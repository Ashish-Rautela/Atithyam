import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function str(name, fallback) {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

function int(name, fallback) {
  const v = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(v) ? v : fallback;
}

function bool(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

/** Validated, frozen runtime configuration. Everything else reads config from here. */
export const config = Object.freeze({
  serverRoot,
  port: int('PORT', 4000),
  // Optional: serve the built UI (client/dist) from the API — used by the single-container AWS deployment.
  serveClientDir: str('SERVE_CLIENT_DIR', undefined),
  logLevel: str('LOG_LEVEL', 'info'),

  db: Object.freeze({
    url: str('DATABASE_URL', 'postgres://rip:rip@localhost:5432/rip'),
    // 'disable' locally; 'require' (encrypt, skip CA check) or 'verify' (needs DATABASE_SSL_CA) on AWS RDS.
    ssl: str('DATABASE_SSL', 'disable'),
    sslCaPath: str('DATABASE_SSL_CA', undefined),
    poolMax: int('DATABASE_POOL_MAX', 10),
    autoMigrate: bool('AUTO_MIGRATE', true),
  }),

  worker: Object.freeze({
    // 'embedded' = the API process also runs jobs (laptop); 'off' = API only (run `npm run worker` separately, e.g. on AWS).
    mode: str('WORKER_MODE', 'embedded'),
    concurrency: int('WORKER_CONCURRENCY', 1),
    pollMs: int('WORKER_POLL_MS', 2000),
    staleAfterSec: int('WORKER_STALE_AFTER_SEC', 600),
    schedulerEveryMin: int('SCHEDULER_EVERY_MIN', 10),
    // Collect a hotel's OTAs at the same time (different sites) once Google has been read.
    parallelPlatforms: bool('PARALLEL_PLATFORMS', true),
    // false (laptop default): the browser only runs for something you asked for — no automatic
    // 15-day refreshes, no collecting every hotel around a new one, and work left queued by an
    // earlier session is parked at start-up until you open that hotel or resume that city.
    // true (AWS worker): refreshes and neighbourhood collection run on their own.
    backgroundScraping: bool('BACKGROUND_SCRAPING', false),
    // Close the browser after this many seconds without scraping work (0 = keep it open).
    browserIdleCloseSec: int('BROWSER_IDLE_CLOSE_SEC', 60),
  }),

  data: Object.freeze({
    // Every hotel is refreshed about every N days; each gets a random offset ("salt") so refreshes spread out.
    refreshIntervalDays: int('REFRESH_INTERVAL_DAYS', 15),
    refreshJitterHours: int('REFRESH_JITTER_HOURS', 72),
    refreshBatch: int('REFRESH_BATCH', 25),
    refreshMaxReviews: int('REFRESH_MAX_REVIEWS', 30),
    seedMaxReviews: int('SEED_MAX_REVIEWS', 30),
    neighborRadiusKm: int('NEIGHBOR_RADIUS_KM', 5),
    onboardRadiusKm: int('ONBOARD_RADIUS_KM', 3),
    // A discovery search counts as covering a point for this long.
    discoveryFreshDays: int('DISCOVERY_FRESH_DAYS', 90),
    clusterEpsM: int('CLUSTER_EPS_M', 600),
    clusterMinPoints: int('CLUSTER_MIN_POINTS', 3),
    seedQueries: str('SEED_QUERIES', 'hotels,guest house,resort,homestay').split(',').map((q) => q.trim()).filter(Boolean),
    seedTileRadiusKm: Number(str('SEED_TILE_RADIUS_KM', '1.5')),
  }),

  ai: Object.freeze({
    // Google Gemini for aspect-sentiment and summaries. Without a key the offline lexicon is used.
    geminiKey: str('GEMINI_API_KEY', undefined),
    model: str('GEMINI_MODEL', 'gemini-3.6-flash'),
    fallbackModels: str('GEMINI_FALLBACK_MODELS', 'gemini-3.1-flash-lite,gemini-3-flash-preview,gemini-3.8-flash').split(',').map((m) => m.trim()).filter(Boolean),
    // Stay under the free-tier request limits; batches keep the number of requests small.
    rpm: int('GEMINI_RPM', 8),
    batchSize: int('GEMINI_BATCH_SIZE', 20),
    timeoutMs: int('GEMINI_TIMEOUT_MS', 60000),
    // Analysis jobs running at the same time (network-bound; the RPM limiter is shared).
    concurrency: int('ANALYSIS_CONCURRENCY', 1),
  }),

  scraping: Object.freeze({
    headless: bool('HEADLESS', false),
    // Optional: use an existing Chromium/Chrome binary instead of Playwright's bundled one.
    executablePath: str('CHROMIUM_EXECUTABLE_PATH', undefined),
    // On AWS point these at a mounted volume (EFS) so the browser profile survives container restarts.
    browserProfileDir: str('BROWSER_PROFILE_DIR', path.join(serverRoot, '.browser-profile')),
    rawSnapshotDir: str('RAW_SNAPSHOT_DIR', path.join(serverRoot, 'data', 'raw')),
    maxReviewsPerPlatform: int('MAX_REVIEWS_PER_PLATFORM', 60),
    pauseMinMs: int('PAUSE_MIN_MS', 1500),
    pauseMaxMs: int('PAUSE_MAX_MS', 4000),
    navTimeoutMs: int('NAV_TIMEOUT_MS', 45000),
    enabled: Object.freeze({
      google_maps: bool('ENABLE_GOOGLE_MAPS', true),
      booking: bool('ENABLE_BOOKING', true),
      agoda: bool('ENABLE_AGODA', true),
      makemytrip: bool('ENABLE_MAKEMYTRIP', true),
      // Off by default: Tripadvisor answers automated visits with a DataDome CAPTCHA.
      tripadvisor: bool('ENABLE_TRIPADVISOR', false),
    }),
  }),

  authorHashSalt: str('AUTHOR_HASH_SALT', 'dev-salt'),
});

if (!['embedded', 'off'].includes(config.worker.mode)) {
  throw new Error(`WORKER_MODE must be "embedded" or "off", got "${config.worker.mode}"`);
}
if (!['disable', 'require', 'verify'].includes(config.db.ssl)) {
  throw new Error(`DATABASE_SSL must be "disable", "require" or "verify", got "${config.db.ssl}"`);
}
