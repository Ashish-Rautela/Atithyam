import { normalizeName, diceCoefficient, tokenContainment } from '../../../shared/util/text.js';
import { distanceKm } from '../../../shared/util/geo.js';

export const MATCH_THRESHOLDS = Object.freeze({ auto: 0.75, confirm: 0.5 });

/**
 * Score how likely a platform candidate is the same physical property as the anchor
 * (the Google Maps listing the user picked).
 *
 * nameScore = 0.6 · Dice(bigrams) + 0.4 · token containment, after removing generic words
 *             ("hotel", "resort", "spa"...) and location words ("Mussoorie").
 * geoScore  = 1 (<150 m), 0.8 (<500 m), 0.4 (<2 km), 0 (≥2 km) when both sides have coordinates.
 * score     = 0.7 · nameScore + 0.3 · geoScore with coordinates, otherwise nameScore.
 * A candidate more than 5 km away is capped at 0.4, whatever its name.
 */
export function scoreCandidate(anchor, candidate, locationWords = []) {
  const a = normalizeName(anchor.name, locationWords);
  const c = normalizeName(candidate.name, locationWords);
  const nameScore = a && c ? 0.6 * diceCoefficient(a, c) + 0.4 * tokenContainment(a, c) : 0;

  const km = distanceKm(anchor.geo, candidate.geo);
  let score = nameScore;
  let geoScore = null;
  if (km !== null) {
    geoScore = km < 0.15 ? 1 : km < 0.5 ? 0.8 : km < 2 ? 0.4 : 0;
    score = 0.7 * nameScore + 0.3 * geoScore;
    if (km > 5) score = Math.min(score, 0.4);
  }
  return {
    score: round(score),
    nameScore: round(nameScore),
    geoScore,
    distanceKm: km === null ? null : round(km),
  };
}

/** Rank candidates; returns { best, decision, ranked } where decision is 'auto' | 'confirm' | 'none'. */
export function rankCandidates(anchor, candidates, locationWords = []) {
  const ranked = candidates
    .map((c) => ({ ...c, match: scoreCandidate(anchor, c, locationWords) }))
    .sort((x, y) => y.match.score - x.match.score);
  const best = ranked[0] ?? null;
  let decision = 'none';
  if (best && best.match.score >= MATCH_THRESHOLDS.auto) decision = 'auto';
  else if (best && best.match.score >= MATCH_THRESHOLDS.confirm) decision = 'confirm';
  return { best: decision === 'none' ? null : best, decision, ranked };
}

function round(n) {
  return Math.round(n * 1000) / 1000;
}
