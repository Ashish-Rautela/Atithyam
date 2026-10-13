import { many, one, query } from '../shared/db/pool.js';

const iso = (d) => (d ? new Date(d).toISOString() : null);

const CITY_COLS = `c.id, c.name, c.kind, c.display_name, c.region, c.radius_km, c.radius_source, c.google_url, c.status, c.settings,
  c.last_error, c.last_seeded_at, c.created_at, c.updated_at, ST_Y(c.center::geometry) AS lat, ST_X(c.center::geometry) AS lng`;

const STATS = `
  (SELECT count(*)::int FROM hotels h WHERE h.city_id = c.id AND h.status = 'active') AS hotel_count,
  (SELECT count(*)::int FROM hotels h WHERE h.city_id = c.id AND h.profile_status IN ('complete', 'partial')) AS profiled_count,
  (SELECT count(*)::int FROM hotels h WHERE h.city_id = c.id AND h.profile_status = 'failed') AS failed_count,
  (SELECT count(*)::int FROM reviews r JOIN hotels h ON h.id = r.hotel_id WHERE h.city_id = c.id) AS review_count,
  (SELECT count(*)::int FROM clusters k WHERE k.city_id = c.id) AS cluster_count,
  (SELECT count(*)::int FROM jobs j WHERE j.city_id = c.id AND j.status = 'queued') AS queued_jobs,
  (SELECT count(*)::int FROM jobs j WHERE j.city_id = c.id AND j.status = 'running') AS running_jobs,
  (SELECT min(h.next_refresh_at) FROM hotels h WHERE h.city_id = c.id) AS next_refresh_at`;

function toCity(r) {
  if (!r) return null;
  return {
    cityId: r.id,
    name: r.name,
    kind: r.kind,
    displayName: r.display_name,
    region: r.region,
    center: r.lat != null ? { lat: r.lat, lng: r.lng } : null,
    radiusKm: r.radius_km,
    radiusSource: r.radius_source,
    googleUrl: r.google_url,
    status: r.status,
    settings: r.settings,
    lastError: r.last_error,
    lastSeededAt: iso(r.last_seeded_at),
    createdAt: iso(r.created_at),
    ...(r.hotel_count !== undefined
      ? {
          stats: {
            hotels: r.hotel_count,
            profiled: r.profiled_count,
            failed: r.failed_count,
            reviews: r.review_count,
            clusters: r.cluster_count,
            queuedJobs: r.queued_jobs,
            runningJobs: r.running_jobs,
            nextRefreshAt: iso(r.next_refresh_at),
          },
        }
      : {}),
  };
}

/** Insert a city/town by name, or return the existing one (names are unique, case-insensitive). */
export async function upsertCity({ name, kind = 'town', radiusKm = null, settings = {} }) {
  const row = await one(
    `INSERT INTO cities (name, kind, radius_km, radius_source, settings)
     VALUES ($1, $2, $3, CASE WHEN $3::numeric IS NULL THEN NULL ELSE 'operator' END, $4)
     ON CONFLICT ((lower(name))) DO UPDATE SET
       kind = EXCLUDED.kind,
       radius_km = COALESCE(EXCLUDED.radius_km, cities.radius_km),
       radius_source = COALESCE(EXCLUDED.radius_source, cities.radius_source),
       settings = cities.settings || EXCLUDED.settings,
       updated_at = now()
     RETURNING id, (xmax = 0) AS inserted`,
    [name.trim(), kind, radiusKm, JSON.stringify(settings)],
  );
  return { cityId: row.id, inserted: row.inserted };
}

export async function getCity(id, { withStats = true } = {}) {
  return toCity(await one(`SELECT ${CITY_COLS}${withStats ? `, ${STATS}` : ''} FROM cities c WHERE c.id = $1`, [id]));
}

export async function listCities() {
  return (await many(`SELECT ${CITY_COLS}, ${STATS} FROM cities c ORDER BY c.created_at DESC`)).map(toCity);
}

export async function updateCity(id, f) {
  await query(
    `UPDATE cities SET
        status         = COALESCE($2, status),
        display_name   = COALESCE($3, display_name),
        region         = COALESCE($4, region),
        center         = COALESCE($5::geography, center),
        radius_km      = COALESCE($6, radius_km),
        radius_source  = COALESCE($7, radius_source),
        google_url     = COALESCE($8, google_url),
        last_error     = CASE WHEN $9 THEN $10 ELSE last_error END,
        last_seeded_at = CASE WHEN $11 THEN now() ELSE last_seeded_at END,
        updated_at     = now()
      WHERE id = $1`,
    [
      id,
      f.status ?? null,
      f.displayName ?? null,
      f.region ?? null,
      f.center ? `SRID=4326;POINT(${f.center.lng} ${f.center.lat})` : null,
      f.radiusKm ?? null,
      f.radiusSource ?? null,
      f.googleUrl ?? null,
      'lastError' in f,
      f.lastError ?? null,
      Boolean(f.seeded),
    ],
  );
}

/** Hotels of a city for the city page, most-reviewed first. */
export async function cityHotels(cityId, { limit = 200, offset = 0, clusterId } = {}) {
  return many(
    `SELECT h.id AS "hotelId", h.name, h.google_rating AS "googleRating", h.google_review_count AS "googleReviewCount",
            h.price_inr AS "priceInr", h.star_class AS "starClass", h.lodging_type AS "lodgingType",
            h.profile_status AS "profileStatus", h.last_profiled_at AS "lastProfiledAt", h.next_refresh_at AS "nextRefreshAt",
            h.is_target AS "isTarget", k.label AS "cluster",
            (SELECT count(*)::int FROM reviews r WHERE r.hotel_id = h.id) AS "reviewsStored",
            (SELECT j.status FROM jobs j WHERE j.hotel_id = h.id AND j.kind = 'profile' ORDER BY j.created_at DESC LIMIT 1) AS "jobStatus"
       FROM hotels h LEFT JOIN cluster_members m ON m.hotel_id = h.id LEFT JOIN clusters k ON k.id = m.cluster_id
      WHERE h.city_id = $1 AND h.status = 'active' AND ($4::int IS NULL OR k.id = $4)
      ORDER BY h.google_review_count DESC NULLS LAST, h.name
      LIMIT $2 OFFSET $3`,
    [cityId, limit, offset, clusterId ?? null],
  );
}

/** Hotel ids of a city in enrichment order (most-reviewed first). `onlyStale` skips recently collected ones. */
export async function cityHotelIdsForEnrichment(cityId, { onlyStale }) {
  return (
    await many(
      `SELECT id FROM hotels WHERE city_id = $1 AND status = 'active'
          AND (NOT $2 OR profile_status = 'none' OR next_refresh_at IS NULL OR next_refresh_at <= now())
        ORDER BY google_review_count DESC NULLS LAST`,
      [cityId, onlyStale],
    )
  ).map((r) => r.id);
}
