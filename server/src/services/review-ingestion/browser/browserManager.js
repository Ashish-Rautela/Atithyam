import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../../../shared/config/env.js';
import { logger } from '../../../shared/logging/logger.js';
import { ScrapeError, ScrapeOutcome } from '../../../shared/errors/AppError.js';
import { sleep, jitter } from '../../../shared/util/timing.js';

let contextPromise = null;

/**
 * One persistent Chromium profile shared by all adapters, so cookie/consent choices survive
 * restarts. The browser runs visibly by default (HEADLESS=false).
 *
 * Guardrails: no user-agent spoofing, no stealth plugins, no CAPTCHA solving, logged-out only.
 * If a site challenges us we stop and report BLOCKED.
 */
export async function getContext() {
  if (!contextPromise) {
    contextPromise = (async () => {
      const { chromium } = await import('playwright');
      await fs.mkdir(config.scraping.browserProfileDir, { recursive: true });
      const ctx = await chromium.launchPersistentContext(config.scraping.browserProfileDir, {
        headless: config.scraping.headless,
        ...(config.scraping.executablePath ? { executablePath: config.scraping.executablePath } : {}),
        locale: 'en-IN',
        timezoneId: 'Asia/Kolkata',
        viewport: { width: 1366, height: 900 },
      });
      ctx.setDefaultNavigationTimeout(config.scraping.navTimeoutMs);
      ctx.setDefaultTimeout(20000);
      ctx.on('close', () => {
        contextPromise = null;
      });
      logger.info({ headless: config.scraping.headless }, 'Browser started');
      return ctx;
    })().catch((err) => {
      contextPromise = null;
      throw err;
    });
  }
  return contextPromise;
}

/** Open a fresh page, run fn(page), always close the page. */
export async function withPage(fn) {
  const ctx = await getContext();
  const page = await ctx.newPage();
  try {
    return await fn(page);
  } finally {
    await page.close().catch(() => {});
  }
}

export async function closeBrowser() {
  if (contextPromise) {
    const ctx = await contextPromise.catch(() => null);
    contextPromise = null;
    await ctx?.close().catch(() => {});
  }
}

/** Random pause between page actions to keep request rates low. */
export function politePause(scale = 1) {
  return sleep(jitter(config.scraping.pauseMinMs * scale, config.scraping.pauseMaxMs * scale));
}

const BLOCK_PATTERNS = [
  /^\s*200-OK\s*$/, // MakeMyTrip's bot shield answers deep links without cookies with a bare "200-OK" page
  /verify you are (a )?human/i,
  /are you a robot/i,
  /unusual traffic from your computer/i,
  /access (is )?(temporarily )?(denied|restricted)/i,
  /please complete the security check/i,
  /press (&|and) hold/i,
  /checking (if the site connection is secure|your browser)/i,
  /request unsuccessful\. incapsula/i,
];

/** Returns a reason string when the page looks like a bot challenge, otherwise null. */
export async function detectBlock(page) {
  const url = page.url();
  if (/google\.[a-z.]+\/sorry\/|[/?&]captcha|\/challenge\b/i.test(url)) {
    return `challenge URL: ${url.slice(0, 120)}`;
  }
  // Only a *visible* challenge frame counts: many sites (e.g. Agoda) embed an invisible
  // reCAPTCHA iframe on every page, which is not a block.
  const challengeFrame = await page
    .evaluate(() =>
      [...document.querySelectorAll('iframe[src*="captcha-delivery.com"], iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[title*="challenge" i], iframe[title*="captcha" i]')]
        .some((f) => {
          const r = f.getBoundingClientRect();
          const st = getComputedStyle(f);
          return r.width > 80 && r.height > 80 && st.display !== 'none' && st.visibility !== 'hidden';
        }),
    )
    .catch(() => false);
  if (challengeFrame) return 'challenge iframe present';
  const text = await page
    .evaluate(() => (document.body?.innerText ?? '').slice(0, 4000))
    .catch(() => '');
  const hit = BLOCK_PATTERNS.find((re) => re.test(text));
  return hit ? `challenge text: ${hit}` : null;
}

/** Throw a BLOCKED ScrapeError (with a snapshot) if the page is a challenge. */
export async function assertNotBlocked(page, platform) {
  const reason = await detectBlock(page);
  if (reason) {
    const snapshotPath = await saveSnapshot(page, platform, 'blocked');
    throw new ScrapeError(ScrapeOutcome.BLOCKED, `${platform} showed a bot challenge (${reason}). Stopped without retrying.`, { snapshotPath });
  }
}

/** Save the page HTML for parser debugging. Returns the path, or null on failure. */
export async function saveSnapshot(page, platform, label) {
  try {
    const dir = path.join(config.scraping.rawSnapshotDir, platform);
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}-${label}.html`);
    await fs.writeFile(file, await page.content());
    return file;
  } catch {
    return null;
  }
}

/** Wait for any of the selectors; throws LAYOUT_CHANGED (with snapshot) if none appear. */
export async function waitForAny(page, selectors, platform, timeout = 20000) {
  try {
    // 'attached', not 'visible': some markers (e.g. JSON-LD <script> tags) are never visible.
    await page.waitForSelector(selectors.join(', '), { timeout, state: 'attached' });
  } catch (err) {
    await assertNotBlocked(page, platform);
    const snapshotPath = await saveSnapshot(page, platform, 'layout');
    throw new ScrapeError(
      ScrapeOutcome.LAYOUT_CHANGED,
      `${platform}: expected elements not found (${selectors.join(' | ')}). The page layout may have changed.`,
      { snapshotPath, cause: err },
    );
  }
}
