import { createApp } from './app.js';
import { config } from '../../shared/config/env.js';
import { logger } from '../../shared/logging/logger.js';
import { migrate } from '../../shared/db/migrate.js';
import { closePool } from '../../shared/db/pool.js';
import { closeBrowser } from '../../services/review-ingestion/browser/browserManager.js';
import { Worker } from '../worker/worker.js';

try {
  if (config.db.autoMigrate) await migrate();
} catch (err) {
  logger.fatal({ err: err.message }, 'Cannot reach or migrate Postgres. Is it running? (npm run db:up) Check DATABASE_URL.');
  process.exit(1);
}

// On a laptop the API also runs the background jobs; on AWS run `npm run worker` separately (WORKER_MODE=off).
const worker = config.worker.mode === 'embedded' ? new Worker() : null;
await worker?.start();

const server = createApp().listen(config.port, () => {
  logger.info({ port: config.port, worker: config.worker.mode, headless: config.scraping.headless }, 'API listening');
});

let stopping = false;
async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, 'Shutting down');
  server.close();
  await worker?.stop(5000);
  await closeBrowser();
  await closePool();
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
