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
  VerbosityLevel,
} from './tracepoint.js';
import { VERBOSITY_KINDS } from './tracepoint.js';

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

let spanCounter = 0;
let traceCounter = 0;

function generateSpanId(): string {
  return `span_${Date.now()}_${++spanCounter}`;
}

function generateTraceId(): string {
  return `trace_${Date.now()}_${++traceCounter}`;
}

/** Reset the span and trace counters. Exported for test determinism. */
export function resetSpanCounter(): void {
  spanCounter = 0;
  traceCounter = 0;
}

// ---------------------------------------------------------------------------
// No-op SpanHandle — returned when tracing is disabled
// ---------------------------------------------------------------------------

const NOOP_SPAN: TraceSpan = {
  spanId: '',
  traceId: '',
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
   * Start a new trace — generates a traceId and returns a root SpanHandle.
   * All child spans created with the returned traceId are correlated.
   *
   * @param name - Human-readable trace name (e.g., "propose:file.write").
   * @param attributes - Optional initial attributes for the root span.
   * @returns SpanHandle for the root span, whose span.traceId is the correlation key.
   */
  startTrace(name: string, attributes?: SpanAttributes): SpanHandle;

  /**
   * Start a new trace span for the given tracepoint kind.
   * Returns a SpanHandle that must be ended by calling end() or endWithError().
   *
   * @param kind - The governance pipeline stage being traced.
   * @param name - Human-readable span name (e.g., "aab.normalize:file.write").
   * @param parentSpanId - Optional parent span ID for nesting.
   * @param attributes - Optional initial attributes.
   * @param traceId - Optional trace ID for correlation. If omitted, a new one is generated.
   */
  startSpan(
    kind: TracepointKind,
    name: string,
    parentSpanId?: string,
    attributes?: SpanAttributes,
    traceId?: string
  ): SpanHandle;

  /** Register a new trace backend. */
  addBackend(backend: TraceBackend): void;

  /** Remove a trace backend by name. */
  removeBackend(name: string): void;

  /** Get the list of registered backend names. */
  getBackendNames(): string[];

  /** Returns true if at least one backend is registered (or forceEnabled). */
  isEnabled(): boolean;

  /** Returns the current verbosity level. */
  getVerbosity(): VerbosityLevel;

  /** Shutdown all backends and flush buffers. */
  shutdown(): void;
}

// ---------------------------------------------------------------------------
// createTracer — factory function
// ---------------------------------------------------------------------------

export function createTracer(config: TracerConfig = {}): Tracer {
  const backends: TraceBackend[] = [...(config.backends || [])];
  const forceEnabled = config.forceEnabled ?? false;
  const verbosity: VerbosityLevel = config.verbosity ?? 'standard';
  const allowedKinds = VERBOSITY_KINDS[verbosity];

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

  function createSpanHandle(span: TraceSpan): SpanHandle {
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
  }

  return {
    startTrace(name: string, attributes?: SpanAttributes): SpanHandle {
      if (!isEnabled()) {
        return NOOP_HANDLE;
      }

      const traceId = generateTraceId();
      const span: TraceSpan = {
        spanId: generateSpanId(),
        traceId,
        parentSpanId: undefined,
        kind: 'kernel.propose',
        name,
        startTime: Date.now(),
        endTime: undefined,
        durationMs: undefined,
        status: undefined,
        error: undefined,
        attributes: { ...attributes },
      };

      notifyStart(span);
      return createSpanHandle(span);
    },

    startSpan(
      kind: TracepointKind,
      name: string,
      parentSpanId?: string,
      attributes?: SpanAttributes,
      traceId?: string
    ): SpanHandle {
      // Zero-cost path: return no-op handle when tracing is disabled
      if (!isEnabled()) {
        return NOOP_HANDLE;
      }

      // Verbosity filter: skip spans for kinds not included at current level
      if (!allowedKinds.has(kind)) {
        return NOOP_HANDLE;
      }

      const span: TraceSpan = {
        spanId: generateSpanId(),
        traceId: traceId || generateTraceId(),
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
      return createSpanHandle(span);
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

    getVerbosity(): VerbosityLevel {
      return verbosity;
    },

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
