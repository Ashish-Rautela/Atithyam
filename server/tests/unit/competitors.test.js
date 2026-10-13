// Step 2: discovery parsing, Google price-link resolution, comparability rules, compset API.
// Inputs are values captured from Google Maps on 13 Oct 2026 (Dehradun, near Hotel Kailash Residency).
import { describe, it, expect } from 'vitest';
import { parseFeedCard, otaLinkFromPcurl, otaLinksFromPrices, attachPriceLinks, searchGrid, zoomForRadius } from '../../src/services/review-ingestion/adapters/googleMaps.js';
import { mapAgodaSummary } from '../../src/services/review-ingestion/adapters/agoda.js';
import { tagCandidates, defaultSelection, priceTier, DEFAULT_RULES } from '../../src/services/competitor-discovery/comparability.js';

const href = (lat, lng, id) => `https://www.google.com/maps/place/X/data=!4m10!3m9!1s${id}!5m2!4m1!1i2!8m2!3d${lat}!4d${lng}!16s%2Fg%2F11?authuser=0&hl=en&g_ep=abc&rclk=1`;

describe('Google result-list cards', () => {
  it('parses a hotel card with star class and price', () => {
    const c = parseFeedCard({
      name: 'Hotel NJ Portico', url: href('30.2960937', '78.0551177', '0x1:0x2'), ratingText: '4.2', countText: '(1,089)', priceText: '₹2,048', sponsored: false,
      lines: ['Hotel NJ Portico', 'Hotel NJ Portico', '4.2(1,089)', '2-star hotel', '₹2,048', 'Free breakfast'],
    });
    expect(c).toMatchObject({ placeId: '0x1:0x2', geo: { lat: 30.2960937, lng: 78.0551177 }, rating: 4.2, reviewCount: 1089, starClass: 2, lodgingType: 'Hotel', priceInr: 2048, sponsored: false });
    expect(c.url).not.toContain('g_ep');
  });

  it('parses a card without a price and a plain "Hotel" type', () => {
    const c = parseFeedCard({
      name: 'Hotel Kailash Residency', url: href('30.2955956', '78.0740518', '0x3909297cbbd6ce6b:0xabf5b89a0af53d71'), ratingText: '4.1', countText: '(297)', priceText: null, sponsored: false,
      lines: ['Hotel Kailash Residency', 'Hotel Kailash Residency', '4.1(297)', 'Hotel', 'Free parking'],
    });
    expect(c).toMatchObject({ starClass: null, lodgingType: 'Hotel', priceInr: null, reviewCount: 297 });
  });

  it('builds a search grid and picks a zoom', () => {
    const g = searchGrid({ lat: 30.3, lng: 78.07 }, 1.5);
    expect(g).toHaveLength(5);
    expect(g[1].lat - 30.3).toBeCloseTo(1.5 / 111.32, 5);
    expect(searchGrid({ lat: 1, lng: 1 }, 0)).toHaveLength(1);
    expect(zoomForRadius(3)).toBe(14);
    expect(zoomForRadius(2)).toBe(15);
  });
});

describe('Google price links → OTA listings', () => {
  it('resolves MakeMyTrip, Agoda, Booking.com and Tripadvisor destinations', () => {
    const mmt = otaLinkFromPcurl('makemytrip', 'https://www.makemytrip.com/hotels/hotel-listing/?topHtlId=201507201256502456&city=CTDED&country=IN&checkin=10152026&checkout=10162026&rsc=1e2e0e&roomStayQualifier=2e0e&_uCurrency=INR&locusId=CTDED');
    expect(mmt.externalId).toBe('201507201256502456');
    expect(mmt.url).toContain('/hotels/hotel-details/');
    expect(mmt.url).toContain('hotelId=201507201256502456');
    expect(mmt.url).toContain('city=CTDED');

    const agoda = otaLinkFromPcurl('agoda', 'https://www.agoda.com/partners/partnersearch.aspx?site_id=1917614&CkInDay=15&NumberOfAdults=2&hid=10781');
    expect(agoda).toEqual({ externalId: '10781', url: 'https://www.agoda.com/partners/partnersearch.aspx?hid=10781' });

    expect(otaLinkFromPcurl('booking', 'https://www.booking.com/hotel/in/kailash-residency.html?aid=1&checkin=2026-10-15'))
      .toEqual({ externalId: 'kailash-residency', url: 'https://www.booking.com/hotel/in/kailash-residency.en-gb.html' });

    expect(otaLinkFromPcurl('tripadvisor', 'https://www.tripadvisor.in/Hotel_Review-g297687-d7625707-Reviews-Hotel_Kailash_Residency.html?m=1').externalId).toBe('7625707');
    expect(otaLinkFromPcurl('agoda', 'not a url')).toBeNull();
  });

  it('attaches pcurl links to parsed price rows and keys them by platform', () => {
    const prices = [
      { provider: 'Agoda', platform: 'agoda', priceInr: 1800 },
      { provider: 'Bluepillow.in', platform: null, priceInr: 1709 },
      { provider: 'MakeMyTrip.com', platform: 'makemytrip', priceInr: 1900 },
    ];
    const links = [
      { provider: 'Agoda', href: 'https://www.google.com/travel/lodging/clk?pc=x&pcurl=https://www.agoda.com/partners/partnersearch.aspx?hid%3D10781&s=y' },
      { provider: 'MakeMyTrip.com', href: 'https://www.google.com/travel/lodging/clk?pc=x&pcurl=https://www.makemytrip.com/hotels/hotel-listing/?topHtlId%3D201507201256502456%26city%3DCTDED&s=y' },
    ];
    const withLinks = attachPriceLinks(prices, links);
    expect(withLinks[0].url).toBe('https://www.agoda.com/partners/partnersearch.aspx?hid=10781');
    expect(withLinks[1].url).toBeNull();
    const byPlatform = otaLinksFromPrices(withLinks);
    expect(Object.keys(byPlatform).sort()).toEqual(['agoda', 'makemytrip']);
    expect(byPlatform.makemytrip.externalId).toBe('201507201256502456');
  });
});

describe('Agoda summary fallback', () => {
  it('reads the score when there is no combinedReview', () => {
    const s = mapAgodaSummary({ hotelName: 'Kailash Residency', score: { score: 7.4, maxScore: 10, reviewCount: 88 }, reviewTabs: [] });
    expect(s.rating).toEqual({ value: 7.4, scaleMax: 10 });
    expect(s.reviewCount).toBe(88);
  });
  it('finds a nested score object', () => {
    const s = mapAgodaSummary({ hotelName: 'X', commentList: { summary: { score: 8.1, maxScore: 10, reviewCount: 12 } } });
    expect(s.rating.value).toBe(8.1);
  });
});

describe('comparability rules', () => {
  const target = { placeId: 'T', name: 'Hotel Kailash Residency', geo: { lat: 30.2955956, lng: 78.0740518 }, priceInr: 1709 };
  const places = [
    { placeId: 'T', name: 'Hotel Kailash Residency', geo: target.geo, priceInr: 1709, reviewCount: 297 },
    { placeId: 'A', name: 'Hotel NJ Portico', geo: { lat: 30.2960937, lng: 78.0551177 }, priceInr: 2048, reviewCount: 1089 },
    { placeId: 'B', name: 'Super Hotel O by OYO Vidhan Sabha Chowk', geo: { lat: 30.2953169, lng: 78.0594911 }, priceInr: 1081, reviewCount: 539 },
    { placeId: 'C', name: 'Hyatt Centric Dehradun', geo: { lat: 30.365875, lng: 78.070495 }, priceInr: 8850, reviewCount: 1300, sponsored: true },
    { placeId: 'D', name: 'FabHotel Kenil Star', geo: { lat: 30.294907, lng: 78.054831 }, priceInr: null, reviewCount: 540 },
    { placeId: 'E', name: 'Tiny Homestay', geo: { lat: 30.2957, lng: 78.0742 }, priceInr: 1500, reviewCount: 4 },
    { placeId: 'F', name: 'Ida Hotel', geo: { lat: 30.3159944, lng: 78.049662 }, priceInr: 3842, reviewCount: 2342 },
  ];

  it('excludes the target, tags distance/price and explains exclusions', () => {
    const t = tagCandidates(target, places, DEFAULT_RULES);
    expect(t.map((c) => c.placeId)).not.toContain('T');
    const byId = Object.fromEntries(t.map((c) => [c.placeId, c]));
    expect(byId.A).toMatchObject({ eligible: true, priceRatio: 1.2, priceTier: 'similar' });
    expect(byId.A.distanceKm).toBeGreaterThan(1.8);
    expect(byId.A.distanceKm).toBeLessThan(1.9);
    expect(byId.C.eligible).toBe(false);
    expect(byId.C.exclusions.join(' ')).toMatch(/km away/);
    expect(byId.C.exclusions.join(' ')).toMatch(/5\.18× yours/);
    expect(byId.D).toMatchObject({ eligible: true, priceTier: 'unknown' });
    expect(byId.E.exclusions.join(' ')).toMatch(/only 4 Google reviews/);
    expect(byId.F.exclusions.join(' ')).toMatch(/2\.25× yours/);
    // nearest first
    expect(t[0].placeId).toBe('E');
  });

  it('default selection = eligible, nearest first, capped', () => {
    const t = tagCandidates(target, places, DEFAULT_RULES);
    expect(defaultSelection(t, DEFAULT_RULES)).toEqual(['B', 'A', 'D']);
    expect(defaultSelection(t, { ...DEFAULT_RULES, maxCompetitors: 1 })).toEqual(['B']);
  });

  it('price tiers', () => {
    expect([0.3, 0.7, 1, 1.6, 3, null].map(priceTier)).toEqual(['much_cheaper', 'cheaper', 'similar', 'pricier', 'much_pricier', 'unknown']);
  });
});

describe('Google place coordinates fallback', async () => {
  const { geoFromStaticMap, parsePlaceUrl } = await import('../../src/services/review-ingestion/adapters/googleMaps.js');
  it('reads coordinates from a static map URL', () => {
    expect(geoFromStaticMap('https://maps.google.com/maps/api/staticmap?center=30.2955956%2C78.0740518&zoom=17&size=900x900')).toEqual({ lat: 30.2955956, lng: 78.0740518 });
    expect(geoFromStaticMap(null)).toBeNull();
  });
  it('a /maps/search/ URL has no place id or coordinates (why the place URL must be awaited)', () => {
    expect(parsePlaceUrl('https://www.google.com/maps/search/Hotel%20Kailash%20Residency%20dehradun?hl=en')).toEqual({ placeId: null, geo: null });
  });
});

describe('fixes from the live competitor run', async () => {
  const { cleanPlaceUrl } = await import('../../src/services/review-ingestion/adapters/googleMaps.js');
  const { cityFromAddress } = await import('../../src/shared/util/text.js');
  it('repairs a place URL whose query string was glued onto the path', () => {
    const broken = 'https://www.google.com/maps/place/Trilokesh+Guest+House/data=!4m10!3m9!1s0x390929bea124ba1f:0xc9a9f4c4f9b01bed!5m2!4m1!1i2!8m2!3d30.2917945!4d78.0706174!16s%2Fg%2F11!19sChIJ&hl=en&g_ep=EgoyMDI2&rclk=1';
    const fixed = cleanPlaceUrl(broken);
    expect(fixed).toBe('https://www.google.com/maps/place/Trilokesh+Guest+House/data=!4m10!3m9!1s0x390929bea124ba1f:0xc9a9f4c4f9b01bed!5m2!4m1!1i2!8m2!3d30.2917945!4d78.0706174!16s%2Fg%2F11!19sChIJ?hl=en');
    expect(cleanPlaceUrl('https://www.google.com/maps/place/X/data=!3d1.5!4d2.5?authuser=0&hl=en&g_ep=abc&rclk=1')).toBe('https://www.google.com/maps/place/X/data=!3d1.5!4d2.5?hl=en');
  });
  it('extracts the town from a Google address', () => {
    expect(cityFromAddress('Hotel Kailash Residency 1, Ring Road adj PNB Bank Nathapur, Indraprastha, Dehradun, Uttarakhand 248014')).toBe('Dehradun');
    expect(cityFromAddress('Village - Siya, Kempty Fall Rd, Mussoorie, Uttarakhand 248179')).toBe('Mussoorie');
    expect(cityFromAddress('26/6 Old Survey Road, Dehradun 248001')).toBe('Dehradun');
    expect(cityFromAddress(null)).toBeNull();
  });
});
