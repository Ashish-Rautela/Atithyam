// "Ask your reviews": an AI assistant that answers an owner's questions using only this hotel's
// computed benchmark and real guest quotes. Gemini writes the answer when a key is set; otherwise a
// plain, data-only answer is assembled from the same facts.
import * as A from '../../data/analysis.js';
import { logger } from '../../shared/logging/logger.js';
import { getBenchmark } from './benchmark.js';
import { generateJson, geminiEnabled } from './gemini.js';

// Words (English, Hindi in Latin script, Hinglish) that point a question at a topic.
const KEYWORDS = {
  food: ['food', 'breakfast', 'dinner', 'lunch', 'meal', 'restaurant', 'buffet', 'menu', 'taste', 'chai', 'tea', 'coffee', 'khana', 'nashta', 'kitchen'],
  room: ['room', 'bed', 'bathroom', 'washroom', 'geyser', 'hot water', 'heater', 'wifi', 'wi-fi', 'balcony', 'pillow', 'noise', 'ac', 'kamra', 'view'],
  housekeeping: ['housekeeping', 'towel', 'linen', 'bedsheet', 'laundry', 'room service', 'toiletries'],
  staff: ['staff', 'service', 'reception', 'manager', 'owner', 'behaviour', 'behavior', 'rude', 'friendly', 'helpful', 'hospitality'],
  location: ['location', 'parking', 'road', 'market', 'mall road', 'distance', 'walk', 'nearby', 'access'],
  value: ['price', 'value', 'money', 'expensive', 'cheap', 'cost', 'tariff', 'overcharg', 'worth', 'paisa', 'rate'],
  cleanliness: ['clean', 'dirty', 'smell', 'hygiene', 'dust', 'stain', 'saaf', 'ganda', 'safai'],
  booking: ['booking', 'check-in', 'checkin', 'check in', 'checkout', 'check-out', 'reservation', 'refund', 'cancel', 'payment', 'ota'],
};
const IMPROVE = /(improve|better|fix|weak|problem|complain|issue|lag|behind|why.*(low|lower|less)|sudhar|kharab|kamzor)/i;

const ANSWER_SCHEMA = {
  type: 'OBJECT',
  properties: {
    answer: { type: 'STRING' },
    followUps: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['answer'],
};

const SYSTEM = `You are "Front Desk", an assistant inside a guest-review analytics product for hotels in Uttarakhand, India.
You answer the owner's question using ONLY the facts provided (computed scores and real guest quotes).
Rules: never invent numbers, names or quotes. Quote guests in double quotes when useful. Be concrete and practical:
when asked how to improve, give 2-4 specific steps tied to the evidence. Keep it under 180 words.
Scores are 0-100 (50 = as much praise as complaint). Reply in the user's language style (English, Hindi or Hinglish).
If the facts do not cover the question, say so briefly and suggest what the data can answer.
Also return up to 3 short follow-up questions the owner might ask next.`;

function topicsFor(question, aspects) {
  const q = question.toLowerCase();
  const hits = Object.entries(KEYWORDS)
    .map(([aspect, words]) => ({ aspect, n: words.filter((w) => q.includes(w)).length }))
    .filter((h) => h.n > 0)
    .sort((a, b) => b.n - a.n)
    .map((h) => h.aspect);
  if (hits.length) return hits.slice(0, 2);
  if (IMPROVE.test(question)) {
    const lags = aspects.filter((a) => a.status === 'lag').map((a) => a.aspect);
    if (lags.length) return lags.slice(0, 2);
    return [...aspects].filter((a) => a.gap !== null).sort((a, b) => a.gap - b.gap).slice(0, 2).map((a) => a.aspect);
  }
  return [...aspects].sort((a, b) => b.you.n - a.you.n).slice(0, 2).map((a) => a.aspect);
}

async function gatherFacts(hotelId, b, focus) {
  const peers = b.heatmap.filter((h) => !h.isYou).map((h) => h.hotelId);
  const focusFacts = [];
  for (const key of focus) {
    const a = b.aspects.find((x) => x.aspect === key);
    if (!a) continue;
    const [complaints, praise, competitorPraise] = await Promise.all([
      A.evidence({ hotelIds: [hotelId], aspect: key, sentiment: -1, limit: 4 }),
      A.evidence({ hotelIds: [hotelId], aspect: key, sentiment: 1, limit: 3 }),
      peers.length ? A.evidence({ hotelIds: peers, aspect: key, sentiment: 1, limit: 3 }) : [],
    ]);
    focusFacts.push({
      topic: a.label,
      aspect: key,
      status: a.status,
      yourScore: a.you.score,
      marketMedian: a.market.median,
      gap: a.gap,
      mentions: a.you.n,
      yourRankAmongHotels: a.rank ? `${a.rank} of ${a.rankOf}` : null,
      weakAcrossMarket: a.marketWide,
      guestComplaints: complaints.map((e) => ({ quote: e.quote, platform: e.platform })),
      guestPraise: praise.map((e) => ({ quote: e.quote, platform: e.platform })),
      whatCompetitorsGetPraisedFor: competitorPraise.map((e) => ({ hotel: e.hotelName, quote: e.quote })),
    });
  }
  return {
    hotel: b.hotel.name,
    comparedWith: b.peerSet.label,
    rating: { you: b.rating.you, marketAverage: b.rating.marketAverage, verdict: b.rating.verdict },
    allTopics: b.aspects.map((a) => ({ topic: a.label, status: a.status, you: a.you.score, market: a.market.median, mentions: a.you.n })),
    specificProblems: b.findings.propertyIssues.map((i) => ({ issue: i.label, youPer100Reviews: i.you.negPer100, marketPer100Reviews: i.market.negPer100 })),
    marketWideProblems: b.findings.marketIssues.map((i) => ({ issue: i.label, competitorsAffected: i.market.hotelsAffected })),
    reviewsAnalysed: b.coverage.yourReviews,
    focus: focusFacts,
  };
}

/** Plain answer from the facts, used without Gemini (or when it fails). */
function templateAnswer(facts) {
  const lines = [];
  for (const f of facts.focus) {
    const where = f.status === 'lead' ? 'ahead of' : f.status === 'lag' ? 'behind' : f.status === 'insufficient' ? 'not yet comparable with' : 'level with';
    lines.push(`${f.topic}: your score is ${f.yourScore ?? 'n/a'} vs ${f.marketMedian ?? 'n/a'} for nearby hotels - you are ${where} the market (${f.mentions} guest mentions).`);
    if (f.guestComplaints.length) lines.push(`Guests complain: ${f.guestComplaints.slice(0, 2).map((e) => `"${e.quote}"`).join(' · ')}`);
    if (f.whatCompetitorsGetPraisedFor.length) lines.push(`Competitors are praised for: ${f.whatCompetitorsGetPraisedFor.slice(0, 2).map((e) => `"${e.quote}" (${e.hotel})`).join(' · ')}`);
    if (f.status === 'lag') lines.push(`Start here: fix what the complaints above describe, then ask a few happy guests to mention ${f.topic.toLowerCase()} in their reviews.`);
  }
  if (!lines.length) lines.push(`Your rating is ${facts.rating.you ?? 'n/a'} vs a market average of ${facts.rating.marketAverage ?? 'n/a'}. Ask about a topic such as breakfast, rooms, staff, cleanliness or value for money.`);
  return {
    answer: lines.join('\n'),
    followUps: ['What do guests complain about most?', 'Where am I ahead of my competitors?', 'How can I improve my rating?'],
  };
}

/**
 * @param {string} hotelId
 * @param {string} question
 * @param {{role:'user'|'assistant', text:string}[]} history  previous turns (most recent last)
 */
export async function askReviews(hotelId, question, history = [], peerOpts = {}) {
  const b = await getBenchmark(hotelId, peerOpts);
  const focus = topicsFor(question, b.aspects);
  const facts = await gatherFacts(hotelId, b, focus);
  const sources = facts.focus.flatMap((f) => [...f.guestComplaints, ...f.guestPraise].slice(0, 3).map((e) => ({ topic: f.topic, quote: e.quote, platform: e.platform })));

  let out = null;
  let method = 'data';
  if (geminiEnabled() && facts.reviewsAnalysed > 0) {
    try {
      const { data, model } = await generateJson({
        system: SYSTEM,
        prompt: JSON.stringify({ question, previousTurns: history.slice(-6), facts }),
        schema: ANSWER_SCHEMA,
        temperature: 0.3,
        maxOutputTokens: 1024,
      });
      out = data;
      method = `gemini:${model}`;
    } catch (err) {
      logger.warn({ err: err.message }, 'Review chat: AI answer failed; using data answer');
    }
  }
  out ??= templateAnswer(facts);
  return {
    answer: String(out.answer ?? '').trim(),
    followUps: (out.followUps ?? []).filter((s) => typeof s === 'string' && s.length < 140).slice(0, 3),
    topics: facts.focus.map((f) => f.topic),
    sources: sources.slice(0, 6),
    method,
  };
}
