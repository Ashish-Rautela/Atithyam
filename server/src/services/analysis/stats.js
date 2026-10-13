/** Small, dependency-free statistics used by the benchmark and trend analysis. */

export const round = (n, d = 1) => (Number.isFinite(n) ? Math.round(n * 10 ** d) / 10 ** d : null);

export function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function mean(xs) {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
}

export function sd(xs) {
  if (xs.length < 2) return null;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

/** z statistic for the difference of two proportions x1/n1 − x2/n2 (pooled). */
export function twoPropZ(x1, n1, x2, n2) {
  if (!n1 || !n2) return 0;
  const p = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  return se > 0 ? (x1 / n1 - x2 / n2) / se : 0;
}

/**
 * Aspect score 0–100 from positive/negative mentions: 50 = as many positive as negative.
 * Shrunk towards `priorNet` (the market's net sentiment) with weight k, so a hotel with two
 * mentions cannot top the table on luck.
 */
export function aspectScore(pos, neg, n, priorNet = 0, k = 4) {
  if (!n) return null;
  return 50 + 50 * ((pos - neg + k * priorNet) / (n + k));
}

/**
 * Single most likely shift in a series of (month, n, mean, var) buckets: the split that maximises
 * Welch's t between the two sides. Returns null unless the shift is large and well supported.
 */
export function detectChangepoint(buckets, { minSide = 8, minMonths = 2, minT = 2.5, minDiff = 0.25 } = {}) {
  const pts = buckets.filter((b) => b.n > 0);
  if (pts.length < minMonths * 2) return null;
  let best = null;
  for (let k = minMonths; k <= pts.length - minMonths; k++) {
    const side = (arr) => {
      const n = arr.reduce((s, b) => s + b.n, 0);
      const m = arr.reduce((s, b) => s + b.mean * b.n, 0) / n;
      // pooled within + between variance
      const v = arr.reduce((s, b) => s + (b.var + (b.mean - m) ** 2) * b.n, 0) / Math.max(n - 1, 1);
      return { n, m, v };
    };
    const L = side(pts.slice(0, k));
    const R = side(pts.slice(k));
    if (L.n < minSide || R.n < minSide) continue;
    const se = Math.sqrt(L.v / L.n + R.v / R.n) || 1e-9;
    const t = (R.m - L.m) / se;
    if (!best || Math.abs(t) > Math.abs(best.t)) best = { index: k, month: pts[k].month, before: L.m, after: R.m, t, nBefore: L.n, nAfter: R.n };
  }
  if (!best || Math.abs(best.t) < minT || Math.abs(best.after - best.before) < minDiff) return null;
  return best;
}
