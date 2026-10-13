import { ScrapeError, ScrapeOutcome } from '../../../shared/errors/AppError.js';
import { assertNotBlocked, waitForAny, politePause } from '../browser/browserManager.js';
import { clean, parseCount, parseDecimal } from '../../../shared/util/text.js';
import { isPoint } from '../../../shared/util/geo.js';
import { makeListing } from './adapterContract.js';

const PLATFORM = 'tripadvisor';
const ORIGIN = 'https://www.tripadvisor.in';

/* ----------------------------- pure parsers (unit-tested) ----------------------------- */

/** Map the LodgingBusiness JSON-LD block of a TripAdvisor hotel page. */
export function mapTripadvisorLd(ld) {
  if (!ld) return {};
  const agg = ld.aggregateRating ?? {};
  const a = ld.address ?? {};
  const geo = ld.geo ? { lat: Number(ld.geo.latitude), lng: Number(ld.geo.longitude) } : null;
  return {
    name: clean(ld.name),
    phone: clean(ld.telephone),
    website: ld.sameAs ?? null,
    priceRange: clean(ld.priceRange),
    address: clean([a.streetAddress, a.addressLocality, a.addressRegion, a.postalCode].filter(Boolean).join(', ')),
    geo: isPoint(geo) ? geo : null,
    rating: Number.isFinite(Number(agg.ratingValue)) ? { value: Number(agg.ratingValue), scaleMax: 5 } : null,
    reviewCount: Number.isFinite(Number(agg.reviewCount)) ? Number(agg.reviewCount) : null,
    amenities: (ld.amenityFeatures ?? []).filter((f) => f.value !== false).map((f) => f.name).filter(Boolean),
  };
}

/** "/ShowUserReviews-g297689-d6999469-r1081567556-…" -> "1081567556" */
export function reviewIdFromHref(href) {
  return String(href ?? '').match(/-r(\d+)-/)?.[1] ?? null;
}

/** "-d6999469-" location id from a Hotel_Review URL. */
export function locationIdFromUrl(url) {
  return String(url ?? '').match(/-d(\d+)-/)?.[1] ?? null;
}

/** Runs in the browser: Tripadvisor review cards -> plain objects. Exported for tests against captured markup. */
export function extractTripadvisorCards(cards) {
  return cards.map((card) => {
    const titleLink = card.querySelector('[data-test-target="review-title"] a');
    const bubble = [...card.querySelectorAll('svg title')].map((t) => t.textContent).find((t) => /of 5 bubbles/.test(t));
    const text = card.innerText || card.textContent;
    return {
      href: titleLink?.getAttribute('href') ?? null,
      title: titleLink?.textContent?.trim() ?? null,
      body: card.querySelector('.JguWG')?.textContent?.trim() ?? null,
      bubble: bubble ?? null,
      written: text.match(/wrote a review\s+([^\n]+?)(?:\s*\d+\s*contributions?|\n|$)/i)?.[1]?.trim() ?? null,
      stay: text.match(/Date of stay:\s*([^\n]+)/i)?.[1]?.trim() ?? null,
      trip: text.match(/Trip type:\s*([^\n]+)/i)?.[1]?.trim() ?? null,
      author: card.querySelector('a[href^="/Profile/"] span')?.textContent ?? null,
    };
  });
}

/* ------------------------------------ adapter ------------------------------------ */

export const tripadvisor = {
  platform: PLATFORM,
  label: 'Tripadvisor',

  hosts: ['tripadvisor.in', 'tripadvisor.com'],

  async fromUrl(url) {
    const id = locationIdFromUrl(url);
    if (!id || !/Hotel_Review/.test(url)) throw new ScrapeError(ScrapeOutcome.NOT_FOUND, 'Not a Tripadvisor Hotel_Review URL.');
    return { externalId: id, url: url.split('#')[0], name: null };
  },

  async search({ name, location }, page) {
    const q = encodeURIComponent(`${name} ${location ?? ''}`.trim());
    await page.goto(`${ORIGIN}/Search?q=${q}`, { waitUntil: 'domcontentloaded' });
    await assertNotBlocked(page, PLATFORM);
    await waitForAny(page, ['a[href*="Hotel_Review"]', 'a[href*="Restaurant_Review"]', '[data-test-attribute="all-results-section"]'], PLATFORM, 25000);
    await page.waitForTimeout(1500);
    const rows = await page.$$eval('a[href*="Hotel_Review"]', (anchors) => {
      const byHref = new Map();
      for (const a of anchors) {
        const href = a.href.split('#')[0];
        if (!byHref.has(href)) byHref.set(href, { href, texts: [], context: '' });
        const entry = byHref.get(href);
        entry.texts.push(a.innerText.trim());
        let card = a;
        for (let i = 0; i < 6 && card.parentElement; i++) {
          card = card.parentElement;
          if (/of 5 bubbles/.test(card.innerText)) break;
        }
        if (card.innerText.length > entry.context.length) entry.context = card.innerText;
      }
      return [...byHref.values()].slice(0, 8);
    });
    return rows.map((r) => {
      const name = r.texts.find((t) => t && !t.includes('\n') && !/^\(|mentions|^hotel$/i.test(t)) ?? r.texts[0]?.split('\n').find((l) => l.length > 3 && !/^hotel$/i.test(l));
      return {
        externalId: locationIdFromUrl(r.href) ?? r.href,
        name: clean(name),
        url: r.href,
        rating: parseDecimal(r.context.match(/(\d(?:\.\d)?) of 5 bubbles/)?.[1]),
        reviewCount: parseCount(r.context.match(/\(([\d,]+) reviews?\)/i)?.[1]),
        address: clean(r.context.split('\n').find((l) => /,\s*India$/i.test(l.trim()))),
      };
    });
  },

  async fetchListing(candidate, page) {
    await page.goto(candidate.url, { waitUntil: 'domcontentloaded' });
    await assertNotBlocked(page, PLATFORM);
    await waitForAny(page, ['script[type="application/ld+json"]', '[data-test-target="HR_CC_CARD"]'], PLATFORM, 25000);
    const ld = await page.evaluate(() =>
      [...document.querySelectorAll('script[type="application/ld+json"]')]
        .map((s) => {
          try {
            return JSON.parse(s.textContent);
          } catch {
            return null;
          }
        })
        .find((x) => x && /LodgingBusiness|Hotel/.test(x['@type'] ?? '')) ?? null,
    );
    const m = mapTripadvisorLd(ld);
    return makeListing(PLATFORM, {
      externalId: candidate.externalId,
      url: candidate.url,
      name: m.name ?? candidate.name,
      address: m.address ?? candidate.address ?? null,
      phone: m.phone ?? null,
      website: m.website ?? null,
      geo: m.geo ?? null,
      rating: m.rating ?? (candidate.rating ? { value: candidate.rating, scaleMax: 5 } : null),
      reviewCount: m.reviewCount ?? candidate.reviewCount ?? null,
      amenities: m.amenities ?? [],
      priceNote: m.priceRange ? `Tripadvisor price band: ${m.priceRange}` : null,
    });
  },

  async fetchReviews(listing, { max }, page) {
    if (!page.url().startsWith(listing.url.split('.html')[0])) {
      await page.goto(listing.url, { waitUntil: 'domcontentloaded' });
      await assertNotBlocked(page, PLATFORM);
    }
    const reviews = [];
    const seen = new Set();
    for (let pageNo = 1; pageNo <= 20 && reviews.length < max; pageNo++) {
      await waitForAny(page, ['[data-test-target="HR_CC_CARD"]', '[data-automation="reviewCard"]'], PLATFORM, 25000);
      // Expand truncated review texts on this page.
      await page
        .$$eval('[data-test-target="HR_CC_CARD"] button', (buttons) =>
          buttons.filter((b) => /read more/i.test(b.innerText)).forEach((b) => b.click()),
        )
        .catch(() => {});
      await page.waitForTimeout(600);
      const batch = await page.$$eval('[data-test-target="HR_CC_CARD"], [data-automation="reviewCard"]', extractTripadvisorCards);
      for (const r of batch) {
        const id = r.href ? r.href.match(/-r(\d+)-/)?.[1] : null;
        const key = id ?? `${r.title}|${r.body?.slice(0, 50)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        reviews.push({
          sourceReviewId: id,
          title: r.title,
          text: r.body,
          rating: parseDecimal(r.bubble),
          scaleMax: 5,
          publishedRaw: r.written,
          stayMonth: r.stay,
          travellerType: r.trip,
          authorName: r.author,
        });
      }
      if (reviews.length >= max) break;
      const nextHref = await page.locator('a[aria-label="Next page"]').first().getAttribute('href').catch(() => null);
      if (!nextHref) break;
      await politePause();
      await page.goto(new URL(nextHref, ORIGIN).toString(), { waitUntil: 'domcontentloaded' });
      await assertNotBlocked(page, PLATFORM);
    }
    return { reviews: reviews.slice(0, max), notes: [], sort: 'most_recent' };
  },
};
