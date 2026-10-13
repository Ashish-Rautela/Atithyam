/**
 * Key builders — the single place where key formats are defined.
 *
 * Core table (TABLE_CORE)
 *   BIZ#{bizId}        | META                  business
 *   BIZ#{bizId}        | LISTING#{platform}    platform listing (profile, match, status)
 *   BIZ_INDEX          | {createdAt}#{bizId}   list of businesses, newest first
 *   JOB#{jobId}        | META                  scrape job with per-platform progress
 *   BIZ#{bizId}        | JOB#{createdAt}#{id}  job history for a business
 *   BIZ#{bizId}        | COMPSET               nearby candidates, selection and collected competitors
 *   PLACE#{placeId}    | META                  Google place id -> bizId (shared pool: each hotel is scraped once)
 *
 * Reviews table (TABLE_REVIEWS)
 *   BIZ#{bizId}#P#{platform} | R#{reviewId}    canonical review (idempotent upsert by reviewId)
 */
export const keys = {
  business: (bizId) => ({ PK: `BIZ#${bizId}`, SK: 'META' }),
  bizIndex: (createdAt, bizId) => ({ PK: 'BIZ_INDEX', SK: `${createdAt}#${bizId}` }),
  listing: (bizId, platform) => ({ PK: `BIZ#${bizId}`, SK: `LISTING#${platform}` }),
  listingPrefix: 'LISTING#',
  compset: (bizId) => ({ PK: `BIZ#${bizId}`, SK: 'COMPSET' }),
  place: (placeId) => ({ PK: `PLACE#${placeId}`, SK: 'META' }),
  job: (jobId) => ({ PK: `JOB#${jobId}`, SK: 'META' }),
  bizJob: (bizId, createdAt, jobId) => ({ PK: `BIZ#${bizId}`, SK: `JOB#${createdAt}#${jobId}` }),
  bizJobPrefix: 'JOB#',
  review: (bizId, platform, reviewId) => ({ PK: `BIZ#${bizId}#P#${platform}`, SK: `R#${reviewId}` }),
  reviewPartition: (bizId, platform) => `BIZ#${bizId}#P#${platform}`,
  reviewPrefix: 'R#',
};
