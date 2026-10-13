// Runs the in-browser extractors in a real Chromium against captured markup.
// Skipped automatically when no Chromium is available (run `npm run browsers:install`).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { extractGoogleReviewCards, extractGoogleFeedCards, parseFeedCard, extractGoogleTravelReviewCards } from '../../src/services/review-ingestion/adapters/googleMaps.js';
import { extractMmtReviewItems } from '../../src/services/review-ingestion/adapters/makemytrip.js';
import { extractTripadvisorCards } from '../../src/services/review-ingestion/adapters/tripadvisor.js';
import { detectBlock } from '../../src/services/review-ingestion/browser/browserManager.js';
import { GOOGLE_REVIEW_CARD, MMT_REVIEW_ITEM, TRIPADVISOR_CARD, GOOGLE_FEED_CARD, GOOGLE_TRAVEL_REVIEW_CARD } from '../fixtures/captured-markup.js';

const exe = process.env.CHROMIUM_EXECUTABLE_PATH;
const available = exe ? existsSync(exe) : existsSync(chromium.executablePath());

describe.skipIf(!available)('in-browser extractors vs captured markup', () => {
  let browser;
  let page;
  beforeAll(async () => {
    browser = await chromium.launch({ headless: true, ...(exe ? { executablePath: exe } : {}) });
    page = await browser.newPage();
  });
  afterAll(async () => browser?.close());

  it('Google Maps review card', async () => {
    await page.setContent(GOOGLE_REVIEW_CARD);
    const [r] = await page.$$eval('div[data-review-id].jftiEf', extractGoogleReviewCards);
    expect(r).toMatchObject({
      sourceReviewId: 'Ci9DQUlRQUNvZENodHljRjlvT2s4M1VqbG9kMk54VmkweFRtTklWbFJVTUROSlpGRRAB',
      ratingText: '5/5',
      publishedRaw: '2 months ago',
      source: 'Google',
      language: 'en',
    });
    expect(r.text).toMatch(/^We stayed at the JW Marriott/);
    expect(r.ownerReply).toMatch(/thank you for choosing us/);
  });

  it('MakeMyTrip review items', async () => {
    await page.setContent(MMT_REVIEW_ITEM);
    const items = await page.$$eval('.userRvs__item', extractMmtReviewItems);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ rating: '1.0', title: 'disappointed.', travellerType: 'family', stayMonth: 'Oct 2026', roomType: 'Premium Club Room' });
    expect(items[0].text).toMatch(/^Network issue/);
    expect(items[1].text).toBeNull(); // "This review does not contain any comments"
  });

  it('Tripadvisor review card', async () => {
    await page.setContent(TRIPADVISOR_CARD);
    const [r] = await page.$$eval('[data-test-target="HR_CC_CARD"]', extractTripadvisorCards);
    expect(r.href).toContain('-r1081567556-');
    expect(r.title).toBe('We wish to be here Soon Again ! Thank You');
    expect(r.bubble).toBe('5.0 of 5 bubbles');
    expect(r.written).toBe('Yesterday');
    expect(r.body).toMatch(/^Everthing was Good/);
  });

  it('Google Maps result-list card (nearby discovery)', async () => {
    await page.setContent(GOOGLE_FEED_CARD);
    const [raw] = await page.$$eval('div[role="feed"] a.hfpxzc', extractGoogleFeedCards);
    const c = parseFeedCard(raw);
    expect(c).toMatchObject({
      placeId: '0x3908d7cbe74607b9:0xc15c4fb2aac68aee',
      name: 'Hyatt Centric Dehradun',
      geo: { lat: 30.365875, lng: 78.070495 },
      rating: 4.3,
      reviewCount: 1300,
      starClass: 5,
      priceInr: 8850,
      sponsored: true,
    });
  });

  it('block detection ignores invisible reCAPTCHA frames but catches a visible challenge', async () => {
    await page.setContent('<p>Agoda home</p><iframe src="about:blank#recaptcha/api2/aframe" width="0" height="0" style="display:none"></iframe>');
    await page.evaluate(() => document.querySelector('iframe').setAttribute('src', 'https://www.google.com/recaptcha/api2/aframe'));
    expect(await detectBlock(page)).toBeNull();
    await page.setContent('<iframe title="DataDome CAPTCHA" width="600" height="600" style="display:block"></iframe>');
    expect(await detectBlock(page)).toMatch(/challenge iframe/);
    await page.setContent('<pre>200-OK</pre>');
    expect(await detectBlock(page)).toMatch(/challenge text/);
  });

  it('Google Hotels review cards (more Google reviews without signing in)', async () => {
    await page.setContent(GOOGLE_TRAVEL_REVIEW_CARD);
    const [a, b] = await page.$$eval('div.Svr5cf.bKhjM', extractGoogleTravelReviewCards);
    expect(a).toMatchObject({
      sourceReviewId: 'Ci9DQUlRQUNvZENodHljRjlvT2tVM09XNXBkbXBmWjNkM1UxVlRjVGx3WjBSR1VHYxAB',
      publishedRaw: '10 months ago',
      source: 'Google',
      ratingText: '1/5',
      truncated: false,
    });
    expect(a.text).toMatch(/^Not cooperative/);
    expect(b.tripLine).toBe('Vacation ❘ Family');
    expect(b.truncated).toBe(true);
    expect(b.text).not.toMatch(/Read more/);
  });
});
