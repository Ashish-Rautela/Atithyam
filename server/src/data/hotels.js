import { randomUUID } from 'node:crypto';
import { one, many, query } from '../shared/db/pool.js';
import { config } from '../shared/config/env.js';
import { searchKey } from '../shared/util/text.js';
import { isPoint } from '../shared/util/geo.js';

export const newHotelId = () => randomUUID().replace(/-/g, '').slice(0, 12);

/** Columns selected for a hotel, with the point split into lat/lng. */
export const HOTEL_COLS = `
  h.id, h.google_place_id, h.name, h.address, h.location_text, h.city_id, h.google_url, h.star_class, h.lodging_type,
  h.google_rating, h.google_review_count, h.price_inr, h.price_seen_at, h.sponsored, h.is_target, h.claimed_at, h.source,
  h.status, h.onboard_status, h.profile_status, h.last_profiled_at, h.next_refresh_at, h.first_seen_at, h.last_seen_at,
  h.created_at, h.updated_at,
  ST_Y(h.geo::geometry) AS lat, ST_X(h.geo::geometry) AS lng`;

const iso = (d) => (d ? new Date(d).toISOString() : null);

/** DB row -> API shape. `bizId` is kept as an alias of the hotel id so existing pages keep working. */
export function toHotel(r) {
  if (!r) return null;
  return {
    bizId: r.id,
    hotelId: r.id,
    placeId: r.google_place_id,
    name: r.name,
    address: r.address,
    location: r.location_text,
    cityId: r.city_id,
    geo: r.lat != null ? { lat: r.lat, lng: r.lng } : null,
    googleUrl: r.google_url,
    starClass: r.star_class,
    lodgingType: r.lodging_type,
    googleRating: r.google_rating,
    googleReviewCount: r.google_review_count,
    priceInr: r.price_inr,
    priceSeenAt: iso(r.price_seen_at),
    sponsored: r.sponsored,
    role: r.is_target ? 'target' : 'competitor',
    isTarget: r.is_target,
    claimedAt: iso(r.claimed_at),
    source: r.source,
    status: r.status,
    onboardStatus: r.onboard_status,
    profileStatus: r.profile_status,
    lastProfiledAt: iso(r.last_profiled_at),
    nextRefreshAt: iso(r.next_refresh_at),
    firstSeenAt: iso(r.first_seen_at),
    lastSeenAt: iso(r.last_seen_at),
    createdAt: iso(r.created_at),
    category: 'hotel',
    ...(r.distance_m != null ? { distanceKm: Math.round(r.distance_m / 10) / 100 } : {}),
  };
}

const point = (geo) => (isPoint(geo) ? `SRID=4326;POINT(${geo.lng} ${geo.lat})` : null);

export async function getHotel(id) {
  return toHotel(await one(`SELECT ${HOTEL_COLS} FROM hotels h WHERE h.id = $1`, [id]));
}

export async function getHotelByPlace(placeId) {
  if (!placeId) return null;
  return toHotel(await one(`SELECT ${HOTEL_COLS} FROM hotels h WHERE h.google_place_id = $1`, [placeId]));
}

export async function getHotelsByPlaceIds(placeIds) {
  if (!placeIds.length) return [];
  return (await many(`SELECT ${HOTEL_COLS} FROM hotels h WHERE h.google_place_id = ANY($1)`, [placeIds])).map(toHotel);
}

/** Hotels claimed by users ("my hotels"), newest first. */
export async function listTargets(limit = 50) {
  return (await many(`SELECT ${HOTEL_COLS} FROM hotels h WHERE h.is_target ORDER BY h.claimed_at DESC LIMIT $1`, [limit])).map(toHotel);
}

/**
 * Fuzzy name lookup in the database (instant — no scraping). `location` narrows by town/address.
 */
export async function searchHotels({ name, location, limit = 8 }) {
  const key = searchKey(name);
  if (!key) return [];
  const loc = location?.trim() ? `%${location.trim()}%` : null;
  const rows = await many(
    `SELECT ${HOTEL_COLS}, similarity(h.name_norm, $1) AS sim, c.name AS city_name
       FROM hotels h LEFT JOIN cities c ON c.id = h.city_id
      WHERE h.status = 'active'
        AND (h.name_norm % $1 OR h.name_norm LIKE '%' || $1 || '%')
        AND ($2::text IS NULL OR h.address ILIKE $2 OR c.name ILIKE $2 OR h.location_text ILIKE $2)
      ORDER BY sim DESC, h.google_review_count DESC NULLS LAST
      LIMIT $3`,
    [key, loc, limit],
  );
  return rows.map((r) => ({ ...toHotel(r), cityName: r.city_name, similarity: Math.round(r.sim * 100) / 100 }));
}

/**
 * Insert or refresh hotels found in a Google Maps result list. One row per Google place id.
 * Returns [{ id, placeId, inserted }].
 */
export async function upsertDiscoveredHotels(places, { cityId = null } = {}) {
  const rows = places
    .filter((p) => p.placeId && p.name)
    .map((p) => ({
      id: newHotelId(),
      place_id: p.placeId,
      name: p.name,
      name_norm: searchKey(p.name),
      geo: point(p.geo),
      url: p.url ?? null,
      star: p.starClass ?? null,
      type: p.lodgingType ?? null,
      rating: p.rating ?? null,
      reviews: p.reviewCount ?? null,
      price: p.priceInr ?? null,
      sponsored: Boolean(p.sponsored),
    }));
  if (!rows.length) return [];
  const result = await many(
    `INSERT INTO hotels AS h (id, google_place_id, name, name_norm, geo, google_url, star_class, lodging_type,
                              google_rating, google_review_count, price_inr, price_seen_at, sponsored, city_id, source)
     SELECT r.id, r.place_id, r.name, r.name_norm, r.geo::geography, r.url, r.star, r.type, r.rating, r.reviews, r.price,
            CASE WHEN r.price IS NULL THEN NULL ELSE now() END, r.sponsored, $2, 'discovery'
       FROM jsonb_to_recordset($1::jsonb) AS r(id text, place_id text, name text, name_norm text, geo text, url text,
            star smallint, type text, rating numeric, reviews integer, price integer, sponsored boolean)
     ON CONFLICT (google_place_id) DO UPDATE SET
       geo                 = COALESCE(h.geo, EXCLUDED.geo),
       google_url          = COALESCE(h.google_url, EXCLUDED.google_url),
       star_class          = COALESCE(EXCLUDED.star_class, h.star_class),
       lodging_type        = COALESCE(EXCLUDED.lodging_type, h.lodging_type),
       google_rating       = COALESCE(EXCLUDED.google_rating, h.google_rating),
       google_review_count = GREATEST(EXCLUDED.google_review_count, h.google_review_count),
       price_inr           = COALESCE(EXCLUDED.price_inr, h.price_inr),
       price_seen_at       = CASE WHEN EXCLUDED.price_inr IS NULL THEN h.price_seen_at ELSE now() END,
       sponsored           = EXCLUDED.sponsored,
       city_id             = COALESCE(h.city_id, EXCLUDED.city_id),
       status              = 'active',
       last_seen_at        = now(),
       updated_at          = now()
     RETURNING id, google_place_id AS "placeId", (xmax = 0) AS inserted`,
    [JSON.stringify(rows), cityId],
  );
  return result;
}

/**
 * Register the hotel a user picked as "my hotel". Reuses the existing row when the Google place is
 * already in the database (e.g. it was seeded or collected as someone's competitor).
 * Returns { hotel, created }.
 */
export async function claimHotel({ hotelId, name, location, googleUrl, placeId, geo }) {
  const existing = hotelId ? await getHotel(hotelId) : placeId ? await getHotelByPlace(placeId) : null;
  if (existing) {
    await query(
      `UPDATE hotels SET is_target = true, claimed_at = COALESCE(claimed_at, now()),
              location_text = COALESCE($2, location_text), google_url = COALESCE(google_url, $3), updated_at = now()
        WHERE id = $1`,
      [existing.hotelId, location ?? null, googleUrl],
    );
    return { hotel: await getHotel(existing.hotelId), created: false };
  }
  const id = newHotelId();
  await query(
    `INSERT INTO hotels (id, google_place_id, name, name_norm, location_text, google_url, geo, is_target, claimed_at, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7::geography, true, now(), 'user')`,
    [id, placeId ?? null, name, searchKey(name), location ?? null, googleUrl, point(geo)],
  );
  return { hotel: await getHotel(id), created: true };
}

export async function setHotelFields(id, fields) {
  const cols = { googleUrl: 'google_url', onboardStatus: 'onboard_status', locationText: 'location_text', cityId: 'city_id' };
  const sets = [];
  const vals = [id];
  for (const [k, col] of Object.entries(cols)) {
    if (k in fields) {
      vals.push(fields[k]);
      sets.push(`${col} = $${vals.length}`);
    }
  }
  if (!sets.length) return;
  await query(`UPDATE hotels SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, vals);
}

/**
 * Copy what Google's place page says into the hotel row (canonical name, coordinates, address,
 * rating). Returns { geoChanged }. The place id is only set when no other hotel already owns it.
 */
export async function applyGoogleListing(id, listing) {
  const placeId = listing.externalId?.startsWith('0x') ? listing.externalId : null;
  const before = await one('SELECT ST_Y(geo::geometry) AS lat, ST_X(geo::geometry) AS lng FROM hotels WHERE id = $1', [id]);
  await query(
    `UPDATE hotels h SET
        name                = COALESCE($2, h.name),
        name_norm           = COALESCE($3, h.name_norm),
        address             = COALESCE($4, h.address),
        geo                 = COALESCE($5::geography, h.geo),
        google_url          = CASE WHEN $6 LIKE '%/maps/place/%' THEN $6 ELSE h.google_url END,
        star_class          = COALESCE($7, h.star_class),
        google_rating       = COALESCE($8, h.google_rating),
        google_review_count = COALESCE($9, h.google_review_count),
        google_place_id     = CASE WHEN h.google_place_id IS NULL AND $10::text IS NOT NULL
                                    AND NOT EXISTS (SELECT 1 FROM hotels o WHERE o.google_place_id = $10 AND o.id <> h.id)
                               THEN $10 ELSE h.google_place_id END,
        updated_at          = now()
      WHERE h.id = $1`,
    [
      id,
      listing.name ?? null,
      listing.name ? searchKey(listing.name) : null,
      listing.address ?? null,
      point(listing.geo),
      listing.url ?? '',
      listing.starClass ?? null,
      listing.rating?.value ?? null,
      listing.reviewCount ?? null,
      placeId,
    ],
  );
  const geoChanged = isPoint(listing.geo) && (!before || before.lat == null || Math.abs(before.lat - listing.geo.lat) > 1e-5 || Math.abs(before.lng - listing.geo.lng) > 1e-5);
  return { geoChanged };
}

/**
 * Record the outcome of a full collection and schedule the next refresh:
 * now + REFRESH_INTERVAL_DAYS ± a random REFRESH_JITTER_HOURS ("salt"), so a city seeded in one
 * night does not come due all on the same day.
 */
export async function markProfiled(id, profileStatus) {
  // A failed collection (e.g. blocked) is retried after a couple of days rather than a full interval.
  const days = profileStatus === 'failed' ? Math.min(2, config.data.refreshIntervalDays) : config.data.refreshIntervalDays;
  const jitterHours = profileStatus === 'failed' ? Math.min(12, config.data.refreshJitterHours) : config.data.refreshJitterHours;
  await query(
    `UPDATE hotels SET profile_status = $2, last_profiled_at = now(),
            next_refresh_at = now() + make_interval(days => $3) + (random() * 2 - 1) * make_interval(hours => $4),
            updated_at = now()
      WHERE id = $1`,
    [id, profileStatus, days, jitterHours],
  );
}

/** Hotels whose scheduled refresh is due (and that have no collection queued or running). */
export async function dueForRefresh(limit) {
  return many(
    `SELECT h.id, h.city_id FROM hotels h
      WHERE h.status = 'active' AND h.next_refresh_at <= now()
        AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.dedupe_key = 'profile:' || h.id AND j.status IN ('queued', 'running'))
      ORDER BY h.is_target DESC, h.next_refresh_at
      LIMIT $1`,
    [limit],
  );
}
