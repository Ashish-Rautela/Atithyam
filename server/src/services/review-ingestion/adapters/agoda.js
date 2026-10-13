import { ScrapeError, ScrapeOutcome } from '../../../shared/errors/AppError.js';
import { assertNotBlocked, politePause } from '../browser/browserManager.js';
import { clean } from '../../../shared/util/text.js';
import { makeListing } from './adapterContract.js';

const PLATFORM = 'agoda';
const ORIGIN = 'https://www.agoda.com';

/** Agoda review provider ids seen in its review API. 3038 = reviews Booking.com collected for the same property. */
export const AGODA_PROVIDERS = Object.freeze({ agoda: 332, booking: 3038 });

/* ----------------------------- pure mappers (unit-tested) ----------------------------- */

/** Map one ReviewComments `comments[]` item to a RawReview. */
export function mapAgodaComment(c) {
  const info = c.reviewerInfo ?? {};
  return {
    sourceReviewId: c.hotelReviewId != null ? String(c.hotelReviewId) : null,
    rating: typeof c.rating === 'number' ? c.rating : Number.parseFloat(c.formattedRating),
    scaleMax: 10,
    title: c.reviewTitle || null,
    text: c.reviewComments || null,
    liked: c.reviewPositives || null,
    disliked: c.reviewNegatives || null,
    language: c.translateSource || null,
    publishedRaw: c.reviewDate || c.formattedReviewDate || null,
    stayMonth: c.checkInDateMonthAndYear || null,
    travellerType: info.reviewGroupName || null,
    roomType: info.roomTypeName || null,
    reviewerCountry: info.countryName || null,
    authorName: info.displayMemberName || null,
    ownerReply: c.responseText || c.reviewResponse || null,
  };
}

/**
 * Map HotelReviews to listing fields. Properties reviewed by several providers have a
 * `combinedReview`; single-provider properties may not, so fall back to any score-like object.
 */
export function mapAgodaSummary(json) {
  const isScore = (o) => o && typeof o === 'object' && Number.isFinite(o.score) && (Number.isFinite(o.maxScore) || Number.isFinite(o.reviewCount));
  let score = json?.combinedReview?.score;
  if (!isScore(score)) score = isScore(json?.score) ? json.score : findDeep(json, isScore) ?? {};
  let grades = json?.combinedReview?.grades;
  if (!Array.isArray(grades) || !grades.length) grades = findDeep(json, (o) => Array.isArray(o?.grades) && o.grades.length)?.grades ?? [];
  return {
    name: json?.hotelName ?? null,
    rating: Number.isFinite(score.score) ? { value: score.score, scaleMax: score.maxScore ?? 10 } : null,
    reviewCount: Number.isFinite(score.reviewCount) ? score.reviewCount : Number.isFinite(score.reviewCommentsCount) ? score.reviewCommentsCount : null,
    reviewCommentsCount: Number.isFinite(score.reviewCommentsCount) ? score.reviewCommentsCount : null,
    subscores: grades
      .filter((g) => g.id !== 'overall' && Number.isFinite(g.score))
      .map((g) => ({ name: g.name, score: g.score, scaleMax: 10 })),
    providers: (json?.combinedReview?.providers ?? []).map((p) => p.logoAltText).filter(Boolean),
  };
}

/** Depth-first search for the first nested object matching `pred` (bounded depth). */
function findDeep(obj, pred, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 5) return null;
  if (pred(obj)) return obj;
  for (const v of Object.values(obj)) {
    const hit = findDeep(v, pred, depth + 1);
    if (hit) return hit;
  }
  return null;
}

/* ------------------------------------ adapter ------------------------------------ */

async function ensureOrigin(page) {
  if (!page.url().startsWith(ORIGIN)) {
    await page.goto(`${ORIGIN}/?locale=en-us&currency=INR`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
  }
  await assertNotBlocked(page, PLATFORM);
}

/** fetch() inside the page so the site's own cookies/session apply. */
async function pageFetchJson(page, path, body) {
  const res = await page.evaluate(
    async ({ path, body }) => {
      const r = await fetch(path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
      const text = await r.text();
      return { status: r.status, text };
    },
    { path, body },
  );
  if (res.status === 403 || res.status === 429) {
    throw new ScrapeError(ScrapeOutcome.BLOCKED, `Agoda API returned HTTP ${res.status}. Stopped without retrying.`);
  }
  if (res.status !== 200) {
    throw new ScrapeError(ScrapeOutcome.LAYOUT_CHANGED, `Agoda API ${path.split('?')[0]} returned HTTP ${res.status}.`);
  }
  try {
    return JSON.parse(res.text);
  } catch {
    throw new ScrapeError(ScrapeOutcome.LAYOUT_CHANGED, `Agoda API ${path.split('?')[0]} did not return JSON.`);
  }
}

function reviewRequest(hotelId, providerId, pageNo) {
  return {
    hotelId: Number(hotelId),
    hotelProviderId: AGODA_PROVIDERS.agoda,
    demographicId: 0,
    pageNo,
    pageSize: 20,
    sorting: 1, // 1 = most recent
    providerIds: [providerId],
    isReviewPage: false,
    isCrawlablePage: true,
    filters: { language: [], room: [] },
    searchKeyword: '',
    searchFilters: [],
  };
}

/** Collect reviews from Agoda's review API for one provider (Agoda itself, or Booking.com). */
export async function fetchAgodaProviderReviews(page, hotelId, providerId, max) {
  await ensureOrigin(page);
  const seen = new Set();
  const reviews = [];
  for (let pageNo = 1; pageNo <= 25 && reviews.length < max; pageNo++) {
    const json = await pageFetchJson(page, '/api/cronos/property/review/ReviewComments', reviewRequest(hotelId, providerId, pageNo));
    const comments = Array.isArray(json?.comments) ? json.comments : [];
    let added = 0;
    for (const c of comments) {
      const id = String(c.hotelReviewId);
      if (seen.has(id)) continue;
      seen.add(id);
      reviews.push(mapAgodaComment(c));
      added++;
    }
    if (!added) break; // empty page or the API ignored pageNo
    await politePause();
  }
  return reviews.slice(0, max);
}

export const agoda = {
  platform: PLATFORM,
  label: 'Agoda',

  hosts: ['agoda.com'],

  async fromUrl(url, page) {
    let id = url.match(/(?:selectedproperty|hotel_id|hotel|hid)=(\d+)/i)?.[1];
    if (!id) {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await assertNotBlocked(page, PLATFORM);
      const html = await page.content();
      id = html.match(/"hotelId"\s*:\s*(\d+)/)?.[1] ?? html.match(/hotel_id["'=:\s]+(\d+)/i)?.[1];
    }
    if (!id) throw new ScrapeError(ScrapeOutcome.NOT_FOUND, 'Could not find an Agoda hotel id in that URL or page.');
    return { externalId: id, url, name: null };
  },

  async search({ name, location }, page) {
    await ensureOrigin(page);
    const q = encodeURIComponent(`${name} ${location ?? ''}`.trim());
    const json = await pageFetchJson(
      page,
      `/api/cronos/search/GetUnifiedSuggestResult/3/1/1/0/en-us/?searchText=${q}&origin=IN&cid=-1&pageTypeId=1&logTypeId=1&isHotelLandSearch=true`,
    );
    const items = Array.isArray(json?.ViewModelList) ? json.ViewModelList : [];
    return items
      .filter((v) => v.IsHotel && v.ObjectId)
      .slice(0, 8)
      .map((v) => ({
        externalId: String(v.ObjectId),
        name: clean(v.Name),
        url: v.ResultUrl ? `${ORIGIN}${v.ResultUrl}` : `${ORIGIN}/search?selectedproperty=${v.ObjectId}`,
        address: clean(v.ResultAddress ?? v.CityName),
        geo: v.Latitude && v.Longtitude ? { lat: v.Latitude, lng: v.Longtitude } : null,
        extra: { cityId: v.CityId },
      }));
  },

  async fetchListing(candidate, page) {
    await ensureOrigin(page);
    const json = await pageFetchJson(page, '/api/cronos/property/review/HotelReviews', reviewRequest(candidate.externalId, AGODA_PROVIDERS.agoda, 1));
    const summary = mapAgodaSummary(json);
    const notes = [];
    if (summary.providers.length > 1) {
      notes.push(`Agoda's overall score combines reviews from: ${summary.providers.join(', ')}.`);
    }
    return makeListing(PLATFORM, {
      externalId: candidate.externalId,
      url: candidate.url,
      name: summary.name ?? candidate.name,
      address: candidate.address ?? null,
      geo: candidate.geo ?? null,
      rating: summary.rating,
      reviewCount: summary.reviewCount,
      subscores: summary.subscores,
      notes,
    });
  },

  async fetchReviews(listing, { max }, page) {
    const reviews = await fetchAgodaProviderReviews(page, listing.externalId, AGODA_PROVIDERS.agoda, max);
    return { reviews, notes: [], sort: 'most_recent' };
  },
};
