// Telemetry batch route — accept batched telemetry events from clients.

import { Hono } from 'hono';
import { createHash } from 'node:crypto';
import { verifySignature, canonicalize } from '@red-codes/telemetry-client';
import type { TelemetryDataStore } from '../store/types.js';
import type { ServerConfig } from '../config.js';

const MAX_BATCH_SIZE = 50;
const VALID_RUNTIMES = new Set(['claude-code', 'copilot', 'ci', 'unknown']);
const VALID_ENVIRONMENTS = new Set(['local', 'ci', 'container']);
const VALID_EVENT_TYPES = new Set([
  'guard_triggered',
  'policy_denied',
  'execution_allowed',
  'error',
]);
const VALID_RESULTS = new Set(['allowed', 'denied', 'error']);

interface BatchPayloadEvent {
  event_id?: string;
  timestamp?: number;
  version?: string;
  runtime?: string;
  environment?: string;
  event_type?: string;
  policy?: string;
  result?: string;
  latency_ms?: number;
}

interface BatchRequestBody {
  mode?: string;
  events?: BatchPayloadEvent[];
}

function validateEvent(event: BatchPayloadEvent): string | null {
  if (!event.event_id || typeof event.event_id !== 'string') return 'missing event_id';
  if (!event.timestamp || typeof event.timestamp !== 'number') return 'missing timestamp';
  if (!event.version || typeof event.version !== 'string') return 'missing version';
  if (!event.runtime || !VALID_RUNTIMES.has(event.runtime)) return 'invalid runtime';
  if (!event.environment || !VALID_ENVIRONMENTS.has(event.environment))
    return 'invalid environment';
  if (!event.event_type || !VALID_EVENT_TYPES.has(event.event_type)) return 'invalid event_type';
  if (!event.policy || typeof event.policy !== 'string') return 'missing policy';
  if (!event.result || !VALID_RESULTS.has(event.result)) return 'invalid result';
  if (typeof event.latency_ms !== 'number' || event.latency_ms < 0) return 'invalid latency_ms';

  // Reject extra fields
  const allowedFields = new Set([
    'event_id',
    'timestamp',
    'version',
    'runtime',
    'environment',
    'event_type',
    'policy',
    'result',
    'latency_ms',
  ]);
  for (const key of Object.keys(event)) {
    if (!allowedFields.has(key)) return `unexpected field: ${key}`;
  }

  return null;
}

export function telemetryBatchRoutes(store: TelemetryDataStore, config: ServerConfig) {
  const app = new Hono();

  app.post('/v1/telemetry/batch', async (c) => {
    // Check content length
    const contentLength = c.req.header('content-length');
    if (contentLength && Number(contentLength) > config.maxRequestSizeMb * 1024 * 1024) {
      return c.json({ error: 'Request body too large' }, 413);
    }

    let body: BatchRequestBody;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const mode = body.mode;
    if (mode !== 'anonymous' && mode !== 'verified') {
      return c.json({ error: 'Invalid mode (must be anonymous or verified)' }, 400);
    }

    const events = body.events;
    if (!Array.isArray(events) || events.length === 0) {
      return c.json({ error: 'Events array is required and must not be empty' }, 400);
    }

    if (events.length > MAX_BATCH_SIZE) {
      return c.json({ error: `Batch size exceeds maximum of ${MAX_BATCH_SIZE}` }, 413);
    }

    // Validate each event
    for (const event of events) {
      const err = validateEvent(event);
      if (err) {
        return c.json({ error: `Invalid event: ${err}` }, 400);
      }
    }

    // Anti-replay: reject events with timestamps outside the window
    const now = Math.floor(Date.now() / 1000);
    const windowSec = Math.floor(config.antiReplayWindowMs / 1000);
    for (const event of events) {
      if (event.timestamp && Math.abs(now - event.timestamp) > windowSec) {
        return c.json({ error: 'Event timestamp outside acceptable window' }, 400);
      }
    }

    // Verify authentication for verified mode
    let installId: string | null = null;

    if (mode === 'verified') {
      const authHeader = c.req.header('Authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return c.json({ error: 'Missing Authorization header for verified mode' }, 401);
      }

      const token = authHeader.slice(7);
      const tokenHash = createHash('sha256').update(token).digest('hex');
      const install = await store.findInstallByTokenHash(tokenHash);

      if (!install) {
        return c.json({ error: 'Invalid or unknown installation token' }, 401);
      }

      // Verify signature
      const signature = c.req.header('X-AgentGuard-Signature');
      if (signature) {
        const rawBody = canonicalize(body);
        const valid = verifySignature(rawBody, signature, install.public_key);
        if (!valid) {
          return c.json({ error: 'Invalid signature' }, 403);
        }
      }

      installId = install.install_id;
    }

    // Store events
    const receivedAt = new Date().toISOString();
    const records = events.map((event) => ({
      event_id: event.event_id!,
      install_id: installId,
      event_json: JSON.stringify(event),
      received_at: receivedAt,
    }));

    await store.appendTelemetryPayloads(records);

    return c.json({ ok: true, accepted: events.length });
  });

  return app;
}
