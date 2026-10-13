import { logger } from '../../../shared/logging/logger.js';

/**
 * Minimal in-process FIFO queue with concurrency 1.
 * Jobs run one at a time so request rates to each site stay low. In the AWS design this
 * becomes SQS + a worker; the job handler signature stays the same.
 */
export class JobRunner {
  constructor(handler) {
    this.handler = handler;
    this.queue = [];
    this.active = null;
    this.known = new Set();
  }

  enqueue(jobId) {
    this.known.add(jobId);
    this.queue.push(jobId);
    this.#drain();
  }

  /** True if this process queued or is running the job (lets the API detect jobs interrupted by a restart). */
  isKnown(jobId) {
    return this.known.has(jobId);
  }

  get pending() {
    return this.queue.length + (this.active ? 1 : 0);
  }

  async #drain() {
    if (this.active || !this.queue.length) return;
    const jobId = this.queue.shift();
    this.active = jobId;
    try {
      await this.handler(jobId);
    } catch (err) {
      logger.error({ err, jobId }, 'Job handler crashed');
    } finally {
      this.active = null;
      this.known.delete(jobId);
      setImmediate(() => this.#drain());
    }
  }
}
