/**
 * Rating scales per platform. Original values are always preserved; `normalized5` is a
 * documented linear rescale for display only — platform ratings are NOT equivalent.
 */
export const PLATFORM_SCALES = Object.freeze({
  google_maps: { min: 1, max: 5, label: 'stars (1–5)' },
  tripadvisor: { min: 1, max: 5, label: 'bubbles (1–5)' },
  makemytrip: { min: 1, max: 5, label: 'rating (1–5)' },
  booking: { min: 1, max: 10, label: 'score (1–10)' },
  agoda: { min: 1, max: 10, label: 'score (1–10)' },
});

/** Build a rating object, or null if the value is missing or outside the scale. */
export function makeRating(value, scaleMax, scaleMin = 1) {
  const v = typeof value === 'string' ? Number.parseFloat(value) : value;
  if (!Number.isFinite(v) || !Number.isFinite(scaleMax)) return null;
  // Agoda occasionally reports sub-1 scores on its 10-point scale; accept anything in [0, max].
  if (v < 0 || v > scaleMax) return null;
  return {
    value: v,
    scaleMin,
    scaleMax,
    normalized5: round((v / scaleMax) * 5, 2),
  };
}

function round(n, d) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}
