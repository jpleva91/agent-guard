// Telemetry event types — external contract for downstream agents and monitors.
// Snake_case field names are intentional: this is an external-facing format.

export interface TelemetryEvent {
  timestamp: string; // ISO 8601
  agent: string;
  run_id: string;
  syscall: string; // e.g., 'file.write', 'git.push'
  target: string;
  capability: string; // matched policy ID or 'default-allow'
  policy_result: 'allow' | 'deny';
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
