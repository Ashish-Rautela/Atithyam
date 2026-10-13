import { describe, it, expect, beforeEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { scoreCandidate, rankCandidates } from '../../src/services/review-ingestion/matching/entityMatch.js';
import { FileStore } from '../../src/shared/data/fileStore.js';

const anchor = { name: 'JW Marriott Mussoorie Walnut Grove Resort & Spa', geo: { lat: 30.4814884, lng: 78.0468318 } };

describe('entity matching', () => {
  it('scores the same property on another platform highly', () => {
    const s = scoreCandidate(anchor, { name: 'JW Marriott Mussoorie Walnut Grove Resort and Spa', geo: { lat: 30.481516, lng: 78.046618 } }, ['Mussoorie']);
    expect(s.score).toBeGreaterThan(0.9);
    expect(s.distanceKm).toBeLessThan(0.1);
  });

  it('does not match a different property with a similar location word', () => {
    const s = scoreCandidate(anchor, { name: 'Mussoorie Gateway', geo: { lat: 30.45968, lng: 78.06537 } }, ['Mussoorie']);
    expect(s.score).toBeLessThan(0.5);
  });

  it('caps far-away namesakes', () => {
    const s = scoreCandidate(anchor, { name: 'JW Marriott Walnut Grove', geo: { lat: 28.6, lng: 77.2 } }, ['Mussoorie']);
    expect(s.score).toBeLessThanOrEqual(0.4);
  });

  it('ranks and decides', () => {
    const { best, decision, ranked } = rankCandidates(anchor, [
      { name: 'Mussoorie Gateway' },
      { name: 'JW Marriott Mussoorie Walnut Grove Resort & Spa' },
    ], ['Mussoorie']);
    expect(decision).toBe('auto');
    expect(best.name).toBe('JW Marriott Mussoorie Walnut Grove Resort & Spa');
    expect(ranked).toHaveLength(2);
  });

  it('returns no match when nothing is close', () => {
    expect(rankCandidates(anchor, [{ name: 'Shalom Backpackers' }], ['Mussoorie']).decision).toBe('none');
  });
});

describe('FileStore', () => {
  let dir;
  let store;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rip-store-'));
    store = new FileStore(dir);
  });

  it('puts, gets, queries by prefix and persists to disk', async () => {
    await store.put('t', { PK: 'BIZ#1', SK: 'META', name: 'a' });
    await store.put('t', { PK: 'BIZ#1', SK: 'LISTING#agoda', x: 1 });
    await store.put('t', { PK: 'BIZ#1', SK: 'LISTING#booking', x: 2 });
    expect(await store.get('t', 'BIZ#1', 'META')).toMatchObject({ name: 'a' });
    expect((await store.query('t', 'BIZ#1', { skPrefix: 'LISTING#' })).map((i) => i.x)).toEqual([1, 2]);
    expect((await store.query('t', 'BIZ#1', { skPrefix: 'LISTING#', descending: true, limit: 1 }))[0].x).toBe(2);
    await store.flushAll();
    const reopened = new FileStore(dir);
    expect(await reopened.get('t', 'BIZ#1', 'LISTING#booking')).toMatchObject({ x: 2 });
  });
});
