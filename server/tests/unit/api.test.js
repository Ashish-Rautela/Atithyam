// API contract tests with the browser and job runner stubbed out (no network, no scraping).
import { describe, it, expect, beforeAll, vi } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import request from 'supertest';
import { FileStore } from '../../src/shared/data/fileStore.js';
import { setStore } from '../../src/shared/data/store.js';
import { createApp } from '../../src/apps/api/app.js';
import { setJobRunner } from '../../src/services/business-management/businessService.js';
import * as repo from '../../src/services/review-ingestion/repository.js';
import { buildCanonicalReview } from '../../src/services/review-ingestion/normalizers/canonicalReview.js';

const GOOGLE_URL = 'https://www.google.com/maps/place/Test/@30.48,78.04,17z/data=!3d30.48!4d78.04';

describe('REST API', () => {
  const enqueue = vi.fn();
  let app;

  beforeAll(async () => {
    setStore(new FileStore(await fs.mkdtemp(path.join(os.tmpdir(), 'rip-api-'))));
    setJobRunner({ enqueue, isKnown: () => true });
    app = createApp();
  });

  it('GET /api/health', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('rejects an invalid search body', async () => {
    const res = await request(app).post('/api/search').send({ name: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.type).toBe('BAD_REQUEST');
  });

  it('rejects a non-Google URL when creating a business', async () => {
    const res = await request(app).post('/api/businesses').send({ name: 'Hotel', googleUrl: 'https://evil.example.com/maps/place/x' });
    expect(res.status).toBe(400);
  });

  it('creates a business, queues a job and serves detail, job and reviews', async () => {
    const created = await request(app).post('/api/businesses').send({ name: 'Hotel Test', location: 'Mussoorie', googleUrl: GOOGLE_URL, maxReviews: 10 });
    expect(created.status).toBe(202);
    const { bizId, jobId } = created.body;
    expect(enqueue).toHaveBeenCalledWith(jobId);

    const job = await request(app).get(`/api/jobs/${jobId}`);
    expect(job.body.status).toBe('queued');
    // Tripadvisor is switched off by default (ENABLE_TRIPADVISOR=false).
    expect(Object.keys(job.body.platforms)).toEqual(['google_maps', 'agoda', 'booking', 'makemytrip']);

    await repo.upsertReviews(bizId, 'agoda', [
      buildCanonicalReview({ sourceReviewId: '1', rating: 9, scaleMax: 10, text: 'Lovely breakfast', publishedRaw: '2026-09-01T00:00:00Z' }, { bizId, platform: 'agoda', listingExternalId: '1' }),
      buildCanonicalReview({ sourceReviewId: '2', rating: 4, scaleMax: 10, text: 'Cold room', publishedRaw: '2026-10-01T00:00:00Z' }, { bizId, platform: 'agoda', listingExternalId: '1' }),
    ]);
    const reviews = await request(app).get(`/api/businesses/${bizId}/reviews?platform=agoda`);
    expect(reviews.body.total).toBe(2);
    expect(reviews.body.items[0].text).toBe('Cold room'); // newest first

    const filtered = await request(app).get(`/api/businesses/${bizId}/reviews?q=breakfast`);
    expect(filtered.body.total).toBe(1);

    const detail = await request(app).get(`/api/businesses/${bizId}`);
    expect(detail.body.business.name).toBe('Hotel Test');
    expect(detail.body.latestJob.jobId).toBe(jobId);

    const list = await request(app).get('/api/businesses');
    expect(list.body.items.map((b) => b.bizId)).toContain(bizId);
  });

  it('re-upserting the same reviews creates no duplicates', async () => {
    const bizId = 'dup-test';
    const mk = () => buildCanonicalReview({ sourceReviewId: 'x', rating: 5, scaleMax: 5, text: 'Same' }, { bizId, platform: 'google_maps', listingExternalId: 'p' });
    const first = await repo.upsertReviews(bizId, 'google_maps', [mk()]);
    const second = await repo.upsertReviews(bizId, 'google_maps', [mk()]);
    expect(first).toMatchObject({ inserted: 1, totalStored: 1 });
    expect(second).toMatchObject({ inserted: 0, unchanged: 1, totalStored: 1 });
  });

  it('rejects a select URL from the wrong platform', async () => {
    const created = await request(app).post('/api/businesses').send({ name: 'Hotel Two', googleUrl: GOOGLE_URL });
    const res = await request(app).post(`/api/businesses/${created.body.bizId}/listings/booking/select`).send({ url: 'https://www.agoda.com/x/hotel/y.html' });
    expect(res.status).toBe(400);
  });

  it('404s unknown businesses', async () => {
    expect((await request(app).get('/api/businesses/nope')).status).toBe(404);
  });
});
