// TelemetryStore interface — storage abstraction for ingested telemetry data.

import type { DomainEvent, GovernanceDecisionRecord } from '@red-codes/core';
import type { TraceSpan } from '@red-codes/telemetry';

export interface QueryFilter {
  readonly runId?: string;
  readonly since?: string; // ISO 8601
  readonly until?: string; // ISO 8601
  readonly limit?: number; // default 100
  readonly offset?: number; // default 0
}

export interface EventQueryFilter extends QueryFilter {
  readonly kind?: string;
}

export interface DecisionQueryFilter extends QueryFilter {
  readonly outcome?: 'allow' | 'deny';
}

export interface TraceQueryFilter extends QueryFilter {
  readonly kind?: string;
}

export interface QueryResult<T> {
  readonly data: T[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

export interface TelemetryStore {
  appendEvents(runId: string, events: DomainEvent[]): Promise<void>;
  appendDecisions(runId: string, decisions: GovernanceDecisionRecord[]): Promise<void>;
  appendTraces(traces: TraceSpan[]): Promise<void>;

  queryEvents(filter: EventQueryFilter): Promise<QueryResult<DomainEvent>>;
  queryDecisions(filter: DecisionQueryFilter): Promise<QueryResult<GovernanceDecisionRecord>>;
  queryTraces(filter: TraceQueryFilter): Promise<QueryResult<TraceSpan>>;
}

/** Install record for enrolled telemetry clients */
export interface InstallRecord {
  readonly install_id: string;
  readonly public_key: string; // PEM-encoded Ed25519
  readonly token_hash: string; // SHA-256 hex of the installation token
  readonly version: string;
  readonly enrolled_at: string; // ISO 8601
}

/** Stored telemetry payload event */
export interface TelemetryPayloadRecord {
  readonly event_id: string;
  readonly install_id: string | null; // null for anonymous
  readonly event_json: string;
  readonly received_at: string; // ISO 8601
}

/** Extended store with enrollment and payload telemetry support */
export interface TelemetryDataStore extends TelemetryStore {
  createInstall(record: InstallRecord): Promise<void>;
  findInstallById(installId: string): Promise<InstallRecord | null>;
  findInstallByTokenHash(tokenHash: string): Promise<InstallRecord | null>;
  appendTelemetryPayloads(records: TelemetryPayloadRecord[]): Promise<void>;
  queryTelemetryPayloads(filter: QueryFilter): Promise<QueryResult<TelemetryPayloadRecord>>;
}
