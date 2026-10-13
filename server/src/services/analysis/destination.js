import { AppError } from '../../shared/errors/AppError.js';
import { many } from '../../shared/db/pool.js';
import { hashParts } from '../../shared/util/hash.js';
import { getCity } from '../../data/cities.js';
import * as A from '../../data/analysis.js';
import { ASPECTS, ASPECT_LABEL, ISSUES, issueLabel } from './taxonomy.js';
import { aspectScore, round } from './stats.js';

/**
 * Destination view for a Tourism Board / district administration: what visitors consistently say
 * about a whole town (or one micro-market), aggregated across every property and platform, with the
 * quotes behind each finding. Issues the hotels do not control (roads, parking, power, taxis) are
 * separated out — those are the ones for the administration.
 */
export async function getDestination(cityId, { clusterId } = {}) {
  const city = await getCity(cityId);
  if (!city) throw AppError.notFound('City not found');
  const hotelRows = await many(
    `SELECT h.id, h.name, k.id AS cluster_id, k.label AS cluster FROM hotels h
       LEFT JOIN cluster_members m ON m.hotel_id = h.id LEFT JOIN clusters k ON k.id = m.cluster_id
      WHERE h.city_id = $1 AND h.status = 'active' AND ($2::int IS NULL OR k.id = $2)`,
    [cityId, clusterId ?? null],
  );
  const ids = hotelRows.map((h) => h.id);
  const [aspectRows, issueRows, analysed] = await Promise.all([A.aspectCounts(ids), A.issueCounts(ids), A.analysedCounts(ids)]);
  const reviews = [...analysed.values()].reduce((s, r) => s + r.n, 0);
  const hotelsWithData = [...analysed.keys()].length;

  const aspects = ASPECTS.map(({ key, label }) => {
    const rows = aspectRows.filter((r) => r.aspect === key);
    const n = rows.reduce((s, r) => s + r.n, 0);
    const pos = rows.reduce((s, r) => s + r.pos, 0);
    const neg = rows.reduce((s, r) => s + r.neg, 0);
    return { aspect: key, label, mentions: n, mentionShare: reviews ? round(n / reviews, 3) : null, posShare: n ? round(pos / n, 3) : null, negShare: n ? round(neg / n, 3) : null, score: n ? round(aspectScore(pos, neg, n, 0, 0), 1) : null, hotels: rows.length };
  });

  const issueMap = new Map();
  for (const r of issueRows) {
    const e = issueMap.get(r.issue) ?? { issue: r.issue, aspect: r.aspect, scope: ISSUES[r.issue]?.scope ?? r.scope, neg: 0, pos: 0, hotelsNeg: 0 };
    e.neg += r.neg;
    e.pos += r.pos;
    if (r.neg > 0) e.hotelsNeg++;
    issueMap.set(r.issue, e);
  }
  const ranked = [...issueMap.values()].filter((i) => i.neg >= 2).sort((a, b) => b.neg - a.neg);
  const withEvidence = async (list, limit) => {
    const out = [];
    for (const i of list.slice(0, limit)) {
      out.push({
        issue: i.issue,
        label: issueLabel(i.issue),
        aspect: i.aspect,
        aspectLabel: ASPECT_LABEL[i.aspect],
        scope: i.scope,
        complaints: i.neg,
        praise: i.pos,
        per100Reviews: reviews ? round((i.neg / reviews) * 100, 1) : null,
        hotelsAffected: i.hotelsNeg,
        hotelsShare: hotelsWithData ? round(i.hotelsNeg / hotelsWithData, 2) : null,
        evidence: await A.evidence({ hotelIds: ids, issue: i.issue, sentiment: -1, limit: 4 }),
      });
    }
    return out;
  };
  const destinationIssues = await withEvidence(ranked.filter((i) => i.scope === 'destination'), 8);
  const propertyIssues = await withEvidence(ranked.filter((i) => i.scope !== 'destination'), 10);
  const strengths = [...issueMap.values()].filter((i) => i.pos >= 3 && i.pos > i.neg * 2).sort((a, b) => b.pos - a.pos).slice(0, 6)
    .map((i) => ({ issue: i.issue, label: issueLabel(i.issue), aspectLabel: ASPECT_LABEL[i.aspect], praise: i.pos, hotels: issueRows.filter((r) => r.issue === i.issue && r.pos > 0).length }));

  // Micro-market × aspect.
  const clusters = new Map();
  for (const h of hotelRows) {
    const key = h.cluster_id ?? 0;
    if (!clusters.has(key)) clusters.set(key, { clusterId: h.cluster_id, label: h.cluster ?? 'Outside micro-markets', ids: [] });
    clusters.get(key).ids.push(h.id);
  }
  const marketGrid = [...clusters.values()].map((c) => ({
    clusterId: c.clusterId,
    label: c.label,
    hotels: c.ids.length,
    reviews: c.ids.reduce((s, id) => s + (analysed.get(id)?.n ?? 0), 0),
    cells: Object.fromEntries(ASPECTS.map(({ key }) => {
      const rows = aspectRows.filter((r) => r.aspect === key && c.ids.includes(r.hotel_id));
      const n = rows.reduce((s, r) => s + r.n, 0);
      const pos = rows.reduce((s, r) => s + r.pos, 0);
      const neg = rows.reduce((s, r) => s + r.neg, 0);
      return [key, n >= 3 ? { score: round(aspectScore(pos, neg, n, 0, 0), 0), n } : { score: null, n }];
    })),
  })).filter((c) => c.reviews > 0).sort((a, b) => b.reviews - a.reviews);

  const monthly = ids.length
    ? await many(
        `SELECT to_char(date_trunc('month', published_at), 'YYYY-MM-DD') AS month,
                count(*) FILTER (WHERE scope = 'destination')::int AS destination,
                count(*)::int AS total
           FROM review_issues WHERE hotel_id = ANY($1) AND sentiment = -1 AND published_at >= now() - interval '18 months'
          GROUP BY 1 ORDER BY 1`,
        [ids],
      )
    : [];

  const result = {
    city: { cityId: city.cityId, name: city.displayName ?? city.name, region: city.region, clusterId: clusterId ?? null },
    coverage: { hotels: ids.length, hotelsWithData, reviews, readingHoursSaved: round((reviews * 30) / 3600, 1) },
    aspects,
    destinationIssues,
    propertyIssues,
    strengths,
    marketGrid,
    monthly,
    generatedAt: new Date().toISOString(),
  };
  result.fingerprint = hashParts([JSON.stringify(aspects.map((a) => [a.aspect, a.score, a.mentions])), JSON.stringify(ranked.slice(0, 10).map((i) => [i.issue, i.neg]))], 16);
  return result;
}

/** All complaint evidence for a destination as CSV — the "issues surfaced with evidence" hand-over. */
export async function destinationEvidenceCsv(cityId) {
  const rows = await many(
    `SELECT h.name AS hotel, k.label AS micro_market, i.platform, to_char(i.published_at, 'YYYY-MM-DD') AS date,
            i.aspect, i.issue, i.scope, i.evidence
       FROM review_issues i JOIN hotels h ON h.id = i.hotel_id
       LEFT JOIN cluster_members m ON m.hotel_id = h.id LEFT JOIN clusters k ON k.id = m.cluster_id
      WHERE h.city_id = $1 AND i.sentiment = -1
      ORDER BY i.scope DESC, i.issue, i.published_at DESC NULLS LAST`,
    [cityId],
  );
  const esc = (v) => (v === null || v === undefined ? '' : `"${String(v).replace(/"/g, '""')}"`);
  const header = ['hotel', 'micro_market', 'platform', 'date', 'aspect', 'issue', 'issue_label', 'scope', 'quote'];
  const lines = rows.map((r) => [r.hotel, r.micro_market, r.platform, r.date, ASPECT_LABEL[r.aspect] ?? r.aspect, r.issue, issueLabel(r.issue), r.scope, r.evidence].map(esc).join(','));
  return [header.join(','), ...lines].join('\n');
}
