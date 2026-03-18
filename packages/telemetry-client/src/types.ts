// Telemetry client types — shared across client SDK modules.

/** Telemetry operating mode */
export type TelemetryMode = 'off' | 'anonymous' | 'verified';

/** Event payload sent to the telemetry server */
export interface TelemetryPayloadEvent {
  readonly event_id: string;
  readonly timestamp: number; // Unix epoch seconds
  readonly version: string;
  readonly runtime: 'claude-code' | 'copilot' | 'ci' | 'unknown';
  readonly environment: 'local' | 'ci' | 'container';
  readonly event_type: 'guard_triggered' | 'policy_denied' | 'execution_allowed' | 'error';
  readonly policy: string;
  readonly result: 'allowed' | 'denied' | 'error';
  readonly latency_ms: number;
}

/** Trackable event fields (auto-filled fields omitted) */
export type TrackableEvent = Omit<TelemetryPayloadEvent, 'event_id' | 'timestamp' | 'version'>;

/** Persisted identity stored at ~/.agentguard/telemetry.json */
export interface TelemetryIdentity {
  install_id: string;
  public_key: string; // PEM-encoded Ed25519
  private_key: string; // PEM-encoded Ed25519
  mode: TelemetryMode;
  enrollment_token?: string;
  enrolled_at?: string; // ISO 8601
  server_url?: string;
  noticed?: boolean;
}

/** Telemetry client configuration */
export interface TelemetryClientConfig {
  serverUrl?: string;
  /** Cloud API key — sent as X-API-Key header when sending to AgentGuard Cloud */
  cloudApiKey?: string;
  mode?: TelemetryMode;
  flushIntervalMs?: number; // default 60000
  batchSize?: number; // default 50
  maxRetries?: number; // default 3
  maxQueueSizeMb?: number; // default 10
  /** Human-readable agent name for swarm identity (e.g. "backlog-steward") */
  agentName?: string;
  /** Override identity file path (for testing) */
  identityPath?: string;
  /** Override queue path (for testing) */
  queuePath?: string;
}

/** Persistent event queue interface */
export interface TelemetryQueue {
  enqueue(event: TelemetryPayloadEvent): void;
  dequeue(count: number): TelemetryPayloadEvent[];
  size(): number;
  sizeBytes(): number;
  clear(): void;
  close(): void;
}

/** Telemetry client interface */
export interface TelemetryClient {
  track(event: TrackableEvent): void;
  enroll(serverUrl: string): Promise<void>;
  start(): void;
  stop(): void;
  status(): TelemetryStatus;
  reset(): void;
}

/** Telemetry status snapshot */
export interface TelemetryStatus {
  mode: TelemetryMode;
  installId: string | null;
  enrolled: boolean;
  queueSize: number;
  queueSizeBytes: number;
}
