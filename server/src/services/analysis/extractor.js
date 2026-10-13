import { logger } from '../../shared/logging/logger.js';
import { config } from '../../shared/config/env.js';
import { ASPECTS, ASPECT_KEYS, ISSUES, normaliseIssue } from './taxonomy.js';
import { analyseWithLexicon, detectLanguage } from './lexicon.js';
import { generateJson, geminiEnabled, GeminiUnavailable } from './gemini.js';

const SENT = { positive: 1, negative: -1, neutral: 0, mixed: 0 };

const SYSTEM = `You analyse hotel guest reviews from India for an operator dashboard.
Reviews may be English, Hindi (Devanagari), or code-switched / transliterated Hinglish ("khana accha tha but garam pani nahi aaya").
For every review return:
- language: en | hi | hinglish | other
- overall: positive | negative | mixed | neutral
- aspects: only aspects the review actually talks about, from this fixed list:
${ASPECTS.map((a) => `  ${a.key} = ${a.label}`).join('\n')}
  Definitions: housekeeping = servicing of the room (cleaning during stay, towels, linen, toiletries);
  cleanliness = how clean/hygienic things were (dirt, smell, pests); room = the room itself and its
  fittings (bed, bathroom, hot water, heating, AC, Wi-Fi, noise, size); booking = reservation, check-in/out,
  billing, refunds, room-as-booked; value = price vs what was received.
  Each aspect gets sentiment positive | negative | neutral and a short evidence quote copied from the review
  (original language, max 120 characters).
- issues: the specific things mentioned, each with its own sentiment. Use these tags when they fit:
${Object.entries(ISSUES).map(([k, v]) => `  ${k} (${v.aspect}${v.scope === 'destination' ? ', destination' : ''}): ${v.label}`).join('\n')}
  Otherwise make a short snake_case tag (max 3 words). scope = "destination" when the hotel does not control it
  (public roads, town parking, traffic, power cuts, local taxis), else "property".
Do not invent aspects that are not mentioned. Ratings are given only as context.`;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    results: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'STRING' },
          language: { type: 'STRING', enum: ['en', 'hi', 'hinglish', 'other'] },
          overall: { type: 'STRING', enum: ['positive', 'negative', 'mixed', 'neutral'] },
          aspects: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                aspect: { type: 'STRING', enum: ASPECT_KEYS },
                sentiment: { type: 'STRING', enum: ['positive', 'negative', 'neutral'] },
                evidence: { type: 'STRING' },
              },
              required: ['aspect', 'sentiment'],
            },
          },
          issues: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                issue: { type: 'STRING' },
                aspect: { type: 'STRING', enum: ASPECT_KEYS },
                sentiment: { type: 'STRING', enum: ['positive', 'negative', 'neutral'] },
                scope: { type: 'STRING', enum: ['property', 'destination'] },
                evidence: { type: 'STRING' },
              },
              required: ['issue', 'aspect', 'sentiment'],
            },
          },
        },
        required: ['id', 'language', 'overall', 'aspects', 'issues'],
      },
    },
  },
  required: ['results'],
};

function reviewText(r) {
  const parts = [r.title, r.text];
  if (r.liked) parts.push(`Liked: ${r.liked}`);
  if (r.disliked) parts.push(`Disliked: ${r.disliked}`);
  return parts.filter(Boolean).join('\n').slice(0, 1500);
}

/** Clean up one model result (or reject it) into the stored shape. */
export function normaliseResult(raw, review) {
  const aspects = [];
  const seen = new Set();
  for (const a of raw.aspects ?? []) {
    if (!ASPECT_KEYS.includes(a.aspect) || seen.has(a.aspect)) continue;
    seen.add(a.aspect);
    aspects.push({ aspect: a.aspect, sentiment: SENT[a.sentiment] ?? 0, evidence: String(a.evidence ?? '').slice(0, 200) || null });
  }
  const issues = [];
  const seenIssues = new Set();
  for (const i of raw.issues ?? []) {
    const key = normaliseIssue(i.issue);
    if (!key || seenIssues.has(key)) continue;
    seenIssues.add(key);
    const aspect = ISSUES[key]?.aspect ?? (ASPECT_KEYS.includes(i.aspect) ? i.aspect : null);
    if (!aspect) continue;
    issues.push({
      issue: key,
      aspect,
      sentiment: SENT[i.sentiment] ?? 0,
      scope: ISSUES[key]?.scope ?? (i.scope === 'destination' ? 'destination' : 'property'),
      evidence: String(i.evidence ?? '').slice(0, 200) || null,
    });
    // An issue implies its aspect was discussed.
    if (!seen.has(aspect)) {
      seen.add(aspect);
      aspects.push({ aspect, sentiment: SENT[i.sentiment] ?? 0, evidence: String(i.evidence ?? '').slice(0, 200) || null });
    }
  }
  return {
    language: ['en', 'hi', 'hinglish', 'other'].includes(raw.language) ? raw.language : detectLanguage(reviewText(review)),
    overall: SENT[raw.overall] ?? 0,
    aspects,
    issues,
  };
}

/**
 * Analyse reviews. Uses Gemini in batches when available; any review the model skipped, or every
 * review when the model is unavailable, goes through the offline lexicon.
 * Returns Map(reviewId → { method, model, language, overall, aspects, issues }).
 */
export async function analyseReviews(reviews, { onProgress, ai = true } = {}) {
  const out = new Map();
  const withText = reviews.filter((r) => reviewText(r).trim().length > 0);
  let aiUsable = ai && geminiEnabled();
  let note = null;

  for (let i = 0; i < withText.length; i += config.ai.batchSize) {
    const batch = withText.slice(i, i + config.ai.batchSize);
    if (aiUsable) {
      try {
        const prompt = JSON.stringify(batch.map((r, idx) => ({ id: String(idx), rating: r.rating5 ?? null, platform: r.platform, text: reviewText(r) })));
        const { data, model } = await generateJson({ system: SYSTEM, prompt: `Analyse these reviews:\n${prompt}`, schema: SCHEMA });
        for (const raw of data.results ?? []) {
          const review = batch[Number(raw.id)];
          if (!review) continue;
          out.set(review.reviewId, { method: 'gemini', model, ...normaliseResult(raw, review) });
        }
      } catch (err) {
        note = err.message;
        if (err instanceof GeminiUnavailable) aiUsable = false;
        logger.warn({ err: err.message }, 'AI batch failed; using the lexicon for it');
      }
    }
    for (const r of batch) {
      if (!out.has(r.reviewId)) out.set(r.reviewId, { method: 'lexicon', model: null, ...analyseWithLexicon(r) });
    }
    onProgress?.(Math.min(i + batch.length, withText.length), withText.length);
  }
  // Rating-only reviews still count for the overall score but have no aspects.
  for (const r of reviews) {
    if (!out.has(r.reviewId)) {
      const overall = Number.isFinite(r.rating5) ? (r.rating5 >= 4 ? 1 : r.rating5 <= 2.5 ? -1 : 0) : 0;
      out.set(r.reviewId, { method: 'lexicon', model: null, language: 'other', overall, aspects: [], issues: [] });
    }
  }
  return { results: out, note };
}
