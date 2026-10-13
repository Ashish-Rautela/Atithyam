import { AppError, classifyScrapeError } from '../../shared/errors/AppError.js';
import { withPage } from '../review-ingestion/browser/browserManager.js';
import { googleMaps, parsePlaceUrl, cleanPlaceUrl } from '../review-ingestion/adapters/googleMaps.js';
import { assertPlatformUrl } from '../review-ingestion/jobs/profileJob.js';
import { enqueueProfile, ALL_PLATFORMS, enabledPlatforms } from '../review-ingestion/jobs/enqueueProfile.js';
import { PLATFORM_SCALES } from '../review-ingestion/normalizers/rating.js';
import * as hotels from '../../data/hotels.js';
import * as listings from '../../data/listings.js';
import * as jobs from '../../data/jobs.js';
import { clusterOf, neighborCount } from '../../data/geo.js';
import { getCity } from '../../data/cities.js';
import { startOnboarding } from '../seeding/onboarding.js';

export { ALL_PLATFORMS, enabledPlatforms };

/** Name lookup in the database — instant, no scraping. */
export async function lookupHotels({ name, location }) {
  return { items: await hotels.searchHotels({ name, location }) };
}

/** Live Google Maps search, for hotels not yet in the database. Marks results we already hold. */
export async function searchProperty({ name, location }) {
  let candidates;
  try {
    candidates = await withPage((page) => googleMaps.search({ name, location }, page));
  } catch (err) {
    const { outcome, message } = classifyScrapeError(err);
    throw new AppError(502, outcome, message);
  }
  const known = await hotels.getHotelsByPlaceIds(candidates.map((c) => parsePlaceUrl(c.url).placeId).filter(Boolean));
  const byPlace = new Map(known.map((h) => [h.placeId, h]));
  return {
    candidates: candidates.map((c) => {
      const h = byPlace.get(parsePlaceUrl(c.url).placeId);
      return h ? { ...c, inDatabase: { hotelId: h.hotelId, profileStatus: h.profileStatus, lastProfiledAt: h.lastProfiledAt } } : c;
    }),
    searchedAt: new Date().toISOString(),
  };
}

/**
 * The user claims a hotel as theirs.
 *  - Already in the database with fresh data → nothing is scraped; the page opens instantly.
 *  - Otherwise its collection is queued at top priority.
 * Either way its neighbourhood is onboarded: hotels around it are discovered (if that area was
 * never seeded) and every nearby hotel's data is queued, so competitor analysis has data.
 */
export async function createBusiness({ name, location, googleUrl, hotelId, maxReviews, platforms }) {
  let hotel;
  if (hotelId) {
    hotel = await hotels.getHotel(hotelId);
    if (!hotel) throw AppError.notFound('Hotel not found');
    ({ hotel } = await hotels.claimHotel({ hotelId: hotel.hotelId, location }));
  } else {
    if (!googleUrl || !name) throw AppError.badRequest('name and googleUrl are required (or pass hotelId).');
    try {
      assertPlatformUrl('google_maps', googleUrl);
    } catch (err) {
      throw AppError.badRequest(err.message);
    }
    const url = cleanPlaceUrl(googleUrl);
    const { placeId, geo } = parsePlaceUrl(url);
    ({ hotel } = await hotels.claimHotel({ name, location, googleUrl: url, placeId, geo }));
  }

  const fresh = hotel.profileStatus !== 'none' && hotel.nextRefreshAt && Date.parse(hotel.nextRefreshAt) > Date.now();
  let job = null;
  if (!fresh) ({ job } = await enqueueProfile(hotel.hotelId, { maxReviews, platforms, reason: 'user' }));
  await startOnboarding(hotel.hotelId);
  return { business: await hotels.getHotel(hotel.hotelId), job, reusedData: fresh };
}

export async function startJob(hotelId, { maxReviews, platforms, forced, reason = 'user' } = {}) {
  const { job } = await enqueueProfile(hotelId, { maxReviews, platforms, forced, reason });
  return job;
}

export async function refreshBusiness(hotelId, { platforms, maxReviews }) {
  await requireHotel(hotelId);
  return startJob(hotelId, { platforms, maxReviews, reason: 'manual' });
}

/** Re-run the neighbourhood: search Google again around the hotel and re-collect every neighbour. */
export async function reseedNeighbourhood(hotelId) {
  await requireHotel(hotelId);
  return startOnboarding(hotelId, { force: true });
}

/** User says "that's the wrong property" and supplies the right URL for one platform. */
export async function selectListing(hotelId, platform, url) {
  await requireHotel(hotelId);
  if (!ALL_PLATFORMS.includes(platform)) throw AppError.badRequest(`Unknown platform ${platform}`);
  try {
    assertPlatformUrl(platform, url);
  } catch (err) {
    throw AppError.badRequest(err.message);
  }
  if (platform === 'google_maps') await hotels.setHotelFields(hotelId, { googleUrl: cleanPlaceUrl(url) });
  return startJob(hotelId, { platforms: [platform], forced: { [platform]: url }, reason: 'manual' });
}

export async function getBusinessDetail(hotelId) {
  const business = await requireHotel(hotelId);
  const [listingStates, latestJob, cluster, neighbours, city] = await Promise.all([
    listings.getListingStates(hotelId),
    jobs.latestJob({ hotelId, kind: 'profile' }),
    clusterOf(hotelId),
    neighborCount(hotelId),
    business.cityId ? getCity(business.cityId, { withStats: false }) : null,
  ]);
  return {
    business,
    listings: listingStates,
    latestJob,
    scales: PLATFORM_SCALES,
    enabledPlatforms: enabledPlatforms(),
    freshness: { lastProfiledAt: business.lastProfiledAt, nextRefreshAt: business.nextRefreshAt, profileStatus: business.profileStatus },
    area: { city: city ? { cityId: city.cityId, name: city.name } : null, cluster, neighbours },
  };
}

export async function getJob(jobId) {
  const job = await jobs.getJob(jobId);
  if (!job) throw AppError.notFound('Job not found');
  return job;
}

export async function listBusinesses() {
  return hotels.listTargets();
}

export async function listReviews(hotelId, { platform, limit = 50, offset = 0, minRating, maxRating, q, aspect, sentiment }) {
  await requireHotel(hotelId);
  const platforms = platform && platform !== 'all' ? [platform] : ALL_PLATFORMS;
  return listings.queryReviews(hotelId, { platforms, limit, offset, minRating, maxRating, q, aspect, sentiment });
}

export async function getHistory(hotelId, platform) {
  await requireHotel(hotelId);
  return { items: await listings.getSnapshots(hotelId, { platform }) };
}

async function requireHotel(hotelId) {
  const hotel = await hotels.getHotel(hotelId);
  if (!hotel) throw AppError.notFound('Business not found');
  return hotel;
}
