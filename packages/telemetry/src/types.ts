// Telemetry event types — external contract for downstream agents and monitors.
// Snake_case field names are intentional: this is an external-facing format.

export interface TelemetryEvent {
  timestamp: string; // ISO 8601
  agent: string;
  run_id: string;
  syscall: string; // e.g., 'file.write', 'git.push'
  target: string;
  capability: string; // matched policy ID or 'default-allow'
  policy_result: 'allow' | 'deny' | 'pause' | 'rollback' | 'modify';
  invariant_result: 'pass' | 'fail';
  issue_id?: number;
  diff_size?: number;
  model?: string;
  provider?: string;
  trust_tier?: string;
  role?: string;
  metadata?: Record<string, unknown>;
}

export interface TelemetryLoggerOptions {
  logDir?: string; // default: 'logs'
  logFile?: string; // default: 'runtime-events.jsonl'
}

export interface TelemetrySink {
  write(event: TelemetryEvent): void;
  flush?(): void;
}

/**
 * Per-stage performance breakdown for a single kernel.propose() call.
 * All durations are in milliseconds. Fields are undefined if the
 * stage was skipped (e.g., no simulation configured).
 */
export interface PerformanceBreakdown {
  /** Total wall-clock time for the entire propose pipeline. */
  totalMs: number;
  /** Time spent in AAB normalization (raw action → ActionContext). */
  normalizeMs?: number;
  /** Time spent in policy evaluation (rule matching). */
  policyEvalMs?: number;
  /** Time spent checking invariants. */
  invariantCheckMs?: number;
  /** Time spent in pre-execution simulation. */
  simulationMs?: number;
  /** Time spent in adapter execution. */
  adapterMs?: number;
  /** Time spent building the governance decision record. */
  decisionBuildMs?: number;
  /** Trace ID correlating all spans in this proposal. */
  traceId?: string;
}
