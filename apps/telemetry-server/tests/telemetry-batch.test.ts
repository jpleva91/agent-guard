import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { createHash, generateKeyPairSync, randomUUID } from 'node:crypto';
import { telemetryBatchRoutes } from '../src/routes/telemetry-batch.js';
import { enrollRoutes } from '../src/routes/enroll.js';
import { createMemoryStore } from '../src/store/memory-store.js';
import { loadConfig } from '../src/config.js';
import { canonicalize, signPayload } from '@red-codes/telemetry-client';

function makeApp() {
  const config = { ...loadConfig(), antiReplayWindowMs: 300_000, maxRequestSizeMb: 1 };
  const store = createMemoryStore();
  const app = new Hono();
  app.route('/api', enrollRoutes(store, config));
  app.route('/api', telemetryBatchRoutes(store, config));
  return { app, store, config };
}

function makeValidEvent() {
  return {
    event_id: randomUUID(),
    timestamp: Math.floor(Date.now() / 1000),
    version: '1.0.0',
    runtime: 'claude-code',
    environment: 'local',
    event_type: 'guard_triggered',
    policy: 'default',
    result: 'allowed',
    latency_ms: 42,
  };
}

describe('POST /api/v1/telemetry/batch', () => {
  it('accepts valid anonymous batch', async () => {
    const { app } = makeApp();
    const res = await app.request('/api/v1/telemetry/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'anonymous',
        events: [makeValidEvent(), makeValidEvent()],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.accepted).toBe(2);
  });

  it('rejects empty events array', async () => {
    const { app } = makeApp();
    const res = await app.request('/api/v1/telemetry/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'anonymous', events: [] }),
    });

    expect(res.status).toBe(400);
  });

  it('rejects invalid mode', async () => {
    const { app } = makeApp();
    const res = await app.request('/api/v1/telemetry/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'invalid', events: [makeValidEvent()] }),
    });

    expect(res.status).toBe(400);
  });

  it('rejects events with extra fields', async () => {
    const { app } = makeApp();
    const event = { ...makeValidEvent(), secret: 'should-not-be-here' };
    const res = await app.request('/api/v1/telemetry/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'anonymous', events: [event] }),
    });

    expect(res.status).toBe(400);
  });

  it('rejects stale timestamps (anti-replay)', async () => {
    const { app } = makeApp();
    const event = {
      ...makeValidEvent(),
      timestamp: Math.floor(Date.now() / 1000) - 600, // 10 min old
    };
    const res = await app.request('/api/v1/telemetry/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'anonymous', events: [event] }),
    });

    expect(res.status).toBe(400);
  });

  it('rejects batch exceeding max size', async () => {
    const { app } = makeApp();
    const events = Array.from({ length: 51 }, () => makeValidEvent());
    const res = await app.request('/api/v1/telemetry/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'anonymous', events }),
    });

    expect(res.status).toBe(413);
  });

  it('rejects verified mode without auth header', async () => {
    const { app } = makeApp();
    const res = await app.request('/api/v1/telemetry/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'verified', events: [makeValidEvent()] }),
    });

    expect(res.status).toBe(401);
  });

  it('accepts verified mode with valid token and signature', async () => {
    const { app } = makeApp();

    // First enroll
    const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    const installId = '550e8400-e29b-41d4-a716-446655440000';
    const enrollRes = await app.request('/api/v1/telemetry/enroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        install_id: installId,
        public_key: publicKey,
        version: '1.0.0',
      }),
    });
    const { token } = await enrollRes.json();

    // Now send batch with signature
    const batchBody = { mode: 'verified', events: [makeValidEvent()] };
    const canonical = canonicalize(batchBody);
    const signature = signPayload(canonical, privateKey);

    const res = await app.request('/api/v1/telemetry/batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-AgentGuard-Install-ID': installId,
        'X-AgentGuard-Signature': signature,
      },
      body: canonical,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it('rejects verified mode with invalid signature', async () => {
    const { app } = makeApp();

    const { publicKey } = generateKeyPairSync('ed25519', {
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    const installId = '550e8400-e29b-41d4-a716-446655440001';
    const enrollRes = await app.request('/api/v1/telemetry/enroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        install_id: installId,
        public_key: publicKey,
        version: '1.0.0',
      }),
    });
    const { token } = await enrollRes.json();

    const batchBody = { mode: 'verified', events: [makeValidEvent()] };

    const res = await app.request('/api/v1/telemetry/batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-AgentGuard-Install-ID': installId,
        'X-AgentGuard-Signature': 'invalid-signature',
      },
      body: JSON.stringify(batchBody),
    });

    expect(res.status).toBe(403);
  });
});
