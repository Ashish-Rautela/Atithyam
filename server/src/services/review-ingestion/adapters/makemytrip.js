import { ScrapeError, ScrapeOutcome } from '../../../shared/errors/AppError.js';
import { assertNotBlocked, waitForAny, politePause, saveSnapshot } from '../browser/browserManager.js';
import { clean, parseCount, parseDecimal } from '../../../shared/util/text.js';
import { isPoint } from '../../../shared/util/geo.js';
import { makeListing } from './adapterContract.js';

const PLATFORM = 'makemytrip';
const ORIGIN = 'https://www.makemytrip.com';

/* ----------------------------- pure parsers (unit-tested) ----------------------------- */

const DIST_LABELS = ['Excellent', 'Very Good', 'Average', 'Poor', 'Bad'];
const CATEGORY_LABELS = [
  'Location', 'Cleanliness', 'Room', 'Food', 'Hospitality', 'Value For Money', 'Amenities', 'Service',
  'Safety and Security', 'Child friendliness', 'Staff', 'Facilities',
];

/** Parse the innerText of MakeMyTrip's "User Rating & Reviews" section. */
export function parseMmtRatingSection(text) {
  const t = String(text ?? '').replace(/\r/g, '');
  const overall = t.match(/\n\s*(\d\.\d)\s*\n\s*(Excellent|Very Good|Good|Average|Poor|Bad)\s*\n/);
  const count = t.match(/([\d,]+)\s+Ratings/i);
  const ratingDistribution = DIST_LABELS.map((label) => {
    const m = t.match(new RegExp(`\\n\\s*${label}\\s*\\n\\s*(\\d+)%`));
    return m ? { label, percent: Number(m[1]) } : null;
  }).filter(Boolean);

  const catStart = t.indexOf('Rating Categories');
  const catEnd = t.search(/We are using generative AI|Review Summary|Filter By:/);
  const catBlock = catStart >= 0 ? t.slice(catStart, catEnd > catStart ? catEnd : undefined) : '';
  const subscores = CATEGORY_LABELS.map((name) => {
    const m = catBlock.match(new RegExp(`\\n\\s*${name}\\s*\\n\\s*(\\d(?:\\.\\d)?)\\s*(\\n|$)`));
    return m ? { name, score: Number(m[1]), scaleMax: 5 } : null;
  }).filter(Boolean);

  const sumStart = t.search(/Powered by Myra\.AI/i);
  const reviewSummary =
    sumStart >= 0
      ? t
          .slice(sumStart)
          .split(/Filter By:/i)[0]
          .split('\n')
          .slice(1)
          .map((l) => l.trim())
          .filter(Boolean)
          .filter((l) => !/^read more$/i.test(l))
          .slice(0, 6)
          .filter((l) => l.length > 15 && !/^filter by/i.test(l))
      : [];

  return {
    rating: overall ? { value: Number(overall[1]), scaleMax: 5 } : null,
    ratingLabel: overall?.[2] ?? null,
    reviewCount: count ? parseCount(count[1]) : null,
    ratingDistribution,
    subscores,
    reviewSummary,
  };
}

/** Parse "/hotels/hotel-details/?…&hotelId=…&lat=…&lng=…" captured from window.open. */
export function parseDetailUrl(relativeUrl) {
  const url = new URL(relativeUrl, ORIGIN);
  const geo = { lat: Number(url.searchParams.get('lat')), lng: Number(url.searchParams.get('lng')) };
  const hotelId = url.searchParams.get('hotelId');
  // Keep only what the detail page needs; drop tracking/search parameters.
  const keep = ['checkin', 'checkout', 'city', 'country', 'hotelId', 'roomStayQualifier', '_uCurrency'];
  const clean = new URL('/hotels/hotel-details/', ORIGIN);
  for (const k of keep) if (url.searchParams.get(k)) clean.searchParams.set(k, url.searchParams.get(k));
  return { hotelId, geo: isPoint(geo) ? geo : null, url: clean.toString() };
}

/** Runs in the browser: MakeMyTrip review items -> plain objects. Exported for tests against captured markup. */
export function extractMmtReviewItems(items) {
  return items.map((it) => {
    const pts = [...it.querySelectorAll('.userRvs__rvdtlPoints')].map((e) => e.textContent.trim());
    const labelValue = (label) => {
      const l = [...it.querySelectorAll('span')].find((x) => x.textContent.trim() === label);
      return l?.nextElementSibling?.textContent?.trim() ?? null;
    };
    const text = it.querySelector('.reviewText')?.textContent?.trim() ?? null;
    return {
      rating: it.querySelector('.userRvs__rtng')?.textContent ?? null,
      title: it.querySelector('.userRvs__itemHdr p')?.textContent ?? null,
      authorName: pts[0] ?? null,
      travellerType: pts[1] ?? null,
      text: text && /does not contain any comments/i.test(text) ? null : text,
      stayMonth: labelValue('Travel Month:'),
      roomType: labelValue('Room:'),
    };
  });
}

/* ------------------------------------ adapter ------------------------------------ */

/**
 * Open a hotel-details page the way a visitor would: land on the MakeMyTrip home page first so
 * the site's bot shield sets its cookies (a cold deep link gets a bare "200-OK" page), then go to
 * the hotel and scroll until the lazily rendered review section appears.
 */
async function openDetail(page, url) {
  if (!page.url().startsWith(ORIGIN)) {
    await page.goto(`${ORIGIN}/hotels/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    await closeLoginModal(page);
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    // Navigate from inside the site (same-origin link navigation, like clicking a link),
    // rather than a cold deep link.
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {}),
      page.evaluate((u) => window.location.assign(u), url),
    ]);
    const body = await page.evaluate(() => document.body?.innerText?.trim() ?? '').catch(() => '');
    if (body !== '200-OK') break;
    await page.goto(`${ORIGIN}/hotels/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);
  }
  if ((await page.evaluate(() => document.body?.innerText?.trim() ?? '').catch(() => '')) === '200-OK') {
    throw new ScrapeError(
      ScrapeOutcome.BLOCKED,
      'MakeMyTrip refused to show the hotel page to the automated browser (it returned a bare "200-OK" page). Stopped without retrying further; its price is still shown from Google.',
    );
  }
  await assertNotBlocked(page, PLATFORM);
  await waitForAny(page, ['h1'], PLATFORM, 30000);
  await page.waitForTimeout(2000);
  await closeLoginModal(page);
  for (let i = 0; i < 10 && !(await page.locator('#userReviewsSection').count()); i++) {
    await page.mouse.wheel(0, 1500);
    await page.waitForTimeout(900);
  }
  await page.locator('#userReviewsSection').first().scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(1500);
}

async function closeLoginModal(page) {
  await page.keyboard.press('Escape').catch(() => {});
  const close = page.locator('[data-cy="closeModal"], .commonModal__close');
  if (await close.count().catch(() => 0)) await close.first().click().catch(() => {});
}

export const makemytrip = {
  platform: PLATFORM,
  label: 'MakeMyTrip',

  hosts: ['makemytrip.com'],

  async fromUrl(url) {
    const { hotelId, geo, url: clean } = parseDetailUrl(url);
    if (!hotelId) throw new ScrapeError(ScrapeOutcome.NOT_FOUND, 'Not a MakeMyTrip hotel-details URL (expected a hotelId parameter).');
    return { externalId: hotelId, url: clean, name: null, geo };
  },

  /**
   * MakeMyTrip's own search box proved unreliable to automate (the typed text is ignored and the
   * date picker opens instead). The hotel is identified through Google's price links instead
   * (see googleMaps.otaLinkFromPcurl) or through a URL the user pastes.
   */
  async search() {
    throw new ScrapeError(
      ScrapeOutcome.NOT_FOUND,
      'MakeMyTrip is matched through Google Maps’ price links, and Google lists no MakeMyTrip price for this hotel. Paste the MakeMyTrip hotel URL to add it.',
    );
  },

  async fetchListing(candidate, page) {
    await openDetail(page, candidate.url);
    const data = await page.evaluate(() => {
      const h1 = document.querySelector('h1');
      const header = h1?.closest('section, div')?.innerText ?? '';
      return {
        name: h1?.innerText ?? null,
        header,
        address: document.querySelector('[data-testid="location-address"]')?.innerText ?? null,
        amenities: [...document.querySelectorAll('[data-testid^="amenity-item"]')].map((e) => e.innerText.trim()),
        reviewSection: document.querySelector('#userReviewsSection')?.innerText ?? '',
      };
    });
    const parsed = parseMmtRatingSection(data.reviewSection);
    const star = (data.header.match(/(\d)\s*Star/i) ?? [])[1];
    const notes = [];
    if (parsed.reviewSummary.length) notes.push('Review summary lines are generated by MakeMyTrip (Myra.AI), not by this tool.');
    return makeListing(PLATFORM, {
      externalId: candidate.externalId,
      url: candidate.url,
      name: clean(data.name) ?? candidate.name,
      address: clean(data.address?.replace(/^address:\s*/i, '')),
      geo: candidate.geo ?? null,
      starClass: star ? Number(star) : null,
      rating: parsed.rating ?? (candidate.rating ? { value: candidate.rating, scaleMax: 5 } : null),
      reviewCount: parsed.reviewCount ?? candidate.reviewCount ?? null,
      ratingDistribution: parsed.ratingDistribution,
      subscores: parsed.subscores,
      reviewSummary: parsed.reviewSummary,
      amenities: [...new Set(data.amenities)],
      priceInr: candidate.priceInr ?? null,
      priceNote: candidate.priceInr
        ? `Lowest price shown on MakeMyTrip search for the next night, 2 adults${candidate.extra?.taxesText ? ` (${candidate.extra.taxesText})` : ''}.`
        : null,
      notes,
    });
  },

  async fetchReviews(listing, { max }, page) {
    if (!page.url().includes('hotel-details')) await openDetail(page, listing.url);
    const hasSection = await page.locator('#userReviewsSection').count();
    if (!hasSection) return { reviews: [], notes: ['No review section on this MakeMyTrip page.'], sort: 'most_relevant' };

    const reviews = [];
    for (let pageNo = 1; pageNo <= 20 && reviews.length < max; pageNo++) {
      await page.locator('.userRvs__item').first().waitFor({ timeout: 15000 }).catch(() => {});
      const batch = await page.$$eval('.userRvs__item', extractMmtReviewItems);
      if (!batch.length) break;
      reviews.push(...batch);
      if (reviews.length >= max) break;

      const next = page.locator('#detpg_review_ratings_pagination a', { hasText: new RegExp(`^${pageNo + 1}$`) });
      if (!(await next.count())) break;
      const firstBefore = batch[0]?.text ?? batch[0]?.title;
      await politePause();
      await next.first().click();
      await page
        .waitForFunction(
          (prev) => {
            const first = document.querySelector('.userRvs__item');
            const t = first?.querySelector('.reviewText')?.textContent?.trim() ?? first?.querySelector('.userRvs__itemHdr p')?.textContent;
            return t && t !== prev;
          },
          firstBefore,
          { timeout: 15000 },
        )
        .catch(() => {});
    }

    return {
      reviews: reviews.slice(0, max).map((r) => ({
        ...r,
        rating: parseDecimal(r.rating),
        scaleMax: 5,
        // MakeMyTrip shows the travel month, not a posting date.
        publishedRaw: r.stayMonth,
      })),
      notes: ['MakeMyTrip reviews have no public review id or posting date; de-duplication uses a content fingerprint and the travel month is used as the date.'],
      sort: 'most_relevant',
    };
  },
};
