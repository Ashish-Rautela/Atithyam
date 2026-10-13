import { Router } from 'express';
import { asyncRoute } from '../../shared/errors/errorHandler.js';
import { validateBody } from '../../shared/validation/validate.js';
import { AppError } from '../../shared/errors/AppError.js';
import * as service from './businessService.js';
import { ASPECT_KEYS } from '../analysis/taxonomy.js';

const platformEnum = { enum: service.ALL_PLATFORMS };

const searchSchema = {
  type: 'object',
  required: ['name'],
  properties: {
    name: { type: 'string', minLength: 2, maxLength: 120 },
    location: { type: 'string', maxLength: 120 },
  },
};

const createSchema = {
  type: 'object',
  // Either a Google Maps place (name + googleUrl) or a hotel already in the database (hotelId).
  anyOf: [{ required: ['name', 'googleUrl'] }, { required: ['hotelId'] }],
  properties: {
    name: { type: 'string', minLength: 2, maxLength: 160 },
    location: { type: 'string', maxLength: 120 },
    googleUrl: { type: 'string', minLength: 10, maxLength: 2000 },
    hotelId: { type: 'string', minLength: 4, maxLength: 40 },
    maxReviews: { type: 'integer', minimum: 5, maximum: 500 },
    platforms: { type: 'array', items: platformEnum, uniqueItems: true },
  },
};

const refreshSchema = {
  type: 'object',
  properties: {
    platforms: { type: 'array', items: platformEnum, uniqueItems: true },
    maxReviews: { type: 'integer', minimum: 5, maximum: 500 },
  },
};

const selectSchema = {
  type: 'object',
  required: ['url'],
  properties: { url: { type: 'string', minLength: 10, maxLength: 2000 } },
};

export function businessRoutes() {
  const r = Router();

  r.post('/search', validateBody(searchSchema), asyncRoute(async (req, res) => {
    res.json(await service.searchProperty(req.body));
  }));

  // Instant: hotels already in the database.
  r.get('/hotels/lookup', asyncRoute(async (req, res) => {
    const name = String(req.query.name ?? '').slice(0, 120);
    if (name.trim().length < 2) throw AppError.badRequest('name must have at least 2 characters');
    res.json(await service.lookupHotels({ name, location: typeof req.query.location === 'string' ? req.query.location.slice(0, 120) : undefined }));
  }));

  r.get('/businesses', asyncRoute(async (req, res) => {
    res.json({ items: await service.listBusinesses() });
  }));

  r.post('/businesses', validateBody(createSchema), asyncRoute(async (req, res) => {
    const { business, job, reusedData } = await service.createBusiness(req.body);
    res.status(202).json({ bizId: business.bizId, jobId: job?.jobId ?? null, reusedData });
  }));

  r.get('/businesses/:bizId', asyncRoute(async (req, res) => {
    res.json(await service.getBusinessDetail(req.params.bizId));
  }));

  r.post('/businesses/:bizId/refresh', validateBody(refreshSchema), asyncRoute(async (req, res) => {
    const job = await service.refreshBusiness(req.params.bizId, req.body);
    res.status(202).json({ jobId: job.jobId });
  }));

  r.post('/businesses/:bizId/reseed', asyncRoute(async (req, res) => {
    res.status(202).json(await service.reseedNeighbourhood(req.params.bizId));
  }));

  r.get('/businesses/:bizId/history', asyncRoute(async (req, res) => {
    const platform = typeof req.query.platform === 'string' && service.ALL_PLATFORMS.includes(req.query.platform) ? req.query.platform : undefined;
    res.json(await service.getHistory(req.params.bizId, platform));
  }));

  r.post('/businesses/:bizId/listings/:platform/select', validateBody(selectSchema), asyncRoute(async (req, res) => {
    const job = await service.selectListing(req.params.bizId, req.params.platform, req.body.url);
    res.status(202).json({ jobId: job.jobId });
  }));

  r.get('/businesses/:bizId/reviews', asyncRoute(async (req, res) => {
    const q = req.query;
    const num = (v, name, min, max) => {
      if (v === undefined || v === '') return undefined;
      const n = Number(v);
      if (!Number.isFinite(n) || n < min || n > max) throw AppError.badRequest(`${name} must be between ${min} and ${max}`);
      return n;
    };
    if (q.platform && q.platform !== 'all' && !service.ALL_PLATFORMS.includes(q.platform)) {
      throw AppError.badRequest('Unknown platform');
    }
    res.json(await service.listReviews(req.params.bizId, {
      platform: q.platform,
      limit: num(q.limit, 'limit', 1, 200) ?? 50,
      offset: num(q.offset, 'offset', 0, 100000) ?? 0,
      minRating: num(q.minRating, 'minRating', 0, 5),
      maxRating: num(q.maxRating, 'maxRating', 0, 5),
      q: typeof q.q === 'string' ? q.q.slice(0, 100) : undefined,
      aspect: ASPECT_KEYS.includes(q.aspect) ? q.aspect : undefined,
      sentiment: ['-1', '0', '1'].includes(q.sentiment) ? Number(q.sentiment) : undefined,
    }));
  }));

  r.get('/jobs/:jobId', asyncRoute(async (req, res) => {
    res.json(await service.getJob(req.params.jobId));
  }));

  return r;
}
