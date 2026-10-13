import { AppError } from '../../shared/errors/AppError.js';
import { hashParts } from '../../shared/util/hash.js';
import * as hotelsRepo from '../../data/hotels.js';
import * as A from '../../data/analysis.js';
import { clusterOf, clusterMemberIds, hotelsWithin, hotelsByIds } from '../../data/geo.js';
import { getCompset } from '../../data/compsets.js';
import { buildCandidates } from '../competitor-discovery/competitorService.js';
import { ASPECTS, ASPECT_LABEL, ISSUES, issueLabel, aspectForSubscore } from './taxonomy.js';
import { cachedView } from './viewCache.js';
import { aspectScore, quantile, mean, sd, twoPropZ, round } from './stats.js';

const MIN_MENTIONS = 3; // fewer mentions than this → "not enough data" for that aspect
const LEAD_GAP = 7; // score points vs the market median
const Z = 1.28; // ~80% one-sided confidence; small hotels have few reviews

/**
 * Which hotels a property is compared with:
 *   compset – the like-for-like competitor set (distance, price band, review count) — default
 *   cluster – everyone in its micro-market (DBSCAN cluster)
 *   radius  – every hotel within `radiusKm`
 */
export async function resolvePeers(hotel, { peers = 'compset', radiusKm = 3 } = {}) {
  let ids = [];
  let label = '';
  if (peers === 'cluster') {
    const cl = await clusterOf(hotel.hotelId);
    if (cl) {
      ids = (await clusterMemberIds(cl.id)).filter((id) => id !== hotel.hotelId);
      label = `Micro-market “${cl.label}” (${cl.hotelCount} hotels)`;
    } else {
      label = 'Not in a micro-market yet — showing hotels within 3 km';
      peers = 'radius';
    }
  }
  if (peers === 'compset') {
    const { candidates, selectedPlaceIds } = await buildCandidates(hotel, await getCompset(hotel.hotelId));
    ids = candidates.filter((c) => selectedPlaceIds.includes(c.placeId)).map((c) => c.hotelId);
    label = `Competitor set (${ids.length} like-for-like hotels)`;
  }
  if (peers === 'radius' || !ids.length) {
    if (!ids.length && peers !== 'radius') label = 'No competitor set yet — showing hotels within 3 km';
    else label = `All hotels within ${radiusKm} km`;
    ids = (await hotelsWithin(hotel.geo, radiusKm, hotel.hotelId)).map((h) => h.hotelId);
  }
  return { ids, label, mode: peers };
}

function index(rows, key = 'hotel_id') {
  const m = new Map();
  for (const r of rows) {
    if (!m.has(r[key])) m.set(r[key], []);
    m.get(r[key]).push(r);
  }
  return m;
}

/** Weighted overall rating on a 0–5 scale across platforms (weights = each platform's review count). */
function overallRating(listings) {
  let w = 0;
  let s = 0;
  const byPlatform = {};
  for (const l of listings) {
    if (!Number.isFinite(l.rating) || !Number.isFinite(l.scale) || !l.scale) continue;
    const v = (l.rating / l.scale) * 5;
    const weight = Math.max(Number(l.review_count) || 1, 1);
    s += v * weight;
    w += weight;
    byPlatform[l.platform] = { value: l.rating, scale: l.scale, normalised5: round(v, 2), reviewCount: l.review_count };
  }
  return { value: w ? round(s / w, 2) : null, reviewCount: w, byPlatform };
}

/** Platform category scores → aspects, as 0–100 averaged over platforms. */
function categoryScores(listings) {
  const acc = {};
  for (const l of listings) {
    for (const s of Array.isArray(l.subscores) ? l.subscores : []) {
      const aspect = aspectForSubscore(s.name);
      const max = Number(s.scaleMax) || (l.platform === 'makemytrip' ? 5 : 10);
      if (!aspect || !Number.isFinite(Number(s.score))) continue;
      (acc[aspect] ??= []).push((Number(s.score) / max) * 100);
    }
  }
  return Object.fromEntries(Object.entries(acc).map(([a, xs]) => [a, round(mean(xs), 1)]));
}

/**
 * The competitive benchmark of one hotel against its peers, aspect by aspect.
 * Everything here is computed from stored, analysed reviews — no scraping, fast.
 */
export async function getBenchmark(hotelId, opts = {}, { refresh = false } = {}) {
  const hotel = await hotelsRepo.getHotel(hotelId);
  if (!hotel) throw AppError.notFound('Business not found');
  const peerSet = await resolvePeers(hotel, opts);
  return cachedView({
    hotelId,
    view: 'benchmark',
    params: `${opts.peers ?? 'compset'}:${opts.radiusKm ?? 3}`,
    ids: [hotelId, ...peerSet.ids],
    compute: () => computeBenchmark(hotel, peerSet),
    refresh,
  });
}

async function computeBenchmark(hotel, peerSet) {
  const { hotelId } = hotel;
  const allIds = [hotelId, ...peerSet.ids];

  const [aspectRows, issueRows, analysed, listingRows, hotelRows, coverage] = await Promise.all([
    A.aspectCounts(allIds),
    A.issueCounts(allIds),
    A.analysedCounts(allIds),
    A.listingScores(allIds),
    hotelsByIds(allIds),
    A.analysisCoverage(allIds),
  ]);
  const byHotelAspects = index(aspectRows);
  const byHotelIssues = index(issueRows);
  const byHotelListings = index(listingRows);
  const names = new Map(hotelRows.map((h) => [h.hotelId, h]));
  const reviewsOf = (id) => analysed.get(id)?.n ?? 0;
  const peersWithData = peerSet.ids.filter((id) => reviewsOf(id) > 0);

  /* ---- overall rating, normalised across platforms ---- */
  const ratingOf = (id) => overallRating(byHotelListings.get(id) ?? []);
  const targetRating = ratingOf(hotelId);
  const peerRatings = peerSet.ids.map((id) => ({ id, ...ratingOf(id) })).filter((r) => r.value !== null);
  const peerValues = peerRatings.map((r) => r.value).sort((a, b) => a - b);
  const marketMean = mean(peerValues);
  const rating = {
    you: targetRating.value,
    byPlatform: targetRating.byPlatform,
    marketAverage: round(marketMean, 2),
    marketMin: peerValues[0] ?? null,
    marketMax: peerValues.at(-1) ?? null,
    peersRated: peerValues.length,
    percentile: targetRating.value !== null && peerValues.length ? Math.round((peerValues.filter((v) => v < targetRating.value).length / peerValues.length) * 100) : null,
    zScore: targetRating.value !== null && peerValues.length > 2 ? round((targetRating.value - marketMean) / (sd(peerValues) || 1), 2) : null,
  };
  rating.verdict = rating.you === null || rating.marketAverage === null
    ? null
    : rating.you - rating.marketAverage >= 0.15 ? 'above' : rating.marketAverage - rating.you >= 0.15 ? 'below' : 'in line';

  /* ---- aspects ---- */
  const countsFor = (id, aspect) => (byHotelAspects.get(id) ?? []).find((r) => r.aspect === aspect) ?? { n: 0, pos: 0, neg: 0 };
  const aspects = ASPECTS.map(({ key, label }) => {
    const pooled = peersWithData.reduce((s, id) => {
      const c = countsFor(id, key);
      return { n: s.n + c.n, pos: s.pos + c.pos, neg: s.neg + c.neg };
    }, { n: 0, pos: 0, neg: 0 });
    const marketNet = pooled.n ? (pooled.pos - pooled.neg) / pooled.n : 0;
    const t = countsFor(hotelId, key);
    const peerScores = peersWithData
      .map((id) => ({ id, ...countsFor(id, key) }))
      .filter((c) => c.n >= MIN_MENTIONS)
      .map((c) => ({ hotelId: c.id, name: names.get(c.id)?.name, n: c.n, score: round(aspectScore(c.pos, c.neg, c.n, marketNet), 1), negShare: round(c.neg / c.n, 3), posShare: round(c.pos / c.n, 3) }));
    const sorted = peerScores.map((p) => p.score).sort((a, b) => a - b);
    // Market reference: median of competitors with enough mentions; when fewer than 2 have that
    // many (small review samples), all competitors' mentions pooled together.
    let median = sorted.length >= 2 ? quantile(sorted, 0.5) : null;
    let basis = 'hotels';
    if (median === null && pooled.n >= 8 && peersWithData.length >= 2) {
      median = aspectScore(pooled.pos, pooled.neg, pooled.n, marketNet);
      basis = 'pooled';
    }
    const score = t.n ? round(aspectScore(t.pos, t.neg, t.n, marketNet), 1) : null;
    const zNeg = twoPropZ(t.neg, t.n, pooled.neg, pooled.n);
    const zPos = twoPropZ(t.pos, t.n, pooled.pos, pooled.n);
    const gap = score !== null && median !== null ? round(score - median, 1) : null;

    let status = 'par';
    if (t.n < MIN_MENTIONS || median === null) status = 'insufficient';
    else if (gap >= LEAD_GAP && (zNeg <= -Z || zPos >= Z || gap >= 2 * LEAD_GAP)) status = 'lead';
    else if (gap <= -LEAD_GAP && (zNeg >= Z || zPos <= -Z || gap <= -2 * LEAD_GAP)) status = 'lag';

    // A weakness of the whole market: most competitors get more complaints than praise here.
    const weakPeers = peerScores.filter((p) => p.negShare >= p.posShare).length;
    const pooledNegShare = pooled.n ? pooled.neg / pooled.n : 0;
    const marketWide = peerScores.length >= 3 && pooledNegShare >= 0.3 && weakPeers / peerScores.length >= 0.5;
    const rank = score !== null ? 1 + peerScores.filter((p) => p.score > score).length : null;

    return {
      aspect: key,
      label,
      you: { n: t.n, pos: t.pos, neg: t.neg, score, posShare: t.n ? round(t.pos / t.n, 3) : null, negShare: t.n ? round(t.neg / t.n, 3) : null, mentionShare: reviewsOf(hotelId) ? round(t.n / reviewsOf(hotelId), 3) : null },
      market: { n: pooled.n, basis, median: round(median, 1), p25: round(quantile(sorted, 0.25), 1), p75: round(quantile(sorted, 0.75), 1), min: sorted[0] ?? null, max: sorted.at(-1) ?? null, negShare: round(pooledNegShare, 3), posShare: pooled.n ? round(pooled.pos / pooled.n, 3) : null, hotels: peerScores.length },
      peers: peerScores,
      gap,
      rank,
      rankOf: peerScores.length + (score !== null ? 1 : 0),
      status,
      marketWide,
      confidence: Math.max(Math.abs(zNeg), Math.abs(zPos)) >= 1.96 ? 'high' : Math.max(Math.abs(zNeg), Math.abs(zPos)) >= Z ? 'medium' : 'low',
    };
  });

  /* ---- platform category scores (normalised: Booking "Staff", Agoda "Service", MMT "Hospitality" → staff) ---- */
  const targetCats = categoryScores(byHotelListings.get(hotelId) ?? []);
  const peerCats = peerSet.ids.map((id) => categoryScores(byHotelListings.get(id) ?? []));
  const platformCategories = ASPECTS.map(({ key, label }) => {
    const vals = peerCats.map((c) => c[key]).filter(Number.isFinite);
    return { aspect: key, label, you: targetCats[key] ?? null, market: round(mean(vals), 1), hotels: vals.length };
  }).filter((r) => r.you !== null || r.hotels > 0);

  /* ---- specific issues: per 100 analysed reviews, you vs the market ---- */
  const peerReviewTotal = peersWithData.reduce((s, id) => s + reviewsOf(id), 0);
  const issueMap = new Map();
  for (const id of allIds) {
    for (const r of byHotelIssues.get(id) ?? []) {
      const e = issueMap.get(r.issue) ?? { issue: r.issue, aspect: r.aspect, scope: r.scope, you: { neg: 0, pos: 0 }, market: { neg: 0, pos: 0, hotelsNeg: 0, hotelsPos: 0 } };
      if (id === hotelId) {
        e.you.neg += r.neg;
        e.you.pos += r.pos;
      } else if (peersWithData.includes(id)) {
        e.market.neg += r.neg;
        e.market.pos += r.pos;
        if (r.neg > 0) e.market.hotelsNeg++;
        if (r.pos > 0) e.market.hotelsPos++;
      }
      issueMap.set(r.issue, e);
    }
  }
  const yourReviews = reviewsOf(hotelId);
  const issues = [...issueMap.values()]
    .map((e) => {
      const per100 = (x, n) => (n ? round((x / n) * 100, 1) : null);
      const youNegRate = per100(e.you.neg, yourReviews);
      const mktNegRate = per100(e.market.neg, peerReviewTotal);
      const youPosRate = per100(e.you.pos, yourReviews);
      const mktPosRate = per100(e.market.pos, peerReviewTotal);
      const zNeg = twoPropZ(e.you.neg, yourReviews, e.market.neg, peerReviewTotal);
      const zPos = twoPropZ(e.you.pos, yourReviews, e.market.pos, peerReviewTotal);
      let kind = 'normal';
      const shareAffected = peersWithData.length ? e.market.hotelsNeg / peersWithData.length : 0;
      if (peersWithData.length >= 3 && shareAffected >= 0.5 && e.market.neg >= 3) kind = 'market_wide';
      else if (e.you.neg >= 2 && zNeg >= Z && youNegRate >= 1.5 * (mktNegRate ?? 0)) kind = 'property_specific';
      else if (e.you.pos >= 2 && zPos >= Z && youPosRate >= 1.5 * (mktPosRate ?? 0)) kind = 'your_strength';
      return {
        issue: e.issue,
        label: issueLabel(e.issue),
        aspect: e.aspect,
        aspectLabel: ASPECT_LABEL[e.aspect],
        scope: ISSUES[e.issue]?.scope ?? e.scope,
        you: { neg: e.you.neg, pos: e.you.pos, negPer100: youNegRate, posPer100: youPosRate },
        market: { neg: e.market.neg, pos: e.market.pos, negPer100: mktNegRate, posPer100: mktPosRate, hotelsAffected: e.market.hotelsNeg, hotelsPraised: e.market.hotelsPos },
        kind,
        // How you compare on a market-wide issue: better (an advantage to advertise) or as bad as everyone.
        youVsMarket: mktNegRate === null || youNegRate === null ? null : youNegRate <= mktNegRate * 0.5 ? 'better' : youNegRate >= mktNegRate * 1.5 ? 'worse' : 'similar',
      };
    })
    .filter((i) => i.you.neg + i.you.pos + i.market.neg + i.market.pos >= 2)
    .sort((a, b) => Math.max(b.you.negPer100 ?? 0, b.market.negPer100 ?? 0) - Math.max(a.you.negPer100 ?? 0, a.market.negPer100 ?? 0))
    .slice(0, 25);

  /* ---- findings with evidence ---- */
  const quote = (args) => A.evidence({ limit: 3, ...args });
  const leads = [];
  const lags = [];
  const marketWide = [];
  for (const a of aspects) {
    // A lead in a market-wide weakness is reported once, under "weak across the market" (you do better).
    if (a.status === 'lead' && !a.marketWide) {
      leads.push({ ...pick(a), evidence: await quote({ hotelIds: [hotelId], aspect: a.aspect, sentiment: 1 }), competitorComplaints: await quote({ hotelIds: peersWithData, aspect: a.aspect, sentiment: -1, limit: 2 }) });
    } else if (a.status === 'lag') {
      lags.push({ ...pick(a), evidence: await quote({ hotelIds: [hotelId], aspect: a.aspect, sentiment: -1 }), competitorPraise: await quote({ hotelIds: peersWithData, aspect: a.aspect, sentiment: 1, limit: 2 }) });
    }
    if (a.marketWide) {
      marketWide.push({ ...pick(a), youToo: a.you.negShare !== null && a.you.negShare >= a.market.negShare * 0.8, evidence: await quote({ hotelIds: peersWithData, aspect: a.aspect, sentiment: -1, limit: 4 }) });
    }
  }
  const propertyIssues = [];
  for (const i of issues.filter((x) => x.kind === 'property_specific').slice(0, 5)) {
    propertyIssues.push({ ...i, evidence: await quote({ hotelIds: [hotelId], issue: i.issue, sentiment: -1 }) });
  }
  const marketIssues = [];
  for (const i of issues.filter((x) => x.kind === 'market_wide').slice(0, 5)) {
    marketIssues.push({ ...i, evidence: await quote({ hotelIds: peersWithData, issue: i.issue, sentiment: -1 }) });
  }

  /* ---- heatmap: every hotel × aspect ---- */
  const marketNetOf = (aspect) => {
    const m = aspects.find((a) => a.aspect === aspect).market;
    return m.posShare !== null ? m.posShare - m.negShare : 0;
  };
  const heatmap = [hotelId, ...peersWithData].map((id) => {
    const h = names.get(id);
    return {
      hotelId: id,
      name: h?.name ?? id,
      isYou: id === hotelId,
      rating: ratingOf(id).value,
      reviews: reviewsOf(id),
      priceInr: h?.priceInr ?? null,
      cells: Object.fromEntries(ASPECTS.map(({ key }) => {
        const c = countsFor(id, key);
        return [key, c.n >= MIN_MENTIONS ? { score: round(aspectScore(c.pos, c.neg, c.n, marketNetOf(key)), 0), n: c.n } : { score: null, n: c.n }];
      })),
    };
  });

  /* ---- coverage & PS metrics ---- */
  const cov = (id) => coverage.get(id) ?? { reviews: 0, analysed: 0, by_ai: 0, pending: 0 };
  const totals = allIds.reduce((s, id) => {
    const c = cov(id);
    return { reviews: s.reviews + c.reviews, analysed: s.analysed + c.analysed, byAi: s.byAi + c.by_ai, pending: s.pending + c.pending };
  }, { reviews: 0, analysed: 0, byAi: 0, pending: 0 });
  const indic = allIds.reduce((s, id) => s + (analysed.get(id)?.indic ?? 0), 0);

  const result = {
    hotel: { hotelId, name: hotel.name, cityId: hotel.cityId, priceInr: hotel.priceInr, starClass: hotel.starClass },
    peerSet: { mode: peerSet.mode, label: peerSet.label, total: peerSet.ids.length, withData: peersWithData.length },
    rating,
    aspects,
    platformCategories,
    issues,
    findings: { leads, lags, marketWide, propertyIssues, marketIssues },
    heatmap,
    coverage: {
      ...totals,
      indicLanguage: indic,
      yourReviews: cov(hotelId).analysed,
      // A person reads a review in ~30 s; this is the reading the analysis replaces.
      readingHoursSaved: round((totals.analysed * 30) / 3600, 1),
      method: totals.byAi > 0 ? (totals.byAi === totals.analysed ? 'ai' : 'mixed') : 'lexicon',
    },
    generatedAt: new Date().toISOString(),
  };
  result.fingerprint = hashParts([JSON.stringify(aspects.map((a) => [a.aspect, a.status, a.you.score, a.market.median, a.marketWide])), JSON.stringify(rating), peerSet.ids.join(',')], 16);
  return result;
}

function pick(a) {
  return { aspect: a.aspect, label: a.label, you: a.you, market: a.market, gap: a.gap, rank: a.rank, rankOf: a.rankOf, confidence: a.confidence };
}
