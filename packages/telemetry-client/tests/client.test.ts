import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createTelemetryClient } from '../src/client.js';

describe('TelemetryClient', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ag-client-'));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    vi.unstubAllGlobals();
    delete process.env.AGENTGUARD_TELEMETRY;
  });

  it('returns no-op client when mode is off', async () => {
    process.env.AGENTGUARD_TELEMETRY = 'off';
    const client = await createTelemetryClient({
      identityPath: join(tempDir, 'identity.json'),
    });

    const status = client.status();
    expect(status.mode).toBe('off');
    expect(status.queueSize).toBe(0);

    // track should be safe (no-op)
    client.track({
      runtime: 'claude-code',
      environment: 'local',
      event_type: 'guard_triggered',
      policy: 'default',
      result: 'allowed',
      latency_ms: 10,
    });

    client.stop();
  });

  it('tracks events when mode is anonymous', async () => {
    process.env.AGENTGUARD_TELEMETRY = 'anonymous';
    const client = await createTelemetryClient({
      identityPath: join(tempDir, 'identity.json'),
      queuePath: join(tempDir, 'queue.jsonl'),
    });

    client.track({
      runtime: 'claude-code',
      environment: 'local',
      event_type: 'guard_triggered',
      policy: 'default',
      result: 'allowed',
      latency_ms: 10,
    });

    const status = client.status();
    expect(status.mode).toBe('anonymous');
    expect(status.queueSize).toBe(1);

    client.stop();
  });

  it('status returns correct info', async () => {
    process.env.AGENTGUARD_TELEMETRY = 'anonymous';
    const client = await createTelemetryClient({
      identityPath: join(tempDir, 'identity.json'),
      queuePath: join(tempDir, 'queue.jsonl'),
    });

    const status = client.status();
    expect(status.mode).toBe('anonymous');
    expect(status.enrolled).toBe(false);
    expect(status.queueSize).toBe(0);

    client.stop();
  });

  it('reset cleans up files', async () => {
    process.env.AGENTGUARD_TELEMETRY = 'anonymous';
    const client = await createTelemetryClient({
      identityPath: join(tempDir, 'identity.json'),
      queuePath: join(tempDir, 'queue.jsonl'),
    });

    client.track({
      runtime: 'claude-code',
      environment: 'local',
      event_type: 'guard_triggered',
      policy: 'default',
      result: 'allowed',
      latency_ms: 10,
    });

    client.reset();

    // After reset, re-creating the client should start fresh
    const client2 = await createTelemetryClient({
      identityPath: join(tempDir, 'identity.json'),
      queuePath: join(tempDir, 'queue.jsonl'),
    });

    expect(client2.status().queueSize).toBe(0);
    client2.stop();
  });
});
