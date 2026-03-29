// Tests for NonBlockingEmitter (KE-4 Emitter plane)

import { describe, it, expect } from 'vitest';
import { createNonBlockingEmitter, EMITTER_DEFAULT_CAPACITY } from '../src/emitter.js';
import type { DomainEvent } from '@red-codes/core';
import type { GovernanceDecisionRecord } from '../src/decisions/types.js';

function makeEvent(id: string): DomainEvent {
  return {
    id,
    kind: 'ActionAllowed',
    timestamp: Date.now(),
    fingerprint: id,
    version: '1.0',
  } as unknown as DomainEvent;
}

function makeDecisionRecord(id: string): GovernanceDecisionRecord {
  return {
    recordId: id,
    runId: 'run_test',
    timestamp: Date.now(),
    action: { type: 'file.read', target: 'test.ts', agent: 'test', destructive: false },
    outcome: 'allow',
    reason: 'test',
    intervention: null,
    policy: null,
    invariants: [],
    execution: null,
    simulation: null,
    agentRole: null,
    capabilityGrant: null,
  } as unknown as GovernanceDecisionRecord;
}

describe('NonBlockingEmitter', () => {
  it('enqueues events and returns true', () => {
    const emitter = createNonBlockingEmitter();
    const event = makeEvent('evt1');
    const result = emitter.enqueue(event);
    expect(result).toBe(true);
    expect(emitter.eventQueueSize).toBe(1);
    expect(emitter.totalEnqueued).toBe(1);
  });

  it('enqueues decision records and returns true', () => {
    const emitter = createNonBlockingEmitter();
    const record = makeDecisionRecord('dec1');
    const result = emitter.enqueueDecision(record);
    expect(result).toBe(true);
    expect(emitter.decisionQueueSize).toBe(1);
  });

  it('drains events via callback in FIFO order', () => {
    const emitter = createNonBlockingEmitter();
    const e1 = makeEvent('evt1');
    const e2 = makeEvent('evt2');
    emitter.enqueue(e1);
    emitter.enqueue(e2);

    const drained: DomainEvent[] = [];
    emitter.drain((e) => drained.push(e), () => {});

    expect(drained).toEqual([e1, e2]);
    expect(emitter.eventQueueSize).toBe(0);
  });

  it('drains decision records via callback in FIFO order', () => {
    const emitter = createNonBlockingEmitter();
    const d1 = makeDecisionRecord('dec1');
    const d2 = makeDecisionRecord('dec2');
    emitter.enqueueDecision(d1);
    emitter.enqueueDecision(d2);

    const drained: GovernanceDecisionRecord[] = [];
    emitter.drain(() => {}, (d) => drained.push(d));

    expect(drained).toEqual([d1, d2]);
    expect(emitter.decisionQueueSize).toBe(0);
  });

  it('clears queues after drain', () => {
    const emitter = createNonBlockingEmitter();
    emitter.enqueue(makeEvent('e1'));
    emitter.enqueueDecision(makeDecisionRecord('d1'));

    emitter.drain(() => {}, () => {});

    expect(emitter.eventQueueSize).toBe(0);
    expect(emitter.decisionQueueSize).toBe(0);
  });

  it('drops events when buffer is at capacity', () => {
    const capacity = 3;
    const emitter = createNonBlockingEmitter(capacity);

    for (let i = 0; i < 3; i++) {
      expect(emitter.enqueue(makeEvent(`evt${i}`))).toBe(true);
    }
    // 4th should be dropped
    expect(emitter.enqueue(makeEvent('evt_overflow'))).toBe(false);
    expect(emitter.droppedCount).toBe(1);
    expect(emitter.eventQueueSize).toBe(3);
  });

  it('drops decision records when buffer is at capacity', () => {
    const capacity = 2;
    const emitter = createNonBlockingEmitter(capacity);

    emitter.enqueueDecision(makeDecisionRecord('d1'));
    emitter.enqueueDecision(makeDecisionRecord('d2'));
    expect(emitter.enqueueDecision(makeDecisionRecord('d3'))).toBe(false);
    expect(emitter.droppedCount).toBe(1);
  });

  it('never throws when enqueuing', () => {
    const emitter = createNonBlockingEmitter();
    expect(() => emitter.enqueue(makeEvent('e1'))).not.toThrow();
    expect(() => emitter.enqueueDecision(makeDecisionRecord('d1'))).not.toThrow();
  });

  it('tracks totalEnqueued including dropped events', () => {
    const emitter = createNonBlockingEmitter(2);
    emitter.enqueue(makeEvent('e1'));
    emitter.enqueue(makeEvent('e2'));
    emitter.enqueue(makeEvent('e3')); // dropped
    expect(emitter.totalEnqueued).toBe(3);
    expect(emitter.droppedCount).toBe(1);
  });

  it('exports EMITTER_DEFAULT_CAPACITY constant', () => {
    expect(EMITTER_DEFAULT_CAPACITY).toBe(10_000);
  });
});
