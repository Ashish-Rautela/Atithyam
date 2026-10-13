import { randomUUID } from 'node:crypto';
import { getPool, many, one, query } from '../shared/db/pool.js';

/** Priorities: higher runs first. A user waiting on screen always beats background seeding. */
export const PRIORITY = Object.freeze({
  USER: 100, // the user's own hotel, manual re-collect / fix
  DISCOVERY: 90, // finding hotels around a user's hotel
  COMPETITOR_SELECTED: 80, // competitors the user selected (or the default set)
  NEIGHBOR: 60, // every other hotel near a new user's hotel
  SEED_DISCOVERY: 50, // seeding: finding hotels in a city
  SEED: 40, // seeding: collecting each hotel in a city
  REFRESH: 20, // scheduled 15-day refresh
});

const iso = (d) => (d ? new Date(d).toISOString() : null);

/** DB row -> API shape (compatible with the earlier job objects: options + platforms). */
export function toJob(r) {
  if (!r) return null;
  return {
    jobId: r.id,
    kind: r.kind,
    bizId: r.hotel_id,
    hotelId: r.hotel_id,
    cityId: r.city_id,
    parentId: r.parent_id,
    reason: r.reason,
    status: r.status,
    priority: r.priority,
    options: r.payload,
    progress: r.progress,
    // jsonb does not keep key order; restore the collection order.
    platforms: Object.fromEntries(
      [...(r.payload?.platforms ?? []), ...Object.keys(r.progress?.platforms ?? {})]
        .filter((p, i, a) => a.indexOf(p) === i && r.progress?.platforms?.[p])
        .map((p) => [p, r.progress.platforms[p]]),
    ),
    message: r.message,
    outcome: r.outcome,
    error: r.error,
    attempts: r.attempts,
    maxAttempts: r.max_attempts,
    createdAt: iso(r.created_at),
    startedAt: iso(r.started_at),
    finishedAt: iso(r.finished_at),
    // Held = queued but parked until something asks for it (see holdQueued).
    held: r.status === 'queued' && isInfinite(r.run_after),
  };
}

const isInfinite = (d) => d === Infinity || String(d) === 'infinity' || (d instanceof Date && !Number.isFinite(d.getTime()));

/**
 * Queue a job. With a `dedupeKey`, a second request while one is queued/running returns the
 * existing job instead (and raises its priority if the new request is more urgent).
 * Returns { job, created }.
 */
export async function enqueue({ kind, hotelId = null, cityId = null, parentId = null, reason = null, priority = 0, payload = {}, progress = {}, dedupeKey = null, maxAttempts = 2, runAfter = null }) {
  // Retry: the conflicting job may finish between our INSERT and UPDATE.
  for (let attempt = 0; attempt < 3; attempt++) {
    const id = randomUUID();
    const inserted = await one(
      `INSERT INTO jobs (id, kind, hotel_id, city_id, parent_id, reason, priority, payload, progress, dedupe_key, max_attempts, run_after, message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, COALESCE($12, now()), 'Waiting…')
       ON CONFLICT (dedupe_key) WHERE status IN ('queued', 'running') DO NOTHING
       RETURNING *`,
      [id, kind, hotelId, cityId, parentId, reason, priority, JSON.stringify(payload), JSON.stringify(progress), dedupeKey, maxAttempts, runAfter],
    );
    if (inserted) return { job: toJob(inserted), created: true };
    const existing = await one(
      // Asking again for a parked job (see holdQueued) releases it.
      `UPDATE jobs SET priority = GREATEST(priority, $2),
              run_after = CASE WHEN run_after = 'infinity' THEN COALESCE($3::timestamptz, now()) ELSE run_after END,
              message = CASE WHEN run_after = 'infinity' THEN 'Waiting…' ELSE message END
        WHERE dedupe_key = $1 AND status IN ('queued', 'running') RETURNING *`,
      [dedupeKey, priority, runAfter],
    );
    if (existing) return { job: toJob(existing), created: false };
  }
  throw new Error(`Could not queue job ${dedupeKey}`);
}

/**
 * Park queued jobs of these kinds (run_after = infinity) so no worker picks them up. Used at start-up
 * when background scraping is off: work left over from an earlier session waits until it is asked for.
 */
export async function holdQueued(kinds, message) {
  return many(
    `UPDATE jobs SET run_after = 'infinity', message = $2
      WHERE status = 'queued' AND kind = ANY($1) AND run_after <> 'infinity'
      RETURNING id, kind, hotel_id, city_id`,
    [kinds, message],
  );
}

/** Release parked jobs for these hotels and/or this city. Returns how many. */
export async function resumeHeld({ hotelIds = [], cityId = null } = {}) {
  const { rows } = await query(
    `UPDATE jobs SET run_after = now(), message = 'Waiting…'
      WHERE status = 'queued' AND run_after = 'infinity' AND (hotel_id = ANY($1) OR ($2::int IS NOT NULL AND city_id = $2))
      RETURNING id`,
    [hotelIds, cityId],
  );
  return rows.length;
}

/** Make a queued job that is waiting for a later start eligible to run now. */
export async function expedite(dedupeKey) {
  await query(`UPDATE jobs SET run_after = now() WHERE dedupe_key = $1 AND status = 'queued' AND run_after > now()`, [dedupeKey]);
}

export async function getJob(id) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id))) return null;
  return toJob(await one('SELECT * FROM jobs WHERE id = $1', [id]));
}

export async function latestJob({ hotelId, cityId, kind }) {
  return toJob(
    await one(
      `SELECT * FROM jobs WHERE ($1::text IS NULL OR hotel_id = $1) AND ($2::int IS NULL OR city_id = $2) AND ($3::text IS NULL OR kind = $3)
        ORDER BY created_at DESC LIMIT 1`,
      [hotelId ?? null, cityId ?? null, kind ?? null],
    ),
  );
}

export async function latestJobsFor(hotelIds, kind = 'profile') {
  if (!hotelIds.length) return new Map();
  const rows = await many(
    `SELECT DISTINCT ON (hotel_id) * FROM jobs WHERE hotel_id = ANY($1) AND kind = $2 ORDER BY hotel_id, created_at DESC`,
    [hotelIds, kind],
  );
  return new Map(rows.map((r) => [r.hotel_id, toJob(r)]));
}

/** Atomically take the most urgent runnable job. */
export async function claimNext(workerId, kinds = null) {
  return toJob(
    await one(
      `UPDATE jobs SET status = 'running', locked_by = $1, heartbeat_at = now(), started_at = now(), attempts = attempts + 1,
              message = 'Starting…'
        WHERE id = (SELECT id FROM jobs WHERE status = 'queued' AND run_after <= now() AND ($2::text[] IS NULL OR kind = ANY($2))
                     ORDER BY priority DESC, created_at FOR UPDATE SKIP LOCKED LIMIT 1)
        RETURNING *`,
      [workerId, kinds],
    ),
  );
}

export async function heartbeat(id) {
  await query(`UPDATE jobs SET heartbeat_at = now() WHERE id = $1 AND status = 'running'`, [id]);
}

// Writes from a handler carry the run's attempt number: once a job has been re-queued and claimed
// again, a late write from the earlier run (e.g. after a timeout) is ignored.
const ref = (j) => (typeof j === 'object' && j ? { id: j.jobId, attempt: j.attempts ?? null } : { id: j, attempt: null });

/** Set top-level fields (status, message, outcome, error, progress). Pass the job (preferred) or its id. */
export async function updateJob(job, { status, message, outcome, error, progress, finished } = {}) {
  const { id, attempt } = ref(job);
  await query(
    `UPDATE jobs SET status = COALESCE($2, status), message = COALESCE($3, message), outcome = COALESCE($4, outcome),
            error = COALESCE($5, error), progress = COALESCE($6::jsonb, progress),
            finished_at = CASE WHEN $7 THEN now() ELSE finished_at END, heartbeat_at = now()
      WHERE id = $1 AND ($8::int IS NULL OR attempts = $8)`,
    [id, status ?? null, message ?? null, outcome ?? null, error ?? null, progress ? JSON.stringify(progress) : null, Boolean(finished), attempt],
  );
}

/** Merge `patch` into progress.platforms[platform] in one statement (safe with parallel platforms). */
export async function patchPlatformProgress(job, platform, patch) {
  const { id, attempt } = ref(job);
  await query(
    `UPDATE jobs SET progress = jsonb_set(
        jsonb_set(progress, '{platforms}', COALESCE(progress->'platforms', '{}'::jsonb)),
        ARRAY['platforms', $2::text], COALESCE(progress->'platforms'->$2, '{}'::jsonb) || $3::jsonb),
        heartbeat_at = now()
      WHERE id = $1 AND ($4::int IS NULL OR attempts = $4)`,
    [id, platform, JSON.stringify(patch), attempt],
  );
}

/** Merge keys into progress (top level). */
export async function mergeProgress(job, patch, message) {
  const { id, attempt } = ref(job);
  await query(
    `UPDATE jobs SET progress = progress || $2::jsonb, message = COALESCE($3, message), heartbeat_at = now()
      WHERE id = $1 AND ($4::int IS NULL OR attempts = $4)`,
    [id, JSON.stringify(patch), message ?? null, attempt],
  );
}

/** A handler threw: retry later (exponential backoff) or give up. */
export async function failOrRetry(job, err) {
  const retry = job.attempts < (job.maxAttempts ?? 2);
  await query(
    `UPDATE jobs SET status = CASE WHEN $2 THEN 'queued' ELSE 'failed' END,
            run_after = CASE WHEN $2 THEN now() + make_interval(mins => $3) ELSE run_after END,
            error = $4, message = $5, locked_by = NULL, finished_at = CASE WHEN $2 THEN NULL ELSE now() END
      WHERE id = $1 AND attempts = $6 AND status = 'running'`,
    [job.jobId, retry, 2 ** job.attempts, String(err?.message ?? err).slice(0, 1000), retry ? 'Will retry shortly…' : 'Failed.', job.attempts],
  );
}

/**
 * Jobs left "running" by a worker that crashed or was stopped (no heartbeat for `staleSec`) go
 * back to the queue, or fail after their last attempt. Called by every worker on start and periodically.
 */
export async function recoverStale(staleSec) {
  const { rows } = await query(
    `UPDATE jobs SET status = CASE WHEN attempts < max_attempts THEN 'queued' ELSE 'failed' END,
            message = CASE WHEN attempts < max_attempts THEN 'Interrupted — queued again.' ELSE 'Interrupted (worker stopped).' END,
            finished_at = CASE WHEN attempts < max_attempts THEN NULL ELSE now() END, locked_by = NULL
      WHERE status = 'running' AND heartbeat_at < now() - make_interval(secs => $1)
      RETURNING id`,
    [staleSec],
  );
  return rows.length;
}

/**
 * Hand back jobs held by worker ids matching `pattern` (SQL LIKE) whose heartbeat is older than
 * `olderThanSec` — used on start (jobs of an earlier process on this machine) and on stop.
 * Jobs that used up their attempts fail instead of looping forever.
 */
export async function releaseHeld(pattern, olderThanSec = 0) {
  const { rows } = await query(
    `UPDATE jobs SET status = CASE WHEN attempts < max_attempts THEN 'queued' ELSE 'failed' END,
            message = CASE WHEN attempts < max_attempts THEN 'Interrupted — queued again.' ELSE 'Interrupted (worker stopped).' END,
            finished_at = CASE WHEN attempts < max_attempts THEN NULL ELSE now() END, locked_by = NULL
      WHERE status = 'running' AND locked_by LIKE $1 AND heartbeat_at <= now() - make_interval(secs => $2)
      RETURNING id`,
    [pattern, olderThanSec],
  );
  return rows.length;
}

export async function cancelQueued({ cityId, parentId }) {
  const { rows } = await query(
    `UPDATE jobs SET status = 'cancelled', finished_at = now(), message = 'Cancelled.'
      WHERE status = 'queued' AND (($1::int IS NOT NULL AND city_id = $1) OR ($2::uuid IS NOT NULL AND parent_id = $2))
      RETURNING id`,
    [cityId ?? null, parentId ?? null],
  );
  return rows.length;
}

export async function isCancelled(id) {
  const r = await one('SELECT status FROM jobs WHERE id = $1', [id]);
  return r?.status === 'cancelled';
}

/** Queue overview for the seeding dashboard. */
export async function queueStats() {
  const byKind = await many(
    `SELECT kind, status, count(*)::int AS n FROM jobs
      WHERE status IN ('queued', 'running') OR finished_at > now() - interval '24 hours'
      GROUP BY kind, status ORDER BY kind, status`,
  );
  const running = await many(
    `SELECT j.*, h.name AS hotel_name, c.name AS city_name FROM jobs j
       LEFT JOIN hotels h ON h.id = j.hotel_id LEFT JOIN cities c ON c.id = j.city_id
      WHERE j.status = 'running' ORDER BY j.started_at`,
  );
  const next = await many(
    `SELECT j.*, h.name AS hotel_name, c.name AS city_name FROM jobs j
       LEFT JOIN hotels h ON h.id = j.hotel_id LEFT JOIN cities c ON c.id = j.city_id
      WHERE j.status = 'queued' ORDER BY j.priority DESC, j.created_at LIMIT 10`,
  );
  const label = (r) => ({ ...toJob(r), hotelName: r.hotel_name, cityName: r.city_name });
  return { byKind, running: running.map(label), next: next.map(label) };
}

/** Test helper. */
export async function _truncateAll() {
  await getPool().query(
    'TRUNCATE jobs, compsets, reviews, listing_snapshots, platform_listings, discovery_areas, cluster_members, clusters, hotel_neighbors, hotels, cities RESTART IDENTITY CASCADE',
  );
}

/** Safety net after a handler returns: a job still marked running is completed. */
export async function finishIfRunning(job) {
  await query(`UPDATE jobs SET status = 'completed', finished_at = now(), locked_by = NULL WHERE id = $1 AND status = 'running' AND attempts = $2`, [job.jobId, job.attempts]);
}
