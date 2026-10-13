import pg from 'pg';
import { migrate } from '../../src/shared/db/migrate.js';
import { _truncateAll } from '../../src/data/jobs.js';

/** True when the test database is reachable (DB tests are skipped otherwise, with a hint). */
export async function testDbAvailable() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 2000 });
  try {
    await client.connect();
    await client.end();
    return true;
  } catch {
    console.warn(`\n⚠  Database tests skipped: cannot reach ${process.env.DATABASE_URL.replace(/:[^:@/]+@/, ':***@')}. Start Postgres with "npm run db:up" (creates rip_test) or set TEST_DATABASE_URL.\n`);
    return false;
  }
}

export async function resetDb() {
  await migrate();
  await _truncateAll();
}

const placeUrl = (lat, lng, id) => `https://www.google.com/maps/place/X/data=!4m10!3m9!1s${id}!8m2!3d${lat}!4d${lng}!16s%2Fg%2F11?hl=en`;
export { placeUrl };
