import { ASPECT_KEYS, ISSUES } from './taxonomy.js';

/**
 * Offline aspect-sentiment analyser: English, romanised Hindi (Hinglish) and Devanagari keyword
 * rules with negation handling. Used when no GEMINI_API_KEY is set or the AI quota is exhausted,
 * so the pipeline always produces a result. Less accurate than the model on unusual wording —
 * every result records which method produced it.
 */

const ASPECT_WORDS = {
  food: ['food', 'breakfast', 'dinner', 'lunch', 'buffet', 'meal', 'meals', 'restaurant', 'menu', 'chef', 'coffee', 'tea', 'cuisine', 'dish', 'dishes', 'snacks', 'khana', 'khaana', 'nashta', 'naashta', 'chai', 'thali', 'maggi', 'paratha', 'खाना', 'नाश्ता', 'भोजन'],
  room: ['room', 'rooms', 'bed', 'beds', 'bathroom', 'washroom', 'toilet', 'balcony', 'geyser', 'heater', 'mattress', 'pillow', 'tv', 'wifi', 'kamra', 'kamre', 'कमरा', 'कमरे', 'suite', 'cottage'],
  housekeeping: ['housekeeping', 'house keeping', 'towel', 'towels', 'linen', 'bedsheet', 'bedsheets', 'toiletries', 'laundry', 'room cleaning', 'turndown'],
  staff: ['staff', 'service', 'reception', 'receptionist', 'manager', 'owner', 'host', 'hospitality', 'waiter', 'team', 'front desk', 'caretaker', 'behaviour', 'behavior', 'स्टाफ', 'सेवा', 'मैनेजर'],
  location: ['location', 'located', 'view', 'mall road', 'market', 'walking distance', 'nearby', 'parking', 'road', 'approach', 'distance', 'surroundings', 'jagah', 'लोकेशन', 'जगह'],
  value: ['price', 'value', 'money', 'worth', 'expensive', 'overpriced', 'costly', 'cheap', 'affordable', 'budget', 'tariff', 'rate', 'rates', 'paisa', 'paise', 'mehenga', 'mehnga', 'sasta', 'महंगा', 'सस्ता', 'पैसा'],
  cleanliness: ['clean', 'cleanliness', 'dirty', 'unclean', 'hygiene', 'hygienic', 'dust', 'dusty', 'stain', 'stains', 'smell', 'smelly', 'stink', 'cockroach', 'spotless', 'neat', 'tidy', 'ganda', 'gandi', 'gandagi', 'saaf', 'safai', 'साफ', 'सफाई', 'गंदा', 'गंदगी', 'बदबू'],
  booking: ['booking', 'booked', 'reservation', 'check-in', 'check in', 'checkin', 'check-out', 'checkout', 'refund', 'cancel', 'cancellation', 'advance', 'payment', 'makemytrip', 'goibibo', 'agoda', 'booking.com', 'confirmation', 'bill', 'invoice'],
};

const POSITIVE = ['good', 'great', 'excellent', 'amazing', 'awesome', 'nice', 'lovely', 'wonderful', 'fantastic', 'superb', 'perfect', 'clean', 'spotless', 'friendly', 'helpful', 'polite', 'courteous', 'delicious', 'tasty', 'comfortable', 'comfy', 'spacious', 'beautiful', 'recommend', 'recommended', 'best', 'loved', 'love', 'enjoyed', 'pleasant', 'prompt', 'quick', 'warm', 'cozy', 'cosy', 'neat', 'tidy', 'affordable', 'reasonable', 'worth', 'satisfied', 'happy', 'outstanding', 'brilliant', 'cooperative', 'supportive', 'accha', 'achha', 'acha', 'achchha', 'badhiya', 'badiya', 'mast', 'shandar', 'shaandar', 'zabardast', 'sundar', 'maza', 'mazaa', 'saaf', 'paisa vasool', 'paisa wasool', 'अच्छा', 'अच्छी', 'बढ़िया', 'शानदार', 'सुंदर', 'स्वादिष्ट', 'साफ'];
const NEGATIVE = ['bad', 'poor', 'worst', 'terrible', 'horrible', 'awful', 'pathetic', 'dirty', 'unclean', 'rude', 'unhelpful', 'slow', 'smelly', 'stinky', 'stink', 'noisy', 'broken', 'not working', 'leaking', 'leak', 'damp', 'cramped', 'overpriced', 'expensive', 'costly', 'disappointing', 'disappointed', 'waste', 'issue', 'issues', 'problem', 'problems', 'complaint', 'uncomfortable', 'unprofessional', 'avoid', 'stale', 'bland', 'tasteless', 'cold food', 'filthy', 'cockroach', 'cockroaches', 'bugs', 'mosquito', 'mosquitoes', 'misleading', 'cheated', 'fraud', 'arrogant', 'careless', 'nightmare', 'never again', 'not worth', 'not clean', 'not good', 'freezing', 'kharab', 'kharaab', 'bekar', 'bekaar', 'ganda', 'gandi', 'gande', 'gandagi', 'bakwas', 'bakwaas', 'ghatiya', 'mehenga', 'mehnga', 'badbu', 'badtameez', 'खराब', 'बेकार', 'घटिया', 'गंदा', 'गंदी', 'गंदगी', 'बकवास', 'बदबू', 'महंगा'];
const NEGATORS = ['not', 'no', 'never', "n't", 'without', 'nahi', 'nahin', 'nhi', 'nai', 'na', 'mat', 'nahi tha', 'नहीं', 'न', 'बिना'];
// "no", "nahi" next to these nouns means something was missing — a complaint on its own.
const MISSING_NOUNS = ['hot water', 'water', 'geyser', 'heater', 'wifi', 'towel', 'towels', 'parking', 'power', 'electricity', 'response', 'service', 'soap', 'blanket', 'pani', 'paani', 'garam pani', 'bijli', 'पानी', 'गरम पानी', 'बिजली'];

const DEVANAGARI = /[ऀ-ॿ]/;
const HINGLISH_MARKERS = ['hai', 'hain', 'tha', 'thi', 'the', 'nahi', 'nahin', 'bahut', 'bohot', 'accha', 'achha', 'acha', 'mein', 'ka', 'ki', 'ke', 'kar', 'bhi', 'aur', 'lekin', 'par', 'wala', 'wali', 'kuch', 'koi', 'humne', 'hum', 'yaha', 'yahan', 'sab'];

function hasTerm(text, term) {
  if (DEVANAGARI.test(term)) return text.includes(term);
  const t = term.trim();
  // Word-boundary match for Latin terms ("ac" must not match "place").
  return new RegExp(`(^|[^a-z0-9])${t.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}([^a-z0-9]|$)`).test(text);
}

export function detectLanguage(text) {
  const t = String(text ?? '');
  const deva = DEVANAGARI.test(t);
  const latinWords = t.toLowerCase().match(/[a-z]+/g) ?? [];
  const markers = latinWords.filter((w) => HINGLISH_MARKERS.includes(w)).length;
  if (deva && latinWords.length > 3) return 'hinglish';
  if (deva) return 'hi';
  if (markers >= 2 && markers / Math.max(latinWords.length, 1) > 0.08) return 'hinglish';
  return latinWords.length ? 'en' : 'other';
}

/** Polarity of one clause: positive words count +1, negative −1; a negator just before flips it. */
function clausePolarity(clause) {
  let score = 0;
  const words = clause.split(/\s+/);
  // A negator up to two words before ("not good", "not very clean") flips the word; in Hinglish it
  // usually follows ("accha nahi tha"), so one word after counts too.
  const clean = (w) => w.replace(/[^\p{L}']/gu, '');
  const negatedNear = (idx) => words.slice(Math.max(0, idx - 2), idx).some((w) => NEGATORS.includes(clean(w)) || /n't$/.test(w)) || (words[idx + 1] && ['nahi', 'nahin', 'nhi', 'नहीं'].includes(clean(words[idx + 1])));
  const scan = (list, sign) => {
    for (const term of list) {
      if (!hasTerm(clause, term)) continue;
      const first = term.split(' ')[0];
      const idx = words.findIndex((w) => w.replace(/[^\p{L}'.-]/gu, '') === first);
      score += idx >= 0 && negatedNear(idx) ? -sign : sign;
    }
  };
  scan(POSITIVE, 1);
  scan(NEGATIVE, -1);
  // Hinglish puts the negation after the noun: "garam pani nahi aaya", "no hot water".
  const hasNegator = NEGATORS.some((n) => hasTerm(clause, n));
  if (hasNegator && MISSING_NOUNS.some((n) => hasTerm(clause, n)) && score >= 0) score -= 1;
  return score;
}

function splitClauses(text) {
  return String(text)
    .toLowerCase()
    .split(/[.!?;,\n।]+|\bbut\b|\bhowever\b|\blekin\b|\bpar\b|\bthough\b|\balthough\b|\bexcept\b|\bwhile\b/)
    .map((c) => c.trim())
    .filter((c) => c.length > 2);
}

/**
 * Analyse one review. Booking's "liked"/"disliked" fields carry their own polarity.
 * Returns { language, overall, aspects: [{ aspect, sentiment, evidence }], issues: [{ issue, aspect, sentiment, scope, evidence }] }.
 */
export function analyseWithLexicon(review) {
  const parts = [
    { text: [review.title, review.text].filter(Boolean).join('. '), force: 0 },
    { text: review.liked, force: 1 },
    { text: review.disliked, force: -1 },
  ].filter((p) => p.text);
  const ratingPrior = Number.isFinite(review.rating5) ? (review.rating5 >= 4 ? 1 : review.rating5 <= 2.5 ? -1 : 0) : 0;
  const byAspect = new Map();
  const byIssue = new Map();

  for (const part of parts) {
    let prev = null; // previous clause's aspects and polarity, for "Location is great, walking distance to …"
    for (const clause of splitClauses(part.text)) {
      let polarity = part.force || Math.sign(clausePolarity(clause));
      const issuesHere = Object.entries(ISSUES).filter(([, def]) => [...def.en, ...def.hi].some((t) => hasTerm(clause, t))).map(([k]) => k);
      const aspectsHere = new Set(ASPECT_KEYS.filter((a) => ASPECT_WORDS[a].some((t) => hasTerm(clause, t))));
      for (const issue of issuesHere) aspectsHere.add(ISSUES[issue].aspect);
      // A clause with no opinion words continues the previous clause about the same aspect.
      if (polarity === 0 && prev && prev.polarity !== 0 && [...aspectsHere].some((a) => prev.aspects.has(a))) polarity = prev.polarity;
      prev = { aspects: aspectsHere, polarity };
      for (const issue of issuesHere) {
        const prev = byIssue.get(issue) ?? { issue, aspect: ISSUES[issue].aspect, score: 0, scope: ISSUES[issue].scope ?? 'property', evidence: clause.slice(0, 160) };
        prev.score += polarity;
        byIssue.set(issue, prev);
      }
      for (const aspect of aspectsHere) {
        const prev = byAspect.get(aspect) ?? { aspect, score: 0, evidence: null, evidenceWeight: -1 };
        prev.score += polarity;
        // Keep the most opinionated clause as evidence.
        const weight = Math.abs(polarity) + issuesHere.length * 0.1;
        if (weight > prev.evidenceWeight) {
          prev.evidence = clause.slice(0, 160);
          prev.evidenceWeight = weight;
        }
        byAspect.set(aspect, prev);
      }
    }
  }

  const aspects = [...byAspect.values()].map((a) => ({
    aspect: a.aspect,
    sentiment: a.score > 0 ? 1 : a.score < 0 ? -1 : byAspect.size === 1 ? ratingPrior : 0,
    evidence: a.evidence,
  }));
  const issues = [...byIssue.values()].map((i) => ({
    issue: i.issue,
    aspect: i.aspect,
    sentiment: i.score > 0 ? 1 : i.score < 0 ? -1 : 0,
    scope: i.scope,
    evidence: i.evidence,
  }));
  const sum = aspects.reduce((s, a) => s + a.sentiment, 0);
  const overall = Number.isFinite(review.rating5) ? ratingPrior : Math.sign(sum);
  return { language: detectLanguage(parts.map((p) => p.text).join(' ')), overall, aspects, issues };
}
