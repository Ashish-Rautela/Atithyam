import { config } from '../../shared/config/env.js';
import { logger } from '../../shared/logging/logger.js';
import * as jobs from '../../data/jobs.js';
import { dueForRefresh } from '../../data/hotels.js';
import { enqueueProfile } from '../review-ingestion/jobs/enqueueProfile.js';
import { hotelsNeedingAnalysis, hotelsNeedingAiUpgrade } from '../../data/analysis.js';
import { enqueueAnalysis, enqueueAiUpgrade } from '../analysis/analyzeJob.js';
import { geminiEnabled } from '../analysis/gemini.js';
import { warmViews } from '../analysis/viewCache.js';
import { many } from '../../shared/db/pool.js';

/**
 * One scheduler pass (every SCHEDULER_EVERY_MIN minutes in each worker; safe to run in several
 * workers at once because a hotel can only have one collection queued).
 *  - jobs whose worker died go back to the queue
 *  - hotels whose refresh date has passed (last collection + 15 days ± jitter) are queued, a
 *    batch at a time and at low priority, so user requests are never stuck behind refreshes
 */
export async function schedulerTick({ background = config.worker.backgroundScraping } = {}) {
  const recovered = await jobs.recoverStale(config.worker.staleAfterSec);
  // Automatic 15-day refreshes only when background scraping is on (AWS); on a laptop a hotel is
  // refreshed when you ask (Refresh / Re-seed), so the browser never starts by itself.
  const due = background ? await dueForRefresh(config.data.refreshBatch) : [];
  let queued = 0;
  for (const h of due) {
    const { created } = await enqueueProfile(h.id, {
      priority: jobs.PRIORITY.REFRESH,
      reason: 'refresh',
      cityId: h.city_id,
      maxReviews: config.data.refreshMaxReviews,
    });
    if (created) queued++;
  }
  // Reviews collected before analysis existed (or whose job failed) are analysed too.
  let analysis = 0;
  for (const h of await hotelsNeedingAnalysis(config.data.refreshBatch)) {
    const { created } = await enqueueAnalysis(h.id, { priority: jobs.PRIORITY.REFRESH, reason: 'backfill' });
    if (created) analysis++;
  }
  // Reviews that only have the offline analysis get the AI pass when Gemini is available.
  if (geminiEnabled()) {
    for (const h of await hotelsNeedingAiUpgrade(config.data.refreshBatch)) {
      const { created } = await enqueueAiUpgrade(h.id, { priority: jobs.PRIORITY.REFRESH });
      if (created) analysis++;
    }
  }
  // Owner hotels whose benchmark / trends were never pre-computed (e.g. data from before this existed).
  const cold = await many(
    `SELECT id FROM hotels h WHERE is_target AND EXISTS (SELECT 1 FROM review_analysis a WHERE a.hotel_id = h.id)
       AND NOT EXISTS (SELECT 1 FROM computed_views v WHERE v.hotel_id = h.id) LIMIT 20`,
  );
  if (cold.length) warmViews(cold.map((r) => r.id));
  if (recovered || queued || analysis) logger.info({ recovered, refreshQueued: queued, analysisQueued: analysis }, 'Scheduler pass');
  return { recovered, refreshQueued: queued, analysisQueued: analysis };
}
