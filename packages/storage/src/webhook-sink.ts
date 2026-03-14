// Webhook event, decision, and trace sinks — batched HTTP POST to a configurable endpoint.
// Follows the fire-and-forget pattern: never crashes the kernel, errors reported via callback.
// Uses Node.js built-in fetch (Node 18+).

import type { DomainEvent, EventSink, GovernanceDecisionRecord, DecisionSink } from '@red-codes/core';
import type { TraceBackend, TraceSpan } from '@red-codes/telemetry';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface WebhookConfig {
  /** HTTP endpoint URL (required). */
  readonly url: string;
  /** Custom headers (e.g., Authorization). */
  readonly headers?: Record<string, string>;
  /** Max items per batch before auto-flush. Default: 50. */
  readonly batchSize?: number;
  /** Flush interval in milliseconds. Default: 5000. */
  readonly flushIntervalMs?: number;
  /** Error callback — report but never crash. */
  readonly onError?: (error: Error) => void;
}

// ---------------------------------------------------------------------------
// Batched sender — shared buffering + flush logic
// ---------------------------------------------------------------------------

interface BatchedSender<T> {
  enqueue(item: T): void;
  flush(): void;
  close(): void;
}

function createBatchedSender<T>(
  config: WebhookConfig,
  payloadType: string,
  runId?: string
): BatchedSender<T> {
  const batchSize = config.batchSize ?? 50;
  const flushIntervalMs = config.flushIntervalMs ?? 5000;
  let buffer: T[] = [];
  let timer: ReturnType<typeof setInterval> | undefined;

  if (flushIntervalMs > 0) {
    timer = setInterval(() => flush(), flushIntervalMs);
    // Allow the process to exit even if the timer is still running
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (timer && typeof (timer as any).unref === 'function') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (timer as any).unref();
    }
  }

  function flush(): void {
    if (buffer.length === 0) return;
    const batch = buffer;
    buffer = [];

    const body = JSON.stringify({
      type: payloadType,
      ...(runId ? { run_id: runId } : {}),
      timestamp: new Date().toISOString(),
      batch,
    });

    fetch(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...config.headers,
      },
      body,
    }).catch((err: unknown) => {
      config.onError?.(err instanceof Error ? err : new Error(String(err)));
    });
  }

  function enqueue(item: T): void {
    buffer.push(item);
    if (buffer.length >= batchSize) {
      flush();
    }
  }

  function close(): void {
    if (timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
    flush();
  }

  return { enqueue, flush, close };
}

// ---------------------------------------------------------------------------
// Event Sink
// ---------------------------------------------------------------------------

/** Extended EventSink with close() for cleanup. */
export interface WebhookEventSink extends EventSink {
  close(): void;
}

/** Create an EventSink that batches and POSTs domain events to a webhook endpoint. */
export function createWebhookEventSink(config: WebhookConfig, runId: string): WebhookEventSink {
  const sender = createBatchedSender<DomainEvent>(config, 'events', runId);

  return {
    write(event: DomainEvent): void {
      sender.enqueue(event);
    },
    flush(): void {
      sender.flush();
    },
    close(): void {
      sender.close();
    },
  };
}

// ---------------------------------------------------------------------------
// Decision Sink
// ---------------------------------------------------------------------------

/** Create a DecisionSink that batches and POSTs governance decisions to a webhook endpoint. */
export function createWebhookDecisionSink(
  config: WebhookConfig,
  runId: string
): DecisionSink {
  const sender = createBatchedSender<GovernanceDecisionRecord>(config, 'decisions', runId);

  return {
    write(record: GovernanceDecisionRecord): void {
      sender.enqueue(record);
    },
    flush(): void {
      sender.flush();
    },
  };
}

// ---------------------------------------------------------------------------
// Trace Backend
// ---------------------------------------------------------------------------

/** Create a TraceBackend that batches and POSTs completed trace spans to a webhook endpoint. */
export function createWebhookTraceBackend(config: WebhookConfig): TraceBackend {
  const sender = createBatchedSender<TraceSpan>(config, 'traces');

  return {
    name: 'webhook',

    onSpanStart(): void {
      // No-op: only send completed spans
    },

    onSpanEnd(span: TraceSpan): void {
      sender.enqueue(span);
    },

    shutdown(): void {
      sender.close();
    },
  };
}
