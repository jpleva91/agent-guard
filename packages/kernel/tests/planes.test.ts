import { describe, it, expect, vi, afterEach } from 'vitest';
import { createEmitter } from '../src/planes/emitter.js';
import { createShipper } from '../src/planes/shipper.js';
import type { DomainEvent, EventSink, DecisionSink } from '@red-codes/core';
import type { GovernanceDecisionRecord } from '../src/decisions/types.js';

function makeFakeEvent(kind: string, id?: string): DomainEvent {
  return {
    id: id || `evt_${Math.random().toString(36).slice(2)}`,
    kind,
    timestamp: Date.now(),
    fingerprint: 'test',
  } as DomainEvent;
}

function makeFakeDecision(recordId?: string): GovernanceDecisionRecord {
  return {
    recordId: recordId || `dec_${Math.random().toString(36).slice(2)}`,
    runId: 'run_test',
    timestamp: Date.now(),
    outcome: 'allow',
    action: { type: 'file.read', target: '/test.ts' },
    reason: 'test',
  } as GovernanceDecisionRecord;
}

describe('Emitter plane', () => {
  it('buffers events via eventSink.write()', () => {
    const emitter = createEmitter({ eventCapacity: 10 });
    const event = makeFakeEvent('ActionRequested');
    emitter.eventSink.write(event);
    expect(emitter.eventCount()).toBe(1);
    const drained = emitter.drainEvents();
    expect(drained).toEqual([event]);
    expect(emitter.eventCount()).toBe(0);
  });

  it('buffers decisions via decisionSink.write()', () => {
    const emitter = createEmitter({ decisionCapacity: 10 });
    const decision = makeFakeDecision();
    emitter.decisionSink.write(decision);
    expect(emitter.decisionCount()).toBe(1);
    const drained = emitter.drainDecisions();
    expect(drained).toEqual([decision]);
    expect(emitter.decisionCount()).toBe(0);
  });

  it('drops oldest events when capacity exceeded', () => {
    const emitter = createEmitter({ eventCapacity: 2 });
    emitter.eventSink.write(makeFakeEvent('A', 'e1'));
    emitter.eventSink.write(makeFakeEvent('B', 'e2'));
    emitter.eventSink.write(makeFakeEvent('C', 'e3')); // drops e1
    expect(emitter.eventsDropped()).toBe(1);
    const drained = emitter.drainEvents();
    expect(drained.map((e) => e.id)).toEqual(['e2', 'e3']);
  });

  it('uses default capacities when not configured', () => {
    const emitter = createEmitter();
    // Default: 4096 events, 1024 decisions — just verify no crash
    for (let i = 0; i < 100; i++) {
      emitter.eventSink.write(makeFakeEvent('test'));
      emitter.decisionSink.write(makeFakeDecision());
    }
    expect(emitter.eventCount()).toBe(100);
    expect(emitter.decisionCount()).toBe(100);
  });
});

describe('Shipper plane', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('flush() drains emitter events to sinks synchronously', () => {
    const emitter = createEmitter({ eventCapacity: 10 });
    const written: DomainEvent[] = [];
    const sink: EventSink = { write: (e) => written.push(e) };

    const shipper = createShipper({
      emitter,
      eventSinks: [sink],
      decisionSinks: [],
      intervalMs: 0, // no background shipping
    });

    emitter.eventSink.write(makeFakeEvent('A'));
    emitter.eventSink.write(makeFakeEvent('B'));

    shipper.flush();
    expect(written.length).toBe(2);
    expect(written[0].kind).toBe('A');
    expect(written[1].kind).toBe('B');
    expect(shipper.totalEventsShipped()).toBe(2);
  });

  it('flush() drains emitter decisions to sinks synchronously', () => {
    const emitter = createEmitter({ decisionCapacity: 10 });
    const written: GovernanceDecisionRecord[] = [];
    const sink: DecisionSink = { write: (d) => written.push(d) };

    const shipper = createShipper({
      emitter,
      eventSinks: [],
      decisionSinks: [sink],
      intervalMs: 0,
    });

    emitter.decisionSink.write(makeFakeDecision('d1'));
    shipper.flush();
    expect(written.length).toBe(1);
    expect(written[0].recordId).toBe('d1');
    expect(shipper.totalDecisionsShipped()).toBe(1);
  });

  it('background timer drains events periodically', async () => {
    vi.useFakeTimers();
    const emitter = createEmitter({ eventCapacity: 10 });
    const written: DomainEvent[] = [];
    const sink: EventSink = { write: (e) => written.push(e) };

    const shipper = createShipper({
      emitter,
      eventSinks: [sink],
      decisionSinks: [],
      intervalMs: 50,
    });

    shipper.start();
    expect(shipper.isRunning()).toBe(true);

    emitter.eventSink.write(makeFakeEvent('A'));
    emitter.eventSink.write(makeFakeEvent('B'));

    // Events not yet shipped
    expect(written.length).toBe(0);

    // Advance timer
    vi.advanceTimersByTime(50);
    expect(written.length).toBe(2);

    shipper.stop();
    expect(shipper.isRunning()).toBe(false);
  });

  it('sink write errors are caught and counted', () => {
    const emitter = createEmitter({ eventCapacity: 10 });
    const errors: string[] = [];
    const failingSink: EventSink = {
      write: () => {
        throw new Error('disk full');
      },
    };

    const shipper = createShipper({
      emitter,
      eventSinks: [failingSink],
      decisionSinks: [],
      intervalMs: 0,
      onError: (err) => errors.push(err.message),
    });

    emitter.eventSink.write(makeFakeEvent('A'));
    shipper.flush();

    expect(shipper.totalErrors()).toBe(1);
    expect(errors).toContain('disk full');
    // Shipper continues despite errors — no crash
  });

  it('sink errors do not block other sinks', () => {
    const emitter = createEmitter({ eventCapacity: 10 });
    const written: DomainEvent[] = [];
    const failingSink: EventSink = {
      write: () => {
        throw new Error('fail');
      },
    };
    const goodSink: EventSink = { write: (e) => written.push(e) };

    const shipper = createShipper({
      emitter,
      eventSinks: [failingSink, goodSink],
      decisionSinks: [],
      intervalMs: 0,
      onError: () => {},
    });

    emitter.eventSink.write(makeFakeEvent('A'));
    shipper.flush();

    // Good sink still received the event despite failing sink
    expect(written.length).toBe(1);
  });

  it('start() is idempotent', () => {
    const emitter = createEmitter();
    const shipper = createShipper({
      emitter,
      eventSinks: [],
      decisionSinks: [],
      intervalMs: 100,
    });

    shipper.start();
    shipper.start(); // should not create duplicate timers
    expect(shipper.isRunning()).toBe(true);
    shipper.stop();
    expect(shipper.isRunning()).toBe(false);
  });

  it('stop() is idempotent', () => {
    const emitter = createEmitter();
    const shipper = createShipper({
      emitter,
      eventSinks: [],
      decisionSinks: [],
    });

    shipper.stop(); // should not throw when not running
    expect(shipper.isRunning()).toBe(false);
  });

  it('flush calls sink.flush() on underlying sinks', () => {
    const emitter = createEmitter();
    const flushed: string[] = [];
    const sink: EventSink = {
      write: () => {},
      flush: () => flushed.push('event_flushed'),
    };
    const decSink: DecisionSink = {
      write: () => {},
      flush: () => flushed.push('decision_flushed'),
    };

    const shipper = createShipper({
      emitter,
      eventSinks: [sink],
      decisionSinks: [decSink],
      intervalMs: 0,
    });

    shipper.flush();
    expect(flushed).toContain('event_flushed');
    expect(flushed).toContain('decision_flushed');
  });
});

describe('Evaluator → Emitter → Shipper integration', () => {
  it('events flow from evaluator writes through to sinks via flush', () => {
    const emitter = createEmitter({ eventCapacity: 100, decisionCapacity: 100 });
    const events: DomainEvent[] = [];
    const decisions: GovernanceDecisionRecord[] = [];

    const shipper = createShipper({
      emitter,
      eventSinks: [{ write: (e) => events.push(e) }],
      decisionSinks: [{ write: (d) => decisions.push(d) }],
      intervalMs: 0,
    });

    // Simulate evaluator writing events
    for (let i = 0; i < 10; i++) {
      emitter.eventSink.write(makeFakeEvent(`kind_${i}`));
    }
    emitter.decisionSink.write(makeFakeDecision());

    // Nothing shipped yet
    expect(events.length).toBe(0);
    expect(decisions.length).toBe(0);

    // Flush ships everything
    shipper.flush();
    expect(events.length).toBe(10);
    expect(decisions.length).toBe(1);
    expect(shipper.totalEventsShipped()).toBe(10);
    expect(shipper.totalDecisionsShipped()).toBe(1);
  });

  it('shipper failure does not affect evaluator writes', () => {
    const emitter = createEmitter({ eventCapacity: 10 });
    const shipper = createShipper({
      emitter,
      eventSinks: [
        {
          write: () => {
            throw new Error('catastrophic failure');
          },
        },
      ],
      decisionSinks: [],
      intervalMs: 0,
      onError: () => {},
    });

    // Evaluator writes succeed regardless of shipper state
    emitter.eventSink.write(makeFakeEvent('A'));
    expect(emitter.eventCount()).toBe(1);

    // Shipper fails — but evaluator is unaffected
    shipper.flush();
    expect(shipper.totalErrors()).toBe(1);

    // Evaluator can continue writing
    emitter.eventSink.write(makeFakeEvent('B'));
    expect(emitter.eventCount()).toBe(1); // 'A' was drained, 'B' is new
  });
});
