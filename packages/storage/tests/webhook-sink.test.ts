// Tests for webhook storage backend — batched HTTP POST sinks.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createWebhookEventSink,
  createWebhookDecisionSink,
  createWebhookTraceBackend,
} from '@red-codes/storage';
import type { WebhookConfig } from '@red-codes/storage';
import type { DomainEvent } from '@red-codes/core';
import type { GovernanceDecisionRecord } from '@red-codes/core';
import type { TraceSpan } from '@red-codes/telemetry';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDomainEvent(id: string, kind = 'ActionRequested'): DomainEvent {
  return {
    id,
    kind,
    timestamp: new Date().toISOString(),
    fingerprint: `fp_${id}`,
    data: {},
  } as unknown as DomainEvent;
}

function makeDecisionRecord(id: string): GovernanceDecisionRecord {
  return {
    recordId: id,
    runId: 'run_test',
    timestamp: new Date().toISOString(),
    outcome: 'allow' as const,
    action: { type: 'file.read', target: '/tmp/test', agent: 'test', destructive: false },
    reason: 'allowed by policy',
    intervention: null,
    matchedPolicyId: 'test-policy',
    severity: 'info',
    violations: [],
    simulation: null,
    evidencePackId: null,
    escalationState: 'NORMAL',
    execution: null,
    executionDurationMs: null,
  } as unknown as GovernanceDecisionRecord;
}

function makeTraceSpan(id: string): TraceSpan {
  return {
    spanId: id,
    parentSpanId: undefined,
    kind: 'kernel.propose' as const,
    name: `propose:file.read`,
    startTime: Date.now() - 100,
    endTime: Date.now(),
    durationMs: 100,
    status: 'ok' as const,
    error: undefined,
    attributes: {},
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('webhook-sink', () => {
  let fetchCalls: Array<{ url: string; init: RequestInit }>;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    fetchCalls = [];
    globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      fetchCalls.push({ url: url as string, init: init! });
      return new Response('ok', { status: 200 });
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const baseConfig: WebhookConfig = {
    url: 'https://logs.example.com/ingest',
    batchSize: 3,
    flushIntervalMs: 0, // Disable timer for deterministic tests
  };

  describe('createWebhookEventSink', () => {
    it('batches events and flushes at batchSize', () => {
      const sink = createWebhookEventSink(baseConfig, 'run_1');

      sink.write(makeDomainEvent('e1'));
      sink.write(makeDomainEvent('e2'));
      expect(fetchCalls).toHaveLength(0);

      sink.write(makeDomainEvent('e3'));
      expect(fetchCalls).toHaveLength(1);

      const body = JSON.parse(fetchCalls[0].init.body as string);
      expect(body.type).toBe('events');
      expect(body.run_id).toBe('run_1');
      expect(body.batch).toHaveLength(3);
      expect(body.batch[0].id).toBe('e1');
    });

    it('flushes remaining items on explicit flush()', () => {
      const sink = createWebhookEventSink(baseConfig, 'run_1');
      sink.write(makeDomainEvent('e1'));
      expect(fetchCalls).toHaveLength(0);

      sink.flush!();
      expect(fetchCalls).toHaveLength(1);

      const body = JSON.parse(fetchCalls[0].init.body as string);
      expect(body.batch).toHaveLength(1);
    });

    it('does not flush when buffer is empty', () => {
      const sink = createWebhookEventSink(baseConfig, 'run_1');
      sink.flush!();
      expect(fetchCalls).toHaveLength(0);
    });

    it('sends custom headers', () => {
      const config: WebhookConfig = {
        ...baseConfig,
        headers: { Authorization: 'Bearer token123' },
        batchSize: 1,
      };
      const sink = createWebhookEventSink(config, 'run_1');
      sink.write(makeDomainEvent('e1'));

      expect(fetchCalls).toHaveLength(1);
      const headers = fetchCalls[0].init.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer token123');
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('calls onError when fetch fails', async () => {
      const errors: Error[] = [];
      const config: WebhookConfig = {
        ...baseConfig,
        batchSize: 1,
        onError: (err) => errors.push(err),
      };

      globalThis.fetch = vi.fn(async () => {
        throw new Error('network error');
      }) as unknown as typeof fetch;

      const sink = createWebhookEventSink(config, 'run_1');
      sink.write(makeDomainEvent('e1'));

      // Wait for the async catch to fire
      await new Promise((r) => setTimeout(r, 10));
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toBe('network error');
    });

    it('flushes on close()', () => {
      const sink = createWebhookEventSink(baseConfig, 'run_1');
      sink.write(makeDomainEvent('e1'));
      sink.write(makeDomainEvent('e2'));
      expect(fetchCalls).toHaveLength(0);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sink as any).close();
      expect(fetchCalls).toHaveLength(1);
      const body = JSON.parse(fetchCalls[0].init.body as string);
      expect(body.batch).toHaveLength(2);
    });
  });

  describe('createWebhookDecisionSink', () => {
    it('batches decisions and flushes at batchSize', () => {
      const sink = createWebhookDecisionSink(baseConfig, 'run_2');

      sink.write(makeDecisionRecord('d1'));
      sink.write(makeDecisionRecord('d2'));
      expect(fetchCalls).toHaveLength(0);

      sink.write(makeDecisionRecord('d3'));
      expect(fetchCalls).toHaveLength(1);

      const body = JSON.parse(fetchCalls[0].init.body as string);
      expect(body.type).toBe('decisions');
      expect(body.run_id).toBe('run_2');
      expect(body.batch).toHaveLength(3);
    });

    it('flushes remaining items on flush()', () => {
      const sink = createWebhookDecisionSink(baseConfig, 'run_2');
      sink.write(makeDecisionRecord('d1'));
      sink.flush!();

      expect(fetchCalls).toHaveLength(1);
      const body = JSON.parse(fetchCalls[0].init.body as string);
      expect(body.batch).toHaveLength(1);
    });
  });

  describe('createWebhookTraceBackend', () => {
    it('buffers spans on onSpanEnd and flushes at batchSize', () => {
      const backend = createWebhookTraceBackend({ ...baseConfig, batchSize: 2 });

      backend.onSpanEnd(makeTraceSpan('s1'));
      expect(fetchCalls).toHaveLength(0);

      backend.onSpanEnd(makeTraceSpan('s2'));
      expect(fetchCalls).toHaveLength(1);

      const body = JSON.parse(fetchCalls[0].init.body as string);
      expect(body.type).toBe('traces');
      expect(body.batch).toHaveLength(2);
    });

    it('onSpanStart is a no-op', () => {
      const backend = createWebhookTraceBackend(baseConfig);
      backend.onSpanStart(makeTraceSpan('s1'));
      expect(fetchCalls).toHaveLength(0);
    });

    it('flushes remaining spans on shutdown', () => {
      const backend = createWebhookTraceBackend(baseConfig);
      backend.onSpanEnd(makeTraceSpan('s1'));
      expect(fetchCalls).toHaveLength(0);

      backend.shutdown!();
      expect(fetchCalls).toHaveLength(1);
    });

    it('has name "webhook"', () => {
      const backend = createWebhookTraceBackend(baseConfig);
      expect(backend.name).toBe('webhook');
    });
  });

  describe('timer-based flush', () => {
    it('flushes on interval when flushIntervalMs > 0', async () => {
      const config: WebhookConfig = {
        url: 'https://logs.example.com/ingest',
        batchSize: 100, // High threshold so only timer triggers flush
        flushIntervalMs: 50,
      };

      const sink = createWebhookEventSink(config, 'run_timer');
      sink.write(makeDomainEvent('e1'));
      expect(fetchCalls).toHaveLength(0);

      // Wait for timer to fire
      await new Promise((r) => setTimeout(r, 80));
      expect(fetchCalls).toHaveLength(1);

      // Clean up: close sink to clear interval
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sink as any).close();
    });
  });
});
