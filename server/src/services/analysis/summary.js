import * as A from '../../data/analysis.js';
import { generateJson, geminiEnabled } from './gemini.js';
import { getBenchmark } from './benchmark.js';
import { getDestination } from './destination.js';
import { logger } from '../../shared/logging/logger.js';

const SUMMARY_SCHEMA = {
  type: 'OBJECT',
  properties: {
    headline: { type: 'STRING' },
    situation: { type: 'STRING' },
    actions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { title: { type: 'STRING' }, why: { type: 'STRING' }, aspect: { type: 'STRING' } },
        required: ['title', 'why'],
      },
    },
    watch: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['headline', 'situation', 'actions'],
};

const HOTEL_SYSTEM = `You are a hospitality analyst writing for the owner of an independent Indian hotel.
You receive a computed competitive benchmark (numbers already calculated — do not invent any others).
Write plainly, no jargon, Indian English. Distinguish clearly between problems specific to this hotel
(fix them) and problems the whole market shares (an opportunity to stand out). Every action must cite
the number it is based on. Max 3 actions, ordered by impact. If data is thin, say so.`;

const CITY_SYSTEM = `You are an analyst preparing a brief for a Tourism Board / district administration in India.
You receive aggregated, computed findings from public guest reviews of every hotel in a destination.
Focus on what visitors consistently experience and on issues the administration can act on (roads,
parking, cleanliness of public areas, power, transport, overcharging). Cite counts. Max 3 actions.`;

function compactHotel(b) {
  return {
    hotel: b.hotel.name,
    comparedWith: b.peerSet.label,
    rating: b.rating,
    aspects: b.aspects.map((a) => ({ aspect: a.label, status: a.status, you: a.you.score, marketMedian: a.market.median, mentions: a.you.n, marketWideWeakness: a.marketWide, negativeShareYou: a.you.negShare, negativeShareMarket: a.market.negShare })),
    propertySpecificIssues: b.findings.propertyIssues.map((i) => ({ issue: i.label, youPer100: i.you.negPer100, marketPer100: i.market.negPer100, quote: i.evidence[0]?.quote })),
    marketWideIssues: b.findings.marketIssues.map((i) => ({ issue: i.label, hotelsAffected: i.market.hotelsAffected, youPer100: i.you.negPer100 })),
    reviewsAnalysed: b.coverage.analysed,
  };
}

function templateHotel(b) {
  const lags = b.aspects.filter((a) => a.status === 'lag');
  const leads = b.aspects.filter((a) => a.status === 'lead');
  const shared = b.aspects.filter((a) => a.marketWide);
  const r = b.rating;
  const headline = r.you !== null && r.marketAverage !== null
    ? `Rated ${r.you} vs a market average of ${r.marketAverage} (${r.verdict} the market)`
    : 'Benchmark based on the reviews collected so far';
  const situation = [
    leads.length ? `You lead the market on ${leads.map((a) => a.label).join(', ')}.` : null,
    lags.length ? `You trail it on ${lags.map((a) => a.label).join(', ')}.` : 'No aspect is clearly behind the market.',
    shared.length ? `${shared.map((a) => a.label).join(', ')} ${shared.length > 1 ? 'are weaknesses' : 'is a weakness'} across the whole market — fixing ${shared.length > 1 ? 'them' : 'it'} is a chance to stand out.` : null,
  ].filter(Boolean).join(' ');
  const actions = [
    ...b.findings.propertyIssues.slice(0, 2).map((i) => ({ title: `Fix: ${i.label}`, why: `${i.you.negPer100} complaints per 100 of your reviews vs ${i.market.negPer100 ?? 0} in the market.`, aspect: i.aspectLabel })),
    ...lags.slice(0, 1).map((a) => ({ title: `Improve ${a.label}`, why: `Score ${a.you.score} vs market median ${a.market.median}.`, aspect: a.label })),
    ...b.findings.marketIssues.slice(0, 1).map((i) => ({ title: `Stand out on: ${i.label}`, why: `${i.market.hotelsAffected} competitors get complaints about it.`, aspect: i.aspectLabel })),
  ].slice(0, 3);
  return { headline, situation, actions, watch: [] };
}

function templateCity(d) {
  const top = d.destinationIssues.slice(0, 3);
  return {
    headline: `${d.coverage.reviews} reviews of ${d.coverage.hotelsWithData} properties in ${d.city.name} analysed`,
    situation: top.length
      ? `Visitors most often complain about ${top.map((i) => `${i.label.toLowerCase()} (${i.complaints} complaints across ${i.hotelsAffected} properties)`).join(', ')}.`
      : 'No destination-level complaint stands out in the reviews collected so far.',
    actions: top.map((i) => ({ title: `Address ${i.label.toLowerCase()}`, why: `${i.complaints} complaints at ${i.hotelsAffected} properties; e.g. “${i.evidence[0]?.quote ?? ''}”`, aspect: i.aspectLabel })),
    watch: [],
  };
}

/**
 * Summary of a benchmark (hotel) or destination (city). Generated with Gemini when available,
 * otherwise from a deterministic template; cached until the underlying numbers change.
 */
export async function getSummary(scope, id, opts = {}, { refresh = false } = {}) {
  const data = scope === 'hotel' ? await getBenchmark(id, opts) : await getDestination(id, opts);
  const cacheKey = scope === 'hotel' ? `${id}:${opts.peers ?? 'compset'}` : `${id}:${opts.clusterId ?? 'all'}`;
  const cached = await A.getSummary(scope, cacheKey);
  if (cached && cached.fingerprint === data.fingerprint && !refresh) return { ...cached.content, method: cached.method, createdAt: cached.createdAt };

  let content;
  let method = 'template';
  const enough = scope === 'hotel' ? data.coverage.yourReviews >= 5 : data.coverage.reviews >= 10;
  if (geminiEnabled() && enough) {
    try {
      const facts = scope === 'hotel' ? compactHotel(data) : { destination: data.city.name, coverage: data.coverage, aspects: data.aspects, destinationIssues: data.destinationIssues.map((i) => ({ ...i, evidence: i.evidence.slice(0, 2).map((e) => e.quote) })), propertyIssues: data.propertyIssues.slice(0, 5).map((i) => ({ issue: i.label, complaints: i.complaints, hotelsAffected: i.hotelsAffected })) };
      const { data: out, model } = await generateJson({ system: scope === 'hotel' ? HOTEL_SYSTEM : CITY_SYSTEM, prompt: JSON.stringify(facts), schema: SUMMARY_SCHEMA, temperature: 0.3, maxOutputTokens: 2048 });
      content = out;
      method = `gemini:${model}`;
    } catch (err) {
      logger.warn({ err: err.message }, 'AI summary failed; using template');
    }
  }
  content ??= scope === 'hotel' ? templateHotel(data) : templateCity(data);
  await A.saveSummary(scope, cacheKey, data.fingerprint, content, method);
  return { ...content, method, createdAt: new Date().toISOString() };
}
