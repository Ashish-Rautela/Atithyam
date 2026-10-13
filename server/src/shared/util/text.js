/** Collapse whitespace and trim; returns null for empty values. */
export function clean(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  return s.length ? s : null;
}

/** Parse "6,485", "(3653 Ratings)", "1.2k" style counts. */
export function parseCount(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).toLowerCase().replace(/,/g, '');
  const m = s.match(/(\d+(?:\.\d+)?)\s*(k)?/);
  if (!m) return null;
  const n = Number.parseFloat(m[1]) * (m[2] ? 1000 : 1);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/** Parse the first decimal number in a string ("4.5", "Scored 8.8", "5/5"). */
export function parseDecimal(value) {
  if (value === null || value === undefined) return null;
  const m = String(value).replace(/,/g, '.').match(/-?\d+(?:\.\d+)?/);
  return m ? Number.parseFloat(m[0]) : null;
}

/** Parse "₹ 2,415" / "₹42,480" into an integer number of rupees. */
export function parseRupees(value) {
  if (value === null || value === undefined) return null;
  const m = String(value).replace(/\s/g, '').match(/₹([\d,]+)/);
  return m ? Number.parseInt(m[1].replace(/,/g, ''), 10) : null;
}

const STOPWORDS = new Set([
  'hotel', 'hotels', 'resort', 'resorts', 'and', 'the', 'spa', 'by', 'a', 'an', 'of', 'at', 'in',
  'inn', 'stay', 'stays', 'homestay', 'home', 'cottage', 'cottages', 'villa', 'villas', 'residency',
  'guest', 'house', 'lodge', 'suites', 'suite', 'boutique', 'collection', 'premium', 'luxury',
]);

/** Lowercase, strip accents and punctuation, drop generic words and location words. */
export function normalizeName(name, locationWords = []) {
  const loc = new Set(
    locationWords
      .flatMap((w) => String(w).toLowerCase().split(/[^a-z0-9]+/))
      .filter((w) => w.length > 2),
  );
  return String(name ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t && !STOPWORDS.has(t) && !loc.has(t))
    .join(' ');
}

function bigrams(s) {
  const out = new Map();
  const t = s.replace(/\s+/g, ' ');
  for (let i = 0; i < t.length - 1; i++) {
    const g = t.slice(i, i + 2);
    out.set(g, (out.get(g) ?? 0) + 1);
  }
  return out;
}

/** Sørensen–Dice coefficient on character bigrams, 0..1. Robust to small spelling differences. */
export function diceCoefficient(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const A = bigrams(a);
  const B = bigrams(b);
  let overlap = 0;
  for (const [g, n] of A) overlap += Math.min(n, B.get(g) ?? 0);
  const total = [...A.values()].reduce((s, n) => s + n, 0) + [...B.values()].reduce((s, n) => s + n, 0);
  return total ? (2 * overlap) / total : 0;
}

/** Token-set containment: share of the shorter name's tokens found in the longer one, 0..1. */
export function tokenContainment(a, b) {
  const A = new Set(a.split(' ').filter(Boolean));
  const B = new Set(b.split(' ').filter(Boolean));
  if (!A.size || !B.size) return 0;
  const [small, large] = A.size <= B.size ? [A, B] : [B, A];
  let hit = 0;
  for (const t of small) if (large.has(t)) hit++;
  return hit / small.size;
}

/**
 * Town/city from an Indian postal address, e.g.
 * "…, Indraprastha, Dehradun, Uttarakhand 248014" -> "Dehradun". Returns null if unsure.
 */
export function cityFromAddress(address) {
  const parts = String(address ?? '').split(',').map((p) => p.trim()).filter(Boolean);
  const pinIdx = parts.findIndex((p) => /\b\d{6}\b/.test(p));
  if (pinIdx > 0) {
    const withoutPin = parts[pinIdx].replace(/\b\d{6}\b/, '').trim();
    // "Dehradun 248001" (city + PIN) vs "Uttarakhand 248014" (state + PIN)
    if (withoutPin && !INDIAN_STATES.has(withoutPin.toLowerCase())) return withoutPin;
    return parts[pinIdx - 1] || null;
  }
  return parts.length >= 2 ? parts[parts.length - 2] : null;
}

const INDIAN_STATES = new Set([
  'andhra pradesh', 'arunachal pradesh', 'assam', 'bihar', 'chhattisgarh', 'goa', 'gujarat', 'haryana', 'himachal pradesh',
  'jharkhand', 'karnataka', 'kerala', 'madhya pradesh', 'maharashtra', 'manipur', 'meghalaya', 'mizoram', 'nagaland', 'odisha',
  'punjab', 'rajasthan', 'sikkim', 'tamil nadu', 'telangana', 'tripura', 'uttar pradesh', 'uttarakhand', 'west bengal', 'delhi',
  'jammu and kashmir', 'ladakh', 'puducherry', 'chandigarh', 'india',
]);

/** Lower-case, accent-free, punctuation-free form used for fuzzy (trigram) name search. */
export function searchKey(name) {
  return String(name ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * The neighbourhood part of a Google address — the segment just before the town:
 * "Village - Siya, Kempty Fall Rd, Mussoorie, Uttarakhand 248179" -> "Kempty Fall Rd".
 * Used to label micro-market clusters. Returns null when the address has no such segment.
 */
export function localityFromAddress(address) {
  const city = cityFromAddress(address);
  if (!city) return null;
  const parts = String(address).split(',').map((p) => p.trim()).filter(Boolean);
  const idx = parts.findIndex((p) => p === city || p.startsWith(`${city} `));
  if (idx <= 0) return null;
  const seg = parts[idx - 1]
    .replace(/^(near|nr\.?|opp\.?|opposite|behind|adj\.?)\s+/i, '')
    .replace(/^[\d/\-\s]+/, '')
    .trim();
  if (seg.length < 3 || /^\d/.test(seg) || /^(plot|house|h\.?no|shop|flat)\b/i.test(seg)) return null;
  return seg;
}
