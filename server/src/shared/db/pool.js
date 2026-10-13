import fs from 'node:fs';
import pg from 'pg';
import { config } from '../config/env.js';
import { logger } from '../logging/logger.js';

// Return BIGINT/NUMERIC as JS numbers (counts and ratings here are far below 2^53).
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => Number(v));

let pool = null;

function sslOptions() {
  if (config.db.ssl === 'disable') return false;
  if (config.db.ssl === 'require') return { rejectUnauthorized: false };
  // 'verify': AWS RDS — download the region bundle from https://truststore.pki.rds.amazonaws.com
  return { rejectUnauthorized: true, ca: config.db.sslCaPath ? fs.readFileSync(config.db.sslCaPath, 'utf8') : undefined };
}

/** Shared connection pool (one per process). */
export function getPool() {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: config.db.url,
      ssl: sslOptions(),
      max: config.db.poolMax,
      idleTimeoutMillis: 30000,
      application_name: 'review-intelligence',
    });
    pool.on('error', (err) => logger.error({ err }, 'Postgres pool error'));
  }
  return pool;
}

export async function query(text, params) {
  return getPool().query(text, params);
}

/** First row or null. */
export async function one(text, params) {
  const { rows } = await getPool().query(text, params);
  return rows[0] ?? null;
}

export async function many(text, params) {
  const { rows } = await getPool().query(text, params);
  return rows;
}

/** Run `fn(client)` inside a transaction. */
export async function tx(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool() {
  if (pool) {
    const p = pool;
    pool = null;
    await p.end();
  }
}
