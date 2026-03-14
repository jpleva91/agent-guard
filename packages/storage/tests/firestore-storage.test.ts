// Tests for Firestore storage backend — uses an in-memory mock Firestore client.
import { describe, it, expect, beforeEach } from 'vitest';
import { createFirestoreEventSink, createFirestoreDecisionSink } from '@red-codes/storage';
import { createFirestoreEventStore } from '@red-codes/storage';
import { aggregateViolationsFirestore, loadAllEventsFirestore } from '@red-codes/storage';
import type { FirestoreClient } from '@red-codes/storage';
import type { DomainEvent } from '@red-codes/core';
import type { GovernanceDecisionRecord } from '@red-codes/core';
import { resetEventCounter } from '@red-codes/events';

/** In-memory Firestore mock that matches the minimal interface */
function createMockFirestore(): FirestoreClient & { _collections: Map<string, Map<string, Record<string, unknown>>> } {
  const collections = new Map<string, Map<string, Record<string, unknown>>>();

  function getCollection(name: string): Map<string, Record<string, unknown>> {
    if (!collections.has(name)) collections.set(name, new Map());
    return collections.get(name)!;
  }

  return {
    _collections: collections,
    collection(name: string) {
      const col = getCollection(name);
      return {
        doc(id: string) {
          return {
            set(data: Record<string, unknown>) {
              col.set(id, data);
              return Promise.resolve();
            },
            get() {
              const d = col.get(id);
              return Promise.resolve({
                id,
                data: () => d,
              });
            },
            delete() {
              col.delete(id);
              return Promise.resolve();
            },
          };
        },
        where(field: string, op: string, value: unknown) {
          return createQuery(col, [{ field, op, value }]);
        },
        orderBy(field: string, direction?: string) {
          return createQuery(col, [], { field, direction: direction ?? 'asc' });
        },
        get() {
          const docs = [...col.entries()].map(([id, data]) => ({
            id,
            data: () => data,
          }));
          return Promise.resolve({ docs, size: docs.length });
        },
      };
    },
  };

  function createQuery(
    col: Map<string, Record<string, unknown>>,
    filters: Array<{ field: string; op: string; value: unknown }>,
    orderByOpt?: { field: string; direction: string },
  ) {
    const query = {
      where(field: string, op: string, value: unknown) {
        filters.push({ field, op, value });
        return query;
      },
      orderBy(field: string, direction?: string) {
        orderByOpt = { field, direction: direction ?? 'asc' };
        return query;
      },
      get() {
        let entries = [...col.entries()];

        // Apply filters
        for (const f of filters) {
          entries = entries.filter(([, data]) => {
            const val = data[f.field];
            if (f.op === '==' || f.op === '===') return val === f.value;
            if (f.op === 'in') return Array.isArray(f.value) && (f.value as unknown[]).includes(val);
            if (f.op === '>=') return (val as number) >= (f.value as number);
            if (f.op === '<=') return (val as number) <= (f.value as number);
            return true;
          });
        }

        // Apply ordering
        if (orderByOpt) {
          const { field, direction } = orderByOpt;
          entries.sort((a, b) => {
            const av = a[1][field] as number;
            const bv = b[1][field] as number;
            return direction === 'desc' ? bv - av : av - bv;
          });
        }

        const docs = entries.map(([id, data]) => ({
          id,
          data: () => data,
        }));
        return Promise.resolve({ docs, size: docs.length });
      },
    };
    return query;
  }
}

function makeEvent(id: string, kind: string, ts: number): DomainEvent {
  return {
    id,
    kind: kind as DomainEvent['kind'],
    timestamp: ts,
    fingerprint: `fp_${id}`,
    metadata: { runId: 'run_1' },
  };
}

function makeDecisionRecord(id: string, outcome: 'allow' | 'deny'): GovernanceDecisionRecord {
  return {
    recordId: id,
    runId: 'run_1',
    timestamp: Date.now(),
    action: { type: 'file.write', target: 'test.ts', agent: 'test', destructive: false },
    outcome,
    reason: outcome === 'deny' ? 'Policy denied' : 'Allowed',
    intervention: outcome === 'deny' ? 'deny' : null,
    policy: { matchedPolicyId: null, matchedPolicyName: null, severity: 3 },
    invariants: { allHold: true, violations: [] },
    simulation: null,
    evidencePackId: null,
    monitor: { escalationLevel: 0, totalEvaluations: 1, totalDenials: 0 },
    execution: { executed: false, success: null, durationMs: null, error: null },
  };
}

beforeEach(() => {
  resetEventCounter();
});

describe('Firestore EventSink', () => {
  it('writes events to the events collection', async () => {
    const db = createMockFirestore();
    const sink = createFirestoreEventSink(db, 'run_1');
    const event = makeEvent('evt_1', 'ActionRequested', 1000);

    sink.write(event);

    // Wait for async write
    await new Promise((r) => setTimeout(r, 10));

    const col = db._collections.get('events')!;
    expect(col.size).toBe(1);
    expect(col.get('evt_1')?.kind).toBe('ActionRequested');
    expect(col.get('evt_1')?.run_id).toBe('run_1');
  });

  it('stores event data as JSON string', async () => {
    const db = createMockFirestore();
    const sink = createFirestoreEventSink(db, 'run_1');
    const event = makeEvent('evt_2', 'ActionAllowed', 2000);

    sink.write(event);
    await new Promise((r) => setTimeout(r, 10));

    const stored = db._collections.get('events')!.get('evt_2')!;
    const parsed = JSON.parse(stored.data as string);
    expect(parsed.id).toBe('evt_2');
    expect(parsed.kind).toBe('ActionAllowed');
  });
});

describe('Firestore DecisionSink', () => {
  it('writes decision records to the decisions collection', async () => {
    const db = createMockFirestore();
    const sink = createFirestoreDecisionSink(db, 'run_1');
    const record = makeDecisionRecord('dec_1', 'deny');

    sink.write(record);
    await new Promise((r) => setTimeout(r, 10));

    const col = db._collections.get('decisions')!;
    expect(col.size).toBe(1);
    expect(col.get('dec_1')?.outcome).toBe('deny');
    expect(col.get('dec_1')?.run_id).toBe('run_1');
  });
});

describe('Firestore EventStore', () => {
  it('appends events and queries them back', () => {
    const db = createMockFirestore();
    const store = createFirestoreEventStore(db, 'run_1');

    store.append(makeEvent('e1', 'ActionRequested', 100));
    store.append(makeEvent('e2', 'ActionAllowed', 200));

    expect(store.count()).toBe(2);
    const all = store.query();
    expect(all).toHaveLength(2);
  });

  it('filters by kind', () => {
    const db = createMockFirestore();
    const store = createFirestoreEventStore(db, 'run_1');

    store.append(makeEvent('e1', 'ActionRequested', 100));
    store.append(makeEvent('e2', 'ActionAllowed', 200));
    store.append(makeEvent('e3', 'ActionRequested', 300));

    const filtered = store.query({ kind: 'ActionRequested' as DomainEvent['kind'] });
    expect(filtered).toHaveLength(2);
  });

  it('filters by timestamp range', () => {
    const db = createMockFirestore();
    const store = createFirestoreEventStore(db, 'run_1');

    store.append(makeEvent('e1', 'ActionRequested', 100));
    store.append(makeEvent('e2', 'ActionAllowed', 200));
    store.append(makeEvent('e3', 'ActionDenied', 300));

    const filtered = store.query({ since: 150, until: 250 });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('e2');
  });

  it('replays from a specific event ID', () => {
    const db = createMockFirestore();
    const store = createFirestoreEventStore(db, 'run_1');

    store.append(makeEvent('e1', 'ActionRequested', 100));
    store.append(makeEvent('e2', 'ActionAllowed', 200));
    store.append(makeEvent('e3', 'ActionDenied', 300));

    const replayed = store.replay('e2');
    expect(replayed).toHaveLength(2);
    expect(replayed[0].id).toBe('e2');
  });

  it('exports and imports NDJSON', () => {
    const db = createMockFirestore();
    const store = createFirestoreEventStore(db, 'run_1');

    store.append(makeEvent('e1', 'ActionRequested', 100));
    store.append(makeEvent('e2', 'ActionAllowed', 200));

    const ndjson = store.toNDJSON();
    expect(ndjson.split('\n')).toHaveLength(2);

    store.clear();
    expect(store.count()).toBe(0);

    const loaded = store.fromNDJSON(ndjson);
    expect(loaded).toBe(2);
    expect(store.count()).toBe(2);
  });
});

describe('Firestore Analytics', () => {
  it('aggregates violations by kind', async () => {
    const db = createMockFirestore();
    const col = db._collections;

    // Manually populate events collection
    col.set('events', new Map());
    const events = col.get('events')!;

    const violationEvent = makeEvent('v1', 'ActionDenied', 100);
    events.set('v1', {
      id: 'v1',
      run_id: 'run_1',
      kind: 'ActionDenied',
      timestamp: 100,
      fingerprint: 'fp_v1',
      data: JSON.stringify({ ...violationEvent, actionType: 'git.push', reason: 'Protected branch' }),
    });

    const allowEvent = makeEvent('a1', 'ActionAllowed', 200);
    events.set('a1', {
      id: 'a1',
      run_id: 'run_1',
      kind: 'ActionAllowed',
      timestamp: 200,
      fingerprint: 'fp_a1',
      data: JSON.stringify(allowEvent),
    });

    const result = await aggregateViolationsFirestore(db);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].kind).toBe('ActionDenied');
    expect(result.sessionCount).toBe(1);
  });

  it('loads all events', async () => {
    const db = createMockFirestore();
    const col = db._collections;
    col.set('events', new Map());
    const events = col.get('events')!;

    for (let i = 0; i < 5; i++) {
      const e = makeEvent(`e${i}`, 'ActionRequested', i * 100);
      events.set(`e${i}`, {
        id: `e${i}`,
        run_id: `run_${i % 2}`,
        kind: 'ActionRequested',
        timestamp: i * 100,
        fingerprint: `fp_e${i}`,
        data: JSON.stringify(e),
      });
    }

    const result = await loadAllEventsFirestore(db);
    expect(result.events).toHaveLength(5);
    expect(result.sessionCount).toBe(2);
  });
});
