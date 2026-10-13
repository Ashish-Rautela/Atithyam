import { childLogger } from '../../shared/logging/logger.js';
import * as A from '../../data/analysis.js';
import * as jobs from '../../data/jobs.js';
import { analyseReviews } from './extractor.js';
import { geminiEnabled } from './gemini.js';
import { warmViews, targetsAround } from './viewCache.js';

/**
 * Analyse a hotel's new or changed reviews. The instant offline pass runs right here (milliseconds,
 * no queue — so it never waits behind a long AI job), then the AI pass is queued in the background.
 * `upgrade` only queues the AI pass. Returns { created, instant }.
 */
export async function enqueueAnalysis(hotelId, { priority = jobs.PRIORITY.SEED, cityId = null, upgrade = false } = {}) {
  let instant = 0;
  if (!upgrade) instant = await analyseInstantly(hotelId);
  if (!geminiEnabled()) return { created: instant > 0, instant };
  const needsAi = (await A.reviewsToAnalyse(hotelId, { upgrade: true, limit: 1 })).length > 0;
  if (!needsAi) return { created: instant > 0, instant };
  const { created, job } = await enqueueAiUpgrade(hotelId, { priority: Math.max(priority - 30, jobs.PRIORITY.REFRESH), cityId, now: upgrade });
  return { created: created || instant > 0, instant, job };
}

/** Offline pass over every not-yet-analysed review of a hotel; returns how many were analysed. */
export async function analyseInstantly(hotelId) {
  const pending = await A.reviewsToAnalyse(hotelId);
  if (!pending.length) return 0;
  const { results } = await analyseReviews(pending, { ai: false });
  await A.saveAnalysis(hotelId, pending, results);
  await prepareViews(hotelId);
  return pending.length;
}

/** New analysis for a hotel: pre-compute its benchmark and trends (and those of owners next to it) in the background. */
async function prepareViews(hotelId) {
  try {
    warmViews([hotelId, ...(await targetsAround(hotelId))]);
  } catch {
    /* best effort */
  }
}

/** Queue the AI pass for reviews that so far only have the instant offline analysis. */
export async function enqueueAiUpgrade(hotelId, { priority = jobs.PRIORITY.REFRESH, cityId = null, round = 0, delayMs = 0, now = false } = {}) {
  const res = await jobs.enqueue({
    kind: 'analyze_reviews',
    hotelId,
    cityId,
    reason: round ? 'ai_retry' : 'ai_upgrade',
    priority,
    dedupeKey: `analyze-ai:${hotelId}`,
    maxAttempts: 2,
    payload: { upgrade: true, retryRound: round },
    runAfter: delayMs ? new Date(Date.now() + delayMs).toISOString() : null,
  });
  // Asked for now (owner clicked, or the benchmark is open): a retry waiting for later runs now.
  if (now && !res.created) await jobs.expedite(`analyze-ai:${hotelId}`);
  return res;
}

/**
 * Job 'analyze_reviews', in two passes so the benchmark never waits for the AI:
 *  1. instant pass — every new review goes through the offline rules (milliseconds per hotel),
 *     so the hotel and all its competitors have aspect data straight away;
 *  2. AI pass (`upgrade`) — queued separately; Gemini re-analyses those reviews in the background
 *     and replaces the offline result review by review. If Gemini is busy, it retries later.
 */
export async function runAnalyzeReviews(job) {
  const log = childLogger({ jobId: job.jobId, hotelId: job.hotelId, kind: 'analyze_reviews' });
  const upgrade = Boolean(job.options?.upgrade);
  const pending = await A.reviewsToAnalyse(job.hotelId, { upgrade: upgrade && geminiEnabled() });

  if (!upgrade) {
    // Pass 1: the new reviews (and changed ones) — offline, instant.
    if (pending.length) {
      const { results } = await analyseReviews(pending, { ai: false });
      await A.saveAnalysis(job.hotelId, pending, results);
      await prepareViews(job.hotelId);
    }
    let aiQueued = false;
    if (geminiEnabled() && (pending.length || (await A.reviewsToAnalyse(job.hotelId, { upgrade: true, limit: 1 })).length)) {
      await enqueueAiUpgrade(job.hotelId, { cityId: job.cityId, priority: Math.max(job.priority - 30, jobs.PRIORITY.REFRESH) })
        .then(() => { aiQueued = true; })
        .catch((err) => log.warn({ err: err.message }, 'Could not queue the AI pass'));
    }
    const message = pending.length
      ? `${pending.length} reviews analysed instantly${aiQueued ? '; AI pass queued' : ''}.`
      : `Nothing new to analyse${aiQueued ? '; AI pass queued' : ''}.`;
    await jobs.updateJob(job, { status: 'completed', finished: true, message, progress: { analysed: pending.length, ai: 0 } });
    log.info({ done: pending.length, aiQueued }, 'Reviews analysed (instant pass)');
    return;
  }

  // Pass 2: AI upgrade of reviews that only the offline rules have seen.
  if (!geminiEnabled() || !pending.length) {
    await jobs.updateJob(job, { status: 'completed', finished: true, message: geminiEnabled() ? 'Every review already analysed by AI.' : 'AI not available; offline analysis kept.' });
    return;
  }
  let done = 0;
  let ai = 0;
  let note = null;
  for (let i = 0; i < pending.length; i += 45) {
    const chunk = pending.slice(i, i + 45);
    const { results, note: n } = await analyseReviews(chunk, {
      onProgress: (k) => jobs.updateJob(job, { message: `AI analysing reviews ${done + k}/${pending.length}…` }).catch(() => {}),
    });
    note = n ?? note;
    // Only AI results replace what is stored; a batch the AI could not do keeps its offline result.
    const aiOnly = new Map([...results].filter(([, r]) => r.method === 'gemini'));
    await A.saveAnalysis(job.hotelId, chunk, aiOnly);
    done += chunk.length;
    ai += aiOnly.size;
    if (n && !geminiEnabled()) break; // quota gone: stop, keep the offline results
  }
  if (ai > 0) await prepareViews(job.hotelId);
  const round = job.options?.retryRound ?? 0;
  if (ai < done && round < 3) {
    await enqueueAiUpgrade(job.hotelId, { cityId: job.cityId, priority: jobs.PRIORITY.REFRESH, round: round + 1, delayMs: 15 * 60 * 1000 })
      .catch((err) => log.warn({ err: err.message }, 'Could not schedule AI retry'));
  }
  const message = `${ai}/${pending.length} reviews upgraded to AI analysis${ai < done ? ` — AI busy for the rest, retrying in 15 min${note ? `: ${note}` : ''}` : ''}.`;
  await jobs.updateJob(job, { status: 'completed', finished: true, message, progress: { analysed: done, ai } });
  log.info({ done, ai }, 'Reviews analysed (AI pass)');
}
