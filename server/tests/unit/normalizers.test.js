import { describe, it, expect } from 'vitest';
import { parseReviewDate } from '../../src/services/review-ingestion/normalizers/dates.js';
import { makeRating } from '../../src/services/review-ingestion/normalizers/rating.js';
import { buildCanonicalReview } from '../../src/services/review-ingestion/normalizers/canonicalReview.js';

const NOW = new Date('2026-10-13T06:00:00Z');

describe('parseReviewDate', () => {
  it.each([
    ['2026-03-29T10:11:29+07:00', '2026-03-29T03:11:29.000Z', 'datetime'],
    ['March 29, 2026', '2026-03-29T00:00:00.000Z', 'day'],
    ['29 March 2026', '2026-03-29T00:00:00.000Z', 'day'],
    ['Oct 2026', '2026-10-01T00:00:00.000Z', 'month'],
    ['October 2026', '2026-10-01T00:00:00.000Z', 'month'],
    ['Yesterday', '2026-10-12T00:00:00.000Z', 'day'],
    ['2 months ago', '2026-08-13T00:00:00.000Z', 'approximate'],
    ['a year ago', '2025-10-13T00:00:00.000Z', 'approximate'],
    ['Edited 3 weeks ago', '2026-09-22T00:00:00.000Z', 'approximate'],
  ])('%s', (input, iso, precision) => {
    expect(parseReviewDate(input, NOW)).toMatchObject({ iso, precision });
  });

  it('returns nulls for unknown formats', () => {
    expect(parseReviewDate('sometime', NOW)).toMatchObject({ iso: null, precision: null });
    expect(parseReviewDate(null, NOW).iso).toBeNull();
  });
});

describe('makeRating', () => {
  it('keeps the original value and adds a display-only 5-point rescale', () => {
    expect(makeRating(8.8, 10)).toEqual({ value: 8.8, scaleMin: 1, scaleMax: 10, normalized5: 4.4 });
    expect(makeRating('4.5', 5)).toEqual({ value: 4.5, scaleMin: 1, scaleMax: 5, normalized5: 4.5 });
  });
  it('rejects missing or out-of-scale values', () => {
    expect(makeRating(null, 5)).toBeNull();
    expect(makeRating(11, 10)).toBeNull();
  });
});

describe('buildCanonicalReview', () => {
  const base = { bizId: 'b1', platform: 'agoda', listingExternalId: '817557', fetchedAt: '2026-10-13T06:00:00.000Z', now: NOW };

  it('derives a stable id from the platform review id', () => {
    const a = buildCanonicalReview({ sourceReviewId: '123', rating: 9, scaleMax: 10, text: 'Great' }, base);
    const b = buildCanonicalReview({ sourceReviewId: '123', rating: 9, scaleMax: 10, text: 'Great, edited' }, base);
    expect(a.reviewId).toBe(b.reviewId);
    expect(a.contentHash).not.toBe(b.contentHash);
    expect(a.dedupStrategy).toBe('source_id');
  });

  it('falls back to a content fingerprint when the platform has no id', () => {
    const raw = { rating: 4, scaleMax: 5, title: 'Good', text: 'Nice stay', stayMonth: 'Oct 2026', authorName: 'A B', publishedRaw: 'Oct 2026' };
    const a = buildCanonicalReview(raw, { ...base, platform: 'makemytrip' });
    const b = buildCanonicalReview({ ...raw }, { ...base, platform: 'makemytrip' });
    expect(a.reviewId).toBe(b.reviewId);
    expect(a.dedupStrategy).toBe('fingerprint');
  });

  it('never stores the reviewer name', () => {
    const r = buildCanonicalReview({ sourceReviewId: '9', text: 'x', authorName: 'Real Person' }, base);
    expect(JSON.stringify(r)).not.toContain('Real Person');
    expect(r.authorHash).toMatch(/^[0-9a-f]{24}$/);
  });
});
