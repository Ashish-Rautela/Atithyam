import { many, query, one } from '../shared/db/pool.js';

const iso = (d) => (d ? new Date(d).toISOString() : null);

function toListingState(r) {
  return {
    platform: r.platform,
    status: r.status,
    listing: r.listing,
    match: r.match,
    alternatives: r.alternatives ?? [],
    notes: r.notes ?? [],
    error: r.error,
    snapshotPath: r.snapshot_path,
    reviewSort: r.review_sort,
    reviewsCollected: r.reviews_collected,
    reviewsStored: r.reviews_stored,
    lastJobId: r.last_job_id,
    lastSuccessAt: iso(r.last_success_at),
    updatedAt: iso(r.updated_at),
  };
}

export async function getListingStates(hotelId) {
  return (await many('SELECT * FROM platform_listings WHERE hotel_id = $1 ORDER BY platform', [hotelId])).map(toListingState);
}

export async function getListingState(hotelId, platform) {
  const r = await one('SELECT * FROM platform_listings WHERE hotel_id = $1 AND platform = $2', [hotelId, platform]);
  return r ? toListingState(r) : null;
}

/** Listing summaries for many hotels at once (competitor tables). */
export async function getListingStatesFor(hotelIds) {
  if (!hotelIds.length) return new Map();
  const rows = await many('SELECT * FROM platform_listings WHERE hotel_id = ANY($1)', [hotelIds]);
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.hotel_id)) map.set(r.hotel_id, []);
    map.get(r.hotel_id).push(toListingState(r));
  }
  return map;
}

export async function saveListingState(hotelId, platform, s) {
  const success = /^SUCCESS|NEEDS_CONFIRMATION/.test(s.status);
  await query(
    `INSERT INTO platform_listings AS p (hotel_id, platform, status, external_id, url, listing, match, alternatives, notes, error,
                                         snapshot_path, review_sort, reviews_collected, reviews_stored, last_job_id, last_success_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, CASE WHEN $16 THEN now() END, now())
     ON CONFLICT (hotel_id, platform) DO UPDATE SET
       status = EXCLUDED.status, external_id = EXCLUDED.external_id, url = EXCLUDED.url, listing = EXCLUDED.listing,
       match = EXCLUDED.match, alternatives = EXCLUDED.alternatives, notes = EXCLUDED.notes, error = EXCLUDED.error,
       snapshot_path = EXCLUDED.snapshot_path, review_sort = EXCLUDED.review_sort, reviews_collected = EXCLUDED.reviews_collected,
       reviews_stored = EXCLUDED.reviews_stored, last_job_id = EXCLUDED.last_job_id,
       last_success_at = COALESCE(EXCLUDED.last_success_at, p.last_success_at), updated_at = now()`,
    [
      hotelId,
      platform,
      s.status,
      s.listing?.externalId ? String(s.listing.externalId) : null,
      s.listing?.url ?? null,
      s.listing ? JSON.stringify(s.listing) : null,
      s.match ? JSON.stringify(s.match) : null,
      JSON.stringify(s.alternatives ?? []),
      JSON.stringify(s.notes ?? []),
      s.error ?? null,
      s.snapshotPath ?? null,
      s.reviewSort ?? null,
      s.reviewsCollected ?? null,
      s.reviewsStored ?? null,
      s.lastJobId ?? null,
      success,
    ],
  );
}

/** Append a point-in-time snapshot (rating, count, price) — history for trend analysis. */
export async function insertSnapshot(hotelId, platform, listing) {
  await query(
    `INSERT INTO listing_snapshots (hotel_id, platform, rating, rating_scale, review_count, price_inr, subscores, distribution)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      hotelId,
      platform,
      listing.rating?.value ?? null,
      listing.rating?.scaleMax ?? null,
      listing.reviewCount ?? null,
      listing.priceInr ?? null,
      listing.subscores?.length ? JSON.stringify(listing.subscores) : null,
      listing.ratingDistribution?.length ? JSON.stringify(listing.ratingDistribution) : null,
    ],
  );
}

export async function getSnapshots(hotelId, { platform, limit = 100 } = {}) {
  return many(
    `SELECT platform, rating, rating_scale AS "ratingScale", review_count AS "reviewCount", price_inr AS "priceInr", captured_at AS "capturedAt"
       FROM listing_snapshots WHERE hotel_id = $1 AND ($2::text IS NULL OR platform = $2)
      ORDER BY captured_at DESC LIMIT $3`,
    [hotelId, platform ?? null, limit],
  );
}

/* ----------------------------------- reviews ----------------------------------- */

/**
 * Idempotent upsert. Same reviewId + same contentHash = unchanged; same reviewId with a different
 * contentHash = updated (edited at source, revision + 1); new reviewId = inserted.
 */
export async function upsertReviews(hotelId, platform, reviews) {
  const unique = [...new Map(reviews.map((r) => [r.reviewId, r])).values()];
  const existing = unique.length
    ? await many('SELECT review_id, content_hash FROM reviews WHERE hotel_id = $1 AND platform = $2 AND review_id = ANY($3)', [hotelId, platform, unique.map((r) => r.reviewId)])
    : [];
  const prev = new Map(existing.map((r) => [r.review_id, r.content_hash]));
  const counts = { inserted: 0, updated: 0, unchanged: 0 };
  const toWrite = [];
  for (const r of unique) {
    if (!prev.has(r.reviewId)) counts.inserted++;
    else if (prev.get(r.reviewId) !== r.contentHash) counts.updated++;
    else {
      counts.unchanged++;
      continue;
    }
    toWrite.push({
      review_id: r.reviewId,
      data: { ...r, bizId: hotelId },
      content_hash: r.contentHash,
      rating5: r.rating?.normalized5 ?? null,
      published_at: r.publishedAt ?? null,
      search_text: [r.title, r.text, r.liked, r.disliked].filter(Boolean).join('\n').toLowerCase(),
    });
  }
  if (toWrite.length) {
    await query(
      `INSERT INTO reviews AS v (hotel_id, platform, review_id, data, content_hash, rating5, published_at, search_text)
       SELECT $1, $2, r.review_id, r.data, r.content_hash, r.rating5, r.published_at, r.search_text
         FROM jsonb_to_recordset($3::jsonb) AS r(review_id text, data jsonb, content_hash text, rating5 numeric, published_at timestamptz, search_text text)
       ON CONFLICT (hotel_id, platform, review_id) DO UPDATE SET
         data = EXCLUDED.data, content_hash = EXCLUDED.content_hash, rating5 = EXCLUDED.rating5,
         published_at = EXCLUDED.published_at, search_text = EXCLUDED.search_text,
         revision = v.revision + 1, updated_at = now()
       WHERE v.content_hash <> EXCLUDED.content_hash`,
      [hotelId, platform, JSON.stringify(toWrite)],
    );
  }
  const { n } = await one('SELECT count(*)::int AS n FROM reviews WHERE hotel_id = $1 AND platform = $2', [hotelId, platform]);
  return { ...counts, totalStored: n };
}

/** Reviews newest first (undated last) with filters and offset paging — all done in SQL. */
export async function queryReviews(hotelId, { platforms, limit = 50, offset = 0, minRating, maxRating, q, aspect, sentiment }) {
  const where = ['hotel_id = $1', 'platform = ANY($2)'];
  const vals = [hotelId, platforms];
  if (minRating !== undefined) {
    vals.push(minRating);
    where.push(`rating5 >= $${vals.length}`);
  }
  if (maxRating !== undefined) {
    vals.push(maxRating);
    where.push(`rating5 <= $${vals.length}`);
  }
  if (q) {
    vals.push(`%${q.toLowerCase().replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
    where.push(`search_text LIKE $${vals.length}`);
  }
  if (aspect) {
    vals.push(aspect);
    const aIdx = vals.length;
    let sentSql = '';
    if (sentiment !== undefined) {
      vals.push(sentiment);
      sentSql = ` AND x.sentiment = $${vals.length}`;
    }
    where.push(`EXISTS (SELECT 1 FROM review_aspects x WHERE x.hotel_id = reviews.hotel_id AND x.platform = reviews.platform AND x.review_id = reviews.review_id AND x.aspect = $${aIdx}${sentSql})`);
  }
  const w = where.join(' AND ');
  const counts = await many(`SELECT platform, count(*)::int AS n FROM reviews WHERE ${w} GROUP BY platform`, vals);
  const items = await many(
    `SELECT data, platform, review_id,
            (SELECT coalesce(json_agg(json_build_object('aspect', x.aspect, 'sentiment', x.sentiment) ORDER BY x.aspect), '[]'::json)
               FROM review_aspects x WHERE x.hotel_id = reviews.hotel_id AND x.platform = reviews.platform AND x.review_id = reviews.review_id) AS aspects,
            (SELECT a.language FROM review_analysis a WHERE a.hotel_id = reviews.hotel_id AND a.platform = reviews.platform AND a.review_id = reviews.review_id) AS language
       FROM reviews WHERE ${w} ORDER BY published_at DESC NULLS LAST, review_id LIMIT $${vals.length + 1} OFFSET $${vals.length + 2}`,
    [...vals, limit, offset],
  );
  const countsByPlatform = Object.fromEntries(counts.map((c) => [c.platform, c.n]));
  return { total: counts.reduce((s, c) => s + c.n, 0), countsByPlatform, offset, limit, items: items.map((r) => ({ ...r.data, aspects: r.aspects, language: r.language })) };
}

export async function reviewCountsFor(hotelIds) {
  if (!hotelIds.length) return new Map();
  const rows = await many('SELECT hotel_id, count(*)::int AS n FROM reviews WHERE hotel_id = ANY($1) GROUP BY hotel_id', [hotelIds]);
  return new Map(rows.map((r) => [r.hotel_id, r.n]));
}
