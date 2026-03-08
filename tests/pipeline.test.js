import assert from 'node:assert';
import { test, suite } from './run.js';
import { ingest } from '../domain/ingestion/pipeline.js';

suite('Ingestion Pipeline (domain/ingestion/pipeline.js)', () => {
  test('ingest returns empty array for non-error text', () => {
    const events = ingest('all good, no errors');
    assert.deepStrictEqual(events, []);
  });

  test('ingest returns empty array for empty string', () => {
    const events = ingest('');
    assert.deepStrictEqual(events, []);
  });

  test('ingest produces events for a TypeError', () => {
    const events = ingest("TypeError: Cannot read properties of null (reading 'x')");
    assert.ok(events.length > 0, 'should produce at least one event');
  });

  test('ingest events have correct structure', () => {
    const events = ingest("ReferenceError: foo is not defined");
    assert.ok(events.length > 0);
    const event = events[0];
    assert.ok(event.kind, 'event should have kind');
    assert.ok(typeof event.timestamp === 'number', 'event should have numeric timestamp');
    assert.strictEqual(event.kind, 'ErrorObserved');
  });

  test('ingest event data includes errorType and bugEvent', () => {
    const events = ingest("SyntaxError: Unexpected token }");
    assert.ok(events.length > 0);
    const event = events[0];
    assert.ok(event.errorType, 'should have errorType');
    assert.ok(event.bugEvent, 'should have bugEvent');
    assert.ok(event.fingerprint, 'should have fingerprint');
  });

  test('ingest deduplicates identical errors', () => {
    const text = "TypeError: x is null\nTypeError: x is null";
    const events = ingest(text);
    assert.strictEqual(events.length, 1, 'duplicate errors should be deduplicated');
  });

  test('ingest handles multiple different errors', () => {
    const text = "TypeError: x is null\nSyntaxError: Unexpected token }";
    const events = ingest(text);
    assert.ok(events.length >= 1, 'should produce events for each distinct error');
  });
});
