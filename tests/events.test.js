import assert from 'node:assert';
import { test, suite } from './run.js';
import { eventBus, Events } from '../game/engine/events.js';

suite('EventBus (game/engine/events.js)', () => {
  test('Events constants are defined', () => {
    assert.strictEqual(Events.BATTLE_STARTED, 'BATTLE_STARTED');
    assert.strictEqual(Events.BUGMON_FAINTED, 'BUGMON_FAINTED');
    assert.strictEqual(Events.CACHE_SUCCESS, 'CACHE_SUCCESS');
    assert.strictEqual(Events.BATTLE_ENDED, 'BATTLE_ENDED');
    assert.strictEqual(Events.STATE_CHANGED, 'STATE_CHANGED');
  });

  test('on + emit triggers callback with data', () => {
    let received = null;
    eventBus.on('test_event_1', (data) => { received = data; });
    eventBus.emit('test_event_1', { value: 42 });
    assert.deepStrictEqual(received, { value: 42 });
  });

  test('multiple listeners on same event all fire', () => {
    let count = 0;
    eventBus.on('test_multi', () => { count++; });
    eventBus.on('test_multi', () => { count++; });
    eventBus.on('test_multi', () => { count++; });
    eventBus.emit('test_multi');
    assert.strictEqual(count, 3);
  });

  test('listeners on different events do not interfere', () => {
    let aFired = false;
    let bFired = false;
    eventBus.on('test_event_a', () => { aFired = true; });
    eventBus.on('test_event_b', () => { bFired = true; });
    eventBus.emit('test_event_a');
    assert.strictEqual(aFired, true);
    assert.strictEqual(bFired, false);
  });

  test('emitting with no listeners does not throw', () => {
    assert.doesNotThrow(() => {
      eventBus.emit('test_no_listeners_xyz', { data: 'test' });
    });
  });

  test('listeners receive the exact data passed to emit', () => {
    const results = [];
    eventBus.on('test_data_types', (d) => results.push(d));
    eventBus.emit('test_data_types', 'string');
    eventBus.emit('test_data_types', 123);
    eventBus.emit('test_data_types', null);
    assert.deepStrictEqual(results, ['string', 123, null]);
  });

  test('emit with undefined data passes undefined to listener', () => {
    let received = 'sentinel';
    eventBus.on('test_undef_data', (d) => { received = d; });
    eventBus.emit('test_undef_data');
    assert.strictEqual(received, undefined);
  });

  test('same callback registered twice fires twice', () => {
    let count = 0;
    const cb = () => { count++; };
    eventBus.on('test_double_reg', cb);
    eventBus.on('test_double_reg', cb);
    eventBus.emit('test_double_reg');
    assert.strictEqual(count, 2);
  });

  test('listeners fire in registration order', () => {
    const order = [];
    eventBus.on('test_order', () => order.push('first'));
    eventBus.on('test_order', () => order.push('second'));
    eventBus.on('test_order', () => order.push('third'));
    eventBus.emit('test_order');
    assert.deepStrictEqual(order, ['first', 'second', 'third']);
  });

  test('PASSIVE_ACTIVATED event constant is defined', () => {
    assert.strictEqual(Events.PASSIVE_ACTIVATED, 'PASSIVE_ACTIVATED');
  });
});
