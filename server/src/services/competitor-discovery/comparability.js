import { distanceKm } from '../../shared/util/geo.js';

/**
 * Default rules for which nearby properties count as like-for-like competitors.
 * These decide the *default selection* only; the user can widen or narrow it in the UI.
 * (Scoring the competitors is the next step and is deliberately not done here.)
 */
export const DEFAULT_RULES = Object.freeze({
  radiusKm: 3,
  minPriceRatio: 0.5,
  maxPriceRatio: 2,
  minReviews: 20,
  maxCompetitors: 10,
  includeUnknownPrice: true,
});

/**
 * Price tier relative to the target. Google shows every price in one result list for the
 * same dates and guests, so prices from one discovery run are comparable with each other.
 */
export function priceTier(ratio) {
  if (!Number.isFinite(ratio)) return 'unknown';
  if (ratio < 0.5) return 'much_cheaper';
  if (ratio < 0.8) return 'cheaper';
  if (ratio <= 1.25) return 'similar';
  if (ratio <= 2) return 'pricier';
  return 'much_pricier';
}

/**
 * Annotate each discovered place with distance, price ratio and the reasons (if any) it falls
 * outside the default competitor set. Does not rank or score.
 */
export function tagCandidates(target, places, rules = DEFAULT_RULES) {
  return places
    .filter((p) => p.placeId && p.placeId !== target.placeId)
    // Safety net: the same pin under a different id is the target itself.
    .filter((p) => !(distanceKm(target.geo, p.geo) !== null && distanceKm(target.geo, p.geo) < 0.02 && p.name?.toLowerCase() === target.name?.toLowerCase()))
    .map((p) => {
      const km = distanceKm(target.geo, p.geo);
      const ratio = Number.isFinite(target.priceInr) && Number.isFinite(p.priceInr) && target.priceInr > 0
        ? Math.round((p.priceInr / target.priceInr) * 100) / 100
        : null;
      const exclusions = [];
      if (km === null) exclusions.push('location unknown');
      else if (km > rules.radiusKm) exclusions.push(`${round1(km)} km away (limit ${rules.radiusKm} km)`);
      if (ratio === null) {
        if (!rules.includeUnknownPrice) exclusions.push('price unknown');
      } else if (ratio < rules.minPriceRatio) exclusions.push(`price ${ratio}× yours (below ${rules.minPriceRatio}×)`);
      else if (ratio > rules.maxPriceRatio) exclusions.push(`price ${ratio}× yours (above ${rules.maxPriceRatio}×)`);
      if ((p.reviewCount ?? 0) < rules.minReviews) exclusions.push(`only ${p.reviewCount ?? 0} Google reviews (min ${rules.minReviews})`);
      return {
        ...p,
        distanceKm: km === null ? null : round2(km),
        priceRatio: ratio,
        priceTier: priceTier(ratio),
        exclusions,
        eligible: exclusions.length === 0,
      };
    })
    .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
}

/** Default selection: eligible places, nearest first, capped at maxCompetitors. */
export function defaultSelection(tagged, rules = DEFAULT_RULES) {
  return tagged.filter((c) => c.eligible).slice(0, rules.maxCompetitors).map((c) => c.placeId);
}

function round1(n) {
  return Math.round(n * 10) / 10;
}
function round2(n) {
  return Math.round(n * 100) / 100;
}
