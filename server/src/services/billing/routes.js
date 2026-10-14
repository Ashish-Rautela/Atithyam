import express, { Router } from 'express';
import { asyncRoute } from '../../shared/errors/errorHandler.js';
import { validateBody } from '../../shared/validation/validate.js';
import { AppError } from '../../shared/errors/AppError.js';
import * as billing from './billingService.js';
import { accountView } from '../auth/routes.js';
import { accessFor } from '../auth/access.js';

const checkoutSchema = {
  type: 'object',
  required: ['plan'],
  properties: { plan: { enum: ['pro', 'destination'] } },
};
const verifySchema = {
  type: 'object',
  required: ['razorpay_order_id', 'razorpay_payment_id', 'razorpay_signature'],
  properties: {
    razorpay_order_id: { type: 'string', minLength: 5, maxLength: 64 },
    razorpay_payment_id: { type: 'string', minLength: 5, maxLength: 64 },
    razorpay_signature: { type: 'string', minLength: 64, maxLength: 64 },
  },
};
const failureSchema = {
  type: 'object',
  required: ['orderId'],
  properties: { orderId: { type: 'string', maxLength: 64 }, reason: { type: 'string', maxLength: 300 } },
};

const needUser = (req) => {
  if (!req.user) throw AppError.unauthorized();
  return req.user;
};

/** Raw-body webhook endpoint; mount BEFORE express.json(). */
export function billingWebhookRoute() {
  const r = Router();
  r.post('/billing/webhook', express.raw({ type: '*/*', limit: '1mb' }), asyncRoute(async (req, res) => {
    const result = await billing.handleWebhook(req.body, req.get('x-razorpay-signature'));
    res.json({ ok: true, ...result });
  }));
  return r;
}

export function billingRoutes() {
  const r = Router();

  r.get('/billing/plans', (req, res) => res.json(billing.listPlans()));

  r.post('/billing/checkout', validateBody(checkoutSchema), asyncRoute(async (req, res) => {
    res.status(201).json(await billing.startCheckout(needUser(req), req.body.plan));
  }));

  r.post('/billing/verify', validateBody(verifySchema), asyncRoute(async (req, res) => {
    const user = needUser(req);
    const result = await billing.confirmCheckout(user, req.body);
    res.json({ ok: true, payment: result.payment, period: result.period, account: await accountView(user, await accessFor(user)) });
  }));

  r.post('/billing/failed', validateBody(failureSchema), asyncRoute(async (req, res) => {
    await billing.reportFailure(needUser(req), req.body);
    res.status(204).end();
  }));

  r.get('/billing/payments', asyncRoute(async (req, res) => {
    res.json({ items: await billing.listPayments(needUser(req)) });
  }));

  return r;
}
