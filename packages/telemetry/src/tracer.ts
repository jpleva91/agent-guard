// Tracer — orchestrator for kernel-level tracing.
// Manages TraceBackend subscribers and provides the span creation API.
//
// Key design: zero-cost when disabled. If no backends are attached,
// startSpan() returns a lightweight no-op handle that avoids allocation
// and callback overhead.

import type {
  TracepointKind,
  TraceSpan,
  SpanHandle,
  SpanAttributes,
  TraceBackend,
  TracerConfig,
} from './tracepoint.js';

// ---------------------------------------------------------------------------
// Span ID generation
// ---------------------------------------------------------------------------

let spanCounter = 0;

function generateSpanId(): string {
  return `span_${Date.now()}_${++spanCounter}`;
}

/** Reset the span counter. Exported for test determinism. */
export function resetSpanCounter(): void {
  spanCounter = 0;
}

// ---------------------------------------------------------------------------
// No-op SpanHandle — returned when tracing is disabled
// ---------------------------------------------------------------------------

const NOOP_SPAN: TraceSpan = {
  spanId: '',
  parentSpanId: undefined,
  kind: 'kernel.propose',
  name: '',
  startTime: 0,
  endTime: undefined,
  durationMs: undefined,
  status: undefined,
  error: undefined,
  attributes: {},
};

const NOOP_HANDLE: SpanHandle = {
  span: NOOP_SPAN,
  end() {},
  endWithError() {},
  setAttribute() {},
};

// ---------------------------------------------------------------------------
// Tracer interface
// ---------------------------------------------------------------------------

/** The Tracer manages trace backends and creates spans. */
export interface Tracer {
  /**
   * Start a new trace span for the given tracepoint kind.
   * Returns a SpanHandle that must be ended by calling end() or endWithError().
   *
   * @param kind - The governance pipeline stage being traced.
   * @param name - Human-readable span name (e.g., "aab.normalize:file.write").
   * @param parentSpanId - Optional parent span ID for nesting.
   * @param attributes - Optional initial attributes.
   */
  startSpan(
    kind: TracepointKind,
    name: string,
    parentSpanId?: string,
    attributes?: SpanAttributes
  ): SpanHandle;

  /** Register a new trace backend. */
  addBackend(backend: TraceBackend): void;

  /** Remove a trace backend by name. */
  removeBackend(name: string): void;

  /** Get the list of registered backend names. */
  getBackendNames(): string[];

  /** Returns true if at least one backend is registered (or forceEnabled). */
  isEnabled(): boolean;

  /** Shutdown all backends and flush buffers. */
  shutdown(): void;
}

// ---------------------------------------------------------------------------
// createTracer — factory function
// ---------------------------------------------------------------------------

export function createTracer(config: TracerConfig = {}): Tracer {
  const backends: TraceBackend[] = [...(config.backends || [])];
  const forceEnabled = config.forceEnabled ?? false;

  function isEnabled(): boolean {
    return forceEnabled || backends.length > 0;
  }

  function notifyStart(span: TraceSpan): void {
    for (const backend of backends) {
      try {
        backend.onSpanStart(span);
      } catch {
        // Backend errors must never crash the kernel
      }
    }
  }

  function notifyEnd(span: TraceSpan): void {
    for (const backend of backends) {
      try {
        backend.onSpanEnd(span);
      } catch {
        // Backend errors must never crash the kernel
      }
    }
  }

  return {
    startSpan(
      kind: TracepointKind,
      name: string,
      parentSpanId?: string,
      attributes?: SpanAttributes
    ): SpanHandle {
      // Zero-cost path: return no-op handle when tracing is disabled
      if (!isEnabled()) {
        return NOOP_HANDLE;
      }

      const span: TraceSpan = {
        spanId: generateSpanId(),
        parentSpanId,
        kind,
        name,
        startTime: Date.now(),
        endTime: undefined,
        durationMs: undefined,
        status: undefined,
        error: undefined,
        attributes: { ...attributes },
      };

      notifyStart(span);

      let ended = false;

      return {
        span,

        end() {
          if (ended) return;
          ended = true;
          span.endTime = Date.now();
          span.durationMs = span.endTime - span.startTime;
          span.status = 'ok';
          notifyEnd(span);
        },

        endWithError(message: string) {
          if (ended) return;
          ended = true;
          span.endTime = Date.now();
          span.durationMs = span.endTime - span.startTime;
          span.status = 'error';
          span.error = message;
          notifyEnd(span);
        },

        setAttribute(key: string, value: string | number | boolean) {
          (span.attributes as Record<string, string | number | boolean>)[key] = value;
        },
      };
    },

    addBackend(backend: TraceBackend): void {
      backends.push(backend);
    },

    removeBackend(name: string): void {
      const idx = backends.findIndex((b) => b.name === name);
      if (idx !== -1) {
        backends.splice(idx, 1);
      }
    },

    getBackendNames(): string[] {
      return backends.map((b) => b.name);
    },

    isEnabled,

    shutdown(): void {
      for (const backend of backends) {
        try {
          backend.shutdown?.();
        } catch {
          // Swallow shutdown errors
        }
      }
    },
  };
}
