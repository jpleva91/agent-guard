import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AgentEvent } from '../src/event-mapper.js';
import type { AgentEventQueue } from '../src/agent-event-queue.js';
import { createAgentEventSender } from '../src/agent-event-sender.js';

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

function createMockQueue(events: AgentEvent[]): AgentEventQueue {
  return {
    enqueue(event: AgentEvent): void {
      events.push(event);
    },
    dequeue(count: number): AgentEvent[] {
      return events.splice(0, count);
    },
    size(): number {
      return events.length;
    },
    sizeBytes(): number {
      return events.length * 100;
    },
    clear(): void {
      events.length = 0;
    },
    close(): void {
      // noop
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentEventSender', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('flush sends batched events to /v1/events', async () => {
    const e1 = makeEvent({ action: 'file.read' });
    const e2 = makeEvent({ action: 'git.push' });
    const queue = createMockQueue([e1, e2]);

    fetchMock.mockResolvedValue({ ok: true, status: 202 });

    const sender = createAgentEventSender({
      serverUrl: 'https://api.example.com',
      queue,
      batchSize: 10,
      retryDelayMs: 1,
    });

    await sender.flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.example.com/v1/events');
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(options.body)).toEqual({ events: [e1, e2] });
  });

  it('flush does nothing when queue is empty', async () => {
    const queue = createMockQueue([]);

    const sender = createAgentEventSender({
      serverUrl: 'https://api.example.com',
      queue,
      batchSize: 10,
      retryDelayMs: 1,
    });

    await sender.flush();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retries on 5xx errors', async () => {
    const e1 = makeEvent({ action: 'file.read' });
    const queue = createMockQueue([e1]);

    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, status: 202 });

    const sender = createAgentEventSender({
      serverUrl: 'https://api.example.com',
      queue,
      batchSize: 10,
      retryDelayMs: 1,
    });

    await sender.flush();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('stops retrying after maxRetries', async () => {
    const e1 = makeEvent({ action: 'file.read' });
    const queue = createMockQueue([e1]);

    fetchMock.mockResolvedValue({ ok: false, status: 503 });

    const sender = createAgentEventSender({
      serverUrl: 'https://api.example.com',
      queue,
      batchSize: 10,
      maxRetries: 2,
      retryDelayMs: 1,
    });

    await sender.flush();

    // initial attempt + 2 retries = 3 calls
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('swallows network errors without throwing', async () => {
    const e1 = makeEvent({ action: 'file.read' });
    const queue = createMockQueue([e1]);

    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    const sender = createAgentEventSender({
      serverUrl: 'https://api.example.com',
      queue,
      batchSize: 10,
      maxRetries: 2,
      retryDelayMs: 1,
    });

    // Should not throw
    await expect(sender.flush()).resolves.toBeUndefined();
  });
});
