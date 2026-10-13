import { many, one, query, tx } from '../shared/db/pool.js';

/* ------------------------------------------------------------ analysis storage */

/**
 * Reviews of a hotel that need (re)analysis: never analysed, text changed since, or — with
 * `upgrade` — analysed only by the offline lexicon (re-run with the AI model).
 */
export async function reviewsToAnalyse(hotelId, { upgrade = false, limit = 5000 } = {}) {
  const rows = await many(
    `SELECT r.platform, r.review_id, r.data, r.content_hash, r.rating5, r.published_at
       FROM reviews r
       LEFT JOIN review_analysis a ON a.hotel_id = r.hotel_id AND a.platform = r.platform AND a.review_id = r.review_id
      WHERE r.hotel_id = $1
        AND (a.review_id IS NULL OR a.content_hash <> r.content_hash
             OR ($2 AND a.method = 'lexicon' AND length(concat(r.data->>'title', r.data->>'text', r.data->>'liked', r.data->>'disliked')) > 0))
      ORDER BY r.published_at DESC NULLS LAST
      LIMIT $3`,
    [hotelId, upgrade, limit],
  );
  return rows.map((r) => ({
    reviewId: r.review_id,
    platform: r.platform,
    contentHash: r.content_hash,
    rating5: r.rating5,
    publishedAt: r.published_at,
    title: r.data.title,
    text: r.data.text,
    liked: r.data.liked,
    disliked: r.data.disliked,
  }));
}

/** Replace the analysis of the given reviews (one transaction). */
export async function saveAnalysis(hotelId, reviews, results) {
  const rows = reviews.filter((r) => results.has(r.reviewId));
  if (!rows.length) return 0;
  const analysis = [];
  const aspects = [];
  const issues = [];
  for (const r of rows) {
    const res = results.get(r.reviewId);
    analysis.push({ platform: r.platform, review_id: r.reviewId, content_hash: r.contentHash, method: res.method, model: res.model, language: res.language, overall: res.overall });
    for (const a of res.aspects) aspects.push({ platform: r.platform, review_id: r.reviewId, aspect: a.aspect, sentiment: a.sentiment, evidence: a.evidence, published_at: r.publishedAt });
    for (const i of res.issues) issues.push({ platform: r.platform, review_id: r.reviewId, issue: i.issue, aspect: i.aspect, sentiment: i.sentiment, scope: i.scope, evidence: i.evidence, published_at: r.publishedAt });
  }
  await tx(async (c) => {
    await c.query(
      `INSERT INTO review_analysis (hotel_id, platform, review_id, content_hash, method, model, language, overall, analyzed_at)
       SELECT $1, x.platform, x.review_id, x.content_hash, x.method, x.model, x.language, x.overall, now()
         FROM jsonb_to_recordset($2::jsonb) AS x(platform text, review_id text, content_hash text, method text, model text, language text, overall smallint)
       ON CONFLICT (hotel_id, platform, review_id) DO UPDATE SET content_hash = EXCLUDED.content_hash, method = EXCLUDED.method,
         model = EXCLUDED.model, language = EXCLUDED.language, overall = EXCLUDED.overall, analyzed_at = now()`,
      [hotelId, JSON.stringify(analysis)],
    );
    const keys = JSON.stringify(analysis.map((a) => ({ platform: a.platform, review_id: a.review_id })));
    for (const table of ['review_aspects', 'review_issues']) {
      await c.query(
        `DELETE FROM ${table} t USING jsonb_to_recordset($2::jsonb) AS k(platform text, review_id text)
          WHERE t.hotel_id = $1 AND t.platform = k.platform AND t.review_id = k.review_id`,
        [hotelId, keys],
      );
    }
    if (aspects.length) {
      await c.query(
        `INSERT INTO review_aspects (hotel_id, platform, review_id, aspect, sentiment, evidence, published_at)
         SELECT $1, x.platform, x.review_id, x.aspect, x.sentiment, x.evidence, x.published_at
           FROM jsonb_to_recordset($2::jsonb) AS x(platform text, review_id text, aspect text, sentiment smallint, evidence text, published_at timestamptz)
         ON CONFLICT DO NOTHING`,
        [hotelId, JSON.stringify(aspects)],
      );
    }
    if (issues.length) {
      await c.query(
        `INSERT INTO review_issues (hotel_id, platform, review_id, issue, aspect, sentiment, scope, evidence, published_at)
         SELECT $1, x.platform, x.review_id, x.issue, x.aspect, x.sentiment, x.scope, x.evidence, x.published_at
           FROM jsonb_to_recordset($2::jsonb) AS x(platform text, review_id text, issue text, aspect text, sentiment smallint, scope text, evidence text, published_at timestamptz)
         ON CONFLICT DO NOTHING`,
        [hotelId, JSON.stringify(issues)],
      );
    }
  });
  return rows.length;
}

/** Per hotel: reviews stored, reviews analysed, by method, and how many still need analysis. */
export async function analysisCoverage(hotelIds) {
  if (!hotelIds.length) return new Map();
  const rows = await many(
    `SELECT r.hotel_id,
            count(*)::int AS reviews,
            count(a.review_id)::int AS analysed,
            count(*) FILTER (WHERE a.method = 'gemini')::int AS by_ai,
            count(*) FILTER (WHERE a.review_id IS NULL OR a.content_hash <> r.content_hash)::int AS pending
       FROM reviews r
       LEFT JOIN review_analysis a ON a.hotel_id = r.hotel_id AND a.platform = r.platform AND a.review_id = r.review_id
      WHERE r.hotel_id = ANY($1)
      GROUP BY r.hotel_id`,
    [hotelIds],
  );
  return new Map(rows.map((r) => [r.hotel_id, r]));
}

/** Hotels with reviews analysed only by the offline rules and no AI pass queued (scheduler backfill). */
export async function hotelsNeedingAiUpgrade(limit) {
  return many(
    `SELECT a.hotel_id AS id, count(*)::int AS pending FROM review_analysis a
       JOIN reviews r ON r.hotel_id = a.hotel_id AND r.platform = a.platform AND r.review_id = a.review_id
      WHERE a.method = 'lexicon' AND length(concat(r.data->>'title', r.data->>'text', r.data->>'liked', r.data->>'disliked')) > 0
        AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.dedupe_key = 'analyze-ai:' || a.hotel_id
                         AND (j.status IN ('queued', 'running') OR j.finished_at > now() - interval '60 minutes'))
      GROUP BY a.hotel_id ORDER BY count(*) DESC LIMIT $1`,
    [limit],
  );
}

/** Hotels with reviews still waiting for analysis (scheduler backfill). */
export async function hotelsNeedingAnalysis(limit) {
  return many(
    `SELECT r.hotel_id AS id, count(*)::int AS pending FROM reviews r
       LEFT JOIN review_analysis a ON a.hotel_id = r.hotel_id AND a.platform = r.platform AND a.review_id = r.review_id
      WHERE (a.review_id IS NULL OR a.content_hash <> r.content_hash)
        AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.dedupe_key = 'analyze:' || r.hotel_id AND j.status IN ('queued', 'running'))
      GROUP BY r.hotel_id ORDER BY count(*) DESC LIMIT $1`,
    [limit],
  );
}

/* ------------------------------------------------------------ aggregates for benchmarking */

export async function aspectCounts(hotelIds, { since } = {}) {
  if (!hotelIds.length) return [];
  return many(
    `SELECT hotel_id, aspect, count(*)::int AS n,
            count(*) FILTER (WHERE sentiment = 1)::int AS pos,
            count(*) FILTER (WHERE sentiment = -1)::int AS neg
       FROM review_aspects WHERE hotel_id = ANY($1) AND ($2::timestamptz IS NULL OR published_at >= $2)
      GROUP BY hotel_id, aspect`,
    [hotelIds, since ?? null],
  );
}

export async function issueCounts(hotelIds) {
  if (!hotelIds.length) return [];
  return many(
    `SELECT hotel_id, issue, aspect, max(scope) AS scope,
            count(*) FILTER (WHERE sentiment = 1)::int AS pos,
            count(*) FILTER (WHERE sentiment = -1)::int AS neg,
            count(*)::int AS n
       FROM review_issues WHERE hotel_id = ANY($1)
      GROUP BY hotel_id, issue, aspect`,
    [hotelIds],
  );
}

export async function analysedCounts(hotelIds) {
  if (!hotelIds.length) return new Map();
  const rows = await many(
    `SELECT hotel_id, count(*)::int AS n,
            count(*) FILTER (WHERE method = 'gemini')::int AS ai,
            count(*) FILTER (WHERE language IN ('hi', 'hinglish'))::int AS indic
       FROM review_analysis WHERE hotel_id = ANY($1) GROUP BY hotel_id`,
    [hotelIds],
  );
  return new Map(rows.map((r) => [r.hotel_id, r]));
}

/** Example quotes for an aspect or issue, newest first, with hotel name / platform / date. */
export async function evidence({ hotelIds, aspect, issue, sentiment, limit = 4 }) {
  if (!hotelIds.length) return [];
  const table = issue ? 'review_issues' : 'review_aspects';
  return many(
    `SELECT * FROM (
       SELECT DISTINCT ON (lower(t.evidence)) t.hotel_id AS "hotelId", h.name AS "hotelName", t.platform, t.evidence AS quote,
              t.published_at AS "publishedAt", t.sentiment
         FROM ${table} t JOIN hotels h ON h.id = t.hotel_id
        WHERE t.hotel_id = ANY($1) AND t.evidence IS NOT NULL AND length(t.evidence) > 8
          AND ($2::text IS NULL OR t.aspect = $2) ${issue ? 'AND t.issue = $5' : 'AND $5::text IS NULL'}
          AND ($3::int IS NULL OR t.sentiment = $3)
        ORDER BY lower(t.evidence), t.published_at DESC NULLS LAST
     ) q ORDER BY "publishedAt" DESC NULLS LAST LIMIT $4`,
    [hotelIds, aspect ?? null, sentiment ?? null, limit, issue ?? null],
  );
}

/** Platform-level ratings and category scores per hotel (from the stored listings). */
export async function listingScores(hotelIds) {
  if (!hotelIds.length) return [];
  return many(
    `SELECT hotel_id, platform,
            (listing->'rating'->>'value')::numeric AS rating,
            (listing->'rating'->>'scaleMax')::numeric AS scale,
            (listing->>'reviewCount')::numeric AS review_count,
            listing->'subscores' AS subscores
       FROM platform_listings
      WHERE hotel_id = ANY($1) AND listing IS NOT NULL`,
    [hotelIds],
  );
}

/* ------------------------------------------------------------ time series */

export async function monthlyAspect(hotelIds, aspect) {
  if (!hotelIds.length) return [];
  return many(
    `SELECT hotel_id, to_char(date_trunc('month', published_at AT TIME ZONE 'UTC'), 'YYYY-MM-01') AS month, count(*)::int AS n,
            count(*) FILTER (WHERE sentiment = 1)::int AS pos, count(*) FILTER (WHERE sentiment = -1)::int AS neg
       FROM review_aspects WHERE hotel_id = ANY($1) AND aspect = $2 AND published_at IS NOT NULL
      GROUP BY hotel_id, month ORDER BY month`,
    [hotelIds, aspect],
  );
}

export async function monthlyRating(hotelIds) {
  if (!hotelIds.length) return [];
  return many(
    `SELECT hotel_id, to_char(date_trunc('month', published_at AT TIME ZONE 'UTC'), 'YYYY-MM-01') AS month, count(*)::int AS n,
            avg(rating5)::float AS mean, coalesce(var_samp(rating5), 0)::float AS var
       FROM reviews WHERE hotel_id = ANY($1) AND published_at IS NOT NULL AND rating5 IS NOT NULL
      GROUP BY hotel_id, month ORDER BY month`,
    [hotelIds],
  );
}

/** Negative issue mentions in a recent window vs the window before, with review volume for rates. */
export async function issueWindows(hotelIds, { recentDays = 60, baselineDays = 240 }) {
  if (!hotelIds.length) return { issues: [], volume: { recent: 0, before: 0 } };
  const issues = await many(
    `SELECT issue, aspect,
            count(*) FILTER (WHERE published_at >= now() - make_interval(days => $2))::int AS recent,
            count(*) FILTER (WHERE published_at < now() - make_interval(days => $2) AND published_at >= now() - make_interval(days => $3))::int AS before,
            min(published_at) FILTER (WHERE published_at >= now() - make_interval(days => $2)) AS first_recent
       FROM review_issues WHERE hotel_id = ANY($1) AND sentiment = -1 AND published_at IS NOT NULL
      GROUP BY issue, aspect`,
    [hotelIds, recentDays, baselineDays],
  );
  const volume = await one(
    `SELECT count(*) FILTER (WHERE r.published_at >= now() - make_interval(days => $2))::int AS recent,
            count(*) FILTER (WHERE r.published_at < now() - make_interval(days => $2) AND r.published_at >= now() - make_interval(days => $3))::int AS before
       FROM reviews r JOIN review_analysis a USING (hotel_id, platform, review_id)
      WHERE r.hotel_id = ANY($1)`,
    [hotelIds, recentDays, baselineDays],
  );
  return { issues, volume };
}

export async function issueMonthOfYear(hotelIds) {
  if (!hotelIds.length) return [];
  return many(
    `SELECT issue, extract(month FROM published_at)::int AS m, count(*)::int AS n
       FROM review_issues WHERE hotel_id = ANY($1) AND sentiment = -1 AND published_at IS NOT NULL
      GROUP BY issue, m`,
    [hotelIds],
  );
}

export async function upsertIssueAlert({ hotelId, aspect, issue, firstEvidenceAt, recentCount }) {
  return one(
    `INSERT INTO issue_alerts (hotel_id, aspect, issue, first_evidence_at, recent_count)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (hotel_id, aspect, issue) DO UPDATE SET last_seen_at = now(), recent_count = EXCLUDED.recent_count,
       first_evidence_at = LEAST(issue_alerts.first_evidence_at, EXCLUDED.first_evidence_at), status = 'open'
     RETURNING first_evidence_at AS "firstEvidenceAt", detected_at AS "detectedAt"`,
    [hotelId, aspect, issue, firstEvidenceAt, recentCount],
  );
}

/* ------------------------------------------------------------ events */

export async function listEvents(hotelId) {
  return many(
    `SELECT id, to_char(event_date, 'YYYY-MM-DD') AS date, label, kind, aspect FROM hotel_events WHERE hotel_id = $1 ORDER BY event_date`,
    [hotelId],
  );
}

export async function addEvent(hotelId, { date, label, kind = 'event', aspect = null }) {
  return one(
    `INSERT INTO hotel_events (hotel_id, event_date, label, kind, aspect) VALUES ($1, $2, $3, $4, $5)
     RETURNING id, to_char(event_date, 'YYYY-MM-DD') AS date, label, kind, aspect`,
    [hotelId, date, label, kind, aspect],
  );
}

export async function deleteEvent(hotelId, id) {
  const { rowCount } = await query('DELETE FROM hotel_events WHERE hotel_id = $1 AND id = $2', [hotelId, id]);
  return rowCount > 0;
}

/** Average rating and aspect net sentiment in a window around a date (intervention impact). */
export async function windowStats(hotelId, { from, to, aspect }) {
  const rating = await one(
    `SELECT count(*)::int AS n, avg(rating5)::float AS mean FROM reviews
      WHERE hotel_id = $1 AND published_at >= $2 AND published_at < $3 AND rating5 IS NOT NULL`,
    [hotelId, from, to],
  );
  const asp = aspect
    ? await one(
        `SELECT count(*)::int AS n, count(*) FILTER (WHERE sentiment = 1)::int AS pos, count(*) FILTER (WHERE sentiment = -1)::int AS neg
           FROM review_aspects WHERE hotel_id = $1 AND aspect = $2 AND published_at >= $3 AND published_at < $4`,
        [hotelId, aspect, from, to],
      )
    : null;
  return { rating, aspect: asp };
}

/* ------------------------------------------------------------ summaries cache */

export async function getSummary(scope, scopeId) {
  return one('SELECT fingerprint, content, method, created_at AS "createdAt" FROM analysis_summaries WHERE scope = $1 AND scope_id = $2', [scope, String(scopeId)]);
}

export async function saveSummary(scope, scopeId, fingerprint, content, method) {
  await query(
    `INSERT INTO analysis_summaries (scope, scope_id, fingerprint, content, method) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (scope, scope_id) DO UPDATE SET fingerprint = EXCLUDED.fingerprint, content = EXCLUDED.content, method = EXCLUDED.method, created_at = now()`,
    [scope, String(scopeId), fingerprint, JSON.stringify(content), method],
  );
}
