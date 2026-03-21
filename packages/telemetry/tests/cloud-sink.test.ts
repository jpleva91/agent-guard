import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DomainEvent, GovernanceDecisionRecord } from '@red-codes/core';
import { createCloudSinks } from '../src/cloud-sink.js';
import type { CloudSinkConfig } from '../src/cloud-sink.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDomainEvent(overrides: Partial<DomainEvent> = {}): DomainEvent {
  return {
    id: 'evt-001',
    kind: 'ActionExecuted',
    timestamp: Date.now(),
    fingerprint: 'abc123',
    actionType: 'file.write',
    target: '/home/user/project/src/index.ts',
    agentId: 'my-agent',
    ...overrides,
  } as DomainEvent;
}

function makeDecisionRecord(
  overrides: Partial<GovernanceDecisionRecord> = {}
): GovernanceDecisionRecord {
  return {
    recordId: 'dec-001',
    runId: 'run-123',
    timestamp: Date.now(),
    action: {
      type: 'file.write',
      target: '/home/user/project/src/main.ts',
      agent: 'my-agent',
      destructive: false,
    },
    outcome: 'allow',
    reason: 'Policy allows file.write',
    intervention: null,
    policy: {
      matchedPolicyId: 'pol-1',
      matchedPolicyName: 'default',
      severity: 0,
    },
    invariants: {
      allHold: true,
      violations: [],
    },
    simulation: null,
    evidencePackId: null,
    monitor: {
      escalationLevel: 0,
      totalEvaluations: 1,
      totalDenials: 0,
    },
    execution: {
      executed: true,
      success: true,
      durationMs: 42,
      error: null,
    },
    ...overrides,
  } as GovernanceDecisionRecord;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CloudSinkBundle', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let tmpDir: string;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 202 });
    globalThis.fetch = fetchMock;
    tmpDir = mkdtempSync(join(tmpdir(), 'cloud-sink-test-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors on Windows
    }
  });

  // -------------------------------------------------------------------------
  // 1. No-op when mode is 'off'
  // -------------------------------------------------------------------------

  it('returns no-op sinks when mode is off', async () => {
    const bundle = await createCloudSinks({
      mode: 'off',
      serverUrl: 'https://api.example.com',
      runId: 'run-1',
      agentId: 'agent-1',
      queueDir: tmpDir,
    });

    // write should not throw and should not call fetch
    bundle.eventSink.write(makeDomainEvent());
    bundle.decisionSink.write(makeDecisionRecord());
    await bundle.flush();
    bundle.registerRun();
    bundle.stop();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 2. Anonymous mode — anonymized events
  // -------------------------------------------------------------------------

  it('queues and sends anonymized events when mode is anonymous', async () => {
    const config: CloudSinkConfig = {
      mode: 'anonymous',
      serverUrl: 'https://api.example.com',
      runId: 'run-anon',
      agentId: 'agent-1',
      installId: 'install-xyz',
      queueDir: tmpDir,
      flushIntervalMs: 60_000,
      batchSize: 50,
    };

    const bundle = await createCloudSinks(config);

    const event = makeDomainEvent({
      target: '/home/user/project/src/index.ts',
      agentId: 'my-agent',
    });
    bundle.eventSink.write(event);

    // Flush to trigger send
    await bundle.flush();
    bundle.stop();

    // Should have been called for the event batch (registerRun not called yet)
    expect(fetchMock).toHaveBeenCalled();

    // Find the /v1/events call
    const eventsCall = fetchMock.mock.calls.find(
      ([url]: [string]) => typeof url === 'string' && url.includes('/v1/events')
    );
    expect(eventsCall).toBeDefined();

    const body = JSON.parse(eventsCall![1].body);
    const sent = body.events[0];

    // Anonymized: resource should be basename only
    expect(sent.resource).toBe('index.ts');

    // Anonymized: agentId should be a 64-char hex hash
    expect(sent.agentId).toMatch(/^[a-f0-9]{64}$/);

    // Anonymized: metadata should be undefined/absent
    expect(sent.metadata).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // 3. Verified mode — full data
  // -------------------------------------------------------------------------

  it('sends full data when mode is verified', async () => {
    const config: CloudSinkConfig = {
      mode: 'verified',
      serverUrl: 'https://api.example.com',
      runId: 'run-verified',
      agentId: 'agent-1',
      queueDir: tmpDir,
      batchSize: 50,
    };

    const bundle = await createCloudSinks(config);

    const event = makeDomainEvent({
      target: '/home/user/project/src/index.ts',
      agentId: 'my-agent',
      metadata: { custom: 'data' },
    });
    bundle.eventSink.write(event);

    await bundle.flush();
    bundle.stop();

    const eventsCall = fetchMock.mock.calls.find(
      ([url]: [string]) => typeof url === 'string' && url.includes('/v1/events')
    );
    expect(eventsCall).toBeDefined();

    const body = JSON.parse(eventsCall![1].body);
    const sent = body.events[0];

    // Not anonymized: full resource path
    expect(sent.resource).toBe('/home/user/project/src/index.ts');

    // Not anonymized: real agentId
    expect(sent.agentId).toBe('my-agent');

    // Metadata preserved
    expect(sent.metadata).toEqual({ custom: 'data' });
  });

  // -------------------------------------------------------------------------
  // 4. API key passthrough
  // -------------------------------------------------------------------------

  it('passes apiKey as X-API-Key header to event sender', async () => {
    const config: CloudSinkConfig = {
      mode: 'anonymous',
      serverUrl: 'https://api.example.com',
      runId: 'run-key',
      agentId: 'agent-1',
      installId: 'install-xyz',
      apiKey: 'ag_my-secret-key',
      queueDir: tmpDir,
      batchSize: 50,
    };

    const bundle = await createCloudSinks(config);
    bundle.eventSink.write(makeDomainEvent());
    await bundle.flush();
    bundle.stop();

    const eventsCall = fetchMock.mock.calls.find(
      ([url]: [string]) => typeof url === 'string' && url.includes('/v1/events')
    );
    expect(eventsCall).toBeDefined();
    expect(eventsCall![1].headers['X-API-Key']).toBe('ag_my-secret-key');
  });

  it('passes apiKey as X-API-Key header in registerRun', async () => {
    const config: CloudSinkConfig = {
      mode: 'anonymous',
      serverUrl: 'https://api.example.com',
      runId: 'run-key-reg',
      agentId: 'agent-1',
      installId: 'install-xyz',
      apiKey: 'ag_my-secret-key',
      queueDir: tmpDir,
      batchSize: 50,
    };

    const bundle = await createCloudSinks(config);
    bundle.registerRun();
    bundle.stop();

    // registerRun is fire-and-forget, give it a tick
    await new Promise((r) => setTimeout(r, 50));

    const runsCall = fetchMock.mock.calls.find(
      ([url]: [string]) => typeof url === 'string' && url.includes('/v1/runs')
    );
    expect(runsCall).toBeDefined();
    expect(runsCall![1].headers['X-API-Key']).toBe('ag_my-secret-key');
  });

  it('omits X-API-Key header when apiKey is not provided', async () => {
    const config: CloudSinkConfig = {
      mode: 'anonymous',
      serverUrl: 'https://api.example.com',
      runId: 'run-no-key',
      agentId: 'agent-1',
      installId: 'install-xyz',
      queueDir: tmpDir,
      batchSize: 50,
    };

    const bundle = await createCloudSinks(config);
    bundle.eventSink.write(makeDomainEvent());
    await bundle.flush();
    bundle.stop();

    const eventsCall = fetchMock.mock.calls.find(
      ([url]: [string]) => typeof url === 'string' && url.includes('/v1/events')
    );
    expect(eventsCall).toBeDefined();
    expect(eventsCall![1].headers['X-API-Key']).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // 5. Decision-covered domain events are deduplicated
  // -------------------------------------------------------------------------

  it('skips DecisionRecorded, ActionAllowed, ActionDenied, ActionEscalated domain events', async () => {
    const config: CloudSinkConfig = {
      mode: 'verified',
      serverUrl: 'https://api.example.com',
      runId: 'run-dedup',
      agentId: 'agent-1',
      queueDir: tmpDir,
      batchSize: 50,
    };

    const bundle = await createCloudSinks(config);

    // These should be silently skipped (covered by decisionSink)
    bundle.eventSink.write(makeDomainEvent({ kind: 'DecisionRecorded' }));
    bundle.eventSink.write(makeDomainEvent({ kind: 'ActionAllowed' }));
    bundle.eventSink.write(makeDomainEvent({ kind: 'ActionDenied' }));
    bundle.eventSink.write(makeDomainEvent({ kind: 'ActionEscalated' }));

    // This should still go through
    bundle.eventSink.write(makeDomainEvent({ kind: 'ActionExecuted' }));

    await bundle.flush();
    bundle.stop();

    const eventsCall = fetchMock.mock.calls.find(
      ([url]: [string]) => typeof url === 'string' && url.includes('/v1/events')
    );
    expect(eventsCall).toBeDefined();

    const body = JSON.parse(eventsCall![1].body);
    // Only the ActionExecuted event should have been enqueued
    expect(body.events).toHaveLength(1);
    expect(body.events[0].eventType).toBe('tool_call');
  });

  // -------------------------------------------------------------------------
  // 6. DecisionSink.write maps GovernanceDecisionRecord
  // -------------------------------------------------------------------------

  it('handles decisionSink.write for GovernanceDecisionRecord', async () => {
    const config: CloudSinkConfig = {
      mode: 'verified',
      serverUrl: 'https://api.example.com',
      runId: 'run-dec',
      agentId: 'agent-1',
      queueDir: tmpDir,
      batchSize: 50,
    };

    const bundle = await createCloudSinks(config);

    const record = makeDecisionRecord({
      outcome: 'deny',
      intervention: 'blocked by policy',
    });
    bundle.decisionSink.write(record);

    await bundle.flush();
    bundle.stop();

    const eventsCall = fetchMock.mock.calls.find(
      ([url]: [string]) => typeof url === 'string' && url.includes('/v1/events')
    );
    expect(eventsCall).toBeDefined();

    const body = JSON.parse(eventsCall![1].body);
    const sent = body.events[0];

    // Should be eventType 'decision'
    expect(sent.eventType).toBe('decision');

    // Outcome mapped from 'deny' → 'denied'
    expect(sent.outcome).toBe('denied');
  });
});
