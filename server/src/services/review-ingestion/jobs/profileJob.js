import { config } from '../../../shared/config/env.js';
import { childLogger } from '../../../shared/logging/logger.js';
import { ScrapeError, ScrapeOutcome, classifyScrapeError } from '../../../shared/errors/AppError.js';
import { withPage } from '../browser/browserManager.js';
import { ADAPTERS, OTA_ORDER, getAdapter } from '../adapters/index.js';
import { rankCandidates, scoreCandidate, MATCH_THRESHOLDS } from '../matching/entityMatch.js';
import { buildCanonicalReview, hasSignal } from '../normalizers/canonicalReview.js';
import * as hotels from '../../../data/hotels.js';
import * as listings from '../../../data/listings.js';
import * as jobs from '../../../data/jobs.js';
import { rebuildNeighbors, cityContaining } from '../../../data/geo.js';
import { continueOnboarding } from '../../seeding/onboarding.js';
import { enqueueAnalysis } from '../../analysis/analyzeJob.js';
import { cityFromAddress } from '../../../shared/util/text.js';

/** Throws unless the URL belongs to the platform (prevents navigating to arbitrary hosts). */
export function assertPlatformUrl(platform, url) {
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    throw new ScrapeError(ScrapeOutcome.NOT_FOUND, 'Invalid URL.');
  }
  const ok = getAdapter(platform).hosts.some((h) => host === h || host.endsWith(`.${h}`));
  if (!ok) throw new ScrapeError(ScrapeOutcome.NOT_FOUND, `URL host ${host} does not belong to ${getAdapter(platform).label}.`);
}

/**
 * Collect one hotel's public profile and reviews from every enabled platform.
 *
 * 1. Google Maps (anchor): name, coordinates, address, prices and links to the hotel's OTA pages.
 * 2. OTAs — in parallel (different sites) when PARALLEL_PLATFORMS=true: use Google's link to the
 *    OTA page, or search by name + town and match on name + distance; fetch profile and reviews.
 * Every platform ends with an explicit outcome; one platform failing never stops the others.
 * Afterwards the hotel's next refresh is scheduled (15 days ± jitter) and, for a newly claimed
 * hotel, onboarding of its neighbourhood continues.
 */
export async function runProfileJob(job) {
  const log = childLogger({ jobId: job.jobId, hotelId: job.hotelId });
  const hotel = await hotels.getHotel(job.hotelId);
  if (!hotel) {
    await jobs.updateJob(job, { status: 'failed', finished: true, message: 'Hotel no longer exists.' });
    return;
  }
  const max = job.options.maxReviews ?? config.scraping.maxReviewsPerPlatform;
  const locationWords = [hotel.location ?? '', cityFromAddress(hotel.address) ?? ''];
  const platforms = job.options.platforms;

  const ctx = { listings: {} };
  // Existing listings give us the anchor (and Agoda id) when only some platforms are refreshed.
  for (const state of await listings.getListingStates(hotel.hotelId)) {
    if (state.listing) ctx.listings[state.platform] = state.listing;
  }
  const update = (platform, patch) => jobs.patchPlatformProgress(job, platform, patch);
  for (const p of platforms) await update(p, { status: 'PENDING', message: 'Waiting…' });
  await jobs.updateJob(job, { message: `Collecting ${hotel.name}…` });

  const outcomes = {};

  // ---- 1. Anchor -------------------------------------------------------------------------
  if (platforms.includes('google_maps')) {
    await runPlatform('google_maps', async () => {
      const forcedUrl = job.options.forced?.google_maps ?? hotel.googleUrl;
      assertPlatformUrl('google_maps', forcedUrl);
      const candidate = await ADAPTERS.google_maps.fromUrl(forcedUrl);
      return { candidate, match: { decision: 'user_selected', score: 1 }, alternatives: [] };
    });
  }

  const g = ctx.listings.google_maps;
  const anchor = g ? { name: g.name, geo: g.geo, address: g.address } : { name: hotel.name, geo: hotel.geo, address: hotel.address };

  // ---- 2. OTAs ---------------------------------------------------------------------------
  const otaTask = (platform) => () =>
    runPlatform(platform, async (page) => {
      const adapter = ADAPTERS[platform];
      const forcedUrl = job.options.forced?.[platform];
      if (forcedUrl) {
        assertPlatformUrl(platform, forcedUrl);
        const candidate = await adapter.fromUrl(forcedUrl, page);
        return { candidate, match: { decision: 'user_selected', score: 1 }, alternatives: [] };
      }
      // Google's own price list links to this hotel's page on the OTA: no name matching needed.
      const googleLink = ctx.listings.google_maps?.otaLinks?.[platform];
      if (googleLink) {
        return { candidate: { ...googleLink, name: anchor.name }, match: { decision: 'google_link', score: 1, method: 'Google Maps price link' }, alternatives: [] };
      }
      // Search with the town from Google's address ("Dehradun"), not free text typed by the user.
      const candidates = await adapter.search({ name: anchor.name, location: cityFromAddress(anchor.address) ?? hotel.location, anchor }, page);
      const { best, decision, ranked } = rankCandidates(anchor, candidates, locationWords);
      const alternatives = ranked.filter((c) => c.match.score >= 0.25).slice(0, 5).map((c) => ({ name: c.name, url: c.url, address: c.address ?? null, score: c.match.score, distanceKm: c.match.distanceKm }));
      if (!best) {
        throw Object.assign(new ScrapeError(ScrapeOutcome.NOT_FOUND, candidates.length
          ? `Not found on ${adapter.label}: Google lists no ${adapter.label} price for this hotel, and ${adapter.label}'s search returned only other properties (best name match ${ranked[0]?.match.score ?? 0}). It may not be listed there. If it is, paste its ${adapter.label} URL below.`
          : `${adapter.label} search returned no properties.`), { alternatives });
      }
      return { candidate: best, match: { decision, ...best.match }, alternatives };
    });
  // Lanes run in parallel; platforms inside a lane run in order. Booking.com reviews are read
  // through Agoda's review API, so Booking waits for Agoda.
  const lanes = [['agoda', 'booking'], ['makemytrip'], ['tripadvisor']]
    .map((lane) => lane.filter((p) => platforms.includes(p) && OTA_ORDER.includes(p)))
    .filter((lane) => lane.length);
  const runLane = async (lane) => {
    for (const p of lane) await otaTask(p)();
  };
  if (config.worker.parallelPlatforms) await Promise.all(lanes.map(runLane));
  else for (const lane of lanes) await runLane(lane);

  // ---- 3. Wrap up --------------------------------------------------------------------------
  const ok = (o) => /^SUCCESS|NEEDS_CONFIRMATION/.test(o);
  const values = Object.entries(outcomes).filter(([, o]) => o !== ScrapeOutcome.DISABLED);
  const googleOk = outcomes.google_maps ? ok(outcomes.google_maps) : true;
  const anyOk = values.some(([, o]) => ok(o));
  // "Not listed on this OTA" is a complete answer, not a failure.
  const allAnswered = values.every(([, o]) => ok(o) || o === ScrapeOutcome.NOT_FOUND);
  const profileStatus = !anyOk || !googleOk ? 'failed' : allAnswered ? 'complete' : 'partial';
  await hotels.markProfiled(hotel.hotelId, profileStatus);

  const status = anyOk ? 'completed' : 'failed';
  const summary = values.map(([p, o]) => `${p}: ${o}`).join(', ');
  await jobs.updateJob(job, { status, finished: true, message: `${hotel.name} — ${summary}` });
  log.info({ status, profileStatus }, 'Profile job finished');

  // New reviews → aspect analysis (AI lane), at the same priority as this collection.
  if (anyOk) await enqueueAnalysis(hotel.hotelId, { priority: job.priority, cityId: hotel.cityId }).catch((err) => log.error({ err }, 'Could not queue analysis'));

  // Re-reads the hotel: resumes an onboarding that was waiting for this hotel's coordinates.
  await continueOnboarding(hotel.hotelId).catch((err) => log.error({ err }, 'Onboarding continuation failed'));

  /**
   * Runs one platform: resolve → fetchListing → (re-score) → fetchReviews → store.
   * `resolve(page)` returns { candidate, match, alternatives }.
   */
  async function runPlatform(platform, resolve) {
    const adapter = ADAPTERS[platform];
    const plog = log.child({ platform });
    if (!config.scraping.enabled[platform]) {
      outcomes[platform] = ScrapeOutcome.DISABLED;
      await update(platform, { status: ScrapeOutcome.DISABLED, message: 'Disabled in configuration.' });
      return;
    }
    await update(platform, { status: 'RUNNING', startedAt: new Date().toISOString(), message: 'Searching…' });
    let alternatives = [];
    try {
      await withPage(async (page) => {
        const resolved = await resolve(page);
        alternatives = resolved.alternatives;
        let { match } = resolved;

        await update(platform, { message: 'Reading profile…' });
        const listing = await adapter.fetchListing(resolved.candidate, page, ctx);

        // Re-score with the fetched profile (it often has coordinates the search result lacked).
        if (match.decision === 'google_link') {
          const check = scoreCandidate(anchor, listing, locationWords);
          match = { ...match, distanceKm: check.distanceKm, nameScore: check.nameScore };
          // Google's link is normally exact; a very different name means the OTA lists it oddly — ask.
          if (check.nameScore < 0.4) match.decision = 'confirm';
        } else if (platform !== 'google_maps' && match.decision !== 'user_selected') {
          const rescored = scoreCandidate(anchor, listing, locationWords);
          if (rescored.distanceKm !== null) {
            match = { ...match, ...rescored };
            match.decision = rescored.score >= MATCH_THRESHOLDS.auto ? 'auto' : rescored.score >= MATCH_THRESHOLDS.confirm ? 'confirm' : 'none';
          }
          if (match.decision === 'none') {
            throw Object.assign(new ScrapeError(ScrapeOutcome.NOT_FOUND, `Best ${adapter.label} result "${listing.name}" is ${match.distanceKm ?? '?'} km away — probably a different property.`), { alternatives });
          }
        }

        // Google is the anchor: copy its canonical data onto the hotel before the OTAs start.
        if (platform === 'google_maps') {
          ctx.listings.google_maps = listing;
          const { geoChanged } = await hotels.applyGoogleListing(hotel.hotelId, listing);
          if (geoChanged) {
            if (!hotel.cityId) {
              const city = await cityContaining(listing.geo);
              if (city) await hotels.setHotelFields(hotel.hotelId, { cityId: city.id });
            }
            await rebuildNeighbors([hotel.hotelId]);
          }
        }

        await update(platform, { message: 'Collecting reviews…' });
        const { featuredReviews, ...listingToStore } = listing;
        ctx.listings[platform] = listing;
        const { reviews: raw, notes, sort } = await adapter.fetchReviews(listing, { max }, page, ctx);

        const fetchedAt = new Date().toISOString();
        const canonical = [];
        let rejected = 0;
        for (const r of raw) {
          try {
            const review = buildCanonicalReview(r, { bizId: hotel.hotelId, platform, listingExternalId: listing.externalId, fetchedAt });
            if (hasSignal(review)) canonical.push(review);
            else rejected++;
          } catch (err) {
            rejected++;
            plog.warn({ err: err.message }, 'Review rejected by schema');
          }
        }
        const counts = await listings.upsertReviews(hotel.hotelId, platform, canonical);
        const allNotes = [...(listing.notes ?? []), ...notes];
        if (rejected) allNotes.push(`${rejected} review(s) skipped because they had no rating or text, or failed validation.`);

        const status = match.decision === 'confirm'
          ? ScrapeOutcome.NEEDS_CONFIRMATION
          : canonical.length ? ScrapeOutcome.SUCCESS : ScrapeOutcome.SUCCESS_NO_REVIEWS;

        await listings.saveListingState(hotel.hotelId, platform, {
          status,
          listing: { ...listingToStore, notes: undefined },
          match,
          alternatives,
          notes: allNotes,
          reviewSort: sort,
          reviewsCollected: canonical.length,
          reviewsStored: counts.totalStored,
          lastJobId: job.jobId,
        });
        await listings.insertSnapshot(hotel.hotelId, platform, listing);
        outcomes[platform] = status;
        await update(platform, {
          status,
          finishedAt: new Date().toISOString(),
          message: status === ScrapeOutcome.NEEDS_CONFIRMATION
            ? `Probable match "${listing.name}" (score ${match.score}). Please confirm.`
            : `${canonical.length} reviews read (${counts.inserted} new, ${counts.updated} updated, ${counts.unchanged} unchanged).`,
          reviews: counts,
        });
        plog.info({ status, counts, ...(allNotes.length ? { notes: allNotes } : {}) }, 'Platform done');
      });
    } catch (err) {
      const { outcome, message } = classifyScrapeError(err);
      plog.warn({ outcome, err: message }, 'Platform failed');
      outcomes[platform] = outcome;
      const previous = await listings.getListingState(hotel.hotelId, platform);
      await listings.saveListingState(hotel.hotelId, platform, {
        ...(previous ?? {}),
        status: outcome,
        error: message,
        snapshotPath: err.snapshotPath ?? null,
        alternatives: err.alternatives ?? alternatives ?? previous?.alternatives ?? [],
        lastJobId: job.jobId,
        // Keep the previous successful listing data (if any) so a blocked refresh does not erase it.
        listing: previous?.listing ?? null,
      });
      await update(platform, { status: outcome, finishedAt: new Date().toISOString(), message });
    }
  }
}
