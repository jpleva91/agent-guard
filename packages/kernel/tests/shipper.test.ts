// Tests for BackgroundShipper (KE-4 Shipper plane)

import { describe, it, expect, vi } from 'vitest';
import { createNonBlockingEmitter } from '../src/emitter.js';
import { createBackgroundShipper } from '../src/shipper.js';
import type {
  DomainEvent,
  EventSink,
  GovernanceDecisionRecord,
  DecisionSink,
} from '@red-codes/core';

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

describe('BackgroundShipper', () => {
  it('ships events to sinks synchronously', () => {
    const received: DomainEvent[] = [];
    const sink: EventSink = { write: (e) => received.push(e) };
    const emitter = createNonBlockingEmitter();
    const shipper = createBackgroundShipper(emitter, [sink], []);

    const event = makeEvent('e1');
    shipper.ship(event);

    expect(received).toHaveLength(1);
    expect(received[0]).toBe(event);
  });

  it('ships decision records to decision sinks synchronously', () => {
    const received: GovernanceDecisionRecord[] = [];
    const sink: DecisionSink = { write: (r) => received.push(r) };
    const emitter = createNonBlockingEmitter();
    const shipper = createBackgroundShipper(emitter, [], [sink]);

    const record = makeDecisionRecord('d1');
    shipper.shipDecision(record);

    expect(received).toHaveLength(1);
    expect(received[0]).toBe(record);
  });

  it('shipAll ships multiple events to sinks', () => {
    const received: DomainEvent[] = [];
    const sink: EventSink = { write: (e) => received.push(e) };
    const emitter = createNonBlockingEmitter();
    const shipper = createBackgroundShipper(emitter, [sink], []);

    shipper.shipAll([makeEvent('e1'), makeEvent('e2'), makeEvent('e3')]);

    expect(received).toHaveLength(3);
  });

  it('tracks eventCount for shipped events', () => {
    const emitter = createNonBlockingEmitter();
    const shipper = createBackgroundShipper(emitter, [], []);

    expect(shipper.eventCount).toBe(0);
    shipper.ship(makeEvent('e1'));
    shipper.ship(makeEvent('e2'));
    expect(shipper.eventCount).toBe(2);
  });

  it('shipAll increments eventCount for each event', () => {
    const emitter = createNonBlockingEmitter();
    const shipper = createBackgroundShipper(emitter, [], []);

    shipper.shipAll([makeEvent('e1'), makeEvent('e2'), makeEvent('e3')]);
    expect(shipper.eventCount).toBe(3);
  });

  it('silences sink write errors — never throws', () => {
    const throwingSink: EventSink = {
      write() {
        throw new Error('sink failure');
      },
    };
    const emitter = createNonBlockingEmitter();
    const shipper = createBackgroundShipper(emitter, [throwingSink], []);

    expect(() => shipper.ship(makeEvent('e1'))).not.toThrow();
    expect(() => shipper.shipAll([makeEvent('e2')])).not.toThrow();
  });

  it('silences decision sink write errors — never throws', () => {
    const throwingSink: DecisionSink = {
      write() {
        throw new Error('decision sink failure');
      },
    };
    const emitter = createNonBlockingEmitter();
    const shipper = createBackgroundShipper(emitter, [], [throwingSink]);

    expect(() => shipper.shipDecision(makeDecisionRecord('d1'))).not.toThrow();
  });

  it('ships to multiple sinks', () => {
    const received1: DomainEvent[] = [];
    const received2: DomainEvent[] = [];
    const sink1: EventSink = { write: (e) => received1.push(e) };
    const sink2: EventSink = { write: (e) => received2.push(e) };
    const emitter = createNonBlockingEmitter();
    const shipper = createBackgroundShipper(emitter, [sink1, sink2], []);

    shipper.ship(makeEvent('e1'));

    expect(received1).toHaveLength(1);
    expect(received2).toHaveLength(1);
  });

  it('shutdown calls flush on all sinks', () => {
    const flush1 = vi.fn();
    const flush2 = vi.fn();
    const sink1: EventSink = { write: () => {}, flush: flush1 };
    const sink2: EventSink = { write: () => {}, flush: flush2 };
    const emitter = createNonBlockingEmitter();
    const shipper = createBackgroundShipper(emitter, [sink1, sink2], []);

    shipper.shutdown();

    expect(flush1).toHaveBeenCalledOnce();
    expect(flush2).toHaveBeenCalledOnce();
  });

  it('shutdown calls flush on decision sinks', () => {
    const flush = vi.fn();
    const sink: DecisionSink = { write: () => {}, flush };
    const emitter = createNonBlockingEmitter();
    const shipper = createBackgroundShipper(emitter, [], [sink]);

    shipper.shutdown();

    expect(flush).toHaveBeenCalledOnce();
  });

  it('shutdown silences flush errors', () => {
    const throwingFlushSink: EventSink = {
      write: () => {},
      flush() {
        throw new Error('flush failure');
      },
    };
    const emitter = createNonBlockingEmitter();
    const shipper = createBackgroundShipper(emitter, [throwingFlushSink], []);

    expect(() => shipper.shutdown()).not.toThrow();
  });

  it('drain flushes any buffered items directly (idempotent when queue empty)', () => {
    const received: DomainEvent[] = [];
    const sink: EventSink = { write: (e) => received.push(e) };
    const emitter = createNonBlockingEmitter();
    const shipper = createBackgroundShipper(emitter, [sink], []);

    // After ship(), drain is already complete — calling drain() again is a no-op
    shipper.ship(makeEvent('e1'));
    shipper.drain();

    expect(received).toHaveLength(1); // still just 1
  });

  it('continues shipping after a sink failure on a previous event', () => {
    let callCount = 0;
    const flakyThenOkSink: EventSink = {
      write() {
        callCount++;
        if (callCount === 1) throw new Error('first call fails');
        // subsequent calls succeed
      },
    };
    const emitter = createNonBlockingEmitter();
    const shipper = createBackgroundShipper(emitter, [flakyThenOkSink], []);

    expect(() => shipper.ship(makeEvent('e1'))).not.toThrow();
    expect(() => shipper.ship(makeEvent('e2'))).not.toThrow();
    expect(callCount).toBe(2);
  });
});
