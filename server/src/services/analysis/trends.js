import { AppError } from '../../shared/errors/AppError.js';
import * as hotelsRepo from '../../data/hotels.js';
import * as A from '../../data/analysis.js';
import { ASPECT_KEYS, ASPECT_LABEL, ISSUES, issueLabel } from './taxonomy.js';
import { detectChangepoint, round } from './stats.js';
import { resolvePeers } from './benchmark.js';
import { cachedView } from './viewCache.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const iso = (d) => {
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const dt = new Date(d);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-01`;
};

/** Fill a continuous month axis (oldest → newest) from bucket rows. */
function monthAxis(rows, maxMonths = 24) {
  const months = [...new Set(rows.map((r) => iso(r.month)))].sort();
  if (!months.length) return [];
  const out = [];
  const end = new Date(`${months.at(-1)}T00:00:00Z`);
  end.setUTCDate(1);
  let d = new Date(`${months[0]}T00:00:00Z`);
  d.setUTCDate(1);
  const minStart = new Date(end);
  minStart.setUTCMonth(minStart.getUTCMonth() - (maxMonths - 1));
  minStart.setUTCDate(1);
  if (d < minStart) d = minStart;
  while (d <= end) {
    out.push(iso(d));
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
}

/**
 * Monthly movement of one measure (overall rating or an aspect's sentiment) for the hotel and its
 * market, plus the most likely changepoint, nearby events, emerging issues, seasonal patterns and
 * the before/after effect of interventions the operator logged.
 */
export async function getTrends(hotelId, { measure = 'rating', ...peerOpts } = {}) {
  const hotel = await hotelsRepo.getHotel(hotelId);
  if (!hotel) throw AppError.notFound('Business not found');
  if (measure !== 'rating' && !ASPECT_KEYS.includes(measure)) throw AppError.badRequest('Unknown measure');
  const { ids: peerIds } = await resolvePeers(hotel, peerOpts);
  const ids = [hotelId, ...peerIds];
  return cachedView({
    hotelId,
    view: 'trends',
    params: `${measure}:${peerOpts.peers ?? 'compset'}:${peerOpts.radiusKm ?? 3}`,
    ids,
    compute: () => computeTrends(hotelId, measure, peerIds),
  });
}

async function computeTrends(hotelId, measure, peerIds) {
  const ids = [hotelId, ...peerIds];

  let rows;
  if (measure === 'rating') {
    rows = (await A.monthlyRating(ids)).map((r) => ({ ...r, value: r.mean }));
  } else {
    rows = (await A.monthlyAspect(ids, measure)).map((r) => {
      const mean = (r.pos - r.neg) / r.n;
      return { ...r, mean, var: (r.pos + r.neg) / r.n - mean ** 2 };
    });
  }
  const axis = monthAxis(rows);
  const agg = (filter) => axis.map((m) => {
    const bucket = rows.filter((r) => iso(r.month) === m && filter(r.hotel_id));
    const n = bucket.reduce((s, b) => s + b.n, 0);
    const meanV = n ? bucket.reduce((s, b) => s + b.mean * b.n, 0) / n : null;
    const varV = n ? bucket.reduce((s, b) => s + (b.var + (b.mean - meanV) ** 2) * b.n, 0) / n : 0;
    return { month: m, n, mean: meanV, var: varV };
  });
  const you = agg((id) => id === hotelId);
  const market = agg((id) => id !== hotelId);
  const toPoint = (b) => ({ month: b.month, n: b.n, value: b.mean === null ? null : measure === 'rating' ? round(b.mean, 2) : round(50 + 50 * b.mean, 1) });

  const events = await A.listEvents(hotelId);
  const cp = detectChangepoint(you, measure === 'rating' ? { minDiff: 0.4 } : { minDiff: 0.25 });
  let changepoint = null;
  if (cp) {
    const near = events.filter((e) => Math.abs(Date.parse(e.date) - Date.parse(cp.month)) <= 50 * 86400e3);
    const marketMoved = detectChangepoint(market.map((b, i) => ({ ...b, month: axis[i] })), measure === 'rating' ? { minDiff: 0.3 } : { minDiff: 0.2 });
    changepoint = {
      month: cp.month,
      direction: cp.after > cp.before ? 'up' : 'down',
      before: measure === 'rating' ? round(cp.before, 2) : round(50 + 50 * cp.before, 1),
      after: measure === 'rating' ? round(cp.after, 2) : round(50 + 50 * cp.after, 1),
      reviewsBefore: cp.nBefore,
      reviewsAfter: cp.nAfter,
      t: round(cp.t, 1),
      relatedEvents: near,
      // If the whole market moved at the same time it is probably seasonal / market-wide, not you.
      marketAlsoMoved: Boolean(marketMoved && Math.abs(Date.parse(marketMoved.month) - Date.parse(cp.month)) <= 62 * 86400e3 && Math.sign(marketMoved.after - marketMoved.before) === Math.sign(cp.after - cp.before)),
    };
  }

  return {
    measure,
    measureLabel: measure === 'rating' ? 'Average rating (out of 5)' : `${ASPECT_LABEL[measure]} sentiment score (0–100)`,
    you: you.map(toPoint),
    market: market.map(toPoint),
    changepoint,
    events,
    emerging: await emergingIssues(hotelId, peerIds),
    seasonal: await seasonalPatterns(ids),
    interventions: await interventionEffects(hotelId, events),
  };
}

/**
 * Issues whose complaints rose in the last 60 days compared with the 6 months before — caught
 * before they move the overall score. Each one is recorded in issue_alerts, so the time from the
 * first complaint to detection can be reported.
 */
export async function emergingIssues(hotelId, peerIds = []) {
  const mine = await A.issueWindows([hotelId], {});
  const market = peerIds.length ? await A.issueWindows(peerIds, {}) : { issues: [], volume: { recent: 0, before: 0 } };
  const out = [];
  for (const i of mine.issues) {
    if (i.recent < 2) continue;
    const recentRate = mine.volume.recent ? i.recent / mine.volume.recent : 0;
    const beforeRate = mine.volume.before ? i.before / mine.volume.before : 0;
    if (!(i.before === 0 || recentRate >= 2 * beforeRate)) continue;
    const m = market.issues.find((x) => x.issue === i.issue);
    const mRecent = m && market.volume.recent ? m.recent / market.volume.recent : 0;
    const alert = await A.upsertIssueAlert({ hotelId, aspect: i.aspect, issue: i.issue, firstEvidenceAt: i.first_recent, recentCount: i.recent });
    out.push({
      issue: i.issue,
      label: issueLabel(i.issue),
      aspect: i.aspect,
      aspectLabel: ASPECT_LABEL[i.aspect],
      recent: i.recent,
      before: i.before,
      recentPer100: round(recentRate * 100, 1),
      beforePer100: round(beforeRate * 100, 1),
      marketRecentPer100: round(mRecent * 100, 1),
      alsoInMarket: mRecent > 0 && mRecent >= recentRate * 0.6,
      firstEvidenceAt: alert.firstEvidenceAt,
      detectedAt: alert.detectedAt,
      daysToDetect: alert.firstEvidenceAt ? Math.max(0, Math.round((Date.parse(alert.detectedAt) - Date.parse(alert.firstEvidenceAt)) / 86400e3)) : null,
      evidence: await A.evidence({ hotelIds: [hotelId], issue: i.issue, sentiment: -1, limit: 2 }),
    });
  }
  return out.sort((a, b) => b.recent - a.recent).slice(0, 8);
}

/** Complaints that cluster in particular months of the year (e.g. heating in December) across the market. */
export async function seasonalPatterns(ids) {
  const rows = await A.issueMonthOfYear(ids);
  const byIssue = new Map();
  for (const r of rows) {
    if (!byIssue.has(r.issue)) byIssue.set(r.issue, []);
    byIssue.get(r.issue).push(r);
  }
  const out = [];
  for (const [issue, months] of byIssue) {
    const total = months.reduce((s, m) => s + m.n, 0);
    if (total < 6) continue;
    const top = months.sort((a, b) => b.n - a.n)[0];
    const share = top.n / total;
    // Uniform would be 1/12 ≈ 8%; flag a month holding ≥ 3× that and at least 4 complaints.
    if (share >= 0.25 && top.n >= 4) {
      out.push({ issue, label: issueLabel(issue), aspect: ISSUES[issue]?.aspect ?? null, month: MONTHS[top.m - 1], share: round(share * 100, 0), complaints: total });
    }
  }
  return out.sort((a, b) => b.share - a.share).slice(0, 6);
}

/** Before/after (90 days each side) for every intervention the operator logged. */
async function interventionEffects(hotelId, events) {
  const out = [];
  for (const e of events.filter((x) => x.kind === 'intervention')) {
    const at = new Date(`${e.date}T00:00:00Z`);
    const before = await A.windowStats(hotelId, { from: new Date(at.getTime() - 90 * 86400e3), to: at, aspect: e.aspect });
    const after = await A.windowStats(hotelId, { from: at, to: new Date(at.getTime() + 90 * 86400e3), aspect: e.aspect });
    const net = (s) => (s?.n ? round(50 + 50 * ((s.pos - s.neg) / s.n), 1) : null);
    out.push({
      ...e,
      rating: { before: round(before.rating.mean, 2), after: round(after.rating.mean, 2), reviewsBefore: before.rating.n, reviewsAfter: after.rating.n },
      aspectScore: e.aspect ? { before: net(before.aspect), after: net(after.aspect), mentionsBefore: before.aspect?.n ?? 0, mentionsAfter: after.aspect?.n ?? 0 } : null,
      enoughData: before.rating.n >= 5 && after.rating.n >= 5,
    });
  }
  return out;
}
