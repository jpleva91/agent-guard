import assert from 'node:assert';
import { test, suite } from './run.js';
import { createInMemoryStore } from '../dist/events/store.js';
import { createEvent, DAMAGE_DEALT, BATTLE_ENDED } from '../dist/events/schema.js';

suite('Event Store — In-Memory Implementation', () => {
  test('append and count', () => {
    const store = createInMemoryStore();
    assert.strictEqual(store.count(), 0);
    const event = createEvent(DAMAGE_DEALT, { amount: 10, target: 'enemy' });
    store.append(event);
    assert.strictEqual(store.count(), 1);
  });

  test('append rejects invalid events', () => {
    const store = createInMemoryStore();
    assert.throws(
      () => store.append({ kind: 'Bogus' }),
      (err) => err.message.includes('invalid event')
    );
    assert.strictEqual(store.count(), 0);
  });

  test('query returns all events with no filter', () => {
    const store = createInMemoryStore();
    store.append(createEvent(DAMAGE_DEALT, { amount: 5, target: 'a' }));
    store.append(createEvent(BATTLE_ENDED, { result: 'victory' }));
    assert.strictEqual(store.query().length, 2);
  });

  test('query filters by kind', () => {
    const store = createInMemoryStore();
    store.append(createEvent(DAMAGE_DEALT, { amount: 5, target: 'a' }));
    store.append(createEvent(BATTLE_ENDED, { result: 'victory' }));
    store.append(createEvent(DAMAGE_DEALT, { amount: 8, target: 'b' }));
    const results = store.query({ kind: DAMAGE_DEALT });
    assert.strictEqual(results.length, 2);
    assert.ok(results.every((e) => e.kind === DAMAGE_DEALT));
  });

  test('query filters by time range', () => {
    const store = createInMemoryStore();
    const e1 = createEvent(DAMAGE_DEALT, { amount: 5, target: 'a' });
    const e2 = createEvent(DAMAGE_DEALT, { amount: 8, target: 'b' });
    store.append(e1);
    store.append(e2);
    const results = store.query({ since: e2.timestamp });
    assert.ok(results.length >= 1);
    assert.ok(results.every((e) => e.timestamp >= e2.timestamp));
  });

  test('query filters by fingerprint', () => {
    const store = createInMemoryStore();
    const e1 = createEvent(DAMAGE_DEALT, { amount: 5, target: 'a' });
    const e2 = createEvent(DAMAGE_DEALT, { amount: 8, target: 'b' });
    store.append(e1);
    store.append(e2);
    const results = store.query({ fingerprint: e1.fingerprint });
    assert.ok(results.length >= 1);
    assert.ok(results.every((e) => e.fingerprint === e1.fingerprint));
  });

  test('replay returns all events when no fromId', () => {
    const store = createInMemoryStore();
    store.append(createEvent(DAMAGE_DEALT, { amount: 5, target: 'a' }));
    store.append(createEvent(BATTLE_ENDED, { result: 'victory' }));
    assert.strictEqual(store.replay().length, 2);
  });

  test('replay returns events from a given ID onward', () => {
    const store = createInMemoryStore();
    const e1 = createEvent(DAMAGE_DEALT, { amount: 5, target: 'a' });
    const e2 = createEvent(BATTLE_ENDED, { result: 'victory' });
    const e3 = createEvent(DAMAGE_DEALT, { amount: 8, target: 'b' });
    store.append(e1);
    store.append(e2);
    store.append(e3);
    const results = store.replay(e2.id);
    assert.strictEqual(results.length, 2);
    assert.strictEqual(results[0].id, e2.id);
    assert.strictEqual(results[1].id, e3.id);
  });

  test('replay returns empty array for unknown ID', () => {
    const store = createInMemoryStore();
    store.append(createEvent(DAMAGE_DEALT, { amount: 5, target: 'a' }));
    assert.strictEqual(store.replay('nonexistent').length, 0);
  });

  test('clear removes all events', () => {
    const store = createInMemoryStore();
    store.append(createEvent(DAMAGE_DEALT, { amount: 5, target: 'a' }));
    store.append(createEvent(BATTLE_ENDED, { result: 'victory' }));
    assert.strictEqual(store.count(), 2);
    store.clear();
    assert.strictEqual(store.count(), 0);
    assert.strictEqual(store.query().length, 0);
  });
});
