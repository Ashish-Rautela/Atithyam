import { AppError } from '../../shared/errors/AppError.js';
import { config } from '../../shared/config/env.js';
import * as hotels from '../../data/hotels.js';
import * as listings from '../../data/listings.js';
import * as jobs from '../../data/jobs.js';
import { neighborsOf, hotelsWithin, isAreaCovered } from '../../data/geo.js';
import { getCompset, saveCompset } from '../../data/compsets.js';
import { enqueueProfile, enabledPlatforms } from '../review-ingestion/jobs/enqueueProfile.js';
import { DEFAULT_RULES, tagCandidates, defaultSelection } from './comparability.js';

export const DEFAULT_QUERIES = Object.freeze(['hotels', 'guest house', 'resort', 'homestay']);

const isFresh = (h) => h.profileStatus !== 'none' && h.nextRefreshAt && Date.parse(h.nextRefreshAt) > Date.now();

/* ---------------------------------------- candidates ---------------------------------------- */

/**
 * Competitor candidates straight from the database: every hotel linked to this one in the
 * nearby-hotel graph (or, beyond the graph radius, a spatial query), tagged with distance, price
 * ratio and the default comparability rules. No scraping — instant.
 */
export async function buildCandidates(hotel, compset) {
  const rules = { ...DEFAULT_RULES, ...(compset?.rules ?? {}) };
  const nearby = rules.radiusKm > config.data.neighborRadiusKm
    ? await hotelsWithin(hotel.geo, rules.radiusKm, hotel.hotelId)
    : await neighborsOf(hotel.hotelId, config.data.neighborRadiusKm);
  const google = (await listings.getListingState(hotel.hotelId, 'google_maps'))?.listing;
  const target = {
    placeId: hotel.placeId ?? hotel.hotelId,
    hotelId: hotel.hotelId,
    name: hotel.name,
    geo: hotel.geo,
    starClass: hotel.starClass ?? google?.starClass ?? null,
    // The result-list price is fairest: every price in one Google list is for the same dates.
    priceInr: hotel.priceInr ?? google?.priceInr ?? null,
    priceSource: hotel.priceInr ? 'google_result_list' : google?.priceInr ? 'google_prices_tab' : null,
    rating: { value: hotel.googleRating ?? google?.rating?.value ?? null },
    reviewCount: hotel.googleReviewCount ?? google?.reviewCount ?? null,
  };
  const places = nearby.map((n) => ({
    placeId: n.placeId ?? n.hotelId,
    hotelId: n.hotelId,
    name: n.name,
    url: n.googleUrl,
    geo: n.geo,
    rating: n.googleRating,
    reviewCount: n.googleReviewCount,
    starClass: n.starClass,
    lodgingType: n.lodgingType,
    priceInr: n.priceInr,
    sponsored: n.sponsored,
    profileStatus: n.profileStatus,
    lastProfiledAt: n.lastProfiledAt,
    nextRefreshAt: n.nextRefreshAt,
    fresh: isFresh(n),
  }));
  const candidates = tagCandidates(target, places, rules);
  const known = new Set(candidates.map((c) => c.placeId));
  const saved = compset?.selectedPlaceIds?.filter((id) => known.has(id));
  const selectedPlaceIds = saved ?? defaultSelection(candidates, rules);
  return { target, rules, candidates, selectedPlaceIds, selectionSource: saved ? compset.selectionSource : 'default_rules' };
}

/* --------------------------------------- discovery --------------------------------------- */

/**
 * "Find nearby hotels". If the area is already in the database (seeded city or an earlier search),
 * nothing is scraped. Otherwise — or with `force` — a Google Maps area search is queued.
 */
export async function startDiscovery(hotelId, { radiusKm, queries, rules: ruleOverrides, force = false } = {}) {
  const hotel = await requireHotel(hotelId);
  if (!hotel.geo) {
    throw AppError.conflict(
      'Your property’s Google Maps location is not known yet. Wait for its collection to finish (or click “Refresh all platforms”), then try again.',
    );
  }
  const previous = await getCompset(hotelId);
  const rules = { ...DEFAULT_RULES, ...(previous?.rules ?? {}), ...(ruleOverrides ?? {}), ...(radiusKm ? { radiusKm } : {}) };
  await saveCompset(hotelId, { rules });
  if (!force && (await isAreaCovered(hotel.geo, rules.radiusKm))) {
    return { jobId: null, covered: true };
  }
  const { job } = await jobs.enqueue({
    kind: 'discover_area',
    hotelId,
    reason: force ? 'manual' : 'user',
    priority: jobs.PRIORITY.DISCOVERY,
    dedupeKey: `discover:${hotelId}`,
    payload: { center: hotel.geo, radiusKm: rules.radiusKm, queries: queries?.length ? queries : [...DEFAULT_QUERIES], forHotelId: hotelId },
  });
  await saveCompset(hotelId, { discoveryJobId: job.jobId });
  return { jobId: job.jobId, covered: false };
}

/* ---------------------------------------- selection ---------------------------------------- */

export async function saveSelection(hotelId, placeIds) {
  const hotel = await requireHotel(hotelId);
  const { candidates } = await buildCandidates(hotel, await getCompset(hotelId));
  const known = new Set(candidates.map((c) => c.placeId));
  const unknown = placeIds.filter((id) => !known.has(id));
  if (unknown.length) throw AppError.badRequest(`Unknown place ids: ${unknown.slice(0, 3).join(', ')}`);
  await saveCompset(hotelId, { selectedPlaceIds: [...new Set(placeIds)], selectionSource: 'user' });
  return getCompsetView(hotelId);
}

/* ---------------------------------------- collection ---------------------------------------- */

/**
 * Make sure every selected competitor has data. Hotels whose data is still fresh (inside their
 * 15-day refresh window) are reused; the rest are queued. `force` re-collects all of them.
 */
export async function collectCompetitors(hotelId, { maxReviews = 30, platforms, force = false } = {}) {
  const hotel = await requireHotel(hotelId);
  const compset = await getCompset(hotelId);
  const { candidates, selectedPlaceIds } = await buildCandidates(hotel, compset);
  if (!selectedPlaceIds.length) throw AppError.badRequest('Select at least one competitor first.');
  const byPlace = new Map(candidates.map((c) => [c.placeId, c]));
  let queued = 0;
  let reused = 0;
  for (const placeId of selectedPlaceIds) {
    const c = byPlace.get(placeId);
    if (!c) continue;
    if (c.fresh && !force) {
      reused++;
      continue;
    }
    await enqueueProfile(c.hotelId, { maxReviews, platforms, priority: jobs.PRIORITY.COMPETITOR_SELECTED, reason: 'competitor' });
    queued++;
  }
  await saveCompset(hotelId, {
    selectedPlaceIds,
    selectionSource: compset?.selectionSource ?? 'default_rules',
    collection: { startedAt: new Date().toISOString(), maxReviews, platforms: platforms ?? enabledPlatforms() },
  });
  return { queued, reused };
}

/* ------------------------------------------- view ------------------------------------------- */

export async function getCompsetView(hotelId) {
  const hotel = await requireHotel(hotelId);
  const compset = await getCompset(hotelId);
  const view = await buildCandidates(hotel, compset);

  const selected = view.candidates.filter((c) => view.selectedPlaceIds.includes(c.placeId));
  const ids = selected.map((c) => c.hotelId);
  const [jobsBy, listingsBy] = await Promise.all([jobs.latestJobsFor(ids), listings.getListingStatesFor(ids)]);
  const members = selected.map((c) => {
    const job = jobsBy.get(c.hotelId);
    return {
      placeId: c.placeId,
      bizId: c.hotelId,
      name: c.name,
      reused: c.fresh,
      lastProfiledAt: c.lastProfiledAt,
      job: job ? { jobId: job.jobId, status: job.status, platforms: job.platforms, finishedAt: job.finishedAt } : null,
      platforms: Object.fromEntries(
        (listingsBy.get(c.hotelId) ?? []).map((l) => [
          l.platform,
          {
            status: l.status,
            name: l.listing?.name ?? null,
            url: l.listing?.url ?? null,
            rating: l.listing?.rating ?? null,
            reviewCount: l.listing?.reviewCount ?? null,
            reviewsStored: l.reviewsStored ?? null,
            priceInr: l.listing?.priceInr ?? null,
            error: l.error ?? null,
          },
        ]),
      ),
    };
  });

  const discoveryJob = await jobs.latestJob({ hotelId, kind: 'discover_area' });
  const covered = hotel.geo ? await isAreaCovered(hotel.geo, view.rules.radiusKm) : false;
  return {
    bizId: hotelId,
    target: view.target,
    rules: view.rules,
    candidates: view.candidates,
    selectedPlaceIds: view.selectedPlaceIds,
    selectionSource: view.selectionSource,
    members,
    collection: compset?.collection ?? null,
    discovery: discoveryJob
      ? { jobId: discoveryJob.jobId, status: discoveryJob.status, finishedAt: discoveryJob.finishedAt, createdAt: discoveryJob.createdAt, job: { status: discoveryJob.status, message: discoveryJob.message } }
      : covered ? { status: 'completed', fromDatabase: true } : null,
    coverage: { covered, hasLocation: Boolean(hotel.geo), onboardStatus: hotel.onboardStatus },
    enabledPlatforms: enabledPlatforms(),
  };
}

async function requireHotel(hotelId) {
  const hotel = await hotels.getHotel(hotelId);
  if (!hotel) throw AppError.notFound('Business not found');
  return hotel;
}
