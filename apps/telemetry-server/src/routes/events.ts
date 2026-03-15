// Events query endpoint — retrieve ingested domain events.

import { Hono } from 'hono';
import type { TelemetryStore } from '../store/types.js';

export function eventRoutes(store: TelemetryStore): Hono {
  const routes = new Hono();

  routes.get('/events', async (c) => {
    const result = await store.queryEvents({
      runId: c.req.query('run_id'),
      kind: c.req.query('kind'),
      since: c.req.query('since'),
      until: c.req.query('until'),
      limit: c.req.query('limit') ? Number(c.req.query('limit')) : undefined,
      offset: c.req.query('offset') ? Number(c.req.query('offset')) : undefined,
    });
    return c.json(result);
  });

  return routes;
}
