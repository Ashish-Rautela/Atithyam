// Parser tests use text/markup captured from the live sites on 13 Oct 2026 (reviewer names removed).
// They prove the parsing logic; only `npm run smoke` proves a live integration still works.
import { describe, it, expect } from 'vitest';
import { parsePlaceUrl, parseRatingBlock, parseHistogram, parsePricesText } from '../../src/services/review-ingestion/adapters/googleMaps.js';
import { parseCardScore, parseSubscore, canonicalHotelUrl } from '../../src/services/review-ingestion/adapters/booking.js';
import { mapAgodaComment, mapAgodaSummary } from '../../src/services/review-ingestion/adapters/agoda.js';
import { parseMmtRatingSection, parseDetailUrl } from '../../src/services/review-ingestion/adapters/makemytrip.js';
import { mapTripadvisorLd, reviewIdFromHref, locationIdFromUrl } from '../../src/services/review-ingestion/adapters/tripadvisor.js';

describe('Google Maps parsers', () => {
  const url =
    'https://www.google.com/maps/place/JW+Marriott+Mussoorie+Walnut+Grove+Resort+%26+Spa/@30.4814884,78.0468318,17z/data=!4m9!3m8!1s0x3908d1a0a0f47e41:0xa56b2bd1df900c3a!5m2!4m1!1i2!8m2!3d30.4814884!4d78.0468318!16s%2Fg%2F11b5phs13l?hl=en';

  it('extracts place id and coordinates from the place URL', () => {
    expect(parsePlaceUrl(url)).toEqual({ placeId: '0x3908d1a0a0f47e41:0xa56b2bd1df900c3a', geo: { lat: 30.4814884, lng: 78.0468318 } });
  });

  it('parses the rating block', () => {
    expect(parseRatingBlock('4.5\n(6,485)')).toEqual({ rating: 4.5, reviewCount: 6485 });
    expect(parseRatingBlock(null)).toEqual({ rating: null, reviewCount: null });
  });

  it('parses the star histogram', () => {
    const h = parseHistogram(['5 stars, 4,729 reviews', '4 stars, 1,071 reviews', '1 stars, 290 reviews']);
    expect(h).toEqual([
      { label: '5★', stars: 5, count: 4729 },
      { label: '4★', stars: 4, count: 1071 },
      { label: '1★', stars: 1, count: 290 },
    ]);
  });

  it('parses the Prices tab and maps providers to platforms', () => {
    const text = [
      'Compare prices', 'Free cancellation only', '', 'Check in / Check out', 'Sat, Dec 19', '', 'Mon, Dec 21', '2',
      'Sponsored', 'Featured options', 'JW Marriott Mussoorie Walnut Grove Resort & Spa', '₹42,480', 'Get price',
      'Official site', '1 king-size bed', '₹42,480', 'See all rooms', 'All options',
      'JW Marriott Mussoorie Walnut Grove Resort & Spa', '₹42,480', 'Get price', 'Official site', 'See rooms',
      'Bookhotel.direct', '₹42,480', 'Free cancellation until 4 Dec · Free breakfast',
      'Agoda', '₹47,200', 'Free cancellation until 4 Dec · Free breakfast', 'See rooms',
      'MakeMyTrip.com', '₹47,200', 'Free cancellation until 4 Dec · Free breakfast', '3 guests', 'See rooms',
      'Booking.com', '₹47,200', 'Free cancellation until 3 Dec · Free breakfast · Free Wi-Fi',
      'Tripadvisor.in', '₹47,200', 'Free cancellation until 4 Dec',
    ].join('\n');
    const r = parsePricesText(text, 'JW Marriott Mussoorie Walnut Grove Resort & Spa');
    expect(r.checkIn).toBe('Sat, Dec 19');
    expect(r.checkOut).toBe('Mon, Dec 21');
    expect(r.prices.map((p) => [p.provider, p.platform, p.priceInr])).toEqual([
      ['Official site', null, 42480],
      ['Bookhotel.direct', null, 42480],
      ['Agoda', 'agoda', 47200],
      ['MakeMyTrip.com', 'makemytrip', 47200],
      ['Booking.com', 'booking', 47200],
      ['Tripadvisor.in', 'tripadvisor', 47200],
    ]);
  });
});

describe('Booking.com parsers', () => {
  it('parses the search card score', () => {
    expect(parseCardScore('Scored 8.8 | 8.8 | Fabulous | 167 reviews')).toEqual({ rating: 8.8, reviewCount: 167 });
  });
  it('parses sub-scores', () => {
    expect(parseSubscore('Value for money, 8.4, Average rating out of 10Value for money 8.4')).toEqual({ name: 'Value for money', score: 8.4, scaleMax: 10 });
    expect(parseSubscore('garbage')).toBeNull();
  });
  it('canonicalises hotel URLs to the en-gb page', () => {
    expect(canonicalHotelUrl('https://www.booking.com/hotel/in/jw-marriott-mussoorie-walnut-grove-resort-amp-spa.en-gb.html?aid=1&label=x'))
      .toBe('https://www.booking.com/hotel/in/jw-marriott-mussoorie-walnut-grove-resort-amp-spa.en-gb.html');
    expect(canonicalHotelUrl('https://www.booking.com/hotel/in/some-hotel.html')).toBe('https://www.booking.com/hotel/in/some-hotel.en-gb.html');
  });
});

describe('Agoda mappers', () => {
  it('maps a ReviewComments item', () => {
    const c = {
      hotelReviewId: 1096540089, providerId: 332, rating: 10, checkInDateMonthAndYear: 'March 2026', formattedRating: '10.0',
      formattedReviewDate: 'March 29, 2026', reviewComments: 'Excellent property and exceptional service with equally helpful staff.',
      reviewNegatives: '', reviewPositives: '', reviewTitle: 'Awesome Holiday ', translateSource: 'en',
      reviewDate: '2026-03-29T10:11:29+07:00',
      reviewerInfo: { countryName: 'India', displayMemberName: 'REVIEWER', reviewGroupName: 'Group', roomTypeName: 'Guest room, 2 Twin, Balcony' },
    };
    const r = mapAgodaComment(c);
    expect(r).toMatchObject({ sourceReviewId: '1096540089', rating: 10, scaleMax: 10, travellerType: 'Group', reviewerCountry: 'India', stayMonth: 'March 2026', publishedRaw: '2026-03-29T10:11:29+07:00' });
    expect(r.liked).toBeNull();
  });
  it('maps the HotelReviews summary and drops the "overall" grade', () => {
    const s = mapAgodaSummary({
      hotelName: 'JW Marriott Mussoorie Walnut Grove Resort & Spa',
      combinedReview: {
        score: { maxScore: 10, reviewCount: 627, reviewCommentsCount: 377, score: 8.9 },
        providers: [{ logoAltText: 'Agoda' }, { logoAltText: 'Booking.com' }],
        grades: [{ id: 'foodDining', name: 'Food and dining', score: 10 }, { id: 'overall', name: '', score: 8.9 }, { id: 'valueForMoney', name: 'Value for money', score: 8.5 }],
      },
    });
    expect(s.rating).toEqual({ value: 8.9, scaleMax: 10 });
    expect(s.reviewCount).toBe(627);
    expect(s.subscores.map((g) => g.name)).toEqual(['Food and dining', 'Value for money']);
    expect(s.providers).toEqual(['Agoda', 'Booking.com']);
  });
});

describe('MakeMyTrip parsers', () => {
  const section = [
    'User Rating & Reviews', 'Verified Reviews', 'Everyone', 'Group', '4.0', 'Very Good', '', '3653 Ratings', '', 'Excellent', '51%',
    'Very Good', '31%', 'Average', '11%', 'Poor', '4%', 'Bad', '3%', '', 'Last 10 Customer Ratings (Latest First)', '', '2', '5', '4',
    '', 'Rating Categories', '', 'Location', '4.2', 'Cleanliness', '4.1', 'Room', '4.2', 'Food', '4.2', 'Hospitality', '4.2',
    'Value For Money', '4.3', 'We are using generative AI to show you summarised user review', '', 'Review Summary', '',
    'Powered by Myra.AI', '', 'Beautiful Valley Views From Every Room Provide A Stunning Experience.',
    'Friendly And Courteous Staff Offer Excellent Service Throughout Your Stay.', 'Read more', '', 'Filter By:', '', 'All Reviews',
  ].join('\n');

  it('parses rating, count, distribution, categories and summary', () => {
    const r = parseMmtRatingSection(section);
    expect(r.rating).toEqual({ value: 4, scaleMax: 5 });
    expect(r.ratingLabel).toBe('Very Good');
    expect(r.reviewCount).toBe(3653);
    expect(r.ratingDistribution).toEqual([
      { label: 'Excellent', percent: 51 }, { label: 'Very Good', percent: 31 }, { label: 'Average', percent: 11 },
      { label: 'Poor', percent: 4 }, { label: 'Bad', percent: 3 },
    ]);
    expect(r.subscores.map((s) => `${s.name}:${s.score}`)).toEqual(['Location:4.2', 'Cleanliness:4.1', 'Room:4.2', 'Food:4.2', 'Hospitality:4.2', 'Value For Money:4.3']);
    expect(r.reviewSummary).toHaveLength(2);
  });

  it('parses the detail URL captured from window.open', () => {
    const r = parseDetailUrl('/hotels/hotel-details/?checkin=10142026&checkout=10152026&city=CTXMS&country=IN&locusId=CTXMS&searchText=JW+Marriott&hotelId=200906020951475443&_uCurrency=INR&lat=30.45968&lng=78.06537&rank=1');
    expect(r.hotelId).toBe('200906020951475443');
    expect(r.geo).toEqual({ lat: 30.45968, lng: 78.06537 });
    expect(r.url).not.toContain('searchText');
    expect(r.url).toContain('hotelId=200906020951475443');
  });
});

describe('Tripadvisor parsers', () => {
  it('maps LodgingBusiness JSON-LD', () => {
    const m = mapTripadvisorLd({
      '@type': 'LodgingBusiness', name: 'JW Marriott Mussoorie Walnut Grove Resort & Spa', priceRange: '₹₹ (Based on Average Nightly Rates)',
      telephone: '0135 300 0000', aggregateRating: { ratingValue: '4.8', reviewCount: 4415 },
      address: { streetAddress: 'Village - Siya Kempty Fall Road, Tehri Garhwal', addressLocality: 'Mussoorie', addressRegion: 'Uttarakhand', postalCode: '248179' },
      geo: { latitude: 30.481613, longitude: 78.04685 },
      amenityFeatures: [{ name: 'Free parking', value: true }, { name: 'Casino', value: false }],
    });
    expect(m.rating).toEqual({ value: 4.8, scaleMax: 5 });
    expect(m.reviewCount).toBe(4415);
    expect(m.geo).toEqual({ lat: 30.481613, lng: 78.04685 });
    expect(m.amenities).toEqual(['Free parking']);
  });
  it('extracts ids from URLs', () => {
    expect(reviewIdFromHref('/ShowUserReviews-g297689-d6999469-r1081567556-JW_Marriott.html')).toBe('1081567556');
    expect(locationIdFromUrl('https://www.tripadvisor.in/Hotel_Review-g297689-d6999469-Reviews-JW.html')).toBe('6999469');
  });
});
