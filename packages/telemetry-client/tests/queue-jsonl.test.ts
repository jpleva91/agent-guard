import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createJsonlQueue } from '../src/queue-jsonl.js';
import type { TelemetryPayloadEvent } from '../src/types.js';

function makeEvent(id: string): TelemetryPayloadEvent {
  return {
    event_id: id,
    timestamp: Math.floor(Date.now() / 1000),
    version: '1.0.0',
    runtime: 'claude-code',
    environment: 'local',
    event_type: 'guard_triggered',
    policy: 'default',
    result: 'allowed',
    latency_ms: 10,
  };
}

describe('JSONL queue', () => {
  let tempDir: string;
  let queuePath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ag-queue-'));
    queuePath = join(tempDir, 'queue.jsonl');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('enqueue and dequeue preserves order', () => {
    const queue = createJsonlQueue(queuePath);
    queue.enqueue(makeEvent('a'));
    queue.enqueue(makeEvent('b'));
    queue.enqueue(makeEvent('c'));

    const events = queue.dequeue(2);
    expect(events).toHaveLength(2);
    expect(events[0].event_id).toBe('a');
    expect(events[1].event_id).toBe('b');

    const remaining = queue.dequeue(10);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].event_id).toBe('c');
  });

  it('dequeue from empty queue returns empty array', () => {
    const queue = createJsonlQueue(queuePath);
    expect(queue.dequeue(10)).toEqual([]);
  });

  it('size tracks events correctly', () => {
    const queue = createJsonlQueue(queuePath);
    expect(queue.size()).toBe(0);

    queue.enqueue(makeEvent('x'));
    expect(queue.size()).toBe(1);

    queue.enqueue(makeEvent('y'));
    expect(queue.size()).toBe(2);

    queue.dequeue(1);
    expect(queue.size()).toBe(1);
  });

  it('sizeBytes returns file size', () => {
    const queue = createJsonlQueue(queuePath);
    expect(queue.sizeBytes()).toBe(0);

    queue.enqueue(makeEvent('x'));
    expect(queue.sizeBytes()).toBeGreaterThan(0);
  });

  it('clear removes all events', () => {
    const queue = createJsonlQueue(queuePath);
    queue.enqueue(makeEvent('a'));
    queue.enqueue(makeEvent('b'));

    queue.clear();
    expect(queue.size()).toBe(0);
  });

  it('close is a no-op', () => {
    const queue = createJsonlQueue(queuePath);
    expect(() => queue.close()).not.toThrow();
  });
});
