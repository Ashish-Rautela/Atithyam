import { ScrapeError, ScrapeOutcome } from '../../../shared/errors/AppError.js';
import { assertNotBlocked, waitForAny, politePause } from '../browser/browserManager.js';
import { clean, parseCount, parseDecimal } from '../../../shared/util/text.js';
import { parseLatLng } from '../../../shared/util/geo.js';
import { makeListing } from './adapterContract.js';
import { fetchAgodaProviderReviews, AGODA_PROVIDERS } from './agoda.js';

const PLATFORM = 'booking';

/* ----------------------------- pure parsers (unit-tested) ----------------------------- */

/** "Scored 8.8 | 8.8 | Fabulous | 167 reviews" -> { rating: 8.8, reviewCount: 167 } */
export function parseCardScore(text) {
  if (!text) return { rating: null, reviewCount: null };
  const rating = parseDecimal(text.replace(/^scored\s*/i, ''));
  const count = text.match(/([\d,]+)\s+reviews?/i)?.[1];
  return { rating: rating !== null && rating <= 10 ? rating : null, reviewCount: count ? parseCount(count) : null };
}

/** "Location, 9.1, Average rating out of 10Location 9.1" -> { name: 'Location', score: 9.1 } */
export function parseSubscore(text) {
  const m = String(text ?? '').match(/^\s*([^,]+?),\s*(\d+(?:\.\d+)?)/);
  return m ? { name: m[1].trim(), score: Number.parseFloat(m[2]), scaleMax: 10 } : null;
}

/** Strip query string and force the English page variant. */
export function canonicalHotelUrl(url) {
  const base = String(url).split(/[?#]/)[0].replace(/\.[a-z]{2}(-[a-z]{2})?\.html$/i, '.html');
  return base.replace(/\.html$/, '.en-gb.html');
}

/* ------------------------------------ adapter ------------------------------------ */

export const booking = {
  platform: PLATFORM,
  label: 'Booking.com',

  hosts: ['booking.com'],

  async fromUrl(url) {
    const canonical = canonicalHotelUrl(url);
    const slug = canonical.match(/\/hotel\/[a-z]{2}\/([^.]+)/i)?.[1];
    if (!slug) throw new ScrapeError(ScrapeOutcome.NOT_FOUND, 'Not a Booking.com hotel URL (expected …/hotel/in/<name>.html).');
    return { externalId: slug, url: canonical, name: null };
  },

  async search({ name, location }, page) {
    const q = encodeURIComponent(`${name} ${location ?? ''}`.trim());
    await page.goto(`https://www.booking.com/searchresults.en-gb.html?ss=${q}&lang=en-gb&selected_currency=INR`, { waitUntil: 'domcontentloaded' });
    await assertNotBlocked(page, PLATFORM);
    // Either result cards, or Booking's "0 properties are available" message.
    await page
      .waitForFunction(() => document.querySelector('[data-testid="property-card"]') || /\b0 properties (are )?(available|found)/i.test(document.body?.innerText ?? ''), null, { timeout: 25000 })
      .catch(() => {});
    if (/\b0 properties (are )?(available|found)/i.test(await page.evaluate(() => document.body?.innerText ?? '').catch(() => ''))) return [];
    await waitForAny(page, ['[data-testid="property-card"]'], PLATFORM);
    const cards = await page.$$eval('[data-testid="property-card"]', (els) =>
      els.slice(0, 10).map((c) => ({
        name: c.querySelector('[data-testid="title"]')?.textContent ?? null,
        url: c.querySelector('a[data-testid="title-link"]')?.href ?? null,
        scoreText: c.querySelector('[data-testid="review-score"]')?.innerText?.replace(/\n/g, ' | ') ?? null,
        address: c.querySelector('[data-testid="address"]')?.textContent ?? null,
        price: c.querySelector('[data-testid="price-and-discounted-price"]')?.textContent ?? null,
      })),
    );
    return cards
      .filter((c) => c.url)
      .map((c) => {
        const url = canonicalHotelUrl(c.url);
        const { rating, reviewCount } = parseCardScore(c.scoreText);
        return {
          externalId: url.match(/\/hotel\/[a-z]{2}\/([^.]+)/i)?.[1] ?? url,
          name: clean(c.name),
          url,
          address: clean(c.address),
          rating,
          reviewCount,
        };
      });
  },

  async fetchListing(candidate, page) {
    await page.goto(`${candidate.url}?lang=en-gb&selected_currency=INR`, { waitUntil: 'domcontentloaded' });
    await assertNotBlocked(page, PLATFORM);
    await waitForAny(page, ['script[type="application/ld+json"]', '[data-testid="review-score-component"]'], PLATFORM);
    await page.waitForTimeout(1500);
    const data = await page.evaluate(() => {
      const ld = [...document.querySelectorAll('script[type="application/ld+json"]')]
        .map((s) => {
          try {
            return JSON.parse(s.textContent);
          } catch {
            return null;
          }
        })
        .flat()
        .find((x) => x && /Hotel|Lodging/i.test(x['@type'] ?? ''));
      const stars = document.querySelector('[data-testid="rating-stars"], [data-testid="rating-squares"]');
      return {
        ld: ld ?? null,
        latlng: document.querySelector('[data-atlas-latlng]')?.getAttribute('data-atlas-latlng') ?? null,
        starCount: stars ? stars.children.length : null,
        subscores: [...document.querySelectorAll('[data-testid="review-subscore"]')].map((e) => e.innerText.replace(/\n/g, ', ')),
        facilities: [...document.querySelectorAll('[data-testid="property-most-popular-facilities-wrapper"] li')].map((e) => e.innerText.trim()),
        featured: [...document.querySelectorAll('[data-testid="featuredreview"]')].map((r) => ({
          author: r.querySelector('h4')?.textContent ?? null,
          country: r.querySelector('[data-testid="featuredreview-avatar"] img[alt]')?.getAttribute('alt') ?? null,
          text: [...r.querySelectorAll('[data-testid="featuredreview-text"] blockquote span')].map((s) => s.textContent).join('').replace(/^“|”$/g, ''),
        })),
      };
    });

    const ld = data.ld ?? {};
    const agg = ld.aggregateRating ?? {};
    const addr = ld.address ?? {};
    const subscores = data.subscores.map(parseSubscore).filter(Boolean);
    return makeListing(PLATFORM, {
      externalId: candidate.externalId,
      url: candidate.url,
      name: clean(ld.name) ?? candidate.name,
      address: clean(addr.streetAddress ?? [addr.addressLocality, addr.addressRegion, addr.postalCode].filter(Boolean).join(', ')),
      geo: parseLatLng(data.latlng),
      starClass: data.starCount || null,
      rating: Number.isFinite(Number(agg.ratingValue)) ? { value: Number(agg.ratingValue), scaleMax: Number(agg.bestRating) || 10 } : null,
      reviewCount: Number.isFinite(Number(agg.reviewCount)) ? Number(agg.reviewCount) : null,
      subscores: dedupeBy(subscores, (s) => s.name),
      amenities: [...new Set(data.facilities)],
      featuredReviews: data.featured.filter((f) => f.text),
    });
  },

  async fetchReviews(listing, { max }, page, ctx) {
    const agodaListing = ctx?.listings?.agoda;
    if (agodaListing?.externalId) {
      // Booking.com and Agoda share review data; Agoda's public review API serves the
      // Booking.com reviews for the same property (provider 3038).
      await politePause();
      const reviews = await fetchAgodaProviderReviews(page, agodaListing.externalId, AGODA_PROVIDERS.booking, max);
      if (reviews.length) {
        return {
          reviews: reviews.map((r) => ({ ...r, via: 'agoda_review_api' })),
          notes: ['Booking.com reviews were collected through Agoda’s review API (same company, same review records).'],
          sort: 'most_recent',
        };
      }
    }
    const featured = (listing.featuredReviews ?? []).slice(0, max).map((f) => ({
      text: f.text,
      authorName: f.author,
      reviewerCountry: f.country,
    }));
    return {
      reviews: featured,
      notes: [
        agodaListing
          ? 'Agoda returned no Booking.com reviews; only the featured reviews on the Booking.com page were collected (no rating or date).'
          : 'Agoda match not available, so only the featured reviews on the Booking.com page were collected (no rating or date).',
      ],
      sort: 'featured',
    };
  },
};

function dedupeBy(items, keyFn) {
  const seen = new Set();
  return items.filter((i) => {
    const k = keyFn(i);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
