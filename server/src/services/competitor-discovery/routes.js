import { Router } from 'express';
import { asyncRoute } from '../../shared/errors/errorHandler.js';
import { validateBody } from '../../shared/validation/validate.js';
import { ALL_PLATFORMS } from '../review-ingestion/jobs/enqueueProfile.js';
import * as service from './competitorService.js';

const discoverSchema = {
  type: 'object',
  properties: {
    radiusKm: { type: 'number', minimum: 0.5, maximum: 10 },
    force: { type: 'boolean' },
    queries: { type: 'array', items: { type: 'string', minLength: 2, maxLength: 40 }, maxItems: 6 },
    rules: {
      type: 'object',
      properties: {
        minPriceRatio: { type: 'number', minimum: 0, maximum: 10 },
        maxPriceRatio: { type: 'number', minimum: 0, maximum: 20 },
        minReviews: { type: 'integer', minimum: 0, maximum: 100000 },
        maxCompetitors: { type: 'integer', minimum: 1, maximum: 30 },
        includeUnknownPrice: { type: 'boolean' },
      },
    },
  },
};

const selectionSchema = {
  type: 'object',
  required: ['placeIds'],
  properties: { placeIds: { type: 'array', items: { type: 'string', minLength: 5, maxLength: 80 }, maxItems: 30 } },
};

const collectSchema = {
  type: 'object',
  properties: {
    maxReviews: { type: 'integer', minimum: 5, maximum: 200 },
    platforms: { type: 'array', items: { enum: ALL_PLATFORMS }, uniqueItems: true },
    force: { type: 'boolean' },
  },
};

export function competitorRoutes() {
  const r = Router();

  r.get('/businesses/:bizId/competitors', asyncRoute(async (req, res) => {
    res.json(await service.getCompsetView(req.params.bizId));
  }));

  r.post('/businesses/:bizId/competitors/discover', validateBody(discoverSchema), asyncRoute(async (req, res) => {
    res.status(202).json(await service.startDiscovery(req.params.bizId, req.body));
  }));

  r.put('/businesses/:bizId/competitors/selection', validateBody(selectionSchema), asyncRoute(async (req, res) => {
    res.json(await service.saveSelection(req.params.bizId, req.body.placeIds));
  }));

  r.post('/businesses/:bizId/competitors/collect', validateBody(collectSchema), asyncRoute(async (req, res) => {
    res.status(202).json(await service.collectCompetitors(req.params.bizId, req.body));
  }));

  return r;
}
