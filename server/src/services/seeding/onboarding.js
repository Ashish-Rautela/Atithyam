import { config } from '../../shared/config/env.js';
import { logger } from '../../shared/logging/logger.js';
import * as hotels from '../../data/hotels.js';
import * as jobs from '../../data/jobs.js';
import { isAreaCovered, rebuildNeighbors } from '../../data/geo.js';
import { getCompset, saveCompset } from '../../data/compsets.js';
import { enqueueProfile } from '../review-ingestion/jobs/enqueueProfile.js';
import { buildCandidates, DEFAULT_QUERIES } from '../competitor-discovery/competitorService.js';

/**
 * Onboard a hotel's neighbourhood ("seeding for one hotel"):
 *   1. If hotels around it were not discovered recently (no seeded city / earlier search covers
 *      it) — or `force` — queue a Google Maps area search around it (ONBOARD_RADIUS_KM).
 *   2. Then queue a collection for every hotel within that radius: the default competitor set
 *      first, everything else after it. Hotels whose data is still fresh are skipped.
 * When the hotel's coordinates are not known yet, this waits until its own collection has read
 * Google (the profile job calls continueOnboarding).
 */
export async function startOnboarding(hotelId, { force = false } = {}) {
  const hotel = await hotels.getHotel(hotelId);
  if (!hotel) return { status: 'missing' };
  if (!hotel.geo) {
    await hotels.setHotelFields(hotelId, { onboardStatus: 'pending' });
    return { status: 'pending' };
  }
  await rebuildNeighbors([hotelId]);
  const radiusKm = config.data.onboardRadiusKm;
  if (force || !(await isAreaCovered(hotel.geo, radiusKm))) {
    const { job } = await jobs.enqueue({
      kind: 'discover_area',
      hotelId,
      reason: force ? 'reseed' : 'onboard',
      priority: jobs.PRIORITY.DISCOVERY,
      dedupeKey: `onboard:${hotelId}`,
      payload: { center: hotel.geo, radiusKm, queries: [...DEFAULT_QUERIES], forHotelId: hotelId, then: 'collect_neighbors', force },
    });
    await hotels.setHotelFields(hotelId, { onboardStatus: 'discovering' });
    await saveCompset(hotelId, { discoveryJobId: job.jobId });
    return { status: 'discovering', jobId: job.jobId };
  }
  const counts = await collectNeighbours(hotelId, { force });
  return { status: 'done', ...counts };
}

/** Called after a hotel's own collection: resumes an onboarding that was waiting for coordinates. */
export async function continueOnboarding(hotelId) {
  const hotel = await hotels.getHotel(hotelId);
  if (hotel?.onboardStatus === 'pending' && hotel.geo) return startOnboarding(hotelId);
  return null;
}

/** Queue collections for the hotels around `hotelId` (selected competitors first). */
export async function collectNeighbours(hotelId, { force = false } = {}) {
  const hotel = await hotels.getHotel(hotelId);
  const compset = await getCompset(hotelId);
  const { candidates, selectedPlaceIds } = await buildCandidates(hotel, compset);
  const radiusKm = config.data.onboardRadiusKm;
  const selected = new Set(selectedPlaceIds);
  let queued = 0;
  let fresh = 0;
  const ordered = [...candidates].sort((a, b) => Number(selected.has(b.placeId)) - Number(selected.has(a.placeId)));
  // Hotels around it beyond the competitor set feed the micro-market and destination views; they are
  // collected by city seeding, or here when background scraping is on (or the owner asks: force).
  const neighbours = config.worker.backgroundScraping || force;
  for (const c of ordered) {
    if (!selected.has(c.placeId) && (!neighbours || (c.distanceKm ?? Infinity) > radiusKm)) continue;
    if (c.fresh && !force) {
      fresh++;
      continue;
    }
    await enqueueProfile(c.hotelId, {
      priority: selected.has(c.placeId) ? jobs.PRIORITY.COMPETITOR_SELECTED : jobs.PRIORITY.NEIGHBOR,
      reason: 'onboard',
      maxReviews: config.data.seedMaxReviews,
    });
    queued++;
  }
  await hotels.setHotelFields(hotelId, { onboardStatus: 'done' });
  logger.info({ hotelId, queued, fresh }, 'Neighbourhood collection queued');
  return { queued, fresh };
}
