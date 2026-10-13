import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config/env.js';
import { logger } from '../logging/logger.js';
import { getPool } from './pool.js';

const MIGRATIONS_DIR = path.join(config.serverRoot, 'migrations');
const LOCK_KEY = 74_201_011; // advisory lock: API and worker may start at the same time

/**
 * Apply every migrations/NNN_*.sql file not yet recorded in schema_migrations, in order,
 * each in its own transaction. Safe to call from several processes at once.
 */
export async function migrate() {
  const client = await getPool().connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const done = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
    const files = (await fs.readdir(MIGRATIONS_DIR)).filter((f) => /^\d+_.*\.sql$/.test(f)).sort();
    const applied = [];
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = await fs.readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        applied.push(file);
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw new Error(`Migration ${file} failed: ${err.message}`, { cause: err });
      }
    }
    if (applied.length) logger.info({ applied }, 'Database migrated');
    return applied;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {});
    client.release();
  }
}
