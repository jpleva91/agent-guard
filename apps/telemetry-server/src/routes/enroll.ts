// Enrollment route — register an AgentGuard installation for verified telemetry.

import { Hono } from 'hono';
import { createHash, randomBytes, createPublicKey } from 'node:crypto';
import type { TelemetryDataStore } from '../store/types.js';
import type { ServerConfig } from '../config.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function enrollRoutes(store: TelemetryDataStore, config: ServerConfig) {
  const app = new Hono();

  app.post('/v1/telemetry/enroll', async (c) => {
    if (!config.enrollmentEnabled) {
      return c.json({ error: 'Enrollment is disabled' }, 403);
    }

    let body: { install_id?: string; public_key?: string; version?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const { install_id, public_key, version } = body;

    // Validate install_id
    if (!install_id || !UUID_RE.test(install_id)) {
      return c.json({ error: 'Invalid or missing install_id (must be UUID v4)' }, 400);
    }

    // Validate public_key
    if (!public_key || typeof public_key !== 'string') {
      return c.json({ error: 'Missing public_key' }, 400);
    }

    try {
      createPublicKey(public_key);
    } catch {
      return c.json({ error: 'Invalid Ed25519 public key' }, 400);
    }

    // Validate version
    if (!version || typeof version !== 'string') {
      return c.json({ error: 'Missing version' }, 400);
    }

    // Check for existing install (idempotent)
    const existing = await store.findInstallById(install_id);
    if (existing) {
      // Re-generate token for existing install
      const newToken = randomBytes(32).toString('hex');
      const newTokenHash = createHash('sha256').update(newToken).digest('hex');
      await store.createInstall({
        ...existing,
        token_hash: newTokenHash,
        version,
      });
      return c.json({ ok: true, token: newToken });
    }

    // Generate installation token
    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');

    await store.createInstall({
      install_id,
      public_key,
      token_hash: tokenHash,
      version,
      enrolled_at: new Date().toISOString(),
    });

    return c.json({ ok: true, token });
  });

  return app;
}
