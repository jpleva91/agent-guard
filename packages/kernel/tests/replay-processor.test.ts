// Tests for the replay processor plugin interface — verifies processor
// registration, pipeline execution, lifecycle callbacks, error isolation,
// and result collection.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createReplayProcessorRegistry,
  runReplayProcessorPipeline,
} from '@red-codes/kernel';
import type {
  ReplayProcessor,
  ReplayProcessorRegistry,
} from '@red-codes/kernel';
import { buildReplaySession } from '@red-codes/kernel';
import type { DomainEvent } from '@red-codes/core';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Create a minimal DomainEvent for testing */
function testEvent(
  kind: string,
  data: Record<string, unknown> = {},
  timestamp?: number
): DomainEvent {
  return {
    id: `evt_test_${Math.random().toString(36).slice(2, 6)}`,
    kind: kind as DomainEvent['kind'],
    timestamp: timestamp || Date.now(),
    fingerprint: 'test',
    ...data,
  };
}

/** Create a full action lifecycle (requested → allowed → executed) */
function createAllowedActionEvents(
  actionType: string,
  target: string,
  baseTimestamp: number
): DomainEvent[] {
  return [
    testEvent(
      'ActionRequested',
      { actionType, target, justification: 'test action' },
      baseTimestamp
    ),
    testEvent(
      'ActionAllowed',
      { actionType, target, capability: 'test', reason: 'allowed' },
      baseTimestamp + 1
    ),
    testEvent('ActionExecuted', { actionType, target, result: 'ok' }, baseTimestamp + 2),
  ];
}

/** Create a denied action lifecycle */
function createDeniedActionEvents(
  actionType: string,
  target: string,
  reason: string,
  baseTimestamp: number
): DomainEvent[] {
  return [
    testEvent(
      'ActionRequested',
      { actionType, target, justification: 'test action' },
      baseTimestamp
    ),
    testEvent('ActionDenied', { actionType, target, reason }, baseTimestamp + 1),
  ];
}

/** Build a test session from events */
function buildTestSession(events: DomainEvent[]) {
  return buildReplaySession('test-run', events);
}

/** Create a simple counting processor */
function createCountingProcessor(
  id: string,
  name: string
): ReplayProcessor & {
  counts: { sessionStart: number; events: number; actions: number; sessionEnd: number };
} {
  const counts = { sessionStart: 0, events: 0, actions: 0, sessionEnd: 0 };
  return {
    id,
    name,
    counts,
    onSessionStart() {
      counts.sessionStart++;
    },
    onEvent() {
      counts.events++;
    },
    onAction() {
      counts.actions++;
    },
    onSessionEnd() {
      counts.sessionEnd++;
    },
    getResults() {
      return { ...counts };
    },
  };
}

// ---------------------------------------------------------------------------
// Registry tests
// ---------------------------------------------------------------------------

describe('ReplayProcessorRegistry', () => {
  let registry: ReplayProcessorRegistry;

  beforeEach(() => {
    registry = createReplayProcessorRegistry();
  });

  it('registers a processor', () => {
    const processor: ReplayProcessor = { id: 'test', name: 'Test' };
    registry.register(processor);
    expect(registry.has('test')).toBe(true);
    expect(registry.count()).toBe(1);
  });

  it('retrieves a registered processor by id', () => {
    const processor: ReplayProcessor = { id: 'test', name: 'Test' };
    registry.register(processor);
    expect(registry.get('test')).toBe(processor);
  });

  it('returns undefined for unregistered id', () => {
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  it('lists processors in registration order', () => {
    const p1: ReplayProcessor = { id: 'first', name: 'First' };
    const p2: ReplayProcessor = { id: 'second', name: 'Second' };
    const p3: ReplayProcessor = { id: 'third', name: 'Third' };
    registry.register(p1);
    registry.register(p2);
    registry.register(p3);

    const list = registry.list();
    expect(list).toHaveLength(3);
    expect(list[0].id).toBe('first');
    expect(list[1].id).toBe('second');
    expect(list[2].id).toBe('third');
  });

  it('throws on duplicate processor id', () => {
    registry.register({ id: 'dup', name: 'First' });
    expect(() => registry.register({ id: 'dup', name: 'Second' })).toThrow(
      'Processor "dup" is already registered'
    );
  });

  it('throws on missing id', () => {
    expect(() => registry.register({ id: '', name: 'No ID' })).toThrow(
      'Processor must have a non-empty string id'
    );
  });

  it('throws on missing name', () => {
    expect(() => registry.register({ id: 'test', name: '' })).toThrow(
      'Processor must have a non-empty string name'
    );
  });

  it('unregisters a processor', () => {
    registry.register({ id: 'test', name: 'Test' });
    expect(registry.unregister('test')).toBe(true);
    expect(registry.has('test')).toBe(false);
    expect(registry.count()).toBe(0);
  });

  it('returns false when unregistering nonexistent processor', () => {
    expect(registry.unregister('nope')).toBe(false);
  });

  it('allows re-registration after unregister', () => {
    registry.register({ id: 'test', name: 'Test' });
    registry.unregister('test');
    registry.register({ id: 'test', name: 'Test Reborn' });
    expect(registry.get('test')?.name).toBe('Test Reborn');
  });
});

// ---------------------------------------------------------------------------
// Pipeline tests
// ---------------------------------------------------------------------------

describe('runReplayProcessorPipeline', () => {
  let registry: ReplayProcessorRegistry;

  beforeEach(() => {
    registry = createReplayProcessorRegistry();
  });

  it('runs empty pipeline with no processors', async () => {
    const session = buildTestSession([testEvent('RunStarted', { runId: 'test-run' })]);

    const result = await runReplayProcessorPipeline(session, registry);
    expect(result.processorsRun).toBe(0);
    expect(result.successes).toBe(0);
    expect(result.failures).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(result.sessionId).toBe('test-run');
  });

  it('invokes all lifecycle callbacks in order', async () => {
    const callOrder: string[] = [];
    const processor: ReplayProcessor = {
      id: 'order-test',
      name: 'Order Test',
      onSessionStart() {
        callOrder.push('start');
      },
      onEvent() {
        callOrder.push('event');
      },
      onAction() {
        callOrder.push('action');
      },
      onSessionEnd() {
        callOrder.push('end');
      },
    };
    registry.register(processor);

    const events = [
      testEvent('RunStarted', { runId: 'test-run' }, 1000),
      ...createAllowedActionEvents('file.write', '/test.ts', 2000),
      testEvent('RunEnded', { runId: 'test-run', result: 'ok' }, 3000),
    ];
    const session = buildTestSession(events);

    await runReplayProcessorPipeline(session, registry);

    // start → events (5 total) → action (1 total) → end
    expect(callOrder[0]).toBe('start');
    expect(callOrder[callOrder.length - 1]).toBe('end');
    expect(callOrder.filter((c) => c === 'event')).toHaveLength(5);
    expect(callOrder.filter((c) => c === 'action')).toHaveLength(1);
  });

  it('counts events and actions correctly', async () => {
    const counter = createCountingProcessor('counter', 'Counter');
    registry.register(counter);

    const events = [
      testEvent('RunStarted', { runId: 'test-run' }, 1000),
      ...createAllowedActionEvents('file.write', '/a.ts', 2000),
      ...createDeniedActionEvents('git.push', 'main', 'protected', 3000),
      testEvent('RunEnded', { runId: 'test-run', result: 'ok' }, 4000),
    ];
    const session = buildTestSession(events);

    const result = await runReplayProcessorPipeline(session, registry);

    expect(result.processorsRun).toBe(1);
    expect(result.successes).toBe(1);
    expect(result.failures).toBe(0);

    const data = result.results[0].data;
    expect(data.sessionStart).toBe(1);
    expect(data.events).toBe(7); // RunStarted + 3 allowed + 2 denied + RunEnded
    expect(data.actions).toBe(2); // 1 allowed + 1 denied
    expect(data.sessionEnd).toBe(1);
  });

  it('collects results from getResults()', async () => {
    let denialCount = 0;
    const processor: ReplayProcessor = {
      id: 'denial-counter',
      name: 'Denial Counter',
      onAction(action) {
        if (!action.allowed) denialCount++;
      },
      getResults() {
        return { denials: denialCount };
      },
    };
    registry.register(processor);

    const events = [
      ...createAllowedActionEvents('file.write', '/a.ts', 1000),
      ...createDeniedActionEvents('git.push', 'main', 'protected', 2000),
      ...createDeniedActionEvents('shell.exec', 'rm -rf', 'dangerous', 3000),
    ];
    const session = buildTestSession(events);

    const result = await runReplayProcessorPipeline(session, registry);
    expect(result.results[0].data.denials).toBe(2);
  });

  it('isolates processor failures', async () => {
    const failingProcessor: ReplayProcessor = {
      id: 'failing',
      name: 'Failing Processor',
      onEvent() {
        throw new Error('processor crashed');
      },
    };

    const counter = createCountingProcessor('counter', 'Counter');

    registry.register(failingProcessor);
    registry.register(counter);

    const events = [...createAllowedActionEvents('file.write', '/test.ts', 1000)];
    const session = buildTestSession(events);

    const result = await runReplayProcessorPipeline(session, registry);

    expect(result.processorsRun).toBe(2);
    expect(result.failures).toBe(1);
    expect(result.successes).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('processor crashed');

    // Counter still ran successfully despite prior failure
    expect(result.results[1].success).toBe(true);
    expect(result.results[1].data.actions).toBe(1);
  });

  it('handles async processors', async () => {
    const asyncProcessor: ReplayProcessor = {
      id: 'async',
      name: 'Async Processor',
      async onSessionStart() {
        await Promise.resolve();
      },
      async onEvent() {
        await Promise.resolve();
      },
      async onAction() {
        await Promise.resolve();
      },
      async onSessionEnd() {
        await Promise.resolve();
      },
      getResults() {
        return { completed: true };
      },
    };
    registry.register(asyncProcessor);

    const session = buildTestSession([...createAllowedActionEvents('file.read', '/test.ts', 1000)]);

    const result = await runReplayProcessorPipeline(session, registry);
    expect(result.successes).toBe(1);
    expect(result.results[0].data.completed).toBe(true);
  });

  it('runs processors in registration order', async () => {
    const order: string[] = [];

    for (const id of ['first', 'second', 'third']) {
      registry.register({
        id,
        name: id,
        onSessionStart() {
          order.push(id);
        },
      });
    }

    const session = buildTestSession([testEvent('RunStarted', { runId: 'test-run' })]);

    await runReplayProcessorPipeline(session, registry);
    expect(order).toEqual(['first', 'second', 'third']);
  });

  it('reports per-processor duration', async () => {
    registry.register({
      id: 'slow',
      name: 'Slow Processor',
      async onSessionStart() {
        await new Promise((r) => setTimeout(r, 10));
      },
    });

    const session = buildTestSession([testEvent('RunStarted', { runId: 'test-run' })]);

    const result = await runReplayProcessorPipeline(session, registry);
    expect(result.results[0].durationMs).toBeGreaterThanOrEqual(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('handles processor with no optional methods', async () => {
    registry.register({ id: 'minimal', name: 'Minimal' });

    const session = buildTestSession([...createAllowedActionEvents('file.read', '/test.ts', 1000)]);

    const result = await runReplayProcessorPipeline(session, registry);
    expect(result.successes).toBe(1);
    expect(result.results[0].data).toEqual({});
  });

  it('captures async processor errors', async () => {
    registry.register({
      id: 'async-fail',
      name: 'Async Fail',
      async onAction() {
        throw new Error('async boom');
      },
    });

    const session = buildTestSession([...createAllowedActionEvents('file.read', '/test.ts', 1000)]);

    const result = await runReplayProcessorPipeline(session, registry);
    expect(result.failures).toBe(1);
    expect(result.errors[0]).toContain('async boom');
  });

  it('provides session id in result', async () => {
    const session = buildReplaySession('my-run-123', [
      testEvent('RunStarted', { runId: 'my-run-123' }),
    ]);

    const result = await runReplayProcessorPipeline(session, registry);
    expect(result.sessionId).toBe('my-run-123');
  });
});
