import Ajv from 'ajv';
import { AppError } from '../errors/AppError.js';

export const ajv = new Ajv({ allErrors: true, coerceTypes: false, useDefaults: true, removeAdditional: 'all' });

/** Express middleware validating req.body against a JSON Schema. */
export function validateBody(schema) {
  const check = ajv.compile(schema);
  return (req, res, next) => {
    const body = req.body ?? {};
    if (!check(body)) {
      return next(AppError.badRequest('Invalid request body', check.errors));
    }
    req.body = body;
    return next();
  };
}
