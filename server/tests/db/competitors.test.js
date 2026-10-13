// Competitor candidates now come from the database (nearby-hotel graph). Synthetic test hotels.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/apps/api/app.js';
import { closePool, query } from '../../src/shared/db/pool.js';
import * as hotels from '../../src/data/hotels.js';
import { recordDiscoveryArea, rebuildNeighbors } from '../../src/data/geo.js';
import { testDbAvailable, resetDb, placeUrl } from './helpers.js';

const ok = await testDbAvailable();
const T = { lat: 30.2955956, lng: 78.0740518 };

describe.skipIf(!ok)('competitor API (from the database)', () => {
  let app;
  let bizId;
  beforeAll(async () => {
    await resetDb();
    app = createApp();
    const saved = await hotels.upsertDiscoveredHotels([
      { placeId: '0xa:0x1', name: 'Test Hotel A', url: placeUrl(30.2960937, 78.0551177, '0xa:0x1'), geo: { lat: 30.2960937, lng: 78.0551177 }, priceInr: 2048, reviewCount: 1089 },
      { placeId: '0xb:0x1', name: 'Test Hotel B', url: placeUrl(30.3159944, 78.049662, '0xb:0x1'), geo: { lat: 30.3159944, lng: 78.049662 }, priceInr: 3842, reviewCount: 2342 },
      { placeId: '0xc:0x1', name: 'Test Target', url: placeUrl(T.lat, T.lng, '0xc:0x1'), geo: T, priceInr: 1709, reviewCount: 297 },
    ]);
    await rebuildNeighbors(saved.map((s) => s.id));
    await recordDiscoveryArea({ center: T, radiusKm: 5, queries: ['hotels'], placesFound: 3 });
    const res = await request(app).post('/api/businesses').send({ name: 'Test Target', location: 'Dehradun', googleUrl: placeUrl(T.lat, T.lng, '0xc:0x1') });
    bizId = res.body.bizId;
    expect(bizId).toBe(saved[2].id); // the discovered row is claimed, not duplicated
  });
  afterAll(closePool);

  it('lists candidates instantly with the default selection, and discovery is skipped for a covered area', async () => {
    const view = await request(app).get(`/api/businesses/${bizId}/competitors`);
    expect(view.body.candidates.map((c) => c.placeId)).toEqual(['0xa:0x1', '0xb:0x1']);
    expect(view.body.selectedPlaceIds).toEqual(['0xa:0x1']); // B is 2.25× the price
    expect(view.body.coverage.covered).toBe(true);
    const d = await request(app).post(`/api/businesses/${bizId}/competitors/discover`).send({});
    expect(d.body).toEqual({ jobId: null, covered: true });
    const forced = await request(app).post(`/api/businesses/${bizId}/competitors/discover`).send({ force: true });
    expect(forced.body.jobId).toBeTruthy();
  });

  it('saves a selection and collects only competitors without fresh data', async () => {
    expect((await request(app).put(`/api/businesses/${bizId}/competitors/selection`).send({ placeIds: ['0xnope:0x0'] })).status).toBe(400);
    const sel = await request(app).put(`/api/businesses/${bizId}/competitors/selection`).send({ placeIds: ['0xa:0x1', '0xb:0x1'] });
    expect(sel.body.selectedPlaceIds).toHaveLength(2);
    await query(`UPDATE hotels SET profile_status = 'complete', next_refresh_at = now() + interval '5 days' WHERE google_place_id = '0xb:0x1'`);
    const col = await request(app).post(`/api/businesses/${bizId}/competitors/collect`).send({ maxReviews: 20 });
    expect(col.body).toEqual({ queued: 1, reused: 1 });
    const after = await request(app).get(`/api/businesses/${bizId}/competitors`);
    expect(after.body.members.map((m) => [m.name, m.reused, m.job?.status ?? null])).toEqual([
      ['Test Hotel A', false, 'queued'],
      ['Test Hotel B', true, null],
    ]);
    // Competitors do not appear on the home list.
    const list = await request(app).get('/api/businesses');
    expect(list.body.items.map((b) => b.name)).toEqual(['Test Target']);
  });
});
