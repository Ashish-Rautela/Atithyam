// Worker loop and the discovery/seeding job handlers with the browser replaced by stubs
// (synthetic places) — checks the pipeline wiring, not the live sites (`npm run smoke:seed` does that).
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { closePool, many, one } from '../../src/shared/db/pool.js';
import * as jobs from '../../src/data/jobs.js';
import * as hotels from '../../src/data/hotels.js';
import { testDbAvailable, resetDb, placeUrl } from './helpers.js';

const C = { lat: 30.4547, lng: 78.082 };
const fakePlaces = (n, dLat = 0) => Array.from({ length: n }, (_, i) => {
  const geo = { lat: C.lat + dLat + i * 0.001, lng: C.lng + i * 0.001 };
  return { placeId: `0xfe${i}:0x${Math.round(dLat * 1e4)}`, name: `Stub Hotel ${i}${dLat}`, url: placeUrl(geo.lat, geo.lng, `0xfe${i}:0x1`), geo, rating: 4.1, reviewCount: 40 + i, priceInr: 2500 };
});

vi.mock('../../src/services/review-ingestion/browser/browserManager.js', async (orig) => ({
  ...(await orig()),
  withPage: async (fn) => fn({}),
  politePause: async () => {},
}));
vi.mock('../../src/services/review-ingestion/adapters/googleMaps.js', async (orig) => {
  const real = await orig();
  return {
    ...real,
    googleMaps: {
      ...real.googleMaps,
      resolveArea: vi.fn(async () => ({ displayName: 'Stubtown', region: 'Uttarakhand', center: C, zoom: 15, placeId: '0x1:0x2', url: 'https://www.google.com/maps/place/Stubtown' })),
      discoverNearby: vi.fn(async ({ center }) => ({ places: fakePlaces(3, Math.round((center.lat - C.lat) * 1000) / 1000), searches: [] })),
    },
  };
});

const ok = await testDbAvailable();

describe.skipIf(!ok)('worker + seeding pipeline (stubbed browser)', () => {
  beforeEach(resetDb);
  afterAll(closePool);

  it('seeds a town: resolves it, searches every tile, builds the graph and queues each hotel', async () => {
    const { addCities } = await import('../../src/services/seeding/seedService.js');
    const { runSeedCity } = await import('../../src/services/seeding/seedCityJob.js');
    const { items: [item] } = await addCities({ names: ['Stubtown'], maxReviews: 15 });
    const job = await jobs.claimNext('test');
    await runSeedCity(job);
    const done = await jobs.getJob(item.jobId);
    expect(done.status).toBe('completed');
    expect(done.progress.tiles).toBe(done.progress.tilesDone.length);
    const city = await one('SELECT display_name, radius_km, radius_source, status, last_seeded_at FROM cities WHERE id = $1', [item.cityId]);
    expect(city).toMatchObject({ display_name: 'Stubtown', radius_source: 'google_viewport', status: 'ready' });
    expect(city.last_seeded_at).toBeTruthy();
    const counts = await one(`SELECT count(*)::int AS h, count(*) FILTER (WHERE city_id = $1)::int AS in_city FROM hotels`, [item.cityId]);
    expect(counts.h).toBeGreaterThan(3);
    expect(counts.in_city).toBe(counts.h);
    const queued = await many(`SELECT priority, reason, payload->>'maxReviews' AS max FROM jobs WHERE kind = 'profile'`);
    expect(queued).toHaveLength(counts.h);
    expect(queued.every((q) => q.priority === 40 && q.reason === 'seed' && q.max === '15')).toBe(true);
    expect((await one('SELECT count(*)::int AS n FROM hotel_neighbors')).n).toBeGreaterThan(0);
  });

  it('onboards a hotel in an unknown area: map search, then the whole neighbourhood is queued', async () => {
    const { runDiscoverArea } = await import('../../src/services/seeding/discoverJob.js');
    const { startOnboarding } = await import('../../src/services/seeding/onboarding.js');
    const { hotel } = await hotels.claimHotel({ name: 'Mine', googleUrl: placeUrl(C.lat, C.lng, '0xaa:0xbb'), placeId: '0xaa:0xbb', geo: C });
    await startOnboarding(hotel.hotelId);
    const job = await jobs.claimNext('test');
    expect(job.kind).toBe('discover_area');
    await runDiscoverArea(job);
    expect((await jobs.getJob(job.jobId)).message).toMatch(/Found 3 places nearby \(3 new to the database\)\. Queued data collection for 3 nearby hotels/);
    expect((await hotels.getHotel(hotel.hotelId)).onboardStatus).toBe('done');
  });

  it('the worker runs queued jobs and retries a crashed handler', async () => {
    const { Worker } = await import('../../src/apps/worker/worker.js');
    const { hotel } = await hotels.claimHotel({ name: 'W', googleUrl: placeUrl(C.lat, C.lng, '0xcc:0xdd'), placeId: '0xcc:0xdd', geo: C });
    const { job } = await jobs.enqueue({ kind: 'profile', hotelId: hotel.hotelId, payload: { platforms: [] } });
    const w = new Worker({ id: 'test-worker', pollMs: 50, handlers: { profile: async () => { throw new Error('boom'); } } });
    await w.start();
    await vi.waitFor(async () => expect((await jobs.getJob(job.jobId)).status).toBe('queued'), { timeout: 5000 });
    const after = await jobs.getJob(job.jobId);
    expect(after).toMatchObject({ attempts: 1, error: 'boom' });
    await w.stop(100);
  });

  it('laptop mode: scraping left queued by an earlier session is parked at start-up and resumes on request', async () => {
    const { Worker } = await import('../../src/apps/worker/worker.js');
    const { schedulerTick } = await import('../../src/services/seeding/scheduler.js');
    const { hotel } = await hotels.claimHotel({ name: 'Left over', googleUrl: placeUrl(C.lat, C.lng, '0xee:0xff'), placeId: '0xee:0xff', geo: C });
    const { job } = await jobs.enqueue({ kind: 'profile', hotelId: hotel.hotelId, dedupeKey: `profile:${hotel.hotelId}`, payload: { platforms: [] } });
    const ran = [];
    const w = new Worker({ id: 'laptop-worker', pollMs: 50, backgroundScraping: false, handlers: { profile: async (j) => { ran.push(j.jobId); } } });
    await w.start();
    await new Promise((r) => setTimeout(r, 300));
    expect(ran).toEqual([]);
    expect(await jobs.getJob(job.jobId)).toMatchObject({ status: 'queued', held: true });
    // No automatic refreshes in laptop mode.
    expect(await schedulerTick({ background: false })).toMatchObject({ refreshQueued: 0 });
    // Asking for the hotel again (or opening its benchmark) releases it.
    expect(await jobs.resumeHeld({ hotelIds: [hotel.hotelId] })).toBe(1);
    await vi.waitFor(() => expect(ran).toEqual([job.jobId]), { timeout: 5000 });
    await w.stop(100);
  });
});
