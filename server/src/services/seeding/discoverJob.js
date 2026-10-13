import { childLogger } from '../../shared/logging/logger.js';
import { classifyScrapeError, ScrapeOutcome } from '../../shared/errors/AppError.js';
import { withPage } from '../review-ingestion/browser/browserManager.js';
import { googleMaps } from '../review-ingestion/adapters/googleMaps.js';
import * as hotels from '../../data/hotels.js';
import * as jobs from '../../data/jobs.js';
import { recordDiscoveryArea, rebuildNeighbors, assignCitiesFor } from '../../data/geo.js';
import { collectNeighbours } from './onboarding.js';

/**
 * Job 'discover_area': Google Maps area search around one point (a user's hotel).
 * Every place found is stored in `hotels` (one row per Google place), linked into the nearby-hotel
 * graph and attached to a seeded city when it lies inside one. With `then: 'collect_neighbors'`
 * (onboarding) every nearby hotel's collection is queued afterwards.
 */
export async function runDiscoverArea(job) {
  const { center, radiusKm, queries, forHotelId, then, force } = job.options;
  const log = childLogger({ jobId: job.jobId, hotelId: forHotelId, kind: 'discover_area' });
  await jobs.updateJob(job, { message: 'Searching Google Maps around the hotel…' });
  const onboarding = forHotelId && then === 'collect_neighbors';
  if (onboarding) await hotels.setHotelFields(forHotelId, { onboardStatus: 'discovering' }).catch(() => {});

  let result;
  try {
    result = await withPage((page) =>
      googleMaps.discoverNearby(
        { center, radiusKm, queries, onProgress: (message) => jobs.updateJob(job, { message }).catch(() => {}) },
        page,
      ),
    );
  } catch (err) {
    const { outcome, message } = classifyScrapeError(err);
    log.warn({ outcome, err: message }, 'Discovery failed');
    if (onboarding) await hotels.setHotelFields(forHotelId, { onboardStatus: 'failed' }).catch(() => {});
    // Blocked / network problems are worth one retry later; layout changes are not.
    if ([ScrapeOutcome.BLOCKED, ScrapeOutcome.NETWORK_ERROR, ScrapeOutcome.TIMEOUT].includes(outcome) && job.attempts < job.maxAttempts) {
      throw err;
    }
    await jobs.updateJob(job, { status: 'failed', outcome, error: message, message, finished: true });
    return;
  }

  const { places, searches } = result;
  const saved = await hotels.upsertDiscoveredHotels(places);
  const ids = saved.map((s) => s.id);
  await assignCitiesFor(ids);
  await rebuildNeighbors(forHotelId ? [...ids, forHotelId] : ids);
  await recordDiscoveryArea({ center, radiusKm, queries, placesFound: places.length });
  const added = saved.filter((s) => s.inserted).length;

  let tail = '';
  if (onboarding) {
    const { queued, fresh } = await collectNeighbours(forHotelId, { force });
    tail = ` Queued data collection for ${queued} nearby hotels${fresh ? ` (${fresh} already up to date)` : ''}.`;
  }
  const message = `Found ${places.length} places nearby (${added} new to the database).${tail}`;
  await jobs.updateJob(job, { status: 'completed', finished: true, message, progress: { searches, found: places.length, added } });
  log.info({ found: places.length, added }, 'Discovery finished');
}
