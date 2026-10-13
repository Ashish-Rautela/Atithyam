// REST API contract on a real Postgres test database. No browser: jobs are queued, never run.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/apps/api/app.js';
import { upsertReviews } from '../../src/data/listings.js';
import { getJob } from '../../src/data/jobs.js';
import { closePool, one } from '../../src/shared/db/pool.js';
import { buildCanonicalReview } from '../../src/services/review-ingestion/normalizers/canonicalReview.js';
import { testDbAvailable, resetDb } from './helpers.js';

const GOOGLE_URL = 'https://www.google.com/maps/place/Test/data=!4m2!3m1!1s0xabc:0x123!8m2!3d30.48!4d78.04?hl=en';
const ok = await testDbAvailable();

describe.skipIf(!ok)('REST API (Postgres)', () => {
  let app;
  beforeAll(async () => {
    await resetDb();
    app = createApp();
  });
  afterAll(closePool);

  it('GET /api/health', async () => {
    const res = await request(app).get('/api/health');
    expect(res.body).toMatchObject({ ok: true, database: 'postgres', refreshIntervalDays: 15 });
  });

  it('rejects an invalid search body and a non-Google URL', async () => {
    expect((await request(app).post('/api/search').send({ name: 'x' })).status).toBe(400);
    expect((await request(app).post('/api/businesses').send({ name: 'Hotel', googleUrl: 'https://evil.example.com/maps/place/x' })).status).toBe(400);
    expect((await request(app).post('/api/businesses').send({ location: 'x' })).status).toBe(400);
  });

  it('claims a new hotel: queues its collection at top priority and waits for coordinates-free onboarding', async () => {
    const created = await request(app).post('/api/businesses').send({ name: 'Hotel Test', location: 'Mussoorie', googleUrl: GOOGLE_URL, maxReviews: 10 });
    expect(created.status).toBe(202);
    const { bizId, jobId } = created.body;
    expect(jobId).toBeTruthy();

    const job = await request(app).get(`/api/jobs/${jobId}`);
    expect(job.body).toMatchObject({ status: 'queued', kind: 'profile', priority: 100, reason: 'user' });
    expect(Object.keys(job.body.platforms)).toEqual(['google_maps', 'agoda', 'booking', 'makemytrip']);

    // The URL carries coordinates, so onboarding queued a map search around the hotel (area never seeded).
    const discover = await one(`SELECT kind, priority, payload FROM jobs WHERE hotel_id = $1 AND kind = 'discover_area'`, [bizId]);
    expect(discover).toMatchObject({ priority: 90, payload: { radiusKm: 3, then: 'collect_neighbors' } });

    // Asking again does not queue a second collection.
    const again = await request(app).post('/api/businesses').send({ name: 'Hotel Test', googleUrl: GOOGLE_URL });
    expect(again.body).toMatchObject({ bizId, jobId });

    const detail = await request(app).get(`/api/businesses/${bizId}`);
    expect(detail.body.business).toMatchObject({ name: 'Hotel Test', role: 'target', placeId: '0xabc:0x123', geo: { lat: 30.48, lng: 78.04 } });
    expect(detail.body.latestJob.jobId).toBe(jobId);
    expect((await request(app).get('/api/businesses')).body.items.map((b) => b.bizId)).toContain(bizId);
  });

  it('stores reviews idempotently and filters/sorts them in SQL', async () => {
    const { body } = await request(app).post('/api/businesses').send({ name: 'Hotel Rev', googleUrl: GOOGLE_URL.replace('0xabc:0x123', '0xdef:0x456') });
    const bizId = body.bizId;
    const mk = (id, rating, text, date) => buildCanonicalReview({ sourceReviewId: id, rating, scaleMax: 10, text, publishedRaw: date }, { bizId, platform: 'agoda', listingExternalId: '1' });
    const first = await upsertReviews(bizId, 'agoda', [mk('1', 9, 'Lovely breakfast', '2026-09-01T00:00:00Z'), mk('2', 4, 'Cold room', '2026-10-01T00:00:00Z')]);
    expect(first).toMatchObject({ inserted: 2, totalStored: 2 });
    const second = await upsertReviews(bizId, 'agoda', [mk('1', 9, 'Lovely breakfast', '2026-09-01T00:00:00Z'), mk('2', 4, 'Cold room!', '2026-10-01T00:00:00Z')]);
    expect(second).toMatchObject({ inserted: 0, updated: 1, unchanged: 1, totalStored: 2 });

    const all = await request(app).get(`/api/businesses/${bizId}/reviews?platform=agoda`);
    expect(all.body.total).toBe(2);
    expect(all.body.items[0].text).toBe('Cold room!'); // newest first
    expect((await request(app).get(`/api/businesses/${bizId}/reviews?q=breakfast`)).body.total).toBe(1);
    expect((await request(app).get(`/api/businesses/${bizId}/reviews?minRating=4`)).body.total).toBe(1);
    expect((await one(`SELECT revision FROM reviews WHERE hotel_id = $1 AND data->>'text' = 'Cold room!'`, [bizId])).revision).toBe(2);
  });

  it('looks hotels up in the database by fuzzy name', async () => {
    const res = await request(app).get('/api/hotels/lookup?name=hotel%20tst');
    expect(res.body.items[0].name).toBe('Hotel Test');
  });

  it('claiming a hotel already in the database with fresh data scrapes nothing', async () => {
    const { body } = await request(app).get('/api/hotels/lookup?name=Hotel%20Rev');
    const id = body.items[0].hotelId;
    await one(`UPDATE hotels SET profile_status = 'complete', next_refresh_at = now() + interval '10 days', is_target = false WHERE id = $1 RETURNING id`, [id]);
    await one(`UPDATE jobs SET status = 'completed' WHERE hotel_id = $1 RETURNING id`, [id]);
    const res = await request(app).post('/api/businesses').send({ hotelId: id });
    expect(res.body).toMatchObject({ bizId: id, jobId: null, reusedData: true });
  });

  it('rejects a select URL from the wrong platform, 404s unknown ids', async () => {
    const { body } = await request(app).post('/api/businesses').send({ name: 'Hotel Two', googleUrl: GOOGLE_URL });
    const res = await request(app).post(`/api/businesses/${body.bizId}/listings/booking/select`).send({ url: 'https://www.agoda.com/x/hotel/y.html' });
    expect(res.status).toBe(400);
    expect((await request(app).get('/api/businesses/nope')).status).toBe(404);
    expect((await request(app).get('/api/jobs/not-a-uuid')).status).toBe(404);
  });

  it('a forced URL gets its own job even while a collection is queued', async () => {
    const { body } = await request(app).post('/api/businesses').send({ name: 'Hotel Test', googleUrl: GOOGLE_URL });
    const res = await request(app).post(`/api/businesses/${body.bizId}/listings/agoda/select`).send({ url: 'https://www.agoda.com/partners/partnersearch.aspx?hid=1' });
    expect(res.status).toBe(202);
    expect(res.body.jobId).not.toBe(body.jobId);
    expect((await getJob(res.body.jobId)).options.forced).toEqual({ agoda: 'https://www.agoda.com/partners/partnersearch.aspx?hid=1' });
  });
});
