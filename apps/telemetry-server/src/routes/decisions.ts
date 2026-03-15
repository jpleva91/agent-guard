// Decisions query endpoint — retrieve ingested governance decision records.

import { Hono } from 'hono';
import type { TelemetryStore } from '../store/types.js';

export function decisionRoutes(store: TelemetryStore): Hono {
  const routes = new Hono();

  routes.get('/decisions', async (c) => {
    const outcome = c.req.query('outcome');
    const result = await store.queryDecisions({
      runId: c.req.query('run_id'),
      outcome: outcome === 'allow' || outcome === 'deny' ? outcome : undefined,
      since: c.req.query('since'),
      until: c.req.query('until'),
      limit: c.req.query('limit') ? Number(c.req.query('limit')) : undefined,
      offset: c.req.query('offset') ? Number(c.req.query('offset')) : undefined,
    });
    return c.json(result);
  });

  return routes;
}
