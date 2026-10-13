// Live check of city seeding (map discovery + graph + clusters), without the web UI.
//
//   npm run smoke:seed -- "Mussoorie"                 # 2 map tiles around the centre, no hotel collection
//   npm run smoke:seed -- "Mussoorie" --tiles 0       # every tile
//   npm run smoke:seed -- "Mussoorie" --enrich        # also queue every hotel's collection (runs in the worker)
import { addCities, getCityDetail } from '../src/services/seeding/seedService.js';
import { runSeedCity } from '../src/services/seeding/seedCityJob.js';
import { closeBrowser } from '../src/services/review-ingestion/browser/browserManager.js';
import { migrate } from '../src/shared/db/migrate.js';
import { closePool, one } from '../src/shared/db/pool.js';
import { toJob } from '../src/data/jobs.js';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const enrich = args.includes('--enrich');
const tiles = Number(flag('tiles') ?? 2);
const [name] = args.filter((a) => !a.startsWith('--'));
if (!name) {
  console.error('Usage: npm run smoke:seed -- "<city or town>" [--tiles 2] [--enrich]');
  process.exit(1);
}

try {
  await migrate();
  const { items: [item] } = await addCities({ names: [name], enrich, maxTiles: tiles > 0 ? tiles : undefined });
  console.log(`\n🗺  Seeding ${name} (city ${item.cityId}) — ${tiles > 0 ? `${tiles} tile(s)` : 'all tiles'} — a browser window will open…`);
  const row = await one(`UPDATE jobs SET status = 'running', started_at = now(), heartbeat_at = now(), attempts = attempts + 1, locked_by = 'smoke' WHERE id = $1 AND status = 'queued' RETURNING *`, [item.jobId]);
  if (!row) throw new Error('That city is already being seeded by a running worker.');
  await runSeedCity(toJob(row));
  const detail = await getCityDetail(item.cityId);
  const c = detail.city;
  console.log(`\n${c.displayName ?? c.name}, ${c.region ?? ''} — centre ${c.center?.lat},${c.center?.lng}, radius ${c.radiusKm} km (${c.radiusSource})`);
  console.log(`Job: ${detail.seedJob.status} — ${detail.seedJob.message}`);
  console.log(`Hotels: ${c.stats.hotels}, clusters: ${c.stats.clusters}`);
  console.table(detail.clusters.map((k) => ({ cluster: k.label, hotels: k.hotelCount, radiusM: k.radiusM, medianPrice: k.medianPriceInr })));
  console.table(detail.hotels.slice(0, 15).map((h) => ({ name: h.name, rating: h.googleRating, reviews: h.googleReviewCount, price: h.priceInr, cluster: h.cluster })));
} catch (err) {
  console.error('\n✗ Seeding smoke run failed:', err.message);
  process.exitCode = 1;
} finally {
  await closeBrowser();
  await closePool();
}
