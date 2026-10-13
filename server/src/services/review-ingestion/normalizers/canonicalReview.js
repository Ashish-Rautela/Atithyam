import { ajv } from '../../../shared/validation/validate.js';
import { config } from '../../../shared/config/env.js';
import { hashParts } from '../../../shared/util/hash.js';
import { clean } from '../../../shared/util/text.js';
import { makeRating, PLATFORM_SCALES } from './rating.js';
import { parseReviewDate } from './dates.js';

export const PLATFORMS = Object.keys(PLATFORM_SCALES);

/** JSON Schema for the canonical review. Shared contract between adapters, storage and API. */
export const canonicalReviewSchema = {
  type: 'object',
  required: ['reviewId', 'platform', 'bizId', 'dedupStrategy', 'fetchedAt', 'acquisitionBasis'],
  properties: {
    reviewId: { type: 'string', minLength: 8 },
    platform: { enum: PLATFORMS },
    bizId: { type: 'string' },
    listingExternalId: { type: ['string', 'null'] },
    sourceReviewId: { type: ['string', 'null'] },
    dedupStrategy: { enum: ['source_id', 'fingerprint'] },
    acquisitionBasis: { const: 'public_scrape' },
    via: { type: ['string', 'null'] },
    syndicatedFrom: { type: ['string', 'null'] },
    rating: {
      type: ['object', 'null'],
      required: ['value', 'scaleMax', 'normalized5'],
      properties: { value: { type: 'number' }, scaleMin: { type: 'number' }, scaleMax: { type: 'number' }, normalized5: { type: 'number' } },
    },
    title: { type: ['string', 'null'] },
    text: { type: ['string', 'null'] },
    language: { type: ['string', 'null'] },
    publishedAt: { type: ['string', 'null'] },
    publishedPrecision: { type: ['string', 'null'] },
    publishedRaw: { type: ['string', 'null'] },
    stayMonth: { type: ['string', 'null'] },
    travellerType: { type: ['string', 'null'] },
    roomType: { type: ['string', 'null'] },
    reviewerCountry: { type: ['string', 'null'] },
    authorHash: { type: ['string', 'null'] },
    ownerReply: { type: ['string', 'null'] },
    liked: { type: ['string', 'null'] },
    disliked: { type: ['string', 'null'] },
    contentHash: { type: 'string' },
    fetchedAt: { type: 'string' },
  },
  additionalProperties: true,
};

const validateCanonical = ajv.compile(canonicalReviewSchema);

/**
 * Build a canonical review from adapter output.
 * - reviewId is deterministic: sha256(platform, sourceReviewId) when the platform exposes an id,
 *   otherwise a content fingerprint. Re-running a scrape therefore overwrites, never duplicates.
 * - Reviewer names are never stored; only a salted hash used for de-duplication.
 */
export function buildCanonicalReview(raw, { bizId, platform, listingExternalId, fetchedAt = new Date().toISOString(), now }) {
  const scale = PLATFORM_SCALES[platform];
  const text = clean(raw.text);
  const title = clean(raw.title);
  const date = parseReviewDate(raw.publishedRaw ?? raw.publishedAt, now);
  const authorHash = raw.authorName ? hashParts([config.authorHashSalt, platform, clean(raw.authorName)?.toLowerCase()], 24) : null;
  const sourceReviewId = raw.sourceReviewId ? String(raw.sourceReviewId) : null;

  const reviewId = sourceReviewId
    ? hashParts([platform, raw.via ?? '', sourceReviewId])
    : hashParts([platform, listingExternalId, authorHash, raw.stayMonth, date.raw, title, (text ?? '').slice(0, 200), raw.rating]);

  const review = {
    reviewId,
    platform,
    bizId,
    listingExternalId: listingExternalId ? String(listingExternalId) : null,
    sourceReviewId,
    dedupStrategy: sourceReviewId ? 'source_id' : 'fingerprint',
    acquisitionBasis: 'public_scrape',
    via: raw.via ?? null,
    syndicatedFrom: clean(raw.syndicatedFrom),
    rating: makeRating(raw.rating, raw.scaleMax ?? scale.max, scale.min),
    title,
    text,
    language: clean(raw.language),
    publishedAt: date.iso,
    publishedPrecision: date.precision,
    publishedRaw: clean(date.raw),
    stayMonth: clean(raw.stayMonth),
    travellerType: clean(raw.travellerType),
    roomType: clean(raw.roomType),
    reviewerCountry: clean(raw.reviewerCountry),
    authorHash,
    ownerReply: clean(raw.ownerReply),
    liked: clean(raw.liked),
    disliked: clean(raw.disliked),
    contentHash: hashParts([title, text, raw.rating, raw.ownerReply, raw.liked, raw.disliked], 16),
    fetchedAt,
  };

  if (!validateCanonical(review)) {
    const err = new Error(`Canonical review failed validation: ${ajv.errorsText(validateCanonical.errors)}`);
    err.validationErrors = validateCanonical.errors;
    throw err;
  }
  return review;
}

/** True when a review carries any usable signal (rating or text). */
export function hasSignal(review) {
  return Boolean(review.rating || review.text || review.title || review.liked || review.disliked);
}
