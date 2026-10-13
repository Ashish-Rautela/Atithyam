import { AppError } from '../../shared/errors/AppError.js';
import { config } from '../../shared/config/env.js';
import * as cities from '../../data/cities.js';
import * as jobs from '../../data/jobs.js';
import { listClusters } from '../../data/geo.js';

/**
 * Add cities/towns and queue a seeding run for each. A name already in the database is not
 * duplicated; if it is being seeded right now, the running job is returned.
 */
export async function addCities({ names, kind = 'town', radiusKm, maxReviews, platforms, enrich = true, maxTiles }) {
  const byKey = new Map();
  for (const n of names) if (n.trim() && !byKey.has(n.trim().toLowerCase())) byKey.set(n.trim().toLowerCase(), n.trim());
  const unique = [...byKey.values()];
  const results = [];
  for (const name of unique) {
    const { cityId, inserted } = await cities.upsertCity({ name, kind, radiusKm: radiusKm ?? null, settings: { maxReviews, platforms } });
    const { job, created } = await queueSeed(cityId, { maxReviews, platforms, enrich, maxTiles });
    results.push({ cityId, name, newCity: inserted, jobId: job.jobId, alreadyRunning: !created });
  }
  return { items: results };
}

/**
 * Seed a city again.
 *   mode 'refresh' – search the map again (new/closed hotels) and collect hotels whose data is due
 *   mode 'full'    – also re-collect every hotel now, whatever its refresh date
 *   mode 'resume'  – continue a paused/failed run from the tile it stopped at
 */
export async function reseedCity(cityId, { mode = 'refresh', reresolve = false, enrich = true } = {}) {
  const city = await cities.getCity(cityId, { withStats: false });
  if (!city) throw AppError.notFound('City not found');
  let progress = {};
  if (mode === 'resume') {
    const last = await jobs.latestJob({ cityId, kind: 'seed_city' });
    if (last && ['cancelled', 'failed'].includes(last.status) && last.progress?.tilesDone) {
      progress = { tilesDone: last.progress.tilesDone, found: last.progress.found ?? 0, added: last.progress.added ?? 0 };
    }
  }
  await cities.updateCity(cityId, { status: 'pending' });
  const { job, created } = await queueSeed(cityId, {
    ...city.settings,
    enrich,
    force: mode === 'full',
    reresolve,
    progress,
    reason: mode === 'resume' ? 'seed' : 'reseed',
  });
  // Collections for this city parked at start-up (BACKGROUND_SCRAPING=false) continue too.
  const resumed = await jobs.resumeHeld({ cityId });
  return { jobId: job.jobId, alreadyRunning: !created, resumed };
}

/** Stop seeding: queued work for the city is cancelled; a running map search stops after its current tile. */
export async function pauseCity(cityId) {
  const city = await cities.getCity(cityId, { withStats: false });
  if (!city) throw AppError.notFound('City not found');
  await cities.updateCity(cityId, { status: 'paused' });
  const cancelled = await jobs.cancelQueued({ cityId });
  return { cancelled };
}

async function queueSeed(cityId, { maxReviews, platforms, enrich = true, force = false, reresolve = false, progress = {}, reason = 'seed', maxTiles }) {
  return jobs.enqueue({
    kind: 'seed_city',
    cityId,
    reason,
    priority: jobs.PRIORITY.SEED_DISCOVERY,
    dedupeKey: `seed:${cityId}`,
    maxAttempts: 3,
    payload: {
      maxReviews: maxReviews ?? config.data.seedMaxReviews,
      platforms: platforms?.length ? platforms : undefined,
      enrich,
      force,
      reresolve,
      queries: config.data.seedQueries,
      tileRadiusKm: config.data.seedTileRadiusKm,
      ...(maxTiles ? { maxTiles } : {}),
    },
    progress,
  });
}

export async function listCities() {
  return { items: await cities.listCities() };
}

export async function getCityDetail(cityId, { clusterId, limit = 300, offset = 0 } = {}) {
  const city = await cities.getCity(cityId);
  if (!city) throw AppError.notFound('City not found');
  const [seedJob, clusters, hotelRows] = await Promise.all([
    jobs.latestJob({ cityId, kind: 'seed_city' }),
    listClusters(cityId),
    cities.cityHotels(cityId, { clusterId, limit, offset }),
  ]);
  return { city, seedJob, clusters, hotels: hotelRows, refresh: { intervalDays: config.data.refreshIntervalDays, jitterHours: config.data.refreshJitterHours } };
}

export async function getQueue() {
  return jobs.queueStats();
}
