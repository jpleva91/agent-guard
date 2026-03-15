import assert from 'node:assert';
import { test, suite } from './run.js';
import { EventBus } from '../dist/events/bus.js';

suite('Domain EventBus (domain/event-bus.js)', () => {
  test('on registers listener and emit calls it', () => {
    const bus = new EventBus();
    let called = false;
    bus.on('test', () => {
      called = true;
    });
    bus.emit('test');
    assert.strictEqual(called, true);
  });

  test('emit passes data to listener', () => {
    const bus = new EventBus();
    let received = null;
    bus.on('test', (data) => {
      received = data;
    });
    bus.emit('test', { value: 42 });
    assert.deepStrictEqual(received, { value: 42 });
  });

  test('emit does nothing for unregistered events', () => {
    const bus = new EventBus();
    // Should not throw
    bus.emit('nonexistent', { data: 'test' });
  });

  test('multiple listeners on same event', () => {
    const bus = new EventBus();
    let count = 0;
    bus.on('test', () => {
      count++;
    });
    bus.on('test', () => {
      count++;
    });
    bus.emit('test');
    assert.strictEqual(count, 2);
  });

  test('off removes specific listener', () => {
    const bus = new EventBus();
    let count = 0;
    const fn = () => {
      count++;
    };
    bus.on('test', fn);
    bus.emit('test');
    assert.strictEqual(count, 1);
    bus.off('test', fn);
    bus.emit('test');
    assert.strictEqual(count, 1); // not called again
  });

  test('off does nothing for unregistered event', () => {
    const bus = new EventBus();
    // Should not throw
    bus.off('nonexistent', () => {});
  });

  test('on returns unsubscribe function', () => {
    const bus = new EventBus();
    let count = 0;
    const unsub = bus.on('test', () => {
      count++;
    });
    bus.emit('test');
    assert.strictEqual(count, 1);
    unsub();
    bus.emit('test');
    assert.strictEqual(count, 1);
  });

  test('clear removes all listeners', () => {
    const bus = new EventBus();
    let count = 0;
    bus.on('a', () => {
      count++;
    });
    bus.on('b', () => {
      count++;
    });
    bus.clear();
    bus.emit('a');
    bus.emit('b');
    assert.strictEqual(count, 0);
  });
});
