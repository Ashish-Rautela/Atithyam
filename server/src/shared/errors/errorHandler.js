import { randomUUID } from 'node:crypto';
import { logger } from '../logging/logger.js';
import { AppError } from './AppError.js';

/** Express middleware: assigns a correlation id to every request. */
export function correlationId(req, res, next) {
  req.correlationId = req.get('x-correlation-id') || randomUUID();
  res.set('x-correlation-id', req.correlationId);
  next();
}

/** Express error handler producing RFC 7807-style problem responses. */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err?.type === 'entity.parse.failed' || err?.type === 'entity.too.large') {
    err = AppError.badRequest(err.type === 'entity.too.large' ? 'Request body too large' : 'Malformed JSON body');
  }
  const status = err instanceof AppError ? err.status : 500;
  if (!(err instanceof AppError)) {
    logger.error({ err, correlationId: req.correlationId, path: req.path }, 'Unhandled error');
  }
  res.status(status).json({
    type: err instanceof AppError ? err.code : 'INTERNAL_ERROR',
    title: err instanceof AppError ? err.message : 'Internal server error',
    status,
    detail: err instanceof AppError ? err.details : undefined,
    correlationId: req.correlationId,
  });
}

/** Wraps async route handlers so rejections reach the error handler. */
export const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
