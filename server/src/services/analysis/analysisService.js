import { AppError } from '../../shared/errors/AppError.js';
import * as hotelsRepo from '../../data/hotels.js';
import * as jobs from '../../data/jobs.js';
import * as A from '../../data/analysis.js';
import { resolvePeers } from './benchmark.js';
import { enqueueAnalysis, enqueueAiUpgrade, analyseInstantly } from './analyzeJob.js';
import { geminiEnabled } from './gemini.js';
import { config } from '../../shared/config/env.js';
import { ASPECT_KEYS } from './taxonomy.js';

async function requireHotel(hotelId) {
  const hotel = await hotelsRepo.getHotel(hotelId);
  if (!hotel) throw AppError.notFound('Business not found');
  return hotel;
}

/**
 * Where the owner's pipeline stands: own data → competitors found → competitors collected →
 * reviews analysed → benchmark ready. Drives the progress bar above the benchmark.
 */
export async function getPipeline(hotelId, peerOpts = {}) {
  const hotel = await requireHotel(hotelId);
  const peers = await resolvePeers(hotel, peerOpts);
  const ids = [hotelId, ...peers.ids];
  // The owner is looking at this hotel: scraping parked at start-up for it and its competitors may run.
  await jobs.resumeHeld({ hotelIds: ids });
  await catchUp(hotelId, ids);
  const [ownJob, discoveryJob, peerJobs, coverage, peerHotels] = await Promise.all([
    jobs.latestJob({ hotelId, kind: 'profile' }),
    jobs.latestJob({ hotelId, kind: 'discover_area' }),
    jobs.latestJobsFor(peers.ids),
    A.analysisCoverage(ids),
    Promise.all(peers.ids.map((id) => hotelsRepo.getHotel(id))),
  ]);
  const analyseJobs = await jobs.latestJobsFor(ids, 'analyze_reviews');
  const aiJob = [...analyseJobs.values()].find((j) => j.status === 'running' && j.options?.upgrade);
  const active = (j) => j && ['queued', 'running'].includes(j.status);

  const peerState = peerHotels.filter(Boolean).map((h) => ({
    collected: h.profileStatus !== 'none',
    inProgress: active(peerJobs.get(h.hotelId)),
    failed: h.profileStatus === 'failed',
  }));
  const cov = [...coverage.values()].reduce((s, c) => ({ reviews: s.reviews + c.reviews, analysed: s.analysed + c.analysed, pending: s.pending + c.pending, byAi: s.byAi + c.by_ai }), { reviews: 0, analysed: 0, pending: 0, byAi: 0 });
  const own = coverage.get(hotelId) ?? { reviews: 0, analysed: 0, pending: 0 };

  const stages = [
    { key: 'you', label: 'Your hotel collected', done: hotel.profileStatus !== 'none', active: active(ownJob), detail: ownJob?.message ?? null },
    { key: 'find', label: 'Competitors found', done: peers.ids.length > 0, active: active(discoveryJob) || ['discovering', 'pending'].includes(hotel.onboardStatus), detail: `${peers.ids.length} in the comparison set` },
    { key: 'collect', label: 'Competitors collected', done: peerState.length > 0 && peerState.every((p) => p.collected || p.failed), active: peerState.some((p) => p.inProgress), detail: `${peerState.filter((p) => p.collected).length}/${peerState.length}` },
    { key: 'analyse', label: 'Reviews analysed', done: cov.reviews > 0 && cov.pending === 0, active: [...analyseJobs.values()].some(active), detail: `${cov.analysed}/${cov.reviews} reviews${cov.byAi < cov.analysed && geminiEnabled() ? ` · ${cov.byAi} by AI so far` : ''}` },
  ];
  const ready = own.analysed > 0 && peerState.filter((p) => p.collected).length >= 2;
  return {
    stages,
    ready,
    complete: stages.every((s) => s.done),
    aiEnabled: geminiEnabled(),
    aiModel: geminiEnabled() ? config.ai.model : null,
    coverage: { ...cov, yourReviews: own.reviews, yourAnalysed: own.analysed },
    aiProgress: aiJob?.message ?? null,
  };
}

/**
 * Analyse the hotel and its comparison set now: offline pass immediately for anything not yet
 * analysed, and the AI pass queued (owner first) for reviews the AI has not seen.
 */
export async function analyseNow(hotelId, { upgrade = true, ...peerOpts } = {}) {
  const hotel = await requireHotel(hotelId);
  const peers = await resolvePeers(hotel, peerOpts);
  const ids = [hotelId, ...peers.ids];
  let instant = 0;
  let queued = 0;
  for (const id of ids) {
    const r = await enqueueAnalysis(id, { priority: id === hotelId ? jobs.PRIORITY.USER : jobs.PRIORITY.COMPETITOR_SELECTED + 10 });
    instant += r.instant;
    if (upgrade && geminiEnabled()) {
      const has = (await A.reviewsToAnalyse(id, { upgrade: true, limit: 1 })).length > 0;
      if (has) {
        const { created } = await enqueueAiUpgrade(id, { priority: id === hotelId ? jobs.PRIORITY.USER : jobs.PRIORITY.COMPETITOR_SELECTED, now: true });
        if (created) queued++;
      }
    }
  }
  return { instant, queued };
}

/**
 * Whenever the owner looks at the benchmark: any collected review of the hotel or its peers that
 * has no analysis yet gets the instant pass right away (so the comparison is never empty), and
 * the AI pass is queued for hotels that have none queued. Cheap when there is nothing to do.
 */
export async function catchUp(hotelId, ids) {
  const [coverage, last] = await Promise.all([A.analysisCoverage(ids), jobs.latestJobsFor(ids, 'analyze_reviews')]);
  for (const id of ids) {
    const c = coverage.get(id);
    if (!c?.reviews) continue;
    if (c.pending > 0) await analyseInstantly(id);
    // AI pass: not if one is queued/running or finished in the last 10 minutes (it schedules its own retries).
    const j = last.get(id);
    const recent = j && (['queued', 'running'].includes(j.status) || (j.finishedAt && Date.now() - Date.parse(j.finishedAt) < 10 * 60e3));
    if (geminiEnabled() && !recent && c.by_ai < c.analysed && (await A.reviewsToAnalyse(id, { upgrade: true, limit: 1 })).length) {
      await enqueueAiUpgrade(id, { priority: id === hotelId ? jobs.PRIORITY.USER - 10 : jobs.PRIORITY.COMPETITOR_SELECTED - 20 });
    }
  }
}

/** Offline pass for any collected-but-unanalysed review of the hotel and its peers (fast; no AI). */
export async function analysePendingInstantly(hotelId, peerOpts = {}) {
  const hotel = await requireHotel(hotelId);
  const peers = await resolvePeers(hotel, peerOpts);
  const coverage = await A.analysisCoverage([hotelId, ...peers.ids]);
  for (const [id, c] of coverage) if (c.pending > 0) await analyseInstantly(id);
}

export async function listEvents(hotelId) {
  await requireHotel(hotelId);
  return { items: await A.listEvents(hotelId) };
}

export async function addEvent(hotelId, body) {
  await requireHotel(hotelId);
  if (body.aspect && !ASPECT_KEYS.includes(body.aspect)) throw AppError.badRequest('Unknown aspect');
  return A.addEvent(hotelId, body);
}

export async function deleteEvent(hotelId, id) {
  if (!(await A.deleteEvent(hotelId, id))) throw AppError.notFound('Event not found');
}
