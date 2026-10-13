// Standalone worker process: `npm run worker` (on AWS: its own ECS service, API runs with WORKER_MODE=off).
import { config } from '../../shared/config/env.js';
import { logger } from '../../shared/logging/logger.js';
import { migrate } from '../../shared/db/migrate.js';
import { closePool } from '../../shared/db/pool.js';
import { closeBrowser } from '../../services/review-ingestion/browser/browserManager.js';
import { Worker } from './worker.js';

if (config.db.autoMigrate) await migrate();
const worker = new Worker();
await worker.start();

let stopping = false;
async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, 'Worker shutting down');
  await worker.stop(20000);
  await closeBrowser();
  await closePool();
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
