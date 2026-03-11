// Tracepoint Interface — foundation for kernel-level tracing.
// Defines pluggable tracepoint types and the TraceBackend contract
// that different backends (console, file, OpenTelemetry, eBPF) implement.
//
// Design: zero-cost when disabled. When no backends are attached,
// span operations are lightweight stubs that do no allocation.

// ---------------------------------------------------------------------------
// Tracepoint Kinds — named locations in the governance pipeline
// ---------------------------------------------------------------------------

/**
 * All tracepoint locations in the governance kernel pipeline.
 * Each kind maps to a specific stage of action processing.
 */
export type TracepointKind =
  | 'aab.normalize' // AAB intent normalization (raw action → normalized intent)
  | 'aab.authorize' // AAB authorization (intent → policy eval + blast radius)
  | 'policy.evaluate' // Policy rule matching (intent → allow/deny decision)
  | 'invariant.check' // Single invariant evaluation
  | 'invariant.checkAll' // Full invariant suite evaluation
  | 'simulation.run' // Pre-execution impact simulation
  | 'adapter.dispatch' // Adapter execution (action → result)
  | 'event.emit' // Event bus publish
  | 'event.store' // Event store write
  | 'decision.build' // Governance decision record construction
  | 'kernel.propose'; // Full kernel propose cycle (top-level span)

// ---------------------------------------------------------------------------
// Span — a unit of traced work
// ---------------------------------------------------------------------------

/** Status of a completed span. */
export type SpanStatus = 'ok' | 'error';

/** Attributes attached to a span for structured data. */
export type SpanAttributes = Record<string, string | number | boolean>;

/**
 * A trace span representing a unit of work in the governance pipeline.
 * Spans form a tree via parentSpanId, enabling reconstruction of the
 * full action processing timeline.
 */
export interface TraceSpan {
  /** Unique span identifier. */
  readonly spanId: string;
  /** Parent span ID for nesting (undefined for root spans). */
  readonly parentSpanId: string | undefined;
  /** Which governance pipeline stage this span covers. */
  readonly kind: TracepointKind;
  /** Human-readable name for this span instance (e.g., "policy.evaluate:file.write"). */
  readonly name: string;
  /** Span start time (Unix ms). */
  readonly startTime: number;
  /** Span end time (Unix ms). Set when the span is ended. */
  endTime: number | undefined;
  /** Duration in milliseconds. Computed when ended. */
  durationMs: number | undefined;
  /** Span completion status. */
  status: SpanStatus | undefined;
  /** Optional error message if status is 'error'. */
  error: string | undefined;
  /** Structured attributes for this span. */
  readonly attributes: SpanAttributes;
}

// ---------------------------------------------------------------------------
// SpanHandle — returned to callers for ending spans
// ---------------------------------------------------------------------------

/**
 * Handle returned when starting a span. Callers use this to end
 * the span and optionally record an error.
 */
export interface SpanHandle {
  /** The underlying span data. */
  readonly span: TraceSpan;

  /**
   * End the span successfully. Records end time and notifies backends.
   * Calling end() multiple times is a no-op after the first call.
   */
  end(): void;

  /**
   * End the span with an error. Records the error message, sets status
   * to 'error', and notifies backends.
   */
  endWithError(message: string): void;

  /**
   * Set a structured attribute on the span.
   */
  setAttribute(key: string, value: string | number | boolean): void;
}

// ---------------------------------------------------------------------------
// TraceBackend — the pluggable subscriber interface
// ---------------------------------------------------------------------------

/**
 * Backend interface for consuming trace spans. Implementations receive
 * span lifecycle callbacks and can export data to any destination.
 *
 * Backends are registered with a Tracer and receive callbacks for every
 * span that is started and ended. They can filter by TracepointKind to
 * focus on specific pipeline stages.
 *
 * Example backends: ConsoleTraceBackend, FileTraceBackend,
 * OpenTelemetryTraceBackend, eBPFTraceBackend.
 */
export interface TraceBackend {
  /** Unique name for this backend (e.g., 'console', 'otel', 'file'). */
  readonly name: string;

  /**
   * Called when a new span starts. Backends can use this to begin
   * tracking the span or to emit a start event.
   */
  onSpanStart(span: TraceSpan): void;

  /**
   * Called when a span ends (successfully or with error). The span
   * object will have endTime, durationMs, and status populated.
   */
  onSpanEnd(span: TraceSpan): void;

  /**
   * Optional: called when the tracer is shut down. Backends can use
   * this to flush buffers, close connections, etc.
   */
  shutdown?(): void;
}

// ---------------------------------------------------------------------------
// TracerConfig — configuration for creating a Tracer
// ---------------------------------------------------------------------------

/** Configuration for creating a Tracer instance. */
export interface TracerConfig {
  /** Initial set of backends to register. */
  backends?: TraceBackend[];
  /** If true, tracing is enabled even with no backends (spans are still created). */
  forceEnabled?: boolean;
}
