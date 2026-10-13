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

/** Builds the Express app (no listening) so tests can mount it with supertest. */
export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Correlation-Id');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  app.use(correlationId);
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (req, res) => {
    res.json({ ok: true, database: 'postgres', ai: geminiEnabled() ? config.ai.model : 'offline rules (set GEMINI_API_KEY)', worker: config.worker.mode, refreshIntervalDays: config.data.refreshIntervalDays, headless: config.scraping.headless, enabled: config.scraping.enabled });
  });
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
