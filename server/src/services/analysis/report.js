// The hotel report: one page an owner gets right after checking in their hotel.
// Free accounts get a real but partial report (rank, rating vs market, two topics, competitor list,
// one strength, and counts of everything else). Paid accounts get everything. Locked parts are
// removed HERE, on the server - the browser only ever receives counts for them, so the blurred
// placeholders on the page cannot be "un-blurred" into real data.
import { getBenchmark } from './benchmark.js';
import { getSummary } from './summary.js';
import { getPipeline, analysePendingInstantly } from './analysisService.js';
import * as A from '../../data/analysis.js';

const FREE_TOPICS = 2;

const topicView = (a) => ({
  aspect: a.aspect,
  label: a.label,
  status: a.status,
  you: { score: a.you.score, mentions: a.you.n, positive: a.you.posShare, negative: a.you.negShare },
  market: { median: a.market.median, hotels: a.market.hotels },
  gap: a.gap,
  rank: a.rank,
  rankOf: a.rankOf,
  marketWide: a.marketWide,
  locked: false,
});

/** Which topics a free report shows: the clearest strength, then the topic guests talk about most. */
function freeTopicKeys(aspects) {
  const usable = aspects.filter((a) => a.status !== 'insufficient' && a.you.score !== null);
  const chosen = [];
  const best = [...usable].sort((a, b) => (b.gap ?? -99) - (a.gap ?? -99))[0];
  if (best) chosen.push(best.aspect);
  const busiest = [...usable].filter((a) => !chosen.includes(a.aspect) && a.status !== 'lag').sort((a, b) => b.you.n - a.you.n)[0];
  if (busiest) chosen.push(busiest.aspect);
  return new Set(chosen.slice(0, FREE_TOPICS));
}

/**
 * @param {string} hotelId
 * @param {object} peerOpts  { peers, radiusKm }
 * @param {{ full: boolean }} access  full = paid plan (or admin)
 */
export async function getReport(hotelId, peerOpts, { full }) {
  // Looking at the report also lets parked collection for this hotel and its competitors continue.
  const pipeline = await getPipeline(hotelId, peerOpts);
  if (!pipeline.ready) {
    return { status: 'collecting', full, pipeline: { stages: pipeline.stages, coverage: pipeline.coverage } };
  }
  await analysePendingInstantly(hotelId, peerOpts);
  const b = await getBenchmark(hotelId, peerOpts);
  const summary = await getSummary('hotel', hotelId, peerOpts).catch(() => null);

  const you = b.heatmap.find((h) => h.isYou);
  const ranked = b.heatmap.filter((h) => h.rating !== null).sort((x, y) => y.rating - x.rating);
  const rank = you?.rating !== null && you ? 1 + ranked.filter((h) => h.rating > you.rating).length : null;

  const { leads, lags, marketWide, propertyIssues, marketIssues } = b.findings;
  const problems = [
    ...lags.map((l) => ({ kind: 'topic', title: `${l.label} is behind the hotels near you`, aspect: l.aspect, label: l.label, you: l.you.score, market: l.market.median, gap: l.gap, evidence: l.evidence, competitorPraise: l.competitorPraise })),
    ...propertyIssues.map((i) => ({ kind: 'issue', title: i.label, aspect: i.aspect, label: i.aspectLabel, youPer100: i.you.negPer100, marketPer100: i.market.negPer100, evidence: i.evidence })),
  ];
  // A topic most competitors get wrong but this hotel gets right is a strength (with its own praise).
  const beatsMarket = marketWide.filter((m) => !m.youToo);
  const opportunities = [
    ...marketWide.filter((m) => m.youToo).map((m) => ({ title: `${m.label}: weak across the whole market`, aspect: m.aspect, label: m.label, youToo: true, evidence: m.evidence })),
    ...marketIssues.map((i) => ({ title: i.label, aspect: i.aspect, label: i.aspectLabel, hotelsAffected: i.market.hotelsAffected, evidence: i.evidence })),
  ];
  const strengths = [
    ...leads.map((l) => ({ aspect: l.aspect, label: l.label, you: l.you.score, market: l.market.median, gap: l.gap, note: null, evidence: l.evidence })),
    ...(await Promise.all(beatsMarket.map(async (m) => ({
      aspect: m.aspect,
      label: m.label,
      you: m.you.score,
      market: m.market.median,
      gap: m.gap,
      note: 'Most hotels near you get complaints here - you do not.',
      evidence: await A.evidence({ hotelIds: [hotelId], aspect: m.aspect, sentiment: 1, limit: 2 }),
    })))),
  ].sort((x, y) => (y.gap ?? 0) - (x.gap ?? 0));
  const actions = summary?.actions ?? [];

  const counts = {
    topics: b.aspects.filter((a) => a.status !== 'insufficient').length,
    strengths: strengths.length,
    problems: problems.length,
    opportunities: opportunities.length,
    actions: actions.length,
    quotes: [...strengths, ...problems, ...opportunities].reduce((s, x) => s + (x.evidence?.length ?? 0), 0),
  };

  const report = {
    status: 'ready',
    full,
    hotel: { hotelId: b.hotel.hotelId, name: b.hotel.name },
    comparedWith: b.peerSet.label,
    generatedAt: b.generatedAt,
    coverage: { yourReviews: b.coverage.yourReviews, analysed: b.coverage.analysed, hotels: b.heatmap.length, readingHoursSaved: b.coverage.readingHoursSaved, method: b.coverage.method },
    // Free: the headline numbers.
    scorecard: {
      rating: b.rating.you,
      marketAverage: b.rating.marketAverage,
      verdict: b.rating.verdict,
      rank,
      rankOf: ranked.length,
      percentile: b.rating.percentile,
    },
    // Free: who you are compared with, their rating and review counts.
    competitors: b.heatmap.map((h) => ({ hotelId: h.hotelId, name: h.name, isYou: h.isYou, rating: h.rating, reviews: h.reviews })).sort((x, y) => (y.rating ?? 0) - (x.rating ?? 0)),
    counts,
    headline: summary?.headline ?? null,
  };

  if (full) {
    return {
      ...report,
      topics: b.aspects.map(topicView),
      strengths,
      problems,
      opportunities,
      actions,
      situation: summary?.situation ?? null,
      watch: summary?.watch ?? [],
      // Per-topic scores of every competitor (the heatmap).
      competitorTopics: b.heatmap.map((h) => ({ hotelId: h.hotelId, cells: Object.fromEntries(Object.entries(h.cells).map(([k, c]) => [k, c.score])) })),
      summaryMethod: summary?.method ?? null,
    };
  }

  // ---- free: keep only what the free report shows; everything else becomes a count.
  const open = freeTopicKeys(b.aspects);
  return {
    ...report,
    topics: b.aspects.map((a) => (open.has(a.aspect) ? topicView(a) : { aspect: a.aspect, label: a.label, locked: true })),
    strengths: strengths.slice(0, 1).map((s) => ({ ...s, evidence: s.evidence.slice(0, 1) })),
    problems: [],
    opportunities: [],
    actions: [],
    situation: null,
    watch: [],
    competitorTopics: null,
  };
}
