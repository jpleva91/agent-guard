// Hono app — composes middleware and routes into a platform-agnostic application.

import { Hono } from 'hono';
import { loadConfig } from './config.js';
import { ipWhitelist } from './middleware/ip-whitelist.js';
import { apiKeyAuth } from './middleware/api-key.js';
import { createRateLimiter } from './middleware/rate-limiter.js';
import { healthRoutes } from './routes/health.js';
import { ingestRoutes } from './routes/ingest.js';
import { eventRoutes } from './routes/events.js';
import { decisionRoutes } from './routes/decisions.js';
import { traceRoutes } from './routes/traces.js';
import { enrollRoutes } from './routes/enroll.js';
import { telemetryBatchRoutes } from './routes/telemetry-batch.js';
import { createMemoryStore } from './store/memory-store.js';
import type { TelemetryDataStore } from './store/types.js';
import type { ServerConfig } from './config.js';

async function createStore(config: ServerConfig): Promise<TelemetryDataStore> {
  if (config.storageBackend === 'postgres') {
    const { createPostgresStore, migratePostgresStore } = await import(
      './store/postgres-store.js'
    );
    await migratePostgresStore();
    return createPostgresStore();
  }
  return createMemoryStore();
}

export async function createApp() {
  const config = loadConfig();
  const store = await createStore(config);

  const app = new Hono();

  // Health check — no auth required
  app.route('/api', healthRoutes);

  // Rate limiting on telemetry endpoints (before auth)
  const ipLimiter = createRateLimiter(
    { windowMs: 60_000, maxRequests: config.rateLimitPerIp },
    (c) =>
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
      c.req.header('x-real-ip') ??
      'unknown'
  );
  const installLimiter = createRateLimiter(
    { windowMs: 60_000, maxRequests: config.rateLimitPerInstall },
    (c) => c.req.header('x-agentguard-install-id') ?? null
  );

  app.use('/api/v1/telemetry/*', ipLimiter);
  app.use('/api/v1/telemetry/*', installLimiter);

  // Telemetry routes — use enrollment tokens, not API key auth
  app.route('/api', enrollRoutes(store, config));
  app.route('/api', telemetryBatchRoutes(store, config));

  // Auth middleware on all other /api routes (excluding health and telemetry)
  app.use('/api/*', ipWhitelist(config));
  app.use('/api/*', apiKeyAuth(config));

  // Data routes
  app.route('/api', ingestRoutes(store));
  app.route('/api', eventRoutes(store));
  app.route('/api', decisionRoutes(store));
  app.route('/api', traceRoutes(store));

  return { app, config };
}
