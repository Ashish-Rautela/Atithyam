// Live check of Step 2 against the real sites, without the UI.
//
//   npm run smoke:competitors -- <bizId> [--radius 3] [--collect 2] [--max 15]
//
// <bizId> is a property you already collected (see the URL /business/<bizId> in the UI, or
// server/data/db/rip-core.json). Runs nearby discovery, prints the candidates and the default
// selection, and optionally collects full data for the first N selected competitors.
import { setJobRunner } from '../src/services/business-management/businessService.js';
import { startDiscovery, getCompsetView, collectCompetitors, saveSelection } from '../src/services/competitor-discovery/competitorService.js';
import { JobRunner } from '../src/services/review-ingestion/jobs/jobRunner.js';
import { dispatchJob } from '../src/apps/api/jobHandlers.js';
import { closeBrowser } from '../src/services/review-ingestion/browser/browserManager.js';
import { getStore } from '../src/shared/data/store.js';

const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args.splice(i, 2)[1] : dflt;
};
const radiusKm = Number(flag('radius', 3));
const collectN = Number(flag('collect', 0));
const max = Number(flag('max', 15));
const [bizId] = args;
if (!bizId) {
  console.error('Usage: npm run smoke:competitors -- <bizId> [--radius 3] [--collect 2] [--max 15]');
  process.exit(1);
}

const runner = new JobRunner(dispatchJob);
setJobRunner(runner);
const idle = () => new Promise((resolve) => {
  const t = setInterval(() => {
    if (runner.pending === 0) {
      clearInterval(t);
      resolve();
    }
  }, 1000);
});

try {
  console.log(`\n🔎 Discovering lodging within ${radiusKm} km…`);
  await startDiscovery(bizId, { radiusKm });
  await idle();
  let view = await getCompsetView(bizId);
  if (view.discovery?.status !== 'completed') throw new Error(view.discovery?.error ?? 'Discovery did not complete');
  console.log(`Target: ${view.target.name} · price ${view.target.priceInr ?? '?'} (${view.target.priceSource ?? 'no price'})`);
  console.log(`Searches: ${view.discovery.searches.map((s) => `${s.query}:${s.results}`).join(', ')}`);
  console.table(view.candidates.map((c) => ({
    selected: view.selectedPlaceIds.includes(c.placeId) ? '✓' : '',
    name: c.name.slice(0, 40),
    km: c.distanceKm,
    type: c.starClass ? `${c.starClass}★` : c.lodgingType ?? '',
    rating: c.rating,
    reviews: c.reviewCount,
    price: c.priceInr,
    ratio: c.priceRatio,
    excluded: c.exclusions.join('; ').slice(0, 50),
  })));

  if (collectN > 0 && view.selectedPlaceIds.length) {
    await saveSelection(bizId, view.selectedPlaceIds.slice(0, collectN));
    console.log(`\n⏳ Collecting ${collectN} competitor(s)…`);
    await collectCompetitors(bizId, { maxReviews: max });
    await idle();
    view = await getCompsetView(bizId);
    console.table(view.members.map((m) => ({
      competitor: m.name?.slice(0, 35),
      ...Object.fromEntries(Object.entries(m.platforms).map(([p, s]) => [p, `${s.status}${s.rating ? ` ${s.rating.value}/${s.rating.scaleMax}` : ''}`])),
    })));
  }
} catch (err) {
  console.error('\n✗ Competitor smoke run failed:', err.message);
  process.exitCode = 1;
} finally {
  await getStore().flushAll();
  await closeBrowser();
}
