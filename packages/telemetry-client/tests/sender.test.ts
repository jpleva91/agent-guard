import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTelemetrySender } from '../src/sender.js';
import type { TelemetryQueue, TelemetryPayloadEvent, TelemetryClientConfig } from '../src/types.js';

function makeEvent(id: string): TelemetryPayloadEvent {
  return {
    event_id: id,
    timestamp: Math.floor(Date.now() / 1000),
    version: '1.0.0',
    runtime: 'claude-code',
    environment: 'local',
    event_type: 'guard_triggered',
    policy: 'default',
    result: 'allowed',
    latency_ms: 10,
  };
}

function createMockQueue(events: TelemetryPayloadEvent[] = []): TelemetryQueue {
  const items = [...events];
  return {
    enqueue(event: TelemetryPayloadEvent) {
      items.push(event);
    },
    dequeue(count: number) {
      return items.splice(0, count);
    },
    size() {
      return items.length;
    },
    sizeBytes() {
      return JSON.stringify(items).length;
    },
    clear() {
      items.length = 0;
    },
    close() {
      // no-op
    },
  };
}

describe('TelemetrySender', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('flush sends batched events to server', async () => {
    const queue = createMockQueue([makeEvent('a'), makeEvent('b')]);
    const config: TelemetryClientConfig = {
      serverUrl: 'https://telemetry.test',
      batchSize: 50,
      maxRetries: 0,
    };

    const sender = createTelemetrySender(config, null, queue);
    await sender.flush();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://telemetry.test/api/v1/telemetry/batch');
    expect(options.method).toBe('POST');

    const body = JSON.parse(options.body);
    expect(body.mode).toBe('anonymous');
    expect(body.events).toHaveLength(2);
  });

  it('does not send when queue is empty', async () => {
    const queue = createMockQueue();
    const config: TelemetryClientConfig = {
      serverUrl: 'https://telemetry.test',
    };

    const sender = createTelemetrySender(config, null, queue);
    await sender.flush();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not send when no server URL', async () => {
    const queue = createMockQueue([makeEvent('a')]);
    const config: TelemetryClientConfig = {};

    const sender = createTelemetrySender(config, null, queue);
    await sender.flush();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('swallows fetch errors gracefully', async () => {
    fetchSpy.mockRejectedValue(new Error('network down'));

    const queue = createMockQueue([makeEvent('a')]);
    const config: TelemetryClientConfig = {
      serverUrl: 'https://telemetry.test',
      maxRetries: 0,
    };

    const sender = createTelemetrySender(config, null, queue);
    await expect(sender.flush()).resolves.toBeUndefined();
  });

  it('start and stop manage the interval', () => {
    const queue = createMockQueue();
    const config: TelemetryClientConfig = {
      serverUrl: 'https://telemetry.test',
      flushIntervalMs: 1000,
    };

    const sender = createTelemetrySender(config, null, queue);
    sender.start();
    sender.start(); // idempotent
    sender.stop();
    sender.stop(); // idempotent
  });

  it('includes auth headers for verified mode', async () => {
    const queue = createMockQueue([makeEvent('a')]);
    const { generateIdentity } = await import('../src/identity.js');
    const identity = {
      ...generateIdentity('verified'),
      enrollment_token: 'test-token-123',
    };

    const config: TelemetryClientConfig = {
      serverUrl: 'https://telemetry.test',
      maxRetries: 0,
    };

    const sender = createTelemetrySender(config, identity, queue);
    await sender.flush();

    const [, options] = fetchSpy.mock.calls[0];
    expect(options.headers['Authorization']).toBe('Bearer test-token-123');
    expect(options.headers['X-AgentGuard-Install-ID']).toBe(identity.install_id);
    expect(options.headers['X-AgentGuard-Signature']).toBeDefined();
  });
});
