// Live end-to-end check of one hotel against the real sites, without the web UI.
//
//   npm run smoke -- "JW Marriott Mussoorie Walnut Grove" "Mussoorie"
//   npm run smoke -- "Hotel name" "Location" --max 20 --platforms google_maps,agoda
//
// Picks the first Google Maps result, claims it, runs its collection right here and prints what
// each platform returned. Neighbourhood jobs it queues run later in the normal worker.
import { searchProperty, createBusiness, getBusinessDetail, listReviews } from '../src/services/business-management/businessService.js';
import { runProfileJob } from '../src/services/review-ingestion/jobs/profileJob.js';
import { closeBrowser } from '../src/services/review-ingestion/browser/browserManager.js';
import { migrate } from '../src/shared/db/migrate.js';
import { closePool, one } from '../src/shared/db/pool.js';
import { toJob } from '../src/data/jobs.js';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const max = Number(flag('max') ?? 20);
const platforms = flag('platforms')?.split(',');
const [name, location = ''] = args;
if (!name) {
  console.error('Usage: npm run smoke -- "<hotel name>" "<location>" [--max 20] [--platforms google_maps,agoda,...]');
  process.exit(1);
}

try {
  await migrate();
  console.log(`\n🔎 Google Maps search: "${name}" ${location}`);
  const { candidates } = await searchProperty({ name, location });
  if (!candidates.length) throw new Error('No Google Maps results.');
  candidates.slice(0, 5).forEach((c, i) => console.log(`  ${i === 0 ? '→' : ' '} ${c.name} — ${c.address ?? ''} (${c.rating ?? '–'}★, ${c.reviewCount ?? '–'})`));
  const pick = candidates[0];

  const { business, job } = await createBusiness({ name: pick.name, location, googleUrl: pick.url, maxReviews: max, platforms });
  if (!job) {
    console.log(`\n✓ ${business.name} is already in the database with fresh data (collected ${business.lastProfiledAt}).`);
  } else {
    console.log(`\n⏳ Collecting (hotel ${business.hotelId}) — a browser window will open…\n`);
    // Claim this one job and run it here.
    const row = await one(`UPDATE jobs SET status = 'running', started_at = now(), heartbeat_at = now(), attempts = attempts + 1, locked_by = 'smoke' WHERE id = $1 RETURNING *`, [job.jobId]);
    await runProfileJob(toJob(row));
  }

  const detail = await getBusinessDetail(business.hotelId);
  console.table(detail.listings.map((l) => ({
    platform: l.platform,
    status: l.status,
    matched: l.listing?.name ?? '–',
    score: l.match?.score ?? '–',
    rating: l.listing?.rating ? `${l.listing.rating.value}/${l.listing.rating.scaleMax}` : '–',
    reviewsOnSite: l.listing?.reviewCount ?? '–',
    collected: l.reviewsCollected ?? 0,
    note: (l.error ?? l.notes?.[0] ?? '').slice(0, 90),
  })));
  const sample = await listReviews(business.hotelId, { limit: 3 });
  console.log(`\nStored reviews: ${sample.total}`, sample.countsByPlatform);
  for (const r of sample.items) console.log(`  [${r.platform}] ${r.rating?.value ?? '–'}/${r.rating?.scaleMax ?? ''} ${r.publishedRaw ?? ''} — ${(r.text ?? r.title ?? '').slice(0, 100)}`);
  console.log(`\nNeighbourhood: ${detail.area.neighbours} nearby hotels linked; onboarding status: ${(await one('SELECT onboard_status FROM hotels WHERE id = $1', [business.hotelId])).onboard_status}. Start the app (npm run dev) to let the worker collect them.`);
} catch (err) {
  console.error('\n✗ Smoke run failed:', err.message);
  process.exitCode = 1;
} finally {
  await closeBrowser();
  await closePool();
}
