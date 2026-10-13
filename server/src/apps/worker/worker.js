import os from 'node:os';
import { config } from '../../shared/config/env.js';
import { logger } from '../../shared/logging/logger.js';
import * as jobs from '../../data/jobs.js';
import { markProfiled } from '../../data/hotels.js';
import { schedulerTick } from '../../services/seeding/scheduler.js';
import { JOB_HANDLERS } from './jobHandlers.js';
import { closeBrowser } from '../../services/review-ingestion/browser/browserManager.js';
import { updateCity } from '../../data/cities.js';

const BROWSER_KINDS = ['profile', 'discover_area', 'seed_city'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A job still running after this long is abandoned (its later writes are ignored) and retried. */
const JOB_TIMEOUT_MIN = Object.freeze({ profile: 30, discover_area: 20, seed_city: 6 * 60, analyze_reviews: 60 });

/**
 * Pulls jobs from the Postgres queue (FOR UPDATE SKIP LOCKED) and runs them, `concurrency` at a
 * time. Runs inside the API process on a laptop (WORKER_MODE=embedded) or as its own process /
 * container (`npm run worker`) — several workers can share one database.
 */
export class Worker {
  constructor({ id = `${process.env.WORKER_ID || os.hostname()}:${process.pid}`, concurrency = config.worker.concurrency, pollMs = config.worker.pollMs, handlers = JOB_HANDLERS, backgroundScraping = config.worker.backgroundScraping } = {}) {
    this.backgroundScraping = backgroundScraping;
    this.id = id;
    this.handlers = handlers;
    this.concurrency = Math.max(1, concurrency);
    this.pollMs = pollMs;
    this.active = new Map();
    this.running = false;
    this.schedulerTimer = null;
  }

  async start() {
    if (this.running) return;
    this.running = true;
    // Jobs an earlier process on this machine was running when it died (no heartbeat for 90 s; a live
    // process on the same machine, e.g. API + `npm run worker`, heartbeats every 30 s and is left alone).
    const host = this.id.slice(0, this.id.lastIndexOf(':'));
    const released = await jobs.releaseHeld(`${host.replace(/[%_\\]/g, (c) => `\\${c}`)}:%`, 90);
    if (released) logger.info({ released }, 'Re-queued jobs left running by an earlier process on this machine');
    if (!this.backgroundScraping) await this.#parkLeftovers();
    await this.#tick();
    this.schedulerTimer = setInterval(() => this.#tick(), config.worker.schedulerEveryMin * 60_000);
    this.schedulerTimer.unref?.();
    logger.info({ workerId: this.id, concurrency: this.concurrency }, 'Worker started');
    this.lanes = [
      { name: 'browser', kinds: BROWSER_KINDS, concurrency: this.concurrency, active: new Map(), lastWork: Date.now() },
      { name: 'ai', kinds: ['analyze_reviews'], concurrency: config.ai.concurrency, active: new Map() },
    ];
    this.loops = this.lanes.map((lane) => this.#loop(lane));
  }

  /**
   * Background scraping off (laptop): scraping left queued by an earlier session must not start the
   * browser on its own. It is parked; opening that hotel's benchmark, asking for it again, or pressing
   * Resume on a city releases it.
   */
  async #parkLeftovers() {
    const parked = await jobs.holdQueued(BROWSER_KINDS, 'Paused when the server started — resumes when you open this hotel or press Resume.');
    if (!parked.length) return;
    const cityIds = [...new Set(parked.map((j) => j.city_id).filter(Boolean))];
    for (const id of cityIds) await updateCity(id, { status: 'paused' }).catch(() => {});
    logger.info({ parked: parked.length, cities: cityIds.length }, 'Parked scraping jobs left from the last session (BACKGROUND_SCRAPING=false)');
  }

  async #tick() {
    try {
      await schedulerTick({ background: this.backgroundScraping });
    } catch (err) {
      logger.error({ err }, 'Scheduler pass failed');
    }
  }

  /**
   * Two lanes: the browser lane (scraping — one at a time, it drives a real browser) and the AI lane
   * (review analysis — network calls only), so analysis never waits behind a 2-minute scrape.
   */
  async #loop(lane) {
    while (this.running) {
      if (lane.active.size >= lane.concurrency) {
        await sleep(250);
        continue;
      }
      let job = null;
      try {
        job = await jobs.claimNext(this.id, lane.kinds);
      } catch (err) {
        logger.error({ err }, 'Could not claim a job');
        await sleep(this.pollMs * 5);
        continue;
      }
      if (!job) {
        // Nothing to scrape for a while: close the browser window instead of leaving it open.
        if (lane.lastWork && !lane.active.size && config.worker.browserIdleCloseSec > 0 && Date.now() - lane.lastWork > config.worker.browserIdleCloseSec * 1000) {
          lane.lastWork = null;
          await closeBrowser().catch(() => {});
        }
        await sleep(this.pollMs);
        continue;
      }
      if (lane.name === 'browser') lane.lastWork = Date.now();
      const p = this.#run(job).finally(() => {
        if (lane.name === 'browser') lane.lastWork = Date.now();
        lane.active.delete(job.jobId);
        this.active.delete(job.jobId);
      });
      lane.active.set(job.jobId, p);
      this.active.set(job.jobId, p);
    }
  }

  async #run(job) {
    const handler = this.handlers[job.kind];
    const log = logger.child({ jobId: job.jobId, kind: job.kind });
    const beat = setInterval(() => jobs.heartbeat(job.jobId).catch(() => {}), 30_000);
    try {
      if (!handler) throw new Error(`No handler for job kind "${job.kind}"`);
      log.info({ hotelId: job.hotelId, cityId: job.cityId, priority: job.priority }, 'Job started');
      let timer;
      const limitMin = JOB_TIMEOUT_MIN[job.kind] ?? 60;
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out after ${limitMin} min`)), limitMin * 60_000);
      });
      try {
        await Promise.race([handler(job), timeout]);
      } finally {
        clearTimeout(timer);
      }
      await jobs.finishIfRunning(job);
    } catch (err) {
      log.error({ err: err.message }, 'Job failed');
      await jobs.failOrRetry(job, err).catch((e) => log.error({ err: e }, 'Could not record job failure'));
      // Keep the scheduler from re-queuing a hotel whose collection crashed every 10 minutes.
      if (job.kind === 'profile' && job.hotelId) await markProfiled(job.hotelId, 'failed').catch(() => {});
    } finally {
      clearInterval(beat);
    }
  }

  /** Stop claiming; give running jobs `graceMs` to finish, then hand them back to the queue. */
  async stop(graceMs = 5000) {
    this.running = false;
    clearInterval(this.schedulerTimer);
    await Promise.race([Promise.allSettled([...this.active.values()]), sleep(graceMs)]);
    if (this.active.size) {
      const n = await jobs.releaseHeld(this.id.replace(/[%_\\]/g, (c) => `\\${c}`), 0).catch(() => 0);
      logger.info({ requeued: n }, 'Worker stopped; unfinished jobs re-queued');
    }
  }
}
