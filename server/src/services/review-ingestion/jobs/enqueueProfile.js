import { config } from '../../../shared/config/env.js';
import { ADAPTERS } from '../adapters/index.js';
import { enqueue, PRIORITY } from '../../../data/jobs.js';

export const ALL_PLATFORMS = Object.keys(ADAPTERS);
/** Platforms switched on in configuration (ENABLE_<PLATFORM>); the UI only shows these. */
export const enabledPlatforms = () => ALL_PLATFORMS.filter((p) => config.scraping.enabled[p]);

/**
 * Queue a full collection (profile + reviews on every enabled platform) for one hotel.
 * Only one collection per hotel can be queued/running; asking again returns that job (raising its
 * priority if needed). `forced` URLs (user fixing a wrong match) always get their own job.
 */
export async function enqueueProfile(hotelId, { priority = PRIORITY.USER, reason = 'user', cityId = null, parentId = null, maxReviews, platforms, forced } = {}) {
  const selected = (platforms?.length ? platforms : ALL_PLATFORMS).filter((p) => ALL_PLATFORMS.includes(p) && config.scraping.enabled[p]);
  const hasForced = forced && Object.keys(forced).length > 0;
  return enqueue({
    kind: 'profile',
    hotelId,
    cityId,
    parentId,
    reason,
    priority,
    dedupeKey: hasForced ? null : `profile:${hotelId}`,
    payload: {
      platforms: selected,
      maxReviews: Math.min(Math.max(maxReviews ?? config.scraping.maxReviewsPerPlatform, 5), 500),
      forced: forced ?? {},
    },
    progress: { platforms: Object.fromEntries(selected.map((p) => [p, { status: 'PENDING', message: 'Waiting…' }])) },
  });
}
