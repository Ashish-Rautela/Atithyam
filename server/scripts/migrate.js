// Apply database migrations (also done automatically on start unless AUTO_MIGRATE=false).
import { migrate } from '../src/shared/db/migrate.js';
import { closePool } from '../src/shared/db/pool.js';

try {
  const applied = await migrate();
  console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Database is up to date.');
} catch (err) {
  console.error(`✗ ${err.message}`);
  process.exitCode = 1;
} finally {
  await closePool();
}
