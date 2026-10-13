/** Great-circle distance in kilometres between two {lat, lng} points, or null if either is missing. */
export function distanceKm(a, b) {
  if (!isPoint(a) || !isPoint(b)) return null;
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function isPoint(p) {
  return (
    p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && !(p.lat === 0 && p.lng === 0) && Math.abs(p.lat) <= 90
  );
}

/** Parse "30.48,78.04" into {lat, lng}. */
export function parseLatLng(text) {
  if (!text) return null;
  const m = String(text).match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const p = { lat: Number.parseFloat(m[1]), lng: Number.parseFloat(m[2]) };
  return isPoint(p) ? p : null;
}
