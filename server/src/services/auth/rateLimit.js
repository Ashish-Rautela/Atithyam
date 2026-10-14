// Small in-memory fixed-window limiter (per process). Enough to slow down password guessing and
// search spam on a single server; use a shared store if the API ever runs on several machines.
import { AppError } from '../../shared/errors/AppError.js';

export function rateLimiter({ windowMs, max, key }) {
  const hits = new Map();
  let sweepAt = Date.now() + windowMs;
  return function limit(req, res, next) {
    const now = Date.now();
    if (now > sweepAt) {
      for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
      sweepAt = now + windowMs;
    }
    const k = key(req);
    const entry = hits.get(k);
    if (!entry || entry.resetAt <= now) {
      hits.set(k, { count: 1, resetAt: now + windowMs });
      return next();
    }
    entry.count += 1;
    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return next(AppError.tooManyRequests());
    }
    return next();
  };
}

export const clientIp = (req) => String(req.get('cloudfront-viewer-address') || req.get('x-forwarded-for') || req.ip || '')
  .split(',')[0].replace(/:\d+$/, '').trim();
