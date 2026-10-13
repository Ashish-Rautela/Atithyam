/** Error with an HTTP status and a stable machine-readable code. */
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message, details) {
    return new AppError(400, 'BAD_REQUEST', message, details);
  }

  static notFound(message = 'Not found') {
    return new AppError(404, 'NOT_FOUND', message);
  }

  static conflict(message) {
    return new AppError(409, 'CONFLICT', message);
  }
}

/**
 * Outcome codes a scraper can report. They let the system tell
 * "the page loaded and there was nothing new" apart from "we could not read the page".
 */
export const ScrapeOutcome = Object.freeze({
  SUCCESS: 'SUCCESS',
  SUCCESS_NO_REVIEWS: 'SUCCESS_NO_REVIEWS',
  NEEDS_CONFIRMATION: 'NEEDS_CONFIRMATION',
  NOT_FOUND: 'NOT_FOUND',
  BLOCKED: 'BLOCKED',
  LAYOUT_CHANGED: 'LAYOUT_CHANGED',
  TIMEOUT: 'TIMEOUT',
  NETWORK_ERROR: 'NETWORK_ERROR',
  DISABLED: 'DISABLED',
  FAILED: 'FAILED',
});

/** Error thrown by adapters; `outcome` is one of ScrapeOutcome. */
export class ScrapeError extends Error {
  constructor(outcome, message, { snapshotPath, cause } = {}) {
    super(message, { cause });
    this.name = 'ScrapeError';
    this.outcome = outcome;
    this.snapshotPath = snapshotPath;
  }
}

/**
 * Classify any error thrown while scraping into { outcome, message } with a short,
 * human-readable message (first line only, no ANSI colour codes or Playwright call logs).
 */
export function classifyScrapeError(err) {
  if (err instanceof ScrapeError) return { outcome: err.outcome, message: err.message };
  const firstLine = String(err?.message ?? err).replace(/\u001b\[[0-9;]*m/g, '').split('\n')[0].trim();
  const net = firstLine.match(/net::(ERR_[A-Z_]+)/);
  if (net) {
    const url = firstLine.match(/https?:\/\/([^/\s]+)/)?.[1] ?? 'the site';
    return { outcome: ScrapeOutcome.NETWORK_ERROR, message: `Could not reach ${url} (${net[1]}). Check the internet connection of the machine running the server.` };
  }
  if (/timeout/i.test(`${err?.name} ${firstLine}`)) {
    return { outcome: ScrapeOutcome.TIMEOUT, message: `Timed out: ${firstLine.slice(0, 200)}` };
  }
  if (/Executable doesn't exist|browserType\.launch/i.test(firstLine)) {
    return { outcome: ScrapeOutcome.FAILED, message: 'Chromium is not installed for Playwright. Run: npm run browsers:install' };
  }
  return { outcome: ScrapeOutcome.FAILED, message: firstLine.slice(0, 300) };
}
