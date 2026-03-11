export type { TelemetryEvent, TelemetryLoggerOptions, TelemetrySink } from './types.js';
export {
  buildTelemetryEvent,
  createTelemetryLogger,
  createTelemetryDecisionSink,
} from './runtimeLogger.js';

// Tracepoint system
export type {
  TracepointKind,
  SpanStatus,
  SpanAttributes,
  TraceSpan,
  SpanHandle,
  TraceBackend,
  TracerConfig,
} from './tracepoint.js';
export type { Tracer } from './tracer.js';
export { createTracer, resetSpanCounter } from './tracer.js';
