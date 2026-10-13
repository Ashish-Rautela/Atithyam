import { distanceKm, isPoint } from '../../shared/util/geo.js';

/**
 * Square grid of search centres covering a circle of `radiusKm`. Each centre is searched at a map
 * zoom showing about `tileRadiusKm` around it; spacing r·√2 makes the tiles overlap enough that the
 * whole area is covered. Ordered from the centre outwards (the dense core is searched first).
 */
export function planTiles(center, radiusKm, tileRadiusKm = 1.5) {
  if (!isPoint(center)) return [];
  const step = tileRadiusKm * Math.SQRT2;
  const n = Math.ceil(radiusKm / step);
  const dLat = step / 111.32;
  const dLng = step / (111.32 * Math.cos((center.lat * Math.PI) / 180));
  const tiles = [];
  for (let i = -n; i <= n; i++) {
    for (let j = -n; j <= n; j++) {
      const p = { lat: round6(center.lat + i * dLat), lng: round6(center.lng + j * dLng) };
      if (distanceKm(center, p) <= radiusKm + step / 2) tiles.push(p);
    }
  }
  return tiles.sort((a, b) => distanceKm(center, a) - distanceKm(center, b));
}

/**
 * Half the width of the visible map at a Google Maps zoom level — how far Google itself frames a
 * town when you search for it. `mapWidthPx` is the map area beside the results panel.
 */
export function radiusFromZoom(zoom, lat, mapWidthPx = 900) {
  const metresPerPx = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
  return Math.round(((metresPerPx * mapWidthPx) / 2 / 1000) * 10) / 10;
}

/** Clamp a seeding radius to something sensible for a town/city. */
export function clampRadius(km) {
  return Math.min(Math.max(Number(km) || 3, 1), 15);
}

function round6(n) {
  return Math.round(n * 1e6) / 1e6;
}
