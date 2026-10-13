import { config } from '../../shared/config/env.js';
import { childLogger } from '../../shared/logging/logger.js';
import { classifyScrapeError, ScrapeError, ScrapeOutcome } from '../../shared/errors/AppError.js';
import { withPage, politePause } from '../review-ingestion/browser/browserManager.js';
import { googleMaps } from '../review-ingestion/adapters/googleMaps.js';
import { enqueueProfile } from '../review-ingestion/jobs/enqueueProfile.js';
import * as hotels from '../../data/hotels.js';
import * as jobs from '../../data/jobs.js';
import * as cities from '../../data/cities.js';
import { recordDiscoveryArea, assignHotelsToCity, rebuildNeighborsForCity, rebuildClusters } from '../../data/geo.js';
import { planTiles, radiusFromZoom, clampRadius } from './tiles.js';

/**
 * Job 'seed_city': build the database for one city/town.
 *
 *   1. resolve   – find the town on Google Maps (centre + the zoom Google frames it with → radius)
 *   2. discover  – search a grid of tiles over the town with each lodging query; store every hotel
 *   3. graph     – link nearby hotels (hotel_neighbors) and build micro-market clusters (DBSCAN)
 *   4. enrich    – queue a full collection (all platforms + reviews) for every hotel, most-reviewed first
 *
 * Progress (finished tiles) is saved after every tile, so an interrupted or blocked run resumes
 * where it stopped. Setting the city to "paused" stops it between tiles.
 */
export async function runSeedCity(job) {
  const log = childLogger({ jobId: job.jobId, cityId: job.cityId, kind: 'seed_city' });
  const opts = job.options;
  let city = await cities.getCity(job.cityId, { withStats: false });
  if (!city) {
    await jobs.updateJob(job, { status: 'failed', finished: true, message: 'City no longer exists.' });
    return;
  }
  const progress = { phase: 'resolve', tilesDone: [], found: 0, added: 0, ...(job.progress ?? {}) };
  const save = (message) => jobs.mergeProgress(job, progress, message);
  await cities.updateCity(city.cityId, { status: 'seeding', lastError: null });

  try {
    // ---- 1. resolve ------------------------------------------------------------------------
    if (!city.center || opts.reresolve) {
      await save(`Finding ${city.name} on Google Maps…`);
      const area = await withPage((page) => googleMaps.resolveArea(city.name, page));
      const viewportKm = area.zoom ? radiusFromZoom(area.zoom, area.center.lat) : 4;
      const radiusKm = city.radiusSource === 'operator' && city.radiusKm ? Number(city.radiusKm) : clampRadius(viewportKm);
      await cities.updateCity(city.cityId, {
        displayName: area.displayName,
        region: area.region,
        center: area.center,
        googleUrl: area.url,
        radiusKm,
        radiusSource: city.radiusSource === 'operator' ? 'operator' : 'google_viewport',
      });
      city = await cities.getCity(city.cityId, { withStats: false });
      log.info({ center: city.center, radiusKm: city.radiusKm }, 'City resolved');
    }

    // ---- 2. discover -----------------------------------------------------------------------
    const tileRadiusKm = opts.tileRadiusKm ?? config.data.seedTileRadiusKm;
    const queries = opts.queries?.length ? opts.queries : config.data.seedQueries;
    // `maxTiles` limits a trial run (e.g. the smoke test) to the centre of town.
    const tiles = planTiles(city.center, Number(city.radiusKm), tileRadiusKm).slice(0, opts.maxTiles ?? Infinity);
    progress.phase = 'discover';
    progress.tiles = tiles.length;
    const done = new Set(progress.tilesDone);
    await save(`Searching ${tiles.length} map tiles over ${city.name} (${done.size} done)…`);

    await withPage(async (page) => {
      for (let i = 0; i < tiles.length; i++) {
        if (done.has(i)) continue;
        const current = await cities.getCity(city.cityId, { withStats: false });
        if (current.status === 'paused' || (await jobs.isCancelled(job.jobId))) {
          throw new ScrapeError('PAUSED', 'Seeding paused by the operator.');
        }
        const { places } = await googleMaps.discoverNearby({ center: tiles[i], radiusKm: tileRadiusKm, queries, offsets: false }, page);
        const saved = await hotels.upsertDiscoveredHotels(places, { cityId: city.cityId });
        await recordDiscoveryArea({ cityId: city.cityId, center: tiles[i], radiusKm: tileRadiusKm, queries, placesFound: places.length });
        done.add(i);
        progress.tilesDone = [...done];
        progress.found += places.length;
        progress.added += saved.filter((s) => s.inserted).length;
        await save(`Tile ${done.size}/${tiles.length}: ${progress.added} hotels added so far.`);
        await politePause(0.5);
      }
    });

    // ---- 3. graph --------------------------------------------------------------------------
    progress.phase = 'graph';
    await save('Linking nearby hotels and building clusters…');
    await assignHotelsToCity(city.cityId);
    const graph = await rebuildNeighborsForCity(city.cityId);
    const clusters = await rebuildClusters(city.cityId);
    progress.graph = { ...graph, ...clusters };
    await cities.updateCity(city.cityId, { status: 'ready', seeded: true });

    // ---- 4. enrich -------------------------------------------------------------------------
    let queued = 0;
    if (opts.enrich !== false) {
      progress.phase = 'enrich';
      const ids = await cities.cityHotelIdsForEnrichment(city.cityId, { onlyStale: !opts.force });
      for (const id of ids) {
        const { created } = await enqueueProfile(id, {
          priority: jobs.PRIORITY.SEED,
          reason: opts.force ? 'reseed' : 'seed',
          cityId: city.cityId,
          parentId: job.jobId,
          maxReviews: opts.maxReviews ?? config.data.seedMaxReviews,
          platforms: opts.platforms,
        });
        if (created) queued++;
      }
      progress.queued = queued;
    }
    progress.phase = 'done';
    const message = `${city.name}: ${graph.hotels} hotels, ${clusters.clusters} clusters, ${graph.links} nearby links. ${opts.enrich === false ? 'Data collection not requested.' : `Queued data collection for ${queued} hotels.`}`;
    await jobs.updateJob(job, { status: 'completed', finished: true, message, progress });
    log.info({ ...graph, ...clusters, queued }, 'City seeded');
  } catch (err) {
    if (err.outcome === 'PAUSED') {
      await save('Paused — resume to continue from the next tile.');
      await jobs.updateJob(job, { status: 'cancelled', finished: true, message: 'Paused — resume to continue from the next tile.' });
      return;
    }
    const { outcome, message } = classifyScrapeError(err);
    log.warn({ outcome, err: message }, 'City seeding failed');
    await save(message);
    const retry = [ScrapeOutcome.BLOCKED, ScrapeOutcome.NETWORK_ERROR, ScrapeOutcome.TIMEOUT].includes(outcome) && job.attempts < job.maxAttempts;
    await cities.updateCity(city.cityId, { status: retry ? 'seeding' : 'failed', lastError: message });
    if (retry) throw err; // worker re-queues with backoff; finished tiles are kept
    await jobs.updateJob(job, { status: 'failed', outcome, error: message, message, finished: true });
  }
}
