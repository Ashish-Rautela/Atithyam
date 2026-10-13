/**
 * Adapter contract — every platform adapter exports an object with:
 *
 *   platform: 'google_maps' | 'booking' | 'agoda' | 'makemytrip' | 'tripadvisor'
 *   label:    human-readable name
 *   anchor:   true only for the adapter used to identify the property (Google Maps)
 *
 *   search(query, page) -> Promise<Candidate[]>
 *       query = { name, location, anchor? }   anchor = the Google listing (name, geo, address)
 *       Candidate = { externalId, name, url, address?, geo?, rating?, reviewCount?, priceInr?, extra? }
 *
 *   fetchListing(candidate, page, ctx) -> Promise<Listing>
 *       Listing = {
 *         platform, externalId, url, name, address, geo, phone, website, category, starClass,
 *         rating: { value, scaleMax } | null, reviewCount, ratingDistribution[], subscores[],
 *         amenities[], priceInr, priceNote, prices[], reviewSummary[], notes[]
 *       }
 *
 *   fetchReviews(listing, { max }, page, ctx) -> Promise<{ reviews: RawReview[], notes: string[], sort: string }>
 *       RawReview = { sourceReviewId?, rating?, scaleMax?, title?, text?, language?, publishedRaw?,
 *                     stayMonth?, travellerType?, roomType?, reviewerCountry?, authorName?,
 *                     ownerReply?, liked?, disliked?, via?, syndicatedFrom? }
 *
 * ctx = { listings }: listings already fetched in this job, keyed by platform. Used for
 * cross-platform data (e.g. Booking.com reviews served through Agoda's review API).
 *
 * Adapters throw ScrapeError(outcome) for BLOCKED / LAYOUT_CHANGED / NOT_FOUND; any other
 * error is reported as FAILED by the job runner.
 */
export const LISTING_DEFAULTS = Object.freeze({
  address: null,
  geo: null,
  phone: null,
  website: null,
  category: null,
  starClass: null,
  rating: null,
  reviewCount: null,
  ratingDistribution: [],
  subscores: [],
  amenities: [],
  priceInr: null,
  priceNote: null,
  prices: [],
  reviewSummary: [],
  notes: [],
});

export function makeListing(platform, fields) {
  return { ...LISTING_DEFAULTS, ...fields, platform, fetchedAt: new Date().toISOString() };
}
