// Seeding, nearby-hotel graph, clusters, onboarding, queue and refresh scheduling on a real
// PostGIS test database. Hotels here are synthetic test fixtures (made-up names on a grid of
// coordinates) — they exercise the SQL and the logic, they are not scraped data.
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/apps/api/app.js';
import { closePool, one, many, query } from '../../src/shared/db/pool.js';
import * as hotels from '../../src/data/hotels.js';
import * as jobs from '../../src/data/jobs.js';
import * as cities from '../../src/data/cities.js';
import { rebuildNeighbors, rebuildNeighborsForCity, rebuildClusters, isAreaCovered, recordDiscoveryArea, neighborsOf, assignHotelsToCity } from '../../src/data/geo.js';
import { startOnboarding } from '../../src/services/seeding/onboarding.js';
import { schedulerTick } from '../../src/services/seeding/scheduler.js';
import { enqueueProfile } from '../../src/services/review-ingestion/jobs/enqueueProfile.js';
import { testDbAvailable, resetDb, placeUrl } from './helpers.js';

const ok = await testDbAvailable();
const CENTER = { lat: 30.4547, lng: 78.082 };
const at = (dxKm, dyKm) => ({ lat: CENTER.lat + dyKm / 111.32, lng: CENTER.lng + dxKm / (111.32 * Math.cos((CENTER.lat * Math.PI) / 180)) });
const place = (i, pos, extra = {}) => ({ placeId: `0xtest:0x${i}`, name: `Test Hotel ${i}`, url: placeUrl(pos.lat, pos.lng, `0xtest:0x${i}`), geo: pos, rating: 4, reviewCount: 50 + i, priceInr: 2000, ...extra });

// Two dense groups 4 km apart plus one isolated hotel.
const GROUP_A = [0, 1, 2, 3].map((i) => place(i, at(i * 0.15, 0)));
const GROUP_B = [10, 11, 12].map((i) => place(i, at(4 + (i - 10) * 0.2, 0)));
const LONER = place(20, at(0, 2.5));

describe.skipIf(!ok)('seeding data layer (PostGIS)', () => {
  beforeEach(resetDb);
  afterAll(closePool);

  it('upserts discovered hotels once per Google place and refreshes their card data', async () => {
    const first = await hotels.upsertDiscoveredHotels(GROUP_A);
    expect(first.every((r) => r.inserted)).toBe(true);
    const again = await hotels.upsertDiscoveredHotels([{ ...GROUP_A[0], rating: 4.6, priceInr: null }]);
    expect(again[0]).toMatchObject({ id: first[0].id, inserted: false });
    const h = await hotels.getHotel(first[0].id);
    expect(h).toMatchObject({ googleRating: 4.6, priceInr: 2000, source: 'discovery' });
    expect(h.geo.lat).toBeCloseTo(GROUP_A[0].geo.lat, 6);
  });

  it('links hotels within NEIGHBOR_RADIUS_KM in both directions', async () => {
    const saved = await hotels.upsertDiscoveredHotels([...GROUP_A, ...GROUP_B]);
    await rebuildNeighbors(saved.map((s) => s.id));
    const a0 = saved[0].id;
    const near = await neighborsOf(a0);
    expect(near.map((n) => n.name)).toEqual(['Test Hotel 1', 'Test Hotel 2', 'Test Hotel 3', 'Test Hotel 10', 'Test Hotel 11', 'Test Hotel 12']);
    expect(near[0].distanceKm).toBeCloseTo(0.15, 1);
    const back = await one('SELECT distance_m FROM hotel_neighbors WHERE hotel_id = $1 AND neighbor_id = $2', [saved[1].id, a0]);
    expect(back.distance_m).toBeGreaterThan(140);
    expect((await neighborsOf(a0, 1)).length).toBe(3);
  });

  it('builds DBSCAN clusters per city and attaches isolated hotels to the nearest cluster', async () => {
    const { cityId } = await cities.upsertCity({ name: 'Testpur', radiusKm: 8 });
    await cities.updateCity(cityId, { center: CENTER });
    await hotels.upsertDiscoveredHotels([...GROUP_A, ...GROUP_B, LONER, place(30, at(0.2, 1.0))]);
    expect(await assignHotelsToCity(cityId)).toBe(9);
    const graph = await rebuildNeighborsForCity(cityId);
    expect(graph.hotels).toBe(9);
    const result = await rebuildClusters(cityId);
    expect(result).toMatchObject({ clusters: 2, unclustered: 1 }); // LONER is 2.5 km from everything
    const rows = await many('SELECT c.cluster_no, count(*)::int AS n, bool_and(m.core) AS all_core FROM clusters c JOIN cluster_members m ON m.cluster_id = c.id GROUP BY c.cluster_no ORDER BY c.cluster_no');
    expect(rows).toEqual([{ cluster_no: 1, n: 5, all_core: false }, { cluster_no: 2, n: 3, all_core: true }]);
  });

  it('knows which areas are already covered', async () => {
    expect(await isAreaCovered(CENTER, 3)).toBe(false);
    await recordDiscoveryArea({ center: CENTER, radiusKm: 3, queries: ['hotels'], placesFound: 4 });
    expect(await isAreaCovered(CENTER, 3)).toBe(true);
    expect(await isAreaCovered(at(1, 0), 3)).toBe(false); // a 3 km circle around this point leaves the searched area
    const { cityId } = await cities.upsertCity({ name: 'Testpur', radiusKm: 6 });
    await cities.updateCity(cityId, { center: CENTER, seeded: true });
    expect(await isAreaCovered(at(3, 0), 3)).toBe(true); // inside a recently seeded town
    expect(await isAreaCovered(at(7, 0), 3)).toBe(false);
  });

  it('schedules the next refresh 15 days ± jitter after a collection', async () => {
    const [{ id }] = await hotels.upsertDiscoveredHotels([GROUP_A[0]]);
    const days = [];
    for (let i = 0; i < 20; i++) {
      await hotels.markProfiled(id, 'complete');
      days.push((await one('SELECT extract(epoch FROM next_refresh_at - now()) / 86400 AS d FROM hotels WHERE id = $1', [id])).d);
    }
    expect(Math.min(...days)).toBeGreaterThanOrEqual(12 - 0.01);
    expect(Math.max(...days)).toBeLessThanOrEqual(18 + 0.01);
    expect(new Set(days.map((d) => d.toFixed(3))).size).toBeGreaterThan(5); // spread out, not all on one day
    await hotels.markProfiled(id, 'failed');
    const retry = (await one('SELECT extract(epoch FROM next_refresh_at - now()) / 86400 AS d FROM hotels WHERE id = $1', [id])).d;
    expect(retry).toBeGreaterThan(1.4);
    expect(retry).toBeLessThan(2.6); // failed collections are retried after ~2 days
  });
});

describe.skipIf(!ok)('job queue', () => {
  beforeEach(resetDb);

  it('claims by priority, de-duplicates per hotel and raises priority on a more urgent request', async () => {
    const [a, b] = await hotels.upsertDiscoveredHotels(GROUP_A.slice(0, 2));
    const low = await enqueueProfile(a.id, { priority: jobs.PRIORITY.SEED, reason: 'seed' });
    await enqueueProfile(b.id, { priority: jobs.PRIORITY.NEIGHBOR, reason: 'onboard' });
    const dup = await enqueueProfile(a.id, { priority: jobs.PRIORITY.USER });
    expect(dup).toMatchObject({ created: false, job: { jobId: low.job.jobId, priority: 100 } });
    const first = await jobs.claimNext('w1');
    expect(first.hotelId).toBe(a.id);
    expect(first.status).toBe('running');
    expect((await jobs.claimNext('w2')).hotelId).toBe(b.id);
    expect(await jobs.claimNext('w3')).toBeNull();
  });

  it('re-queues jobs of a dead worker and retries failures with backoff', async () => {
    const [a] = await hotels.upsertDiscoveredHotels([GROUP_A[0]]);
    await enqueueProfile(a.id);
    const job = await jobs.claimNext('w1');
    await query(`UPDATE jobs SET heartbeat_at = now() - interval '1 hour' WHERE id = $1`, [job.jobId]);
    expect(await jobs.recoverStale(600)).toBe(1);
    const again = await jobs.claimNext('w1');
    expect(again.attempts).toBe(2);
    // A late write from the abandoned first run is ignored.
    await jobs.updateJob(job, { status: 'completed', finished: true, message: 'stale' });
    expect((await jobs.getJob(job.jobId)).status).toBe('running');
    await jobs.failOrRetry(again, new Error('boom'));
    expect((await jobs.getJob(job.jobId)).status).toBe('failed'); // max_attempts = 2
  });

  it('the scheduler queues hotels whose refresh date has passed, once', async () => {
    const [a, b] = await hotels.upsertDiscoveredHotels(GROUP_A.slice(0, 2));
    await query(`UPDATE hotels SET profile_status = 'complete', next_refresh_at = now() - interval '1 hour' WHERE id = $1`, [a.id]);
    await query(`UPDATE hotels SET profile_status = 'complete', next_refresh_at = now() + interval '3 days' WHERE id = $1`, [b.id]);
    expect(await schedulerTick()).toMatchObject({ refreshQueued: 1 });
    expect(await schedulerTick()).toMatchObject({ refreshQueued: 0 });
    const job = await jobs.latestJob({ hotelId: a.id, kind: 'profile' });
    expect(job).toMatchObject({ reason: 'refresh', priority: jobs.PRIORITY.REFRESH, options: { maxReviews: 30 } });
  });
});

describe.skipIf(!ok)('onboarding a new hotel', () => {
  beforeEach(resetDb);

  it('in a covered area: links neighbours and queues their collection (selected competitors first)', async () => {
    await hotels.upsertDiscoveredHotels([...GROUP_A.slice(1), ...GROUP_B, place(40, at(0.4, 0.1), { reviewCount: 3 })]);
    await recordDiscoveryArea({ center: CENTER, radiusKm: 5, queries: ['hotels'], placesFound: 7 });
    const { hotel } = await hotels.claimHotel({ name: 'My Hotel', googleUrl: GROUP_A[0].url, placeId: GROUP_A[0].placeId, geo: GROUP_A[0].geo });
    const result = await startOnboarding(hotel.hotelId);
    // Within 3 km: hotels 1, 2, 3 (eligible) and 40 (too few reviews); group B is 4 km away.
    expect(result).toMatchObject({ status: 'done', queued: 4, fresh: 0 });
    const queued = await many(`SELECT h.name, j.priority FROM jobs j JOIN hotels h ON h.id = j.hotel_id WHERE j.kind = 'profile' ORDER BY j.priority DESC, h.name`);
    expect(queued).toEqual([
      { name: 'Test Hotel 1', priority: 80 },
      { name: 'Test Hotel 2', priority: 80 },
      { name: 'Test Hotel 3', priority: 80 },
      { name: 'Test Hotel 40', priority: 60 },
    ]);
    expect((await hotels.getHotel(hotel.hotelId)).onboardStatus).toBe('done');
  });

  it('in an unknown area: queues a map search around the hotel first', async () => {
    const { hotel } = await hotels.claimHotel({ name: 'My Hotel', googleUrl: GROUP_A[0].url, placeId: GROUP_A[0].placeId, geo: GROUP_A[0].geo });
    expect(await startOnboarding(hotel.hotelId)).toMatchObject({ status: 'discovering' });
    const d = await jobs.latestJob({ hotelId: hotel.hotelId, kind: 'discover_area' });
    expect(d.options).toMatchObject({ radiusKm: 3, forHotelId: hotel.hotelId, then: 'collect_neighbors' });
  });

  it('without coordinates: waits for the hotel’s own collection', async () => {
    const { hotel } = await hotels.claimHotel({ name: 'No Pin Hotel', googleUrl: 'https://www.google.com/maps/place/No+Pin', placeId: null, geo: null });
    expect(await startOnboarding(hotel.hotelId)).toEqual({ status: 'pending' });
  });
});

describe.skipIf(!ok)('cities API', () => {
  let app;
  beforeEach(async () => {
    await resetDb();
    app = createApp();
  });

  it('adds towns, queues one seeding run each, pauses and resumes from the saved tile', async () => {
    const res = await request(app).post('/api/cities').send({ names: ['Mussoorie', 'Dhanaulti', 'mussoorie '], kind: 'town', maxReviews: 20 });
    expect(res.status).toBe(202);
    expect(res.body.items.map((i) => i.name)).toEqual(['Mussoorie', 'Dhanaulti']);
    const again = await request(app).post('/api/cities').send({ names: ['MUSSOORIE'] });
    expect(again.body.items[0]).toMatchObject({ newCity: false, alreadyRunning: true });

    const list = await request(app).get('/api/cities');
    expect(list.body.items).toHaveLength(2);
    expect(list.body.items[0].stats).toMatchObject({ hotels: 0, queuedJobs: 1 });

    const cityId = res.body.items[0].cityId;
    // Simulate a run that stopped after 3 tiles.
    const job = await jobs.claimNext('w1');
    expect(job.kind).toBe('seed_city');
    await jobs.updateJob(job.jobId, { status: 'cancelled', finished: true, progress: { tilesDone: [0, 1, 2], found: 30, added: 12 } });
    expect((await request(app).post(`/api/cities/${job.cityId}/pause`)).body.cancelled).toBe(0);
    // Pausing the other town cancels its queued run.
    expect((await request(app).post(`/api/cities/${res.body.items[1].cityId}/pause`)).body.cancelled).toBe(1);
    expect((await cities.getCity(res.body.items[1].cityId)).status).toBe('paused');

    const resumed = await request(app).post(`/api/cities/${job.cityId}/reseed`).send({ mode: 'resume' });
    expect(resumed.status).toBe(202);
    expect((await jobs.getJob(resumed.body.jobId)).progress).toMatchObject({ tilesDone: [0, 1, 2], added: 12 });

    const detail = await request(app).get(`/api/cities/${cityId}`);
    expect(detail.body).toMatchObject({ city: { name: 'Mussoorie', kind: 'town' }, clusters: [], hotels: [], refresh: { intervalDays: 15 } });
    expect((await request(app).post('/api/cities').send({ names: [] })).status).toBe(400);
    expect((await request(app).get('/api/queue')).body.byKind.length).toBeGreaterThan(0);
  });
});
