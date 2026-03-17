// Backend data source interface — unified abstraction over JSONL, SQLite, Firestore, and remote.

import type { DomainEvent, GovernanceDecisionRecord } from '@red-codes/core';

export interface DataSource {
  listRuns(limit?: number): Promise<string[]>;
  loadEvents(runId: string): Promise<DomainEvent[]>;
  loadDecisions(runId: string): Promise<GovernanceDecisionRecord[]>;
  queryEvents(opts: { runId?: string; kind?: string; limit?: number }): Promise<DomainEvent[]>;
  /** Release underlying resources (e.g. close SQLite connection). No-op if unsupported. */
  close?(): void;
}
