import { Router } from 'express';
import { asyncRoute } from '../../shared/errors/errorHandler.js';
import { validateBody } from '../../shared/validation/validate.js';
import { AppError } from '../../shared/errors/AppError.js';
import { ASPECT_KEYS } from './taxonomy.js';
import { getBenchmark } from './benchmark.js';
import { getTrends } from './trends.js';
import { getDestination, destinationEvidenceCsv } from './destination.js';
import { getSummary } from './summary.js';
import * as service from './analysisService.js';

const eventSchema = {
  type: 'object',
  required: ['date', 'label'],
  properties: {
    date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    label: { type: 'string', minLength: 2, maxLength: 120 },
    kind: { enum: ['event', 'intervention'] },
    aspect: { enum: [...ASPECT_KEYS, null] },
  },
};

/** ?peers=compset|cluster|radius&radiusKm=3 */
function peerOpts(q) {
  const peers = ['compset', 'cluster', 'radius'].includes(q.peers) ? q.peers : 'compset';
  const r = Number(q.radiusKm);
  return { peers, radiusKm: Number.isFinite(r) && r >= 0.5 && r <= 10 ? r : 3 };
}

export function analysisRoutes() {
  const r = Router();

  r.get('/businesses/:bizId/pipeline', asyncRoute(async (req, res) => res.json(await service.getPipeline(req.params.bizId, peerOpts(req.query)))));
  r.get('/businesses/:bizId/benchmark', asyncRoute(async (req, res) => {
    await service.analysePendingInstantly(req.params.bizId, peerOpts(req.query));
    res.json(await getBenchmark(req.params.bizId, peerOpts(req.query)));
  }));
  r.get('/businesses/:bizId/trends', asyncRoute(async (req, res) => {
    const measure = typeof req.query.measure === 'string' ? req.query.measure : 'rating';
    res.json(await getTrends(req.params.bizId, { measure, ...peerOpts(req.query) }));
  }));
  r.get('/businesses/:bizId/summary', asyncRoute(async (req, res) => res.json(await getSummary('hotel', req.params.bizId, peerOpts(req.query)))));
  r.post('/businesses/:bizId/summary', asyncRoute(async (req, res) => res.json(await getSummary('hotel', req.params.bizId, peerOpts(req.query), { refresh: true }))));
  r.post('/businesses/:bizId/analyse', asyncRoute(async (req, res) => {
    res.status(202).json(await service.analyseNow(req.params.bizId, { upgrade: req.body?.upgrade !== false, ...peerOpts(req.query) }));
  }));

  r.get('/businesses/:bizId/events', asyncRoute(async (req, res) => res.json(await service.listEvents(req.params.bizId))));
  r.post('/businesses/:bizId/events', validateBody(eventSchema), asyncRoute(async (req, res) => res.status(201).json(await service.addEvent(req.params.bizId, req.body))));
  r.delete('/businesses/:bizId/events/:id', asyncRoute(async (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) throw AppError.notFound('Event not found');
    await service.deleteEvent(req.params.bizId, id);
    res.status(204).end();
  }));

  const cityId = (req) => {
    const id = Number.parseInt(req.params.cityId, 10);
    if (!Number.isFinite(id)) throw AppError.notFound('City not found');
    return id;
  };
  const clusterOpt = (req) => {
    const c = Number.parseInt(req.query.cluster, 10);
    return Number.isFinite(c) ? { clusterId: c } : {};
  };
  r.get('/cities/:cityId/destination', asyncRoute(async (req, res) => res.json(await getDestination(cityId(req), clusterOpt(req)))));
  r.get('/cities/:cityId/destination/summary', asyncRoute(async (req, res) => res.json(await getSummary('city', cityId(req), clusterOpt(req)))));
  r.post('/cities/:cityId/destination/summary', asyncRoute(async (req, res) => res.json(await getSummary('city', cityId(req), clusterOpt(req), { refresh: true }))));
  r.get('/cities/:cityId/destination/evidence.csv', asyncRoute(async (req, res) => {
    const csv = await destinationEvidenceCsv(cityId(req));
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', `attachment; filename="destination-${cityId(req)}-evidence.csv"`);
    res.send(`﻿${csv}`);
  }));

  return r;
}
