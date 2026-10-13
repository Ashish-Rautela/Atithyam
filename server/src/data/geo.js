import { many, one, query, tx } from '../shared/db/pool.js';
import { config } from '../shared/config/env.js';
import { HOTEL_COLS, toHotel } from './hotels.js';
import { localityFromAddress } from '../shared/util/text.js';
import { distanceKm, isPoint } from '../shared/util/geo.js';

const pointSql = (geo) => `SRID=4326;POINT(${geo.lng} ${geo.lat})`;

/* ------------------------------------------------------------ nearby-hotel graph */

/**
 * Recompute the neighbour links of the given hotels (both directions) — every active hotel within
 * NEIGHBOR_RADIUS_KM. Uses the GiST index on hotels.geo, so it stays fast for whole cities.
 */
export async function rebuildNeighbors(hotelIds) {
  if (!hotelIds.length) return 0;
  return tx(async (c) => {
    // One rebuild at a time across all workers: overlapping DELETE/INSERT sets could otherwise deadlock.
    await c.query('SELECT pg_advisory_xact_lock(74201012)');
    await c.query('DELETE FROM hotel_neighbors WHERE hotel_id = ANY($1) OR neighbor_id = ANY($1)', [hotelIds]);
    const { rowCount } = await c.query(
      `INSERT INTO hotel_neighbors (hotel_id, neighbor_id, distance_m)
       SELECT a.id, b.id, round(ST_Distance(a.geo, b.geo))::int
         FROM hotels a JOIN hotels b ON b.id <> a.id AND ST_DWithin(a.geo, b.geo, $2)
        WHERE (a.id = ANY($1) OR b.id = ANY($1))
          AND a.status = 'active' AND b.status = 'active' AND a.geo IS NOT NULL AND b.geo IS NOT NULL
       ON CONFLICT (hotel_id, neighbor_id) DO UPDATE SET distance_m = EXCLUDED.distance_m`,
      [hotelIds, config.data.neighborRadiusKm * 1000],
    );
    return rowCount;
  });
}

export async function rebuildNeighborsForCity(cityId) {
  const ids = (await many('SELECT id FROM hotels WHERE city_id = $1 AND geo IS NOT NULL', [cityId])).map((r) => r.id);
  return { hotels: ids.length, links: await rebuildNeighbors(ids) };
}

/** Hotels linked to `hotelId`, nearest first. */
export async function neighborsOf(hotelId, maxKm = config.data.neighborRadiusKm) {
  const rows = await many(
    `SELECT ${HOTEL_COLS}, n.distance_m FROM hotel_neighbors n JOIN hotels h ON h.id = n.neighbor_id
      WHERE n.hotel_id = $1 AND n.distance_m <= $2 AND h.status = 'active'
      ORDER BY n.distance_m`,
    [hotelId, maxKm * 1000],
  );
  return rows.map(toHotel);
}

export async function neighborCount(hotelId) {
  return (await one('SELECT count(*)::int AS n FROM hotel_neighbors WHERE hotel_id = $1', [hotelId])).n;
}

/* ------------------------------------------------------------ discovery coverage */

export async function recordDiscoveryArea({ cityId = null, center, radiusKm, queries, placesFound }) {
  await query(
    `INSERT INTO discovery_areas (city_id, center, radius_m, queries, places_found) VALUES ($1, $2::geography, $3, $4, $5)`,
    [cityId, pointSql(center), Math.round(radiusKm * 1000), queries, placesFound],
  );
}

/**
 * True when hotels within `radiusKm` of `geo` were already discovered recently — either by a
 * seeded city that contains the point, or by a discovery search centred close enough.
 */
export async function isAreaCovered(geo, radiusKm) {
  if (!isPoint(geo)) return false;
  const r = await one(
    `SELECT EXISTS (
        SELECT 1 FROM cities c
         WHERE c.last_seeded_at > now() - make_interval(days => $3) AND c.center IS NOT NULL
           AND ST_DWithin(c.center, $1::geography, GREATEST(c.radius_km * 1000 - $2::float8 * 500, 0))
     ) OR EXISTS (
        SELECT 1 FROM discovery_areas d
         WHERE d.discovered_at > now() - make_interval(days => $3)
           AND ST_Distance(d.center, $1::geography) + $2::float8 * 1000 <= d.radius_m + 250
     ) AS covered`,
    [pointSql(geo), Number(radiusKm), config.data.discoveryFreshDays],
  );
  return r.covered;
}

/* ------------------------------------------------------------ cities */

/** Attach hotels inside the city's radius (and not yet in another city) to the city. */
export async function assignHotelsToCity(cityId) {
  const { rowCount } = await query(
    `UPDATE hotels h SET city_id = c.id, updated_at = now()
       FROM cities c
      WHERE c.id = $1 AND h.city_id IS NULL AND h.geo IS NOT NULL AND c.center IS NOT NULL
        AND ST_DWithin(h.geo, c.center, c.radius_km * 1000 + 500)`,
    [cityId],
  );
  return rowCount;
}

/** The seeded city whose area contains the point, if any. */
export async function cityContaining(geo) {
  if (!isPoint(geo)) return null;
  return one(
    `SELECT id, name FROM cities WHERE center IS NOT NULL AND ST_DWithin(center, $1::geography, radius_km * 1000 + 500)
      ORDER BY ST_Distance(center, $1::geography) LIMIT 1`,
    [pointSql(geo)],
  );
}

/* ------------------------------------------------------------ micro-market clusters */

/**
 * Rebuild a city's clusters with DBSCAN (PostGIS ST_ClusterDBSCAN): hotels closer than
 * CLUSTER_EPS_M chain into one micro-market; at least CLUSTER_MIN_POINTS hotels form a cluster.
 * Isolated hotels are attached to the nearest cluster within 3×eps (core = false).
 * Each cluster is labelled with the most common neighbourhood in its members' addresses.
 */
export async function rebuildClusters(cityId) {
  const eps = config.data.clusterEpsM;
  const minPoints = config.data.clusterMinPoints;
  const rows = await many(
    `SELECT id, address, price_inr, ST_Y(geo::geometry) AS lat, ST_X(geo::geometry) AS lng,
            ST_ClusterDBSCAN(ST_Transform(geo::geometry, 3857), eps := $2 / cos(radians(ST_Y(geo::geometry))), minpoints := $3) OVER () AS cid
       FROM hotels WHERE city_id = $1 AND geo IS NOT NULL AND status = 'active'`,
    [cityId, eps, minPoints],
  );
  const groups = new Map();
  for (const r of rows.filter((x) => x.cid !== null)) {
    if (!groups.has(r.cid)) groups.set(r.cid, []);
    groups.get(r.cid).push({ ...r, core: true });
  }
  const centroidOf = (members) => ({
    lat: members.reduce((s, m) => s + m.lat, 0) / members.length,
    lng: members.reduce((s, m) => s + m.lng, 0) / members.length,
  });
  const centroids = new Map([...groups].map(([cid, m]) => [cid, centroidOf(m)]));
  for (const r of rows.filter((x) => x.cid === null)) {
    let best = null;
    for (const [cid, c] of centroids) {
      const d = distanceKm(c, r);
      if (d !== null && d * 1000 <= eps * 3 && (!best || d < best.d)) best = { cid, d };
    }
    if (best) groups.get(best.cid).push({ ...r, core: false });
  }

  const clusters = [...groups.values()]
    .sort((a, b) => b.length - a.length)
    .map((members, i) => {
      const center = centroidOf(members);
      const prices = members.map((m) => m.price_inr).filter(Number.isFinite).sort((a, b) => a - b);
      const localities = new Map();
      for (const m of members) {
        const loc = localityFromAddress(m.address);
        if (loc) localities.set(loc, (localities.get(loc) ?? 0) + 1);
      }
      const top = [...localities].sort((a, b) => b[1] - a[1])[0];
      return {
        clusterNo: i + 1,
        label: top && top[1] >= 2 ? top[0] : `Area ${i + 1}`,
        center,
        radiusM: Math.round(Math.max(...members.map((m) => distanceKm(center, m) * 1000))),
        medianPrice: prices.length ? prices[Math.floor(prices.length / 2)] : null,
        members,
      };
    });

  await tx(async (c) => {
    await c.query('DELETE FROM clusters WHERE city_id = $1', [cityId]);
    for (const cl of clusters) {
      const { rows: [row] } = await c.query(
        `INSERT INTO clusters (city_id, cluster_no, label, method, params, centroid, radius_m, hotel_count, median_price_inr)
         VALUES ($1, $2, $3, 'dbscan', $4, $5::geography, $6, $7, $8) RETURNING id`,
        [cityId, cl.clusterNo, cl.label, JSON.stringify({ epsM: eps, minPoints }), pointSql(cl.center), cl.radiusM, cl.members.length, cl.medianPrice],
      );
      await c.query(
        `INSERT INTO cluster_members (cluster_id, hotel_id, core)
         SELECT $1, m.id, m.core FROM jsonb_to_recordset($2::jsonb) AS m(id text, core boolean)
         ON CONFLICT (hotel_id) DO UPDATE SET cluster_id = EXCLUDED.cluster_id, core = EXCLUDED.core`,
        [row.id, JSON.stringify(cl.members.map((m) => ({ id: m.id, core: m.core })))],
      );
    }
  });
  return { clusters: clusters.length, clustered: clusters.reduce((s, c) => s + c.members.length, 0), unclustered: rows.length - clusters.reduce((s, c) => s + c.members.length, 0) };
}

export async function listClusters(cityId) {
  return many(
    `SELECT c.id, c.cluster_no AS "clusterNo", c.label, c.hotel_count AS "hotelCount", c.radius_m AS "radiusM",
            c.median_price_inr AS "medianPriceInr", ST_Y(c.centroid::geometry) AS lat, ST_X(c.centroid::geometry) AS lng,
            c.built_at AS "builtAt",
            count(h.id) FILTER (WHERE h.profile_status IN ('complete', 'partial'))::int AS "profiledCount"
       FROM clusters c LEFT JOIN cluster_members m ON m.cluster_id = c.id LEFT JOIN hotels h ON h.id = m.hotel_id
      WHERE c.city_id = $1 GROUP BY c.id ORDER BY c.cluster_no`,
    [cityId],
  );
}

export async function clusterOf(hotelId) {
  return one(
    `SELECT c.id, c.label, c.hotel_count AS "hotelCount", c.city_id AS "cityId", m.core
       FROM cluster_members m JOIN clusters c ON c.id = m.cluster_id WHERE m.hotel_id = $1`,
    [hotelId],
  );
}

/** Active hotels within `km` of a point (direct spatial query; used beyond the neighbour radius). */
export async function hotelsWithin(geo, km, excludeId = null) {
  if (!isPoint(geo)) return [];
  const rows = await many(
    `SELECT ${HOTEL_COLS}, round(ST_Distance(h.geo, $1::geography))::int AS distance_m FROM hotels h
      WHERE h.status = 'active' AND h.geo IS NOT NULL AND ST_DWithin(h.geo, $1::geography, $2)
        AND ($3::text IS NULL OR h.id <> $3)
      ORDER BY distance_m LIMIT 500`,
    [pointSql(geo), km * 1000, excludeId],
  );
  return rows.map(toHotel);
}

/** Give hotels without a city the seeded city whose area contains them. */
export async function assignCitiesFor(hotelIds) {
  if (!hotelIds.length) return 0;
  const { rowCount } = await query(
    `UPDATE hotels h SET city_id = (
        SELECT c.id FROM cities c WHERE c.center IS NOT NULL AND ST_DWithin(c.center, h.geo, c.radius_km * 1000 + 500)
         ORDER BY ST_Distance(c.center, h.geo) LIMIT 1)
      WHERE h.id = ANY($1) AND h.city_id IS NULL AND h.geo IS NOT NULL`,
    [hotelIds],
  );
  return rowCount;
}

/** Hotel ids of a micro-market cluster. */
export async function clusterMemberIds(clusterId) {
  return (await many('SELECT hotel_id FROM cluster_members WHERE cluster_id = $1', [clusterId])).map((r) => r.hotel_id);
}

/** Names and basics for a set of hotel ids. */
export async function hotelsByIds(ids) {
  if (!ids.length) return [];
  return (await many(`SELECT ${HOTEL_COLS} FROM hotels h WHERE h.id = ANY($1)`, [ids])).map(toHotel);
}
