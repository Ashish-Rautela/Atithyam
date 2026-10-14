import path from 'node:path';
import express from 'express';
import { correlationId, errorHandler } from '../../shared/errors/errorHandler.js';
import { AppError } from '../../shared/errors/AppError.js';
import { config } from '../../shared/config/env.js';
import { businessRoutes } from '../../services/business-management/routes.js';
import { competitorRoutes } from '../../services/competitor-discovery/routes.js';
import { seedingRoutes } from '../../services/seeding/routes.js';
import { analysisRoutes } from '../../services/analysis/routes.js';
import { geminiEnabled } from '../../services/analysis/gemini.js';
import { authRoutes } from '../../services/auth/routes.js';
import { loadSession, requireAppHeader, enforcePolicy } from '../../services/auth/middleware.js';
import { billingRoutes, billingWebhookRoute } from '../../services/billing/routes.js';
import { billingEnabled } from '../../services/billing/razorpay.js';

/** Builds the Express app (no listening) so tests can mount it with supertest. */
export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true); // CloudFront / Amplify / ALB in front: honour X-Forwarded-Proto for Secure cookies
  app.use(correlationId);
  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'SAMEORIGIN' });
    next();
  });
  // Razorpay webhooks are verified against the exact raw body, so they come before the JSON parser.
  app.use('/api', billingWebhookRoute());
  app.use(express.json({ limit: '100kb' }));

  // Accounts: who is calling (session cookie), CSRF guard, and the route access policy.
  app.use('/api', loadSession);
  if (config.auth.required) app.use('/api', requireAppHeader);
  app.use('/api', enforcePolicy);

  app.get('/api/health', (req, res) => {
    res.json({ ok: true, database: 'postgres', ai: geminiEnabled() ? config.ai.model : 'offline rules (set GEMINI_API_KEY)', worker: config.worker.mode, refreshIntervalDays: config.data.refreshIntervalDays, headless: config.scraping.headless, enabled: config.scraping.enabled, accounts: config.auth.required, payments: billingEnabled() });
  });
  app.use('/api', authRoutes());
  app.use('/api', billingRoutes());
  app.use('/api', businessRoutes());
  app.use('/api', competitorRoutes());
  app.use('/api', seedingRoutes());
  app.use('/api', analysisRoutes());

  app.use('/api', (req, res, next) => next(AppError.notFound(`No route ${req.method} ${req.path}`)));
  if (config.serveClientDir) {
    app.use(express.static(config.serveClientDir, { index: false, maxAge: '1h' }));
    // Single-page app: every non-API GET returns index.html.
    app.get(/^(?!\/api\/).*/, (req, res) => res.sendFile(path.join(config.serveClientDir, 'index.html')));
  }
  app.use(errorHandler);
  return app;
}
