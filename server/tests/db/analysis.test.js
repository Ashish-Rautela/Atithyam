// Aspect analysis → benchmark → trends → destination, end to end on PostGIS.
// The reviews below are SYNTHETIC TEST FIXTURES written to exercise each rule (a property-specific
// breakfast problem, a staff strength, a market-wide parking weakness, a rating drop after an
// event, an emerging hot-water issue). They test the logic; they are not evidence about any hotel.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/apps/api/app.js';
import { closePool, one, query } from '../../src/shared/db/pool.js';
import * as hotels from '../../src/data/hotels.js';
import * as cities from '../../src/data/cities.js';
import { upsertReviews } from '../../src/data/listings.js';
import { reviewsToAnalyse, saveAnalysis } from '../../src/data/analysis.js';
import { rebuildNeighborsForCity, rebuildClusters, assignHotelsToCity, recordDiscoveryArea } from '../../src/data/geo.js';
import { analyseReviews } from '../../src/services/analysis/extractor.js';
import { buildCanonicalReview } from '../../src/services/review-ingestion/normalizers/canonicalReview.js';
import { testDbAvailable, resetDb, placeUrl } from './helpers.js';

const ok = await testDbAvailable();
const C = { lat: 30.4547, lng: 78.082 };
const at = (dx) => ({ lat: C.lat, lng: C.lng + dx / (111.32 * Math.cos((C.lat * Math.PI) / 180)) });
const daysAgo = (d) => new Date(Date.now() - d * 86400e3).toISOString();
const monthsAgo = (m) => daysAgo(m * 30 + 5);

let seq = 0;
async function addReviews(hotelId, items) {
  const reviews = items.map(([text, rating, date]) =>
    buildCanonicalReview({ sourceReviewId: `r${++seq}`, rating, scaleMax: 5, text, publishedRaw: date }, { bizId: hotelId, platform: 'google_maps', listingExternalId: hotelId }),
  );
  await upsertReviews(hotelId, 'google_maps', reviews);
}
async function analyse(hotelId) {
  const pending = await reviewsToAnalyse(hotelId);
  const { results } = await analyseReviews(pending);
  await saveAnalysis(hotelId, pending, results);
}

describe.skipIf(!ok)('competitive benchmark (synthetic fixtures, offline lexicon)', () => {
  let app;
  let T;
  let peers;
  let cityId;

  beforeAll(async () => {
    await resetDb();
    app = createApp();
    ({ cityId } = await cities.upsertCity({ name: 'Fixture Town', radiusKm: 5 }));
    await cities.updateCity(cityId, { center: C, seeded: true });
    const saved = await hotels.upsertDiscoveredHotels(
      [0, 0.2, 0.4, 0.6, 0.8].map((dx, i) => ({ placeId: `0xf${i}:0x1`, name: i === 0 ? 'Fixture Target' : `Fixture Peer ${i}`, url: placeUrl(at(dx).lat, at(dx).lng, `0xf${i}:0x1`), geo: at(dx), rating: 4, reviewCount: 120, priceInr: 3000 })),
      { cityId },
    );
    T = saved[0].id;
    peers = saved.slice(1).map((s) => s.id);
    await hotels.claimHotel({ hotelId: T });
    await assignHotelsToCity(cityId);
    await rebuildNeighborsForCity(cityId);
    await rebuildClusters(cityId);
    await recordDiscoveryArea({ center: C, radiusKm: 5, queries: ['hotels'], placesFound: 5 });

    // Target: friendly staff throughout; good food until a drop ~7 months ago; breakfast complaints;
    // parking complaints like everyone; a fresh hot-water problem in the last weeks.
    const t = [];
    for (let m = 14; m >= 8; m--) for (let k = 0; k < 3; k++) t.push([`Food was delicious and the staff very friendly and helpful.`, 5, monthsAgo(m)]);
    for (let m = 7; m >= 3; m--) for (let k = 0; k < 3; k++) t.push([`Breakfast was cold and bland, food bekar. Staff was friendly though. Parking is a problem.`, 2, monthsAgo(m)]);
    t.push(['Room was good but no hot water in the morning, geyser not working.', 3, daysAgo(10)]);
    t.push(['Garam pani nahi aaya, staff helpful tha.', 3, daysAgo(20)]);
    t.push(['No hot water for two days. Staff were polite.', 2, daysAgo(30)]);
    await addReviews(T, t);

    // Peers: praised breakfast, rude staff, everyone complains about parking; heating in December.
    for (const [i, id] of peers.entries()) {
      const p = [];
      for (let m = 12; m >= 1; m--) {
        p.push([`Breakfast was delicious with lots of variety. Parking is a big problem, no parking near the hotel.`, 4, monthsAgo(m)]);
        p.push([i % 2 ? 'Staff was rude and unhelpful at reception.' : 'Staff behaviour was bad, very slow service.', 3, monthsAgo(m)]);
      }
      p.push(['Room was freezing, heater not working in December.', 2, `${new Date().getUTCFullYear() - 1}-12-1${i}T00:00:00Z`]);
      p.push(['Too cold, no heater provided.', 2, `${new Date().getUTCFullYear() - 1}-12-2${i}T00:00:00Z`]);
      await addReviews(id, p);
    }
    for (const id of [T, ...peers]) await analyse(id);
    // Listing-level ratings for the normalised overall rating.
    for (const [i, id] of [T, ...peers].entries()) {
      await query(`INSERT INTO platform_listings (hotel_id, platform, status, listing) VALUES ($1, 'google_maps', 'SUCCESS', $2)`, [
        id,
        JSON.stringify({ rating: { value: [4.4, 3.9, 4.0, 3.8, 4.1][i], scaleMax: 5 }, reviewCount: 200, subscores: [{ name: 'Staff', score: [9.1, 7.0, 7.2, 6.9, 7.5][i], scaleMax: 10 }] }),
      ]);
    }
  });
  afterAll(closePool);

  it('analyses every review and records the method and language', async () => {
    const r = await one(`SELECT count(*)::int AS n, count(*) FILTER (WHERE language = 'hinglish')::int AS hinglish FROM review_analysis`);
    expect(r.n).toBeGreaterThan(100);
    expect(r.hinglish).toBeGreaterThanOrEqual(1);
  });

  it('positions the hotel per aspect: leads on staff, lags on food, parking is market-wide', async () => {
    const res = await request(app).get(`/api/businesses/${T}/benchmark?peers=radius&radiusKm=3`);
    expect(res.status).toBe(200);
    const b = res.body;
    expect(b.peerSet).toMatchObject({ total: 4, withData: 4 });
    const by = Object.fromEntries(b.aspects.map((a) => [a.aspect, a]));
    expect(by.staff.status).toBe('lead');
    expect(by.food.status).toBe('lag');
    expect(by.location.marketWide).toBe(true);
    expect(b.rating).toMatchObject({ you: 4.4, marketAverage: 3.95, verdict: 'above', percentile: 100 });
    const issues = Object.fromEntries(b.issues.map((i) => [i.issue, i]));
    expect(issues.breakfast.kind).toBe('property_specific');
    expect(issues.parking.kind).toBe('market_wide');
    expect(issues.parking.scope).toBe('destination');
    expect(b.findings.lags[0].evidence.length).toBeGreaterThan(0);
    expect(b.platformCategories.find((c) => c.aspect === 'staff')).toMatchObject({ you: 91, market: 71.5 });
    expect(b.heatmap[0]).toMatchObject({ isYou: true, name: 'Fixture Target' });
    expect(b.coverage.analysed).toBe(b.coverage.reviews);
  });

  it('finds the rating drop, links it to a logged event, and measures an intervention', async () => {
    const dropMonth = new Date(monthsAgo(7));
    const ev = await request(app).post(`/api/businesses/${T}/events`).send({ date: dropMonth.toISOString().slice(0, 10), label: 'Head chef left', kind: 'event', aspect: 'food' });
    expect(ev.status).toBe(201);
    await request(app).post(`/api/businesses/${T}/events`).send({ date: monthsAgo(1).slice(0, 10), label: 'New geyser', kind: 'intervention', aspect: 'room' });
    const res = await request(app).get(`/api/businesses/${T}/trends?measure=rating&peers=radius`);
    expect(res.status).toBe(200);
    expect(res.body.changepoint).toMatchObject({ direction: 'down' });
    expect(res.body.changepoint.relatedEvents.map((e) => e.label)).toContain('Head chef left');
    expect(res.body.you.filter((p) => p.value !== null).length).toBeGreaterThan(8);
    expect(res.body.interventions[0]).toMatchObject({ label: 'New geyser' });
    const food = await request(app).get(`/api/businesses/${T}/trends?measure=food&peers=radius`);
    expect(food.body.changepoint?.direction).toBe('down');
    expect((await request(app).get(`/api/businesses/${T}/trends?measure=nope`)).status).toBe(400);
  });

  it('flags the new hot-water complaints as emerging and records how fast they were caught', async () => {
    const res = await request(app).get(`/api/businesses/${T}/trends?measure=room&peers=radius`);
    const hw = res.body.emerging.find((e) => e.issue === 'hot_water');
    expect(hw).toMatchObject({ recent: 3, before: 0 });
    expect(hw.daysToDetect).toBeGreaterThanOrEqual(25);
    expect(res.body.seasonal.find((s) => s.issue === 'heating')).toMatchObject({ month: 'Dec' });
  });

  it('builds the destination view with administration-level issues and a CSV of the evidence', async () => {
    const res = await request(app).get(`/api/cities/${cityId}/destination`);
    expect(res.status).toBe(200);
    expect(res.body.coverage).toMatchObject({ hotels: 5, hotelsWithData: 5 });
    expect(res.body.destinationIssues[0]).toMatchObject({ issue: 'parking', hotelsAffected: 5 });
    expect(res.body.destinationIssues[0].evidence.length).toBeGreaterThan(0);
    const csv = await request(app).get(`/api/cities/${cityId}/destination/evidence.csv`);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text.split('\n')[0]).toContain('hotel,micro_market,platform,date,aspect,issue');
    expect(csv.text).toContain('Parking');
  });

  it('writes a summary without an AI key (template) and caches it', async () => {
    const s1 = await request(app).get(`/api/businesses/${T}/summary?peers=radius`);
    expect(s1.body.method).toBe('template');
    expect(s1.body.actions.length).toBeGreaterThan(0);
    expect(s1.body.headline).toMatch(/4\.4/);
    const city = await request(app).get(`/api/cities/${cityId}/destination/summary`);
    expect(city.body.situation).toMatch(/parking/i);
  });

  it('reports the pipeline stages for the owner', async () => {
    const res = await request(app).get(`/api/businesses/${T}/pipeline?peers=radius`);
    expect(res.body.stages.map((s) => s.key)).toEqual(['you', 'find', 'collect', 'analyse']);
    expect(res.body.stages[3]).toMatchObject({ done: true });
  });

  it('stores computed benchmark and trends, and recomputes them only when the data changes', async () => {
    const url = `/api/businesses/${T}/trends?peers=radius&radiusKm=3&measure=rating`;
    const first = await request(app).get(url);
    const second = await request(app).get(url);
    expect(second.body.cache.hit).toBe(true);
    expect(second.body.you).toEqual(first.body.you);
    await query(`INSERT INTO hotel_events (hotel_id, event_date, label, kind) VALUES ($1, '2020-01-01', 'Old event', 'event')`, [T]);
    expect((await request(app).get(url)).body.cache.hit).toBe(false);
  });

  it('analyses newly collected competitor reviews instantly when the benchmark is opened', async () => {
    await addReviews(peers[0], [['Breakfast was cold and the staff rude.', 2, daysAgo(2)]]);
    expect((await reviewsToAnalyse(peers[0])).length).toBe(1);
    const res = await request(app).get(`/api/businesses/${T}/benchmark?peers=radius&radiusKm=3`);
    expect(res.status).toBe(200);
    expect(res.body.coverage.pending).toBe(0);
    expect((await reviewsToAnalyse(peers[0])).length).toBe(0);
  });
});

describe('Gemini extraction (stubbed HTTP)', () => {
  it('maps model output onto the taxonomy and falls back to rules for skipped reviews', async () => {
    vi.resetModules();
    process.env.GEMINI_API_KEY = 'test-key';
    const fetchMock = vi.fn(async () => ({
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify({ results: [
          { id: '0', language: 'hinglish', overall: 'mixed', aspects: [{ aspect: 'food', sentiment: 'positive', evidence: 'khana accha tha' }], issues: [{ issue: 'Geyser', aspect: 'room', sentiment: 'negative', evidence: 'garam pani nahi' }, { issue: 'parking', aspect: 'location', sentiment: 'negative', scope: 'property' }] },
        ] }) }] } }],
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const { analyseReviews: run } = await import('../../src/services/analysis/extractor.js');
    const { results } = await run([
      { reviewId: 'a', platform: 'google_maps', text: 'Khana accha tha lekin garam pani nahi aaya', rating5: 3 },
      { reviewId: 'b', platform: 'google_maps', text: 'Staff was rude', rating5: 2 },
    ]);
    const a = results.get('a');
    expect(a).toMatchObject({ method: 'gemini', language: 'hinglish', overall: 0 });
    expect(a.issues.map((i) => [i.issue, i.scope])).toEqual([['hot_water', 'property'], ['parking', 'destination']]);
    expect(a.aspects.map((x) => x.aspect).sort()).toEqual(['food', 'location', 'room']);
    expect(results.get('b')).toMatchObject({ method: 'lexicon' });
    expect(fetchMock.mock.calls[0][1].headers['x-goog-api-key']).toBe('test-key');
    vi.unstubAllGlobals();
    delete process.env.GEMINI_API_KEY;
  });
});
