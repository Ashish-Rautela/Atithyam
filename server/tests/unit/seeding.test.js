import { describe, it, expect } from 'vitest';
import { planTiles, radiusFromZoom, clampRadius } from '../../src/services/seeding/tiles.js';
import { parseAreaUrl } from '../../src/services/review-ingestion/adapters/googleMaps.js';
import { localityFromAddress, searchKey } from '../../src/shared/util/text.js';
import { distanceKm } from '../../src/shared/util/geo.js';

describe('city tiles', () => {
  const c = { lat: 30.4547465, lng: 78.081985 };
  it('covers the circle with overlapping tiles, centre first', () => {
    const tiles = planTiles(c, 3.7, 1.5);
    expect(distanceKm(tiles[0], c)).toBeLessThan(0.001);
    expect(tiles.length).toBeGreaterThan(15);
    expect(tiles.length).toBeLessThan(30);
    // every point of the town is within one tile radius of some tile centre
    for (let a = 0; a < 360; a += 15) {
      for (const r of [1, 2.5, 3.7]) {
        const p = { lat: c.lat + (r * Math.cos((a * Math.PI) / 180)) / 111.32, lng: c.lng + (r * Math.sin((a * Math.PI) / 180)) / (111.32 * Math.cos((c.lat * Math.PI) / 180)) };
        expect(Math.min(...tiles.map((t) => distanceKm(t, p)))).toBeLessThanOrEqual(1.5);
      }
    }
  });
  it('a small radius is a single tile', () => {
    expect(planTiles(c, 1, 1.5)).toHaveLength(1);
    expect(planTiles(null, 3)).toEqual([]);
  });
  it('turns Google’s zoom into a radius and clamps it', () => {
    expect(radiusFromZoom(14, 30.45)).toBeCloseTo(3.7, 1);
    expect(radiusFromZoom(12, 30.45)).toBeCloseTo(14.9, 0);
    expect(clampRadius(40)).toBe(15);
    expect(clampRadius(0.2)).toBe(1);
  });
});

describe('Google area URL (captured 13 Oct 2026 for "Mussoorie")', () => {
  it('reads name, region, pin and zoom', () => {
    const url = 'https://www.google.com/maps/place/Mussoorie,+Uttarakhand/@30.4547233,78.0764401,14z/data=!3m1!4b1!4m6!3m5!1s0x3908d0cfa61cda5b:0x197fd47d980e85b1!8m2!3d30.4547465!4d78.081985!16zL20vMDU0Mjlq?hl=en&entry=ttu';
    expect(parseAreaUrl(url)).toEqual({ displayName: 'Mussoorie', region: 'Uttarakhand', center: { lat: 30.4547465, lng: 78.081985 }, zoom: 14, placeId: '0x3908d0cfa61cda5b:0x197fd47d980e85b1' });
    expect(parseAreaUrl('https://www.google.com/maps/search/x').center).toBeNull();
  });
});

describe('address helpers', () => {
  it('finds the neighbourhood for cluster labels', () => {
    expect(localityFromAddress('Village - Siya, Kempty Fall Rd, Mussoorie, Uttarakhand 248179')).toBe('Kempty Fall Rd');
    expect(localityFromAddress('Hotel Kailash Residency 1, Ring Road adj PNB Bank Nathapur, Indraprastha, Dehradun, Uttarakhand 248014')).toBe('Indraprastha');
    expect(localityFromAddress('26/6 Old Survey Road, Dehradun 248001')).toBe('Old Survey Road');
    expect(localityFromAddress(null)).toBeNull();
  });
  it('normalises names for fuzzy search', () => {
    expect(searchKey('Hôtel  Café & Spa!')).toBe('hotel cafe and spa');
  });
});
