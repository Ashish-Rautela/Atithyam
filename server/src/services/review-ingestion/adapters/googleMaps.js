import { ScrapeError, ScrapeOutcome } from '../../../shared/errors/AppError.js';
import { assertNotBlocked, politePause, waitForAny, saveSnapshot } from '../browser/browserManager.js';
import { clean, parseCount, parseDecimal, parseRupees, cityFromAddress, normalizeName, diceCoefficient } from '../../../shared/util/text.js';
import { isPoint } from '../../../shared/util/geo.js';
import { makeListing } from './adapterContract.js';

const PLATFORM = 'google_maps';

/* ----------------------------- pure parsers (unit-tested) ----------------------------- */

/** Extract {placeId, geo} from a Google Maps place URL (…!1s0x..:0x..!…!3d<lat>!4d<lng>…). */
export function parsePlaceUrl(url) {
  const placeId = url?.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i)?.[1] ?? null;
  const lat = url?.match(/!3d(-?\d+\.\d+)/)?.[1];
  const lng = url?.match(/!4d(-?\d+\.\d+)/)?.[1];
  let geo = lat && lng ? { lat: Number(lat), lng: Number(lng) } : null;
  if (!geo) {
    const at = url?.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (at) geo = { lat: Number(at[1]), lng: Number(at[2]) };
  }
  return { placeId, geo: isPoint(geo) ? geo : null };
}

/**
 * Normalise a Google Maps URL: drop tracking parameters, keep `hl=en`, and repair URLs saved by an
 * earlier version where the query string was glued onto the path ("…!19sChIJ…&hl=en&g_ep=…"),
 * which makes Google render an empty page.
 */
export function cleanPlaceUrl(url) {
  if (!url) return url;
  let s = String(url);
  const q = s.indexOf('?');
  const amp = s.indexOf('&');
  if (amp !== -1 && (q === -1 || amp < q)) s = s.slice(0, amp); // query glued onto the path
  try {
    const u = new URL(s);
    u.search = '';
    u.searchParams.set('hl', 'en');
    return u.toString();
  } catch {
    return s;
  }
}

/** Coordinates from a static-map URL (…center=30.29%2C78.07…). */
export function geoFromStaticMap(url) {
  const m = String(url ?? '').match(/center=(-?\d+\.\d+)(?:%2C|,)(-?\d+\.\d+)/i);
  if (!m) return null;
  const g = { lat: Number(m[1]), lng: Number(m[2]) };
  return isPoint(g) ? g : null;
}

/** "4.5\n(6,485)" -> { rating: 4.5, reviewCount: 6485 } */
export function parseRatingBlock(text) {
  if (!text) return { rating: null, reviewCount: null };
  const rating = parseDecimal(text.split('\n')[0]);
  const count = text.match(/\(([\d,.]+k?)\)/i)?.[1];
  return { rating: rating !== null && rating <= 5 ? rating : null, reviewCount: count ? parseCount(count) : null };
}

/** ["5 stars, 4,729 reviews", ...] -> [{ stars: 5, count: 4729 }, ...] */
export function parseHistogram(labels) {
  return (labels ?? [])
    .map((l) => l.match(/(\d)\s*stars?,\s*([\d,]+)\s*review/i))
    .filter(Boolean)
    .map((m) => ({ label: `${m[1]}★`, stars: Number(m[1]), count: parseCount(m[2]) }));
}

const PROVIDER_PLATFORM = [
  [/makemytrip/i, 'makemytrip'],
  [/booking\.com/i, 'booking'],
  [/^agoda/i, 'agoda'],
  [/tripadvisor/i, 'tripadvisor'],
];

/**
 * Parse the text of the Google Maps "Prices" tab into per-provider prices.
 * Only rows after "All options" are used (the "Featured" block repeats the same rows).
 */
export function parsePricesText(text, hotelName) {
  if (!text) return { checkIn: null, checkOut: null, prices: [] };
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const ci = lines.findIndex((l) => /^check in\s*\/\s*check out$/i.test(l));
  const checkIn = ci >= 0 ? lines[ci + 1] ?? null : null;
  const checkOut = ci >= 0 ? lines[ci + 2] ?? null : null;
  const start = lines.findIndex((l) => /^all options$/i.test(l));
  const body = start >= 0 ? lines.slice(start + 1) : lines;
  const seen = new Set();
  const prices = [];
  for (let i = 1; i < body.length; i++) {
    if (!/^₹\s?[\d,]+$/.test(body[i])) continue;
    let provider = body[i - 1];
    if (/bed|room|^see /i.test(provider)) continue;
    const isOfficial = hotelName && provider.toLowerCase() === hotelName.toLowerCase();
    if (isOfficial) provider = 'Official site';
    if (seen.has(provider)) continue;
    seen.add(provider);
    const next = body[i + 1] ?? '';
    const note = /cancellation|breakfast|wi-?fi|parking/i.test(next) ? next : null;
    const platform = PROVIDER_PLATFORM.find(([re]) => re.test(provider))?.[1] ?? null;
    prices.push({ provider, platform, priceInr: parseRupees(body[i]), note });
  }
  return { checkIn, checkOut, prices };
}

/**
 * Runs in the browser (serialised by Playwright): review card elements -> plain objects.
 * Exported so it can be tested against captured real markup.
 */
export function extractGoogleReviewCards(cards) {
  return cards.map((card) => {
    // textContent (not innerText) so this also works on hidden/unrendered nodes.
    const meta = (card.querySelector('.xRkPPb') ?? card.querySelector('.rsqaWe'))?.textContent ?? '';
    const [when, source] = meta.replace(/\s+/g, ' ').split(/\s+on\s+/i);
    return {
      sourceReviewId: card.getAttribute('data-review-id'),
      authorName: card.querySelector('.d4r55')?.textContent ?? null,
      ratingText: card.querySelector('.fzvQIb')?.textContent ?? card.querySelector('span.kvMYJc')?.getAttribute('aria-label') ?? null,
      publishedRaw: when?.trim() || null,
      source: source?.trim() || null,
      text: card.querySelector('.wiI7pd')?.textContent ?? null,
      language: card.querySelector('.MyEned')?.getAttribute('lang') ?? null,
      ownerReply: card.querySelector('.CDe7pd')?.innerText ?? null,
    };
  });
}


/** Join provider rows with the provider's outbound link; Google puts the destination in `pcurl`. */
export function attachPriceLinks(prices, links) {
  return prices.map((p) => {
    const link = links.find((l) => l.provider.toLowerCase() === p.provider.toLowerCase());
    let target = null;
    try {
      target = link ? new URL(link.href).searchParams.get('pcurl') : null;
    } catch {
      target = null;
    }
    return { ...p, url: target };
  });
}

/**
 * Turn the OTA destination URLs from Google's price list into direct listing links, keyed by
 * platform. This identifies the same physical hotel on each OTA without any name matching.
 */
export function otaLinkFromPcurl(platform, pcurl) {
  let u;
  try {
    u = new URL(pcurl);
  } catch {
    return null;
  }
  const q = (k) => u.searchParams.get(k);
  switch (platform) {
    case 'makemytrip': {
      const id = q('topHtlId') ?? q('hotelId');
      if (!id) return null;
      const d = new URL('https://www.makemytrip.com/hotels/hotel-details/');
      d.searchParams.set('hotelId', id);
      for (const k of ['city', 'country', 'checkin', 'checkout']) if (q(k)) d.searchParams.set(k, q(k));
      d.searchParams.set('roomStayQualifier', '2e0e');
      d.searchParams.set('_uCurrency', 'INR');
      return { externalId: id, url: d.toString() };
    }
    case 'agoda': {
      const id = q('hid') ?? q('hotel_id') ?? q('selectedproperty');
      return id ? { externalId: id, url: `https://www.agoda.com/partners/partnersearch.aspx?hid=${id}` } : null;
    }
    case 'booking': {
      const m = u.pathname.match(/\/hotel\/([a-z]{2})\/([^./]+)/i);
      return m ? { externalId: m[2], url: `https://www.booking.com/hotel/${m[1]}/${m[2]}.en-gb.html` } : null;
    }
    case 'tripadvisor': {
      const id = (pcurl.match(/-d(\d+)-/) ?? pcurl.match(/[?&](?:d|detail|locationId)=(\d+)/))?.[1];
      return id ? { externalId: id, url: pcurl.includes('Hotel_Review') ? pcurl.split('#')[0] : `https://www.tripadvisor.in/Hotel_Review-d${id}` } : null;
    }
    default:
      return null;
  }
}

/** { makemytrip: {externalId, url}, agoda: …, … } from the parsed price list. */
export function otaLinksFromPrices(prices) {
  const out = {};
  for (const p of prices ?? []) {
    if (!p.platform || !p.url || out[p.platform]) continue;
    const link = otaLinkFromPcurl(p.platform, p.url);
    if (link) out[p.platform] = link;
  }
  return out;
}


/* ------------------------------ nearby discovery (Step 2) ------------------------------ */

/** Runs in the browser: Google Maps result-list anchors (a.hfpxzc) -> plain objects. */
export function extractGoogleFeedCards(anchors) {
  return anchors.map((a) => {
    const card = a.closest('[role="article"]') ?? a.parentElement;
    const text = card?.innerText || card?.textContent || '';
    return {
      name: a.getAttribute('aria-label'),
      url: a.href,
      ratingText: card?.querySelector('span.MW4etd')?.textContent ?? null,
      countText: card?.querySelector('span.UY7F9')?.textContent ?? null,
      priceText: card?.querySelector('.wcldff')?.textContent ?? null,
      sponsored: Boolean(card?.querySelector('[aria-label="Sponsored"]')) || /(^|\n)Sponsored(\n|$)/.test(text),
      lines: text.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 12),
    };
  });
}

const LODGING_TYPES = [
  'hotel', 'resort hotel', 'resort', 'guest house', 'homestay', 'lodge', 'inn', 'hostel', 'bed & breakfast',
  'villa', 'cottage', 'serviced apartment', 'holiday home', 'motel', 'farmstay', 'camp', 'boutique hotel',
];

/** Normalise one feed card: coordinates, place id, rating, price, star class / lodging type. */
export function parseFeedCard(raw) {
  const { placeId, geo } = parsePlaceUrl(raw.url);
  const ratingIdx = raw.lines.findIndex((l) => /^\d\.\d\s*\(/.test(l));
  const after = ratingIdx >= 0 ? raw.lines.slice(ratingIdx + 1, ratingIdx + 4) : raw.lines.slice(1, 4);
  const starLine = raw.lines.find((l) => /^\d-star hotel$/i.test(l));
  const typeLine = after.find((l) => LODGING_TYPES.includes(l.toLowerCase())) ?? (starLine ? 'Hotel' : null);
  const priceText = raw.priceText ?? raw.lines.find((l) => /^₹[\d,]+$/.test(l)) ?? null;
  const night = raw.lines.find((l) => /\/night on /i.test(l));
  return {
    placeId,
    name: clean(raw.name),
    url: cleanPlaceUrl(raw.url),
    geo,
    rating: parseDecimal(raw.ratingText),
    reviewCount: parseCount(raw.countText),
    starClass: starLine ? Number(starLine[0]) : null,
    lodgingType: typeLine,
    priceInr: parseRupees(priceText),
    priceNote: clean(night),
    sponsored: Boolean(raw.sponsored),
    description: clean(after.find((l) => l.length > 18 && !/^₹/.test(l)) ?? null),
  };
}

/**
 * Parse a Google Maps place URL for an area: "/maps/place/Mussoorie,+Uttarakhand/@lat,lng,14z/…!3d…!4d…"
 * -> { displayName, region, center (the place pin, else the map centre), zoom, placeId }.
 */
export function parseAreaUrl(url) {
  const seg = url?.match(/\/maps\/place\/([^/@?]+)/)?.[1];
  const label = seg ? decodeURIComponent(seg.replace(/\+/g, ' ')).trim() : null;
  const [first, ...rest] = (label ?? '').split(',').map((p) => p.trim()).filter(Boolean);
  const zoom = Number(url?.match(/@-?\d+\.\d+,-?\d+\.\d+,(\d+(?:\.\d+)?)z/)?.[1]) || null;
  const { placeId, geo } = parsePlaceUrl(url);
  return { displayName: first ?? null, region: rest.join(', ') || null, center: geo, zoom, placeId };
}

/** Points to search around the centre: the centre itself plus 4 points at `offsetKm` (N, E, S, W). */
export function searchGrid(center, offsetKm) {
  if (!offsetKm) return [center];
  const dLat = offsetKm / 111.32;
  const dLng = offsetKm / (111.32 * Math.cos((center.lat * Math.PI) / 180));
  return [
    center,
    { lat: center.lat + dLat, lng: center.lng },
    { lat: center.lat, lng: center.lng + dLng },
    { lat: center.lat - dLat, lng: center.lng },
    { lat: center.lat, lng: center.lng - dLng },
  ];
}

/** Map zoom so that the visible area roughly covers the radius. */
export function zoomForRadius(radiusKm) {
  return radiusKm <= 1 ? 16 : radiusKm <= 2.5 ? 15 : radiusKm <= 6 ? 14 : 13;
}


/* ------------------------------ Google Hotels reviews ------------------------------ */

/** Runs in the browser: Google Hotels review cards (div.Svr5cf) -> plain objects. */
export function extractGoogleTravelReviewCards(cards) {
  return cards.map((card) => {
    const report = card.querySelector('a[href*="postId="]')?.getAttribute('href') ?? '';
    const id = (report.match(/postId=([^&]+)/) ?? [])[1] ?? null;
    const meta = (card.querySelector('.iUtr1')?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const [when, source] = meta.split(/\s+on\s+/i);
    const body = card.querySelector('.K7oBsc');
    const rawText = body ? (body.innerText || body.textContent || '') : '';
    const text = rawText.replace(/\s*Read more\s*$/i, '').trim();
    const lines = (card.innerText || card.textContent || '').split('\n').map((l) => l.trim());
    return {
      sourceReviewId: id ? decodeURIComponent(id) : null,
      authorName: card.querySelector('a.DHIhE')?.textContent ?? null,
      publishedRaw: when || null,
      source: source || null,
      ratingText: card.querySelector('.GDWaad')?.textContent ?? null,
      text: text || null,
      truncated: /…$/.test(text),
      tripLine: lines.find((l) => l.includes('❘')) ?? null,
    };
  });
}

function isLodging(listing) {
  return Boolean(listing.prices?.length || listing.starClass || /hotel|resort|guest ?house|homestay|lodge|inn|hostel|villa|cottage|stay/i.test(`${listing.category ?? ''} ${listing.name ?? ''}`));
}

const SORTS = ['Most recent', 'Lowest score', 'Highest score', 'Most helpful'];

async function fetchTravelReviews(listing, { max }, page) {
  const q = `${listing.name} ${cityFromAddress(listing.address) ?? ''}`.trim();
  await page.goto(`https://www.google.com/travel/search?q=${encodeURIComponent(q)}&hl=en&gl=in`, { waitUntil: 'domcontentloaded' });
  await assertNotBlocked(page, PLATFORM);
  await page.waitForTimeout(3500);

  // Continue only on this exact property's page. When Google shows a list of hotels instead,
  // open the result whose name matches.
  const titleName = async () => (await page.title()).replace(/\s*[-–|]\s*Google (hotels|travel|search).*$/i, '').trim();
  const reviewsTab = page.getByRole('tab', { name: /^Reviews$/ });
  let entity = await titleName();
  let sim = diceCoefficient(normalizeName(entity), normalizeName(listing.name));
  if (sim < 0.6 || !(await reviewsTab.count())) {
    const links = await page.$$eval('a[href*="/travel/hotels/"]', (as) =>
      as.map((a) => ({ href: a.href, text: (a.getAttribute('aria-label') ?? a.innerText ?? '').split('\n')[0].trim() })).filter((l) => l.text && /\/entity\//.test(l.href)),
    ).catch(() => []);
    const best = links
      .map((l) => ({ ...l, score: diceCoefficient(normalizeName(l.text), normalizeName(listing.name)) }))
      .sort((a, b) => b.score - a.score)[0];
    if (best && best.score >= 0.6) {
      await page.goto(best.href, { waitUntil: 'domcontentloaded' });
      await assertNotBlocked(page, PLATFORM);
      await page.waitForTimeout(3000);
      entity = await titleName();
      sim = Math.max(best.score, diceCoefficient(normalizeName(entity), normalizeName(listing.name)));
    }
  }
  if (sim < 0.6 || !(await reviewsTab.count())) {
    const snapshotPath = await saveSnapshot(page, PLATFORM, 'google-hotels').catch(() => null);
    return {
      reviews: [],
      views: 0,
      notes: [`Google Hotels did not open this property (page: "${entity.slice(0, 60)}", match ${Math.round(sim * 100)}%), so only the Google Maps reviews were read.${snapshotPath ? ` Page saved to ${snapshotPath}.` : ''}`],
    };
  }
  await reviewsTab.first().click();
  await page.waitForSelector('div.Svr5cf.bKhjM', { state: 'attached', timeout: 15000 });
  await page.waitForTimeout(1500);

  const collected = new Map();
  let views = 0;
  const harvest = async () => {
    views++;
    const more = page.locator('div.Svr5cf.bKhjM span[role="button"][jsname="kDNJsb"]:visible');
    const n = Math.min(await more.count(), 12);
    for (let i = 0; i < n; i++) await more.nth(i).click({ timeout: 2000 }).catch(() => {});
    if (n) await page.waitForTimeout(800);
    const raw = await page.$$eval('div.Svr5cf.bKhjM', extractGoogleTravelReviewCards);
    for (const r of raw) {
      if (!r.sourceReviewId || !/google/i.test(r.source ?? '')) continue; // other sites' reviews are only excerpts
      const prev = collected.get(r.sourceReviewId);
      if (!prev || (r.text?.length ?? 0) > (prev.text?.length ?? 0)) collected.set(r.sourceReviewId, r);
    }
  };
  const selectSort = async (label) => {
    const current = page.locator('[role="option"]:visible').filter({ hasText: /^(Most helpful|Most recent|Highest score|Lowest score)$/ }).first();
    await current.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(500);
    await page.locator('[role="option"]:visible').filter({ hasText: new RegExp(`^${label}$`) }).first().click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(2500);
  };

  await harvest();
  const chips = await page.$$eval('button', (bs) =>
    [...new Set(bs.filter((b) => /^[A-Za-z &]+ \(\d+\)$/.test(b.innerText.trim()) && b.getBoundingClientRect().width > 0).map((b) => b.innerText.trim()))].slice(0, 8),
  );
  outer: for (const chip of [null, ...chips]) {
    if (chip) {
      await page.locator('button:visible').filter({ hasText: chip }).first().click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(2500);
    }
    for (const sort of SORTS) {
      if (collected.size >= max) break outer;
      await selectSort(sort);
      await harvest();
      await politePause(0.4);
    }
    if (chip) {
      await page.locator('button:visible').filter({ hasText: chip }).first().click({ timeout: 3000 }).catch(() => {}); // deselect
      await page.waitForTimeout(1500);
    }
  }

  const reviews = [...collected.values()].map((r) => ({
    sourceReviewId: r.sourceReviewId,
    authorName: r.authorName,
    rating: parseDecimal(r.ratingText),
    scaleMax: 5,
    publishedRaw: r.publishedRaw,
    text: r.text,
    travellerType: r.tripLine ? r.tripLine.replace(/\s*❘\s*/g, ' · ') : null,
  }));
  const truncated = [...collected.values()].filter((r) => r.truncated).length;
  return {
    reviews,
    views,
    notes: truncated ? [`${truncated} Google Hotels review text(s) are shortened ("…") as Google shows them.`] : [],
  };
}

/* ------------------------------------ adapter ------------------------------------ */

async function dismissConsent(page) {
  if (/consent\.google\./.test(page.url())) {
    // Choose the privacy-preserving option.
    const reject = page.getByRole('button', { name: /reject all/i });
    if (await reject.count()) {
      await reject.first().click();
      await page.waitForLoadState('domcontentloaded');
    }
  }
}

/**
 * Google keeps the /maps/search/… URL for a moment after showing a place, then switches to
 * /maps/place/… (which carries the place id and coordinates). Wait for that switch.
 */
async function waitForPlaceUrl(page) {
  await page.waitForURL(/\/maps\/place\//, { timeout: 15000 }).catch(() => {});
  // The URL keeps updating with the !3d/!4d coordinates shortly after.
  await page.waitForFunction(() => /!3d-?\d|@-?\d+\.\d+,-?\d+\.\d+/.test(location.href), null, { timeout: 8000 }).catch(() => {});
}

async function dismissSignInPrompt(page) {
  const dismiss = page.getByRole('button', { name: /^dismiss$/i });
  if (await dismiss.count().catch(() => 0)) await dismiss.first().click().catch(() => {});
}

export const googleMaps = {
  platform: PLATFORM,
  label: 'Google Maps',
  anchor: true,

  hosts: ['google.com', 'google.co.in', 'maps.app.goo.gl'],

  async fromUrl(url) {
    const clean = cleanPlaceUrl(url);
    const { placeId, geo } = parsePlaceUrl(clean);
    return { externalId: placeId ?? clean, url: clean, name: null, geo };
  },

  async search({ name, location }, page) {
    const q = `${name} ${location ?? ''}`.trim();
    await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(q)}?hl=en`, { waitUntil: 'domcontentloaded' });
    await dismissConsent(page);
    await assertNotBlocked(page, PLATFORM);
    await waitForAny(page, ['div[role="feed"]', 'h1.DUwDvf', 'div.F7nice'], PLATFORM);
    await page.waitForTimeout(1500);

    // Google jumps straight to the place page when the query is unambiguous.
    if (!(await page.locator('div[role="feed"]').count())) {
      await waitForPlaceUrl(page);
      const listing = await extractPlace(page);
      return [{ externalId: listing.externalId, name: listing.name, url: listing.url, address: listing.address, geo: listing.geo, rating: listing.rating?.value ?? null, reviewCount: listing.reviewCount, category: listing.category }];
    }

    const results = await page.$$eval('div[role="feed"] a.hfpxzc', (anchors) =>
      anchors.slice(0, 8).map((a) => {
        const card = a.closest('div.Nv2PK') ?? a.parentElement;
        const lines = (card?.innerText ?? '').split('\n').map((s) => s.trim()).filter(Boolean);
        return {
          name: a.getAttribute('aria-label'),
          url: a.href,
          ratingText: card?.querySelector('span.MW4etd')?.textContent ?? null,
          countText: card?.querySelector('span.UY7F9')?.textContent ?? null,
          lines,
        };
      }),
    );
    return results.map((r) => {
      const { placeId, geo } = parsePlaceUrl(r.url);
      const info = r.lines.find((l) => l.includes('·')) ?? null;
      return {
        externalId: placeId ?? r.url,
        name: clean(r.name),
        url: r.url,
        geo,
        rating: parseDecimal(r.ratingText),
        reviewCount: parseCount(r.countText),
        address: clean(info),
        category: clean(info?.split('·')[0]),
      };
    });
  },


  /**
   * Step 2: list lodging around a point. Signed-out Google Maps shows only ~8–10 results per
   * search ("limited view"), so several searches (query × grid point) are combined and
   * de-duplicated by place id. onProgress(message) is called after each search.
   */
  /**
   * Resolve a city/town name to Google's place: canonical name, region, centre pin and the zoom
   * Google uses to frame it (which gives a sensible seeding radius). Verified 13 Oct 2026:
   * "Mussoorie" -> /maps/place/Mussoorie,+Uttarakhand/@30.4547,78.0764,14z/data=…!3d30.4547!4d78.0819…
   */
  async resolveArea(name, page) {
    await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(name)}?hl=en`, { waitUntil: 'domcontentloaded' });
    await dismissConsent(page);
    await assertNotBlocked(page, PLATFORM);
    await waitForAny(page, ['div[role="feed"]', 'h1'], PLATFORM);
    await page.waitForTimeout(1500);
    if (await page.locator('div[role="feed"] a.hfpxzc').count()) {
      // Ambiguous name: Google lists several places; take the first.
      const href = await page.locator('div[role="feed"] a.hfpxzc').first().getAttribute('href');
      await page.goto(href, { waitUntil: 'domcontentloaded' });
    }
    await waitForPlaceUrl(page);
    const url = page.url();
    const area = parseAreaUrl(url);
    if (!area.center) {
      const snapshotPath = await saveSnapshot(page, PLATFORM, 'area');
      throw new ScrapeError(ScrapeOutcome.NOT_FOUND, `Google Maps did not resolve "${name}" to a place.`, { snapshotPath });
    }
    const h1 = await page.locator('h1').first().textContent({ timeout: 5000 }).catch(() => null);
    return { ...area, displayName: clean(h1) ?? area.displayName, url: cleanPlaceUrl(url) };
  },

  /**
   * Hotels around a point. `offsets` (default) also searches 4 points around the centre with the main
   * query; city seeding turns it off because its tiles already form a dense grid.
   */
  async discoverNearby({ center, radiusKm, queries, maxSearches = 12, onProgress, offsets = true }, page) {
    const zoom = zoomForRadius(radiusKm);
    const points = offsets ? searchGrid(center, radiusKm >= 1.5 ? radiusKm / 2 : 0) : [center];
    const plan = [];
    for (const q of queries) {
      // The main query uses the whole grid; extra lodging types only the centre.
      for (const p of q === queries[0] ? points : [center]) plan.push({ q, p });
    }
    const byId = new Map();
    const searches = [];
    for (const { q, p } of plan.slice(0, maxSearches)) {
      const url = `https://www.google.com/maps/search/${encodeURIComponent(q)}/@${p.lat.toFixed(6)},${p.lng.toFixed(6)},${zoom}z?hl=en`;
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await dismissConsent(page);
      await assertNotBlocked(page, PLATFORM);
      let found = 0;
      try {
        await page.waitForSelector('div[role="feed"] a.hfpxzc', { timeout: 15000 });
        // Real mouse-wheel scrolling: the result list ignores programmatic scrollTop changes.
        const box = await page.locator('div[role="feed"]').first().boundingBox();
        let last = 0;
        for (let i = 0; i < 8; i++) {
          if (box) {
            await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height - 20, 400));
            await page.mouse.wheel(0, 2500);
          }
          await page.waitForTimeout(1500);
          const n = await page.locator('div[role="feed"] a.hfpxzc').count();
          const limited = await page.getByText(/limited view of Google Maps|reached the end of the list/i).count().catch(() => 0);
          if (n === last || limited) break;
          last = n;
        }
        const raw = await page.$$eval('div[role="feed"] a.hfpxzc', extractGoogleFeedCards);
        for (const r of raw.map(parseFeedCard)) {
          if (!r.placeId) continue;
          found++;
          const prev = byId.get(r.placeId);
          byId.set(r.placeId, prev ? { ...r, ...Object.fromEntries(Object.entries(prev).filter(([, v]) => v !== null && v !== undefined)), foundBy: [...prev.foundBy, q] } : { ...r, foundBy: [q] });
        }
      } catch {
        // A query with no result list (e.g. no homestays nearby) is not an error.
      }
      searches.push({ query: q, at: p, results: found });
      onProgress?.(`Searched "${q}" (${searches.length}/${Math.min(plan.length, maxSearches)}), ${byId.size} unique places so far`);
      await politePause(0.6);
    }
    return { places: [...byId.values()], searches };
  },

  async fetchListing(candidate, page) {
    const url = cleanPlaceUrl(candidate.url);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await dismissConsent(page);
    await assertNotBlocked(page, PLATFORM);
    await waitForAny(page, ['h1.DUwDvf', 'div.F7nice', 'button[data-item-id="address"]'], PLATFORM);
    await waitForPlaceUrl(page);
    await page.waitForTimeout(1200);
    const listing = await extractPlace(page);

    // Prices tab (hotels only): OTA prices for Google's default dates.
    const pricesTab = page.locator('button[role="tab"][aria-label^="Prices"]');
    if (await pricesTab.count()) {
      await politePause(0.5);
      await pricesTab.first().click().catch(() => {});
      await page.waitForTimeout(3500);
      const { text, links } = await page
        .evaluate(() => {
          const pane = document.querySelector('div.m6QErb.DxyBCb.kA9KIf.dS8AEf') ?? document.querySelector('div[role="main"]');
          const links = [...(pane?.querySelectorAll('a[href*="/travel/lodging/clk"]') ?? [])]
            .map((a) => ({ provider: (a.innerText || '').split('\n')[0].trim(), href: a.href }))
            .filter((l) => l.provider);
          return { text: pane?.innerText ?? '', links };
        })
        .catch(() => ({ text: '', links: [] }));
      const parsed = parsePricesText(text, listing.name);
      listing.prices = attachPriceLinks(parsed.prices, links);
      listing.otaLinks = otaLinksFromPrices(listing.prices);
      if (parsed.prices.length) {
        listing.priceNote = `Lowest of ${parsed.prices.length} prices Google shows for ${parsed.checkIn ?? '?'} → ${parsed.checkOut ?? '?'} (2 adults). Snapshot only.`;
        const amounts = parsed.prices.map((p) => p.priceInr).filter(Number.isFinite);
        listing.priceInr = amounts.length ? Math.min(...amounts) : null;
      }
    }
    return listing;
  },

  /**
   * Google Maps shows signed-out visitors only ~5 reviews. For lodging, Google Hotels shows the
   * same Google reviews 10 at a time, with 4 sort orders and topic filters (Service, Dining…).
   * Combining those views (and the Maps ones) yields far more of the property's real reviews,
   * still without signing in. Reviews are de-duplicated by Google's review id.
   */
  async fetchReviews(listing, opts, page) {
    let mapsError = null;
    const maps = await this.fetchMapsReviews(listing, opts, page).catch((err) => {
      mapsError = err;
      return { reviews: [], notes: [], sort: 'most_relevant' };
    });
    const wantMore = isLodging(listing) && maps.reviews.length < opts.max && (listing.reviewCount ?? Infinity) > maps.reviews.length;
    if (!wantMore) {
      if (mapsError) throw mapsError;
      return maps;
    }
    try {
      const travel = await fetchTravelReviews(listing, opts, page);
      if (!travel.reviews.length && mapsError) throw mapsError;
      const byId = new Map();
      for (const r of [...maps.reviews, ...travel.reviews]) {
        const key = r.sourceReviewId ?? `${r.authorName}|${r.text?.slice(0, 60)}`;
        const prev = byId.get(key);
        if (!prev || (r.text?.length ?? 0) > (prev.text?.length ?? 0)) byId.set(key, { ...prev, ...r });
      }
      const reviews = [...byId.values()].slice(0, opts.max);
      const notes = maps.notes.filter((n) => !/signed-out visitors/.test(n));
      notes.push(...travel.notes);
      if (reviews.length < (listing.reviewCount ?? 0)) {
        notes.push(`Collected ${reviews.length} of ${listing.reviewCount} Google reviews without signing in (Google Maps + ${travel.views} Google Hotels views: sort orders × topics).`);
      }
      return { reviews, notes, sort: travel.reviews.length ? 'mixed_views' : maps.sort };
    } catch (err) {
      if (err === mapsError) throw err;
      if (mapsError) throw mapsError;
      return { ...maps, notes: [...maps.notes, `Google Hotels reviews could not be read (${String(err.message).split('\n')[0].slice(0, 120)}); kept the Google Maps reviews.`] };
    }
  },

  async fetchMapsReviews(listing, { max }, page) {
    const notes = [];
    if (!page.url().includes('/maps/place/')) {
      await page.goto(listing.url, { waitUntil: 'domcontentloaded' });
      await assertNotBlocked(page, PLATFORM);
      await waitForPlaceUrl(page);
    }
    const tab = page.locator('button[role="tab"][aria-label^="Reviews"]');
    await tab.first().waitFor({ state: 'attached', timeout: 15000 }).catch(() => {});
    if (!(await tab.count())) {
      return { reviews: [], notes: ['No Reviews tab on this Google listing.'], sort: 'most_relevant' };
    }
    await politePause(0.5);
    await tab.first().click();
    await waitForAny(page, ['div[data-review-id].jftiEf'], PLATFORM);
    await page.waitForTimeout(1500);

    // Histogram (only rendered on the Reviews tab).
    const histogram = await page.$$eval('tr[aria-label]', (rows) => rows.map((r) => r.getAttribute('aria-label'))).catch(() => []);
    listing.ratingDistribution = parseHistogram(histogram);

    // Scroll the review pane until we have `max` reviews or Google stops loading more
    // (signed-out visitors only get a handful before a sign-in prompt).
    let lastCount = 0;
    let stagnant = 0;
    for (let i = 0; i < 40; i++) {
      const count = await page.locator('div[data-review-id].jftiEf').count();
      if (count >= max) break;
      stagnant = count === lastCount ? stagnant + 1 : 0;
      if (stagnant >= 3) break;
      lastCount = count;
      await page.evaluate(() => {
        const first = document.querySelector('div[data-review-id].jftiEf');
        let el = first?.parentElement;
        while (el && !(el.scrollHeight > el.clientHeight + 50 && /auto|scroll/.test(getComputedStyle(el).overflowY))) el = el.parentElement;
        if (el) el.scrollTop = el.scrollHeight;
      });
      await politePause(0.5);
      await dismissSignInPrompt(page);
    }
    const signInWall = await page.getByText(/sign-?in to get the best of google maps/i).count().catch(() => 0);
    await dismissSignInPrompt(page);

    // Expand truncated texts.
    await page.$$eval('div[data-review-id].jftiEf button.w8nwRe', (buttons) => buttons.forEach((b) => b.click())).catch(() => {});
    await page.waitForTimeout(800);

    const raw = await page.$$eval('div[data-review-id].jftiEf', extractGoogleReviewCards);

    if (!raw.length) {
      const snapshotPath = await saveSnapshot(page, PLATFORM, 'no-reviews');
      throw new ScrapeError(ScrapeOutcome.LAYOUT_CHANGED, 'Google Maps: review cards not found after opening the Reviews tab.', { snapshotPath });
    }
    if (signInWall || raw.length < Math.min(max, listing.reviewCount ?? max)) {
      notes.push(`Google shows only ${raw.length} reviews to signed-out visitors; the listing has ${listing.reviewCount ?? 'more'} in total. This tool does not sign in.`);
    }

    const reviews = raw.slice(0, max).map((r) => {
      const syndicated = r.source && !/^google$/i.test(r.source) ? r.source : null;
      return {
        sourceReviewId: r.sourceReviewId,
        authorName: r.authorName,
        rating: parseDecimal(r.ratingText),
        scaleMax: 5,
        publishedRaw: r.publishedRaw,
        text: r.text,
        language: r.language,
        ownerReply: r.ownerReply?.replace(/^response from the owner[^\n]*\n/i, '') ?? null,
        syndicatedFrom: syndicated,
      };
    });
    return { reviews, notes, sort: 'most_relevant' };
  },
};

async function extractPlace(page) {
  const data = await page.evaluate(() => {
    const txt = (sel) => document.querySelector(sel)?.textContent?.trim() ?? null;
    const aria = (sel) => document.querySelector(sel)?.getAttribute('aria-label') ?? null;
    const h1 = [...document.querySelectorAll('h1')].map((h) => h.textContent.trim()).find((t) => t && !/^sponsored$/i.test(t));
    const starText = [...document.querySelectorAll('span')].map((s) => s.textContent).find((t) => /\d-star hotel/i.test(t ?? ''));
    return {
      name: h1 ?? null,
      ratingBlock: document.querySelector('div.F7nice')?.innerText ?? null,
      category: txt('button[jsaction*="category"]'),
      starText: starText ?? null,
      address: aria('button[data-item-id="address"]'),
      phone: aria('button[data-item-id^="phone"]'),
      website: document.querySelector('a[data-item-id="authority"]')?.href ?? null,
      amenities: [...document.querySelectorAll('div[role="region"] li, .QoXOEc')].map((e) => e.textContent.trim()).filter(Boolean).slice(0, 20),
    };
  });
  if (!data.name) {
    const snapshotPath = await saveSnapshot(page, PLATFORM, 'place');
    throw new ScrapeError(ScrapeOutcome.LAYOUT_CHANGED, 'Google Maps: place name (h1) not found.', { snapshotPath });
  }
  const url = page.url();
  const parsed = parsePlaceUrl(url);
  const placeId = parsed.placeId;
  let geo = parsed.geo;
  if (!geo) {
    // Fallback: the place's static-map preview image carries its centre coordinates.
    const metaUrl = await page
      .evaluate(() => [...document.querySelectorAll('meta[content*="center="], img[src*="center="]')].map((e) => e.getAttribute('content') ?? e.getAttribute('src'))[0] ?? null)
      .catch(() => null);
    geo = geoFromStaticMap(metaUrl);
  }
  const { rating, reviewCount } = parseRatingBlock(data.ratingBlock);
  return makeListing(PLATFORM, {
    externalId: placeId ?? url.split('/data=')[0],
    url,
    name: clean(data.name),
    address: clean(data.address?.replace(/^address:\s*/i, '')),
    phone: clean(data.phone?.replace(/^phone:\s*/i, '')),
    website: data.website,
    category: clean(data.category),
    starClass: data.starText ? Number(data.starText.match(/(\d)-star/i)[1]) : null,
    geo,
    rating: rating !== null ? { value: rating, scaleMax: 5 } : null,
    reviewCount,
    amenities: [...new Set(data.amenities)],
  });
}
