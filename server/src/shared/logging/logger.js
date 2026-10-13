import pino from 'pino';
import { config } from '../config/env.js';

const isDev = process.env.NODE_ENV !== 'production';

let transport;
if (isDev) {
  try {
    // pino-pretty is a dev dependency; fall back to JSON logs if it is missing.
    await import('pino-pretty');
    transport = { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } };
  } catch {
    transport = undefined;
  }
}

export const logger = pino({ level: config.logLevel, base: undefined, transport });

/** Child logger carrying context such as jobId / platform on every line. */
export function childLogger(bindings) {
  return logger.child(bindings);
}
