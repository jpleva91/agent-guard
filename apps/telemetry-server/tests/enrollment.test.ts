import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { generateKeyPairSync } from 'node:crypto';
import { enrollRoutes } from '../src/routes/enroll.js';
import { createMemoryStore } from '../src/store/memory-store.js';
import { loadConfig } from '../src/config.js';

function makeApp() {
  const config = loadConfig();
  const store = createMemoryStore();
  const app = new Hono();
  app.route('/api', enrollRoutes(store, config));
  return { app, store };
}

function generateTestKey() {
  const { publicKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return publicKey;
}

describe('POST /api/v1/telemetry/enroll', () => {
  it('enrolls successfully with valid data', async () => {
    const { app } = makeApp();
    const res = await app.request('/api/v1/telemetry/enroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        install_id: '550e8400-e29b-41d4-a716-446655440000',
        public_key: generateTestKey(),
        version: '1.0.0',
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.token).toBeDefined();
    expect(typeof body.token).toBe('string');
    expect(body.token.length).toBeGreaterThan(0);
  });

  it('rejects invalid install_id', async () => {
    const { app } = makeApp();
    const res = await app.request('/api/v1/telemetry/enroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        install_id: 'not-a-uuid',
        public_key: generateTestKey(),
        version: '1.0.0',
      }),
    });

    expect(res.status).toBe(400);
  });

  it('rejects invalid public key', async () => {
    const { app } = makeApp();
    const res = await app.request('/api/v1/telemetry/enroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        install_id: '550e8400-e29b-41d4-a716-446655440000',
        public_key: 'not-a-key',
        version: '1.0.0',
      }),
    });

    expect(res.status).toBe(400);
  });

  it('handles duplicate install_id idempotently', async () => {
    const { app } = makeApp();
    const body = {
      install_id: '550e8400-e29b-41d4-a716-446655440000',
      public_key: generateTestKey(),
      version: '1.0.0',
    };

    const res1 = await app.request('/api/v1/telemetry/enroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(res1.status).toBe(200);

    const res2 = await app.request('/api/v1/telemetry/enroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(res2.status).toBe(200);
  });

  it('rejects missing version', async () => {
    const { app } = makeApp();
    const res = await app.request('/api/v1/telemetry/enroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        install_id: '550e8400-e29b-41d4-a716-446655440000',
        public_key: generateTestKey(),
      }),
    });

    expect(res.status).toBe(400);
  });
});
