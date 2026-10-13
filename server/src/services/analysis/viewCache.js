import { one, query } from '../../shared/db/pool.js';
import { hashParts } from '../../shared/util/hash.js';
import { logger } from '../../shared/logging/logger.js';

/**
 * Stored results of the expensive per-hotel views (benchmark, trends).
 *
 * A view is computed once — normally right after the hotel's reviews are analysed, i.e. during
 * seeding / onboarding — and served from Postgres until its inputs change. The version covers
 * everything a view reads: which peers it compares with, their analysed reviews, their platform
 * listings and the hotel's logged events. Anything time-relative (emerging issues use "last 60
 * days") is also recomputed after `maxAgeHours`.
 */
const MAX_AGE_HOURS = 24;

export async function dataVersion(hotelId, ids) {
  const r = await one(
    `SELECT (SELECT coalesce(max(analyzed_at)::text, '') || ':' || count(*) FROM review_analysis WHERE hotel_id = ANY($1)) AS a,
            (SELECT coalesce(max(updated_at)::text, '') || ':' || count(*) FROM platform_listings WHERE hotel_id = ANY($1)) AS l,
            (SELECT coalesce(max(id), 0) || ':' || count(*) FROM hotel_events WHERE hotel_id = $2) AS e`,
    [ids, hotelId],
  );
  return hashParts([[...ids].sort().join(','), r.a, r.l, r.e], 16);
}

/**
 * Return the stored view when it is current, otherwise compute, store and return it.
 * `ids` = the hotel and the peers the view compares with.
 */
export async function cachedView({ hotelId, view, params, ids, compute, maxAgeHours = MAX_AGE_HOURS, refresh = false }) {
  const version = await dataVersion(hotelId, ids);
  if (!refresh) {
    const row = await one(
      `SELECT payload, computed_at FROM computed_views
        WHERE hotel_id = $1 AND view = $2 AND params = $3 AND version = $4 AND computed_at > now() - make_interval(hours => $5)`,
      [hotelId, view, params, version, maxAgeHours],
    );
    if (row) return { ...row.payload, cache: { hit: true, computedAt: row.computed_at.toISOString() } };
  }
  const started = Date.now();
  const payload = await compute();
  const ms = Date.now() - started;
  await query(
    `INSERT INTO computed_views (hotel_id, view, params, version, payload, compute_ms, computed_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (hotel_id, view, params) DO UPDATE SET version = EXCLUDED.version, payload = EXCLUDED.payload,
       compute_ms = EXCLUDED.compute_ms, computed_at = now()`,
    [hotelId, view, params, version, JSON.stringify(payload), ms],
  ).catch((err) => logger.warn({ err: err.message, hotelId, view }, 'Could not store computed view'));
  return { ...payload, cache: { hit: false, computedAt: new Date().toISOString(), ms } };
}

/* ---- warming: compute views in the background right after new analysis ---- */

const pending = new Set();
let chain = Promise.resolve();

/**
 * Pre-compute the default benchmark and rating trend of these hotels, one at a time in the
 * background (never blocks the caller). Called after a hotel's reviews are analysed, for the hotel
 * itself and for owner hotels that compare with it.
 */
export function warmViews(hotelIds) {
  for (const id of hotelIds) {
    if (pending.has(id)) continue;
    pending.add(id);
    chain = chain
      .then(async () => {
        pending.delete(id);
        const [{ getBenchmark }, { getTrends }] = await Promise.all([import('./benchmark.js'), import('./trends.js')]);
        await getBenchmark(id, { peers: 'compset', radiusKm: 3 });
        await getTrends(id, { measure: 'rating', peers: 'compset', radiusKm: 3 });
      })
      .catch((err) => {
        pending.delete(id);
        logger.warn({ err: err.message, hotelId: id }, 'Could not pre-compute views');
      });
  }
  return chain;
}

/** Owner hotels (claimed targets) within the neighbour graph of `hotelId` — their benchmark includes it. */
export async function targetsAround(hotelId) {
  const { rows } = await query(
    `SELECT h.id FROM hotel_neighbors n JOIN hotels h ON h.id = n.hotel_id
      WHERE n.neighbor_id = $1 AND h.is_target`,
    [hotelId],
  );
  return rows.map((r) => r.id);
}
