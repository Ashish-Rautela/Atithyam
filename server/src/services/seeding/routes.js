import { Router } from 'express';
import { asyncRoute } from '../../shared/errors/errorHandler.js';
import { validateBody } from '../../shared/validation/validate.js';
import { AppError } from '../../shared/errors/AppError.js';
import { ALL_PLATFORMS } from '../review-ingestion/jobs/enqueueProfile.js';
import * as service from './seedService.js';

const addSchema = {
  type: 'object',
  required: ['names'],
  properties: {
    names: { type: 'array', minItems: 1, maxItems: 20, items: { type: 'string', minLength: 2, maxLength: 80, pattern: '\\S' } },
    kind: { enum: ['city', 'town'] },
    radiusKm: { type: 'number', minimum: 1, maximum: 15 },
    maxReviews: { type: 'integer', minimum: 5, maximum: 200 },
    platforms: { type: 'array', items: { enum: ALL_PLATFORMS }, uniqueItems: true },
    enrich: { type: 'boolean' },
    maxTiles: { type: 'integer', minimum: 1, maximum: 500 },
  },
};

const reseedSchema = {
  type: 'object',
  properties: {
    mode: { enum: ['refresh', 'full', 'resume'] },
    reresolve: { type: 'boolean' },
    enrich: { type: 'boolean' },
  },
};

const cityId = (req) => {
  const id = Number.parseInt(req.params.cityId, 10);
  if (!Number.isFinite(id)) throw AppError.notFound('City not found');
  return id;
};

export function seedingRoutes() {
  const r = Router();

  r.get('/cities', asyncRoute(async (req, res) => res.json(await service.listCities())));

  r.post('/cities', validateBody(addSchema), asyncRoute(async (req, res) => {
    res.status(202).json(await service.addCities(req.body));
  }));

  r.get('/cities/:cityId', asyncRoute(async (req, res) => {
    const clusterId = req.query.cluster ? Number.parseInt(req.query.cluster, 10) : undefined;
    res.json(await service.getCityDetail(cityId(req), { clusterId: Number.isFinite(clusterId) ? clusterId : undefined }));
  }));

  r.post('/cities/:cityId/reseed', validateBody(reseedSchema), asyncRoute(async (req, res) => {
    res.status(202).json(await service.reseedCity(cityId(req), req.body));
  }));

  r.post('/cities/:cityId/pause', asyncRoute(async (req, res) => {
    res.json(await service.pauseCity(cityId(req)));
  }));

  r.get('/queue', asyncRoute(async (req, res) => res.json(await service.getQueue())));

  return r;
}
