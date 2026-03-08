import assert from 'node:assert';
import { test, suite } from './run.js';
import { SourceRegistry } from '../domain/source-registry.js';
import { EventBus } from '../domain/event-bus.js';

/** Create a mock source with spied start/stop. */
function mockSource(name = 'test-source') {
  const source = {
    name,
    started: false,
    stopped: false,
    onRawSignal: null,
    start(cb) { source.started = true; source.onRawSignal = cb; },
    stop() { source.stopped = true; source.started = false; },
  };
  return source;
}

/** Create a mock ingest that returns controllable events. */
function mockIngest(events = []) {
  return () => events;
}

suite('SourceRegistry (domain/source-registry.js)', () => {
  test('constructor requires eventBus', () => {
    assert.throws(
      () => new SourceRegistry({ ingest: () => [] }),
      /requires an eventBus/,
    );
  });

  test('constructor requires ingest function', () => {
    assert.throws(
      () => new SourceRegistry({ eventBus: new EventBus() }),
      /requires an ingest function/,
    );
  });

  test('register stores a source and returns unregister function', () => {
    const reg = new SourceRegistry({ eventBus: new EventBus(), ingest: mockIngest() });
    const src = mockSource();
    const unsub = reg.register(src);
    assert.strictEqual(typeof unsub, 'function');
    assert.strictEqual(reg.list().length, 1);
    assert.strictEqual(reg.list()[0].name, 'test-source');
  });

  test('register throws on missing name', () => {
    const reg = new SourceRegistry({ eventBus: new EventBus(), ingest: mockIngest() });
    assert.throws(() => reg.register({ start() {}, stop() {} }), /non-empty name/);
  });

  test('register throws on missing start', () => {
    const reg = new SourceRegistry({ eventBus: new EventBus(), ingest: mockIngest() });
    assert.throws(() => reg.register({ name: 'x', stop() {} }), /start function/);
  });

  test('register throws on missing stop', () => {
    const reg = new SourceRegistry({ eventBus: new EventBus(), ingest: mockIngest() });
    assert.throws(() => reg.register({ name: 'x', start() {} }), /stop function/);
  });

  test('register throws on duplicate name', () => {
    const reg = new SourceRegistry({ eventBus: new EventBus(), ingest: mockIngest() });
    reg.register(mockSource('dup'));
    assert.throws(() => reg.register(mockSource('dup')), /already registered/);
  });

  test('unregister via returned function removes the source', () => {
    const reg = new SourceRegistry({ eventBus: new EventBus(), ingest: mockIngest() });
    const unsub = reg.register(mockSource());
    assert.strictEqual(reg.list().length, 1);
    unsub();
    assert.strictEqual(reg.list().length, 0);
  });

  test('unregister stops a running source', () => {
    const reg = new SourceRegistry({ eventBus: new EventBus(), ingest: mockIngest() });
    const src = mockSource();
    reg.register(src);
    reg.start('test-source');
    assert.strictEqual(src.started, true);
    reg.unregister('test-source');
    assert.strictEqual(src.stopped, true);
    assert.strictEqual(reg.list().length, 0);
  });

  test('start calls source start with onRawSignal callback', () => {
    const reg = new SourceRegistry({ eventBus: new EventBus(), ingest: mockIngest() });
    const src = mockSource();
    reg.register(src);
    reg.start('test-source');
    assert.strictEqual(src.started, true);
    assert.strictEqual(typeof src.onRawSignal, 'function');
  });

  test('start without name starts all sources', () => {
    const reg = new SourceRegistry({ eventBus: new EventBus(), ingest: mockIngest() });
    const s1 = mockSource('a');
    const s2 = mockSource('b');
    reg.register(s1);
    reg.register(s2);
    reg.start();
    assert.strictEqual(s1.started, true);
    assert.strictEqual(s2.started, true);
  });

  test('start is idempotent for already-running source', () => {
    const reg = new SourceRegistry({ eventBus: new EventBus(), ingest: mockIngest() });
    let startCount = 0;
    const src = { name: 'x', start() { startCount++; }, stop() {} };
    reg.register(src);
    reg.start('x');
    reg.start('x');
    assert.strictEqual(startCount, 1);
  });

  test('start throws for unregistered source', () => {
    const reg = new SourceRegistry({ eventBus: new EventBus(), ingest: mockIngest() });
    assert.throws(() => reg.start('nonexistent'), /not registered/);
  });

  test('stop calls source stop', () => {
    const reg = new SourceRegistry({ eventBus: new EventBus(), ingest: mockIngest() });
    const src = mockSource();
    reg.register(src);
    reg.start('test-source');
    reg.stop('test-source');
    assert.strictEqual(src.stopped, true);
  });

  test('stop without name stops all sources', () => {
    const reg = new SourceRegistry({ eventBus: new EventBus(), ingest: mockIngest() });
    const s1 = mockSource('a');
    const s2 = mockSource('b');
    reg.register(s1);
    reg.register(s2);
    reg.start();
    reg.stop();
    assert.strictEqual(s1.stopped, true);
    assert.strictEqual(s2.stopped, true);
  });

  test('stop is idempotent for already-stopped source', () => {
    const reg = new SourceRegistry({ eventBus: new EventBus(), ingest: mockIngest() });
    let stopCount = 0;
    const src = { name: 'x', start() {}, stop() { stopCount++; } };
    reg.register(src);
    reg.start('x');
    reg.stop('x');
    reg.stop('x');
    assert.strictEqual(stopCount, 1);
  });

  test('stop throws for unregistered source', () => {
    const reg = new SourceRegistry({ eventBus: new EventBus(), ingest: mockIngest() });
    assert.throws(() => reg.stop('nonexistent'), /not registered/);
  });

  test('raw signal through onRawSignal produces events on EventBus', () => {
    const bus = new EventBus();
    const fakeEvents = [
      { kind: 'ErrorObserved', message: 'test error' },
      { kind: 'ErrorObserved', message: 'another error' },
    ];
    const reg = new SourceRegistry({ eventBus: bus, ingest: () => fakeEvents });
    const src = mockSource();
    reg.register(src);
    reg.start('test-source');

    const received = [];
    bus.on('ErrorObserved', (evt) => received.push(evt));

    src.onRawSignal('TypeError: x is not a function');
    assert.strictEqual(received.length, 2);
    assert.strictEqual(received[0].message, 'test error');
    assert.strictEqual(received[1].message, 'another error');
  });

  test('raw signal with no errors produces no events', () => {
    const bus = new EventBus();
    const reg = new SourceRegistry({ eventBus: bus, ingest: () => [] });
    const src = mockSource();
    reg.register(src);
    reg.start('test-source');

    let emitted = false;
    bus.on('ErrorObserved', () => { emitted = true; });

    src.onRawSignal('all good, no errors');
    assert.strictEqual(emitted, false);
  });

  test('list returns correct names, running status, and meta', () => {
    const reg = new SourceRegistry({ eventBus: new EventBus(), ingest: mockIngest() });
    reg.register({ name: 'a', start() {}, stop() {}, meta: { version: '1.0' } });
    reg.register({ name: 'b', start() {}, stop() {} });
    reg.start('a');

    const items = reg.list();
    assert.strictEqual(items.length, 2);

    const a = items.find(i => i.name === 'a');
    assert.strictEqual(a.running, true);
    assert.deepStrictEqual(a.meta, { version: '1.0' });

    const b = items.find(i => i.name === 'b');
    assert.strictEqual(b.running, false);
    assert.strictEqual(b.meta, null);
  });
});
