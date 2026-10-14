// "Ask Front Desk": a chat assistant (Hotel Pro) that answers an owner's questions from this hotel's
// computed benchmark and real guest quotes - never from general knowledge.
//
// Speed:
//  - answers stream word by word (Gemini streamGenerateContent);
//  - the hotel's facts are built once per benchmark version and kept in memory;
//  - evidence quotes for a topic or competitor are cached the same way;
//  - a first question asked before (same hotel, same data) is answered from cache instantly.
// Without a Gemini key, or when Gemini is busy, a plain answer is built from the same facts.
import * as A from '../../data/analysis.js';
import { logger } from '../../shared/logging/logger.js';
import { getBenchmark } from './benchmark.js';
import { getSummary } from './summary.js';
import { geminiEnabled, streamText } from './gemini.js';

// ------------------------------------------------------------------ small TTL cache
function ttlCache(max, ttlMs) {
  const m = new Map();
  return {
    get(k) {
      const e = m.get(k);
      if (!e) return undefined;
      if (e.exp < Date.now()) {
        m.delete(k);
        return undefined;
      }
      m.delete(k); // refresh LRU position
      m.set(k, e);
      return e.v;
    },
    set(k, v) {
      m.set(k, { v, exp: Date.now() + ttlMs });
      while (m.size > max) m.delete(m.keys().next().value);
    },
    clear: () => m.clear(),
  };
}
const baseCache = ttlCache(300, 15 * 60_000); // hotel facts per benchmark version
const evidenceCache = ttlCache(2000, 15 * 60_000); // quotes per topic / competitor
const answerCache = ttlCache(1000, 60 * 60_000); // first-turn answers
export const _clearChatCaches = () => [baseCache, evidenceCache, answerCache].forEach((c) => c.clear());

// ------------------------------------------------------------------ understanding the question
// Words (English, Hindi in Latin script, Hinglish) that point a question at a topic.
const KEYWORDS = {
  food: ['food', 'breakfast', 'dinner', 'lunch', 'meal', 'restaurant', 'buffet', 'menu', 'taste', 'chai', 'tea', 'coffee', 'khana', 'nashta', 'kitchen'],
  room: ['room', 'bed', 'bathroom', 'washroom', 'geyser', 'hot water', 'heater', 'wifi', 'wi-fi', 'balcony', 'pillow', 'noise', ' ac ', 'kamra', 'view'],
  housekeeping: ['housekeeping', 'towel', 'linen', 'bedsheet', 'laundry', 'room service', 'toiletries'],
  staff: ['staff', 'service', 'reception', 'manager', 'owner', 'behaviour', 'behavior', 'rude', 'friendly', 'helpful', 'hospitality'],
  location: ['location', 'parking', 'road', 'market', 'mall road', 'distance', 'walk', 'nearby', 'access'],
  value: ['price', 'value', 'money', 'expensive', 'cheap', 'cost', 'tariff', 'overcharg', 'worth', 'paisa', 'rate '],
  cleanliness: ['clean', 'dirty', 'smell', 'hygiene', 'dust', 'stain', 'saaf', 'ganda', 'safai'],
  booking: ['booking', 'check-in', 'checkin', 'check in', 'checkout', 'check-out', 'reservation', 'refund', 'cancel', 'payment', 'ota'],
};
const IMPROVE = /(improve|better|fix|weak|problem|complain|issue|lag|behind|why.*(low|lower|less)|sudhar|kharab|kamzor)/i;
const norm = (s) => ` ${String(s).toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim()} `;

function focusTopics(q, aspects, { guess = true } = {}) {
  const hits = Object.entries(KEYWORDS)
    .map(([aspect, words]) => ({ aspect, n: words.filter((w) => q.includes(w)).length }))
    .filter((h) => h.n > 0)
    .sort((a, b) => b.n - a.n)
    .map((h) => h.aspect);
  if (hits.length) return hits.slice(0, 2);
  if (guess && IMPROVE.test(q)) {
    const lags = aspects.filter((a) => a.status === 'lag').map((a) => a.aspect);
    if (lags.length) return lags.slice(0, 2);
    return [...aspects].filter((a) => a.gap !== null).sort((a, b) => a.gap - b.gap).slice(0, 2).map((a) => a.aspect);
  }
  return [];
}

/** Competitors named in the question ("why is Maple Lodge rated higher?"). */
function focusCompetitors(q, competitors) {
  return competitors.filter((c) => {
    const words = norm(c.name).trim().split(' ').filter((w) => w.length > 3 && !['hotel', 'resort', 'homestay', 'lodge', 'inn', 'stay', 'the'].includes(w));
    return norm(c.name).trim().length > 3 && (q.includes(norm(c.name)) || (words.length && words.every((w) => q.includes(` ${w} `))));
  }).slice(0, 2);
}

// ------------------------------------------------------------------ facts
async function baseFacts(hotelId, peerOpts) {
  const b = await getBenchmark(hotelId, peerOpts);
  const key = `${hotelId}:${peerOpts.peers ?? 'compset'}:${b.fingerprint}`;
  const hit = baseCache.get(key);
  if (hit) return hit;
  const summary = await getSummary('hotel', hotelId, peerOpts).catch(() => null);
  const labels = Object.fromEntries(b.aspects.map((a) => [a.aspect, a.label]));
  const competitors = b.heatmap.filter((h) => !h.isYou).map((h) => {
    const cells = Object.entries(h.cells).filter(([, c]) => c.score !== null).sort((x, y) => y[1].score - x[1].score);
    return {
      hotelId: h.hotelId,
      name: h.name,
      rating: h.rating,
      reviews: h.reviews,
      bestTopics: cells.slice(0, 2).map(([k, c]) => `${labels[k]} ${c.score}`),
      weakestTopics: cells.slice(-2).map(([k, c]) => `${labels[k]} ${c.score}`),
      topicScores: Object.fromEntries(cells.map(([k, c]) => [labels[k], c.score])),
    };
  });
  const you = b.heatmap.find((h) => h.isYou);
  const facts = {
    key,
    b,
    competitors,
    data: {
      hotel: b.hotel.name,
      comparedWith: b.peerSet.label,
      reviewsAnalysed: b.coverage.yourReviews,
      rating: { you: b.rating.you, marketAverage: b.rating.marketAverage, verdict: b.rating.verdict, rankAmongNearby: you?.rating != null ? `${1 + b.heatmap.filter((h) => h.rating > you.rating).length} of ${b.heatmap.filter((h) => h.rating !== null).length}` : null },
      topics: b.aspects.map((a) => ({ topic: a.label, status: a.status, you: a.you.score, marketMedian: a.market.median, gap: a.gap, mentions: a.you.n, rank: a.rank ? `${a.rank} of ${a.rankOf}` : null, weakAcrossMarket: a.marketWide })),
      specificProblems: b.findings.propertyIssues.map((i) => ({ issue: i.label, topic: i.aspectLabel, youPer100Reviews: i.you.negPer100, marketPer100Reviews: i.market.negPer100 })),
      marketWideProblems: b.findings.marketIssues.map((i) => ({ issue: i.label, competitorsAffected: i.market.hotelsAffected, youPer100Reviews: i.you.negPer100 })),
      competitors: competitors.map(({ hotelId: _id, topicScores: _t, ...c }) => c),
      recommendedActions: (summary?.actions ?? []).map((a) => ({ title: a.title, why: a.why })),
    },
  };
  baseCache.set(key, facts);
  return facts;
}

async function cachedEvidence(key, args) {
  const hit = evidenceCache.get(key);
  if (hit) return hit;
  const rows = await A.evidence(args);
  const out = rows.map((e) => ({ quote: e.quote, platform: e.platform, hotel: e.hotelName }));
  evidenceCache.set(key, out);
  return out;
}

async function focusFacts(hotelId, base, q) {
  const { b, competitors } = base;
  const peers = competitors.map((c) => c.hotelId);
  const named = focusCompetitors(q, competitors);
  // "Why is <competitor> rated higher?" is about that competitor, not a guessed weak topic.
  const topics = focusTopics(q, b.aspects, { guess: named.length === 0 });
  // Nothing specific asked: give the model the two most talked-about topics to quote from.
  const chosen = topics.length || named.length ? topics : [...b.aspects].sort((x, y) => y.you.n - x.you.n).slice(0, 2).map((a) => a.aspect);
  const k = base.key;
  const topicFacts = await Promise.all(chosen.map(async (aspect) => {
    const a = b.aspects.find((x) => x.aspect === aspect);
    const [complaints, praise, competitorPraise] = await Promise.all([
      cachedEvidence(`${k}:${aspect}:you:-1`, { hotelIds: [hotelId], aspect, sentiment: -1, limit: 4 }),
      cachedEvidence(`${k}:${aspect}:you:1`, { hotelIds: [hotelId], aspect, sentiment: 1, limit: 3 }),
      peers.length ? cachedEvidence(`${k}:${aspect}:peers:1`, { hotelIds: peers, aspect, sentiment: 1, limit: 3 }) : [],
    ]);
    return { topic: a.label, guestComplaints: complaints, guestPraise: praise, whatCompetitorsArePraisedFor: competitorPraise };
  }));
  const competitorFacts = await Promise.all(named.map(async (c) => ({
    competitor: c.name,
    rating: c.rating,
    topicScores: c.topicScores,
    whatGuestsPraise: await cachedEvidence(`${k}:c:${c.hotelId}:1`, { hotelIds: [c.hotelId], sentiment: 1, limit: 4 }),
    whatGuestsComplainAbout: await cachedEvidence(`${k}:c:${c.hotelId}:-1`, { hotelIds: [c.hotelId], sentiment: -1, limit: 3 }),
  })));
  return { topics: topicFacts, competitors: competitorFacts };
}

// ------------------------------------------------------------------ answering
const SYSTEM = (facts, focus) => `You are "Front Desk", the assistant inside a guest-review analytics product for hotels in Uttarakhand, India.
You talk to the owner of ${facts.hotel}. Answer ONLY from the FACTS below (computed scores and real guest quotes).
Rules:
- Never invent numbers, hotel names or quotes. If the facts do not cover the question, say so in one line and suggest what you can answer.
- Be concrete and practical. For "how do I improve" questions give 2-4 numbered steps tied to the evidence.
- Quote guests sparingly, in double quotes. Mention numbers (scores are 0-100; 50 = as much praise as complaint).
- Keep answers under 170 words. Use short paragraphs or "- " bullets; **bold** at most two key phrases.
- Reply in the owner's language style (English, Hindi or Hinglish).
- After the answer, on a new last line, write: FOLLOW-UPS: <question 1> | <question 2> | <question 3>
  (short questions the owner might ask next, answerable from these facts).

FACTS:
${JSON.stringify(facts)}

FOCUS (quotes for this question):
${JSON.stringify(focus)}`;

export function splitFollowUps(text) {
  const i = text.search(/\n?\s*FOLLOW-?UPS?:/i);
  if (i < 0) return { answer: text.trim(), followUps: [] };
  const tail = text.slice(i).replace(/^\s*FOLLOW-?UPS?:/i, '');
  return {
    answer: text.slice(0, i).trim(),
    followUps: tail.split('|').map((s) => s.trim().replace(/^[-*\d.\s]+/, '')).filter((s) => s.length > 3 && s.length < 140).slice(0, 3),
  };
}

/** Plain answer from the facts, used without Gemini (or when it is busy). */
function dataAnswer(base, focus, q) {
  const d = base.data;
  const lines = [];
  const asked = new Set(focus.topics.map((t) => t.topic));
  for (const t of d.topics.filter((x) => asked.has(x.topic))) {
    const where = t.status === 'lead' ? 'ahead of' : t.status === 'lag' ? 'behind' : t.status === 'insufficient' ? 'not yet comparable with' : 'level with';
    lines.push(`**${t.topic}**: your score is ${t.you ?? 'n/a'} vs ${t.marketMedian ?? 'n/a'} for nearby hotels - you are ${where} the market (${t.mentions} guest mentions).`);
    const f = focus.topics.find((x) => x.topic === t.topic);
    if (f?.guestComplaints.length) lines.push(`- Guests complain: ${f.guestComplaints.slice(0, 2).map((e) => `"${e.quote}"`).join(' · ')}`);
    if (f?.whatCompetitorsArePraisedFor.length) lines.push(`- Competitors are praised for: ${f.whatCompetitorsArePraisedFor.slice(0, 2).map((e) => `"${e.quote}" (${e.hotel})`).join(' · ')}`);
    if (t.status === 'lag') lines.push(`- Start here: fix what these complaints describe, then ask happy guests to mention ${t.topic.toLowerCase()} in their reviews.`);
  }
  for (const c of focus.competitors) {
    lines.push(`**${c.competitor}** is rated ${c.rating ?? 'n/a'} (you: ${d.rating.you ?? 'n/a'}). Their strongest topics: ${Object.entries(c.topicScores).slice(0, 2).map(([k, v]) => `${k} ${v}`).join(', ') || 'n/a'}.`);
    if (c.whatGuestsPraise.length) lines.push(`- Guests praise them for: ${c.whatGuestsPraise.slice(0, 2).map((e) => `"${e.quote}"`).join(' · ')}`);
  }
  if (!lines.length && IMPROVE.test(q) && d.recommendedActions.length) {
    lines.push('Your top actions:', ...d.recommendedActions.map((a, i) => `${i + 1}. **${a.title}** - ${a.why}`));
  }
  if (!lines.length) lines.push(`Your rating is ${d.rating.you ?? 'n/a'} vs a market average of ${d.rating.marketAverage ?? 'n/a'} (rank ${d.rating.rankAmongNearby ?? 'n/a'} nearby). Ask about a topic - breakfast, rooms, staff, cleanliness, value for money - or name a competitor.`);
  return { answer: lines.join('\n'), followUps: ['What do guests complain about most?', 'Where am I ahead of my competitors?', 'How can I improve my rating?'] };
}

/**
 * Answers a question. Calls onMeta({topics, sources}) first, then onDelta(text) as the answer
 * streams. Resolves { answer, followUps, topics, sources, method, cached }.
 * @param {{role:'user'|'assistant', text:string}[]} history  previous turns (oldest first)
 */
export async function askReviews(hotelId, question, history = [], peerOpts = {}, { onMeta, onDelta, signal } = {}) {
  const base = await baseFacts(hotelId, peerOpts);
  const q = norm(question);
  const focus = await focusFacts(hotelId, base, q);
  const sources = [
    ...focus.topics.flatMap((t) => [...t.guestComplaints, ...t.guestPraise].slice(0, 3).map((e) => ({ topic: t.topic, quote: e.quote, platform: e.platform }))),
    ...focus.competitors.flatMap((c) => c.whatGuestsPraise.slice(0, 2).map((e) => ({ topic: c.competitor, quote: e.quote, platform: e.platform }))),
  ].slice(0, 6);
  const topics = [...focus.topics.map((t) => t.topic), ...focus.competitors.map((c) => c.competitor)];
  onMeta?.({ topics, sources });

  const cacheKey = history.length === 0 ? `${base.key}:${q.trim()}` : null;
  const cached = cacheKey && answerCache.get(cacheKey);
  if (cached) {
    onDelta?.(cached.answer);
    return { ...cached, topics, sources, cached: true };
  }

  let result = null;
  if (geminiEnabled() && base.data.reviewsAnalysed > 0) {
    const contents = [
      ...history.slice(-8).map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.text.slice(0, 1500) }] })),
      { role: 'user', parts: [{ text: question }] },
    ];
    // Don't stream the FOLLOW-UPS line: hold back anything from the marker on.
    let sent = 0;
    let all = '';
    const flush = (final) => {
      const marker = all.search(/\n?\s*FOLLOW-?UPS?:/i);
      const safeEnd = marker >= 0 ? marker : final ? all.length : Math.max(sent, all.length - 12);
      if (safeEnd > sent) {
        onDelta?.(all.slice(sent, safeEnd));
        sent = safeEnd;
      }
    };
    try {
      const { text, model } = await streamText({
        system: SYSTEM(base.data, focus),
        contents,
        signal,
        onText: (chunk) => {
          all += chunk;
          flush(false);
        },
      });
      flush(true);
      result = { ...splitFollowUps(text), method: `gemini:${model}` };
    } catch (err) {
      if (signal?.aborted) throw err;
      logger.warn({ err: err.message }, 'Front Desk: AI answer failed; using data answer');
      if (sent > 0) onDelta?.('\n\n');
    }
  }
  if (!result) {
    result = { ...dataAnswer(base, focus, q), method: 'data' };
    onDelta?.(result.answer);
  }
  if (cacheKey && result.answer) answerCache.set(cacheKey, { answer: result.answer, followUps: result.followUps, method: result.method });
  return { ...result, topics, sources, cached: false };
}
