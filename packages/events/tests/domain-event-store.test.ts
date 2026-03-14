import { describe, it, expect, beforeEach } from 'vitest';
import { createInMemoryStore } from '@red-codes/events';
import { createEvent, resetEventCounter, ERROR_OBSERVED, MOVE_USED } from '@red-codes/events';

describe('domain/event-store', () => {
  beforeEach(() => {
    resetEventCounter();
  });

  it('creates an empty store', () => {
    const store = createInMemoryStore();
    expect(store.count()).toBe(0);
    expect(store.replay()).toHaveLength(0);
  });

  it('appends and counts events', () => {
    const store = createInMemoryStore();
    const event = createEvent(ERROR_OBSERVED, { message: 'test error' });
    store.append(event);
    expect(store.count()).toBe(1);
  });

  it('rejects invalid events', () => {
    const store = createInMemoryStore();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => store.append({ kind: 'FakeEvent' } as any)).toThrow('Cannot append invalid event');
  });

  it('queries by kind', () => {
    const store = createInMemoryStore();
    store.append(createEvent(ERROR_OBSERVED, { message: 'err1' }));
    store.append(createEvent(MOVE_USED, { move: 'segfault', attacker: 'NullPointer' }));
    store.append(createEvent(ERROR_OBSERVED, { message: 'err2' }));

    const errors = store.query({ kind: ERROR_OBSERVED });
    expect(errors).toHaveLength(2);

    const moves = store.query({ kind: MOVE_USED });
    expect(moves).toHaveLength(1);
  });

  it('queries by fingerprint', () => {
    const store = createInMemoryStore();
    const e1 = createEvent(ERROR_OBSERVED, { message: 'specific error' });
    store.append(e1);
    store.append(createEvent(ERROR_OBSERVED, { message: 'other error' }));

    const results = store.query({ fingerprint: e1.fingerprint });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(e1.id);
  });

  it('replays from a given ID', () => {
    const store = createInMemoryStore();
    const e1 = createEvent(ERROR_OBSERVED, { message: 'err1' });
    const e2 = createEvent(ERROR_OBSERVED, { message: 'err2' });
    const e3 = createEvent(ERROR_OBSERVED, { message: 'err3' });
    store.append(e1);
    store.append(e2);
    store.append(e3);

    const replayed = store.replay(e2.id);
    expect(replayed).toHaveLength(2);
    expect(replayed[0].id).toBe(e2.id);
  });

  it('returns empty array for unknown replay ID', () => {
    const store = createInMemoryStore();
    store.append(createEvent(ERROR_OBSERVED, { message: 'test' }));
    expect(store.replay('unknown_id')).toHaveLength(0);
  });

  it('clears all events', () => {
    const store = createInMemoryStore();
    store.append(createEvent(ERROR_OBSERVED, { message: 'test' }));
    store.clear();
    expect(store.count()).toBe(0);
  });

  describe('NDJSON serialization', () => {
    it('toNDJSON returns empty string for empty store', () => {
      const store = createInMemoryStore();
      expect(store.toNDJSON()).toBe('');
    });

    it('toNDJSON serializes events as newline-delimited JSON', () => {
      const store = createInMemoryStore();
      const e1 = createEvent(ERROR_OBSERVED, { message: 'err1' });
      const e2 = createEvent(MOVE_USED, { move: 'segfault', attacker: 'NullPointer' });
      store.append(e1);
      store.append(e2);

      const ndjson = store.toNDJSON();
      const lines = ndjson.split('\n');
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0])).toMatchObject({ kind: ERROR_OBSERVED, message: 'err1' });
      expect(JSON.parse(lines[1])).toMatchObject({ kind: MOVE_USED, move: 'segfault' });
    });

    it('fromNDJSON loads events and returns count', () => {
      const source = createInMemoryStore();
      source.append(createEvent(ERROR_OBSERVED, { message: 'err1' }));
      source.append(createEvent(ERROR_OBSERVED, { message: 'err2' }));
      const ndjson = source.toNDJSON();

      const target = createInMemoryStore();
      const loaded = target.fromNDJSON(ndjson);
      expect(loaded).toBe(2);
      expect(target.count()).toBe(2);
    });

    it('fromNDJSON skips blank lines', () => {
      const store = createInMemoryStore();
      const e = createEvent(ERROR_OBSERVED, { message: 'test' });
      const ndjson = '\n' + JSON.stringify(e) + '\n\n  \n';
      const loaded = store.fromNDJSON(ndjson);
      expect(loaded).toBe(1);
      expect(store.count()).toBe(1);
    });

    it('round-trips events through toNDJSON and fromNDJSON', () => {
      const source = createInMemoryStore();
      const e1 = createEvent(ERROR_OBSERVED, { message: 'err1' });
      const e2 = createEvent(MOVE_USED, { move: 'segfault', attacker: 'NullPointer' });
      source.append(e1);
      source.append(e2);

      const target = createInMemoryStore();
      target.fromNDJSON(source.toNDJSON());

      expect(target.count()).toBe(source.count());
      const replayed = target.replay();
      expect(replayed[0].id).toBe(e1.id);
      expect(replayed[1].id).toBe(e2.id);
      expect(replayed[0].kind).toBe(ERROR_OBSERVED);
      expect(replayed[1].kind).toBe(MOVE_USED);
    });
  });
});
