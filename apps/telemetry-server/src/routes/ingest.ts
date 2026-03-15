// Ingest endpoint — accepts batched webhook payloads from AgentGuard clients.
// Payload format matches packages/storage/src/webhook-sink.ts output.

import { Hono } from 'hono';
import type { TelemetryStore } from '../store/types.js';

const MAX_BATCH_SIZE = 500;

export function ingestRoutes(store: TelemetryStore): Hono {
  const routes = new Hono();

  routes.post('/ingest', async (c) => {
    const body = await c.req.json();

    if (!body || typeof body !== 'object') {
      return c.json({ error: 'Invalid request body' }, 400);
    }

    const { type, batch } = body as { type: string; batch: unknown[] };

    if (!type || !Array.isArray(batch) || batch.length === 0) {
      return c.json({ error: 'Missing required fields: type, batch (non-empty array)' }, 400);
    }

    if (batch.length > MAX_BATCH_SIZE) {
      return c.json({ error: `Batch size ${batch.length} exceeds maximum ${MAX_BATCH_SIZE}` }, 413);
    }

    const runId = (body as { run_id?: string }).run_id;

    switch (type) {
      case 'events': {
        if (!runId) {
          return c.json({ error: 'run_id is required for events' }, 400);
        }
        await store.appendEvents(runId, batch as Parameters<TelemetryStore['appendEvents']>[1]);
        break;
      }
      case 'decisions': {
        if (!runId) {
          return c.json({ error: 'run_id is required for decisions' }, 400);
        }
        await store.appendDecisions(
          runId,
          batch as Parameters<TelemetryStore['appendDecisions']>[1]
        );
        break;
      }
      case 'traces': {
        await store.appendTraces(batch as Parameters<TelemetryStore['appendTraces']>[0]);
        break;
      }
      default:
        return c.json({ error: `Unknown payload type: ${type}` }, 400);
    }

    return c.json({ ok: true, ingested: batch.length });
  });

  return routes;
}
