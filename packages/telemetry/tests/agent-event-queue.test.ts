import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AgentEvent } from '../src/event-mapper.js';
import { createAgentEventQueue } from '../src/agent-event-queue.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<AgentEvent> = {}): AgentEvent {
  return {
    agentId: 'agent-1',
    eventType: 'tool_call',
    action: 'file.write',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentEventQueue', () => {
  let dir: string;

  afterEach(() => {
    rmSync(dir, { recursive: true });
  });

  it('enqueues and dequeues events in FIFO order', () => {
    dir = mkdtempSync(join(tmpdir(), 'aeq-'));
    const queue = createAgentEventQueue(dir);

    const e1 = makeEvent({ action: 'file.read' });
    const e2 = makeEvent({ action: 'file.write' });
    const e3 = makeEvent({ action: 'git.push' });

    queue.enqueue(e1);
    queue.enqueue(e2);
    queue.enqueue(e3);

    const dequeued = queue.dequeue(3);
    expect(dequeued).toEqual([e1, e2, e3]);
    expect(queue.size()).toBe(0);

    queue.close();
  });

  it('dequeue respects count limit', () => {
    dir = mkdtempSync(join(tmpdir(), 'aeq-'));
    const queue = createAgentEventQueue(dir);

    const e1 = makeEvent({ action: 'file.read' });
    const e2 = makeEvent({ action: 'file.write' });
    const e3 = makeEvent({ action: 'git.push' });

    queue.enqueue(e1);
    queue.enqueue(e2);
    queue.enqueue(e3);

    const batch1 = queue.dequeue(2);
    expect(batch1).toEqual([e1, e2]);
    expect(queue.size()).toBe(1);

    const batch2 = queue.dequeue(5);
    expect(batch2).toEqual([e3]);
    expect(queue.size()).toBe(0);

    queue.close();
  });

  it('reports size correctly', () => {
    dir = mkdtempSync(join(tmpdir(), 'aeq-'));
    const queue = createAgentEventQueue(dir);

    expect(queue.size()).toBe(0);

    queue.enqueue(makeEvent({ action: 'file.read' }));
    expect(queue.size()).toBe(1);

    queue.enqueue(makeEvent({ action: 'file.write' }));
    expect(queue.size()).toBe(2);

    queue.dequeue(1);
    expect(queue.size()).toBe(1);

    expect(queue.sizeBytes()).toBeGreaterThan(0);

    queue.close();
  });

  it('clear removes all events', () => {
    dir = mkdtempSync(join(tmpdir(), 'aeq-'));
    const queue = createAgentEventQueue(dir);

    queue.enqueue(makeEvent({ action: 'file.read' }));
    queue.enqueue(makeEvent({ action: 'file.write' }));
    expect(queue.size()).toBe(2);

    queue.clear();
    expect(queue.size()).toBe(0);
    expect(queue.sizeBytes()).toBe(0);

    const dequeued = queue.dequeue(10);
    expect(dequeued).toEqual([]);

    queue.close();
  });

  it('survives close and reopen', () => {
    dir = mkdtempSync(join(tmpdir(), 'aeq-'));

    const e1 = makeEvent({ action: 'file.read' });
    const e2 = makeEvent({ action: 'git.commit' });

    // First instance — enqueue and close
    const queue1 = createAgentEventQueue(dir);
    queue1.enqueue(e1);
    queue1.enqueue(e2);
    expect(queue1.size()).toBe(2);
    queue1.close();

    // Second instance — reopen and verify
    const queue2 = createAgentEventQueue(dir);
    expect(queue2.size()).toBe(2);

    const dequeued = queue2.dequeue(2);
    expect(dequeued).toEqual([e1, e2]);
    expect(queue2.size()).toBe(0);

    queue2.close();
  });
});
