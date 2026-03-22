// Storage backend configuration and aggregation query types.

import { homedir } from 'node:os';
import { join } from 'node:path';

/** Supported storage backends */
export type StorageBackend = 'sqlite';

/** Configuration for the storage layer */
export interface StorageConfig {
  /** Which backend to use. Default: 'sqlite' */
  readonly backend: StorageBackend;
  /** Path to the .db file. Default: ~/.agentguard/agentguard.db */
  readonly dbPath?: string;
  /** Base directory for storage data. Default: .agentguard (repo-local) */
  readonly baseDir?: string;
  /** Directory for optional JSONL streaming sink. When set, events and decisions
   *  are also written as JSONL files for real-time tailing (`tail -f`). */
  readonly jsonlPath?: string;
}

/** Default paths */
export const DEFAULT_BASE_DIR = '.agentguard';
export const DEFAULT_DB_FILENAME = 'agentguard.db';

/** Default SQLite database directory (home directory, out of repo tree) */
export const DEFAULT_SQLITE_DIR = join(homedir(), '.agentguard');

/** Default SQLite database path */
export const DEFAULT_SQLITE_DB_PATH = join(DEFAULT_SQLITE_DIR, DEFAULT_DB_FILENAME);

// ─── Aggregation Query Types ──────────────────────────────────────────────────

/** Time-range filter for aggregation queries */
export interface AggregationTimeFilter {
  /** Only include events at or after this timestamp (epoch ms) */
  readonly since?: number;
  /** Only include events at or before this timestamp (epoch ms) */
  readonly until?: number;
  /** Restrict to the N most recent sessions */
  readonly sessionLimit?: number;
}

/** Event count grouped by kind */
export interface EventKindCount {
  readonly kind: string;
  readonly count: number;
}

/** Decision count grouped by outcome */
export interface DecisionOutcomeCount {
  readonly outcome: string;
  readonly count: number;
}

/** Denied action count grouped by action_type */
export interface DeniedActionCount {
  readonly actionType: string;
  readonly count: number;
  readonly distinctSessions: number;
}

/** Per-run summary statistics */
export interface RunSummary {
  readonly runId: string;
  readonly totalEvents: number;
  readonly allowed: number;
  readonly denied: number;
  readonly escalated: number;
  readonly violations: number;
  readonly firstEventAt: number;
  readonly lastEventAt: number;
}

/** Violation count grouped by invariant name */
export interface ViolationByInvariant {
  readonly invariant: string;
  readonly count: number;
  readonly distinctSessions: number;
}

/** Time-bucketed event count */
export interface TimeBucketCount {
  readonly bucketStart: number;
  readonly count: number;
}

/** Overall governance statistics */
export interface GovernanceStats {
  readonly totalSessions: number;
  readonly totalEvents: number;
  readonly totalDecisions: number;
  readonly allowedCount: number;
  readonly deniedCount: number;
  readonly escalatedCount: number;
  readonly firstEventAt: number | null;
  readonly lastEventAt: number | null;
}

/** Per-agent governance statistics */
export interface AgentStats {
  readonly agent: string;
  readonly totalDecisions: number;
  readonly allowed: number;
  readonly denied: number;
  readonly escalated: number;
  readonly distinctSessions: number;
  readonly firstSeenAt: number;
  readonly lastSeenAt: number;
}

/** Time-bucketed governance rollup */
export interface TimeRollup {
  readonly period: string;
  readonly totalEvents: number;
  readonly totalDecisions: number;
  readonly allowed: number;
  readonly denied: number;
  readonly distinctSessions: number;
}

/** Common invariant violations across multiple agents */
export interface TeamViolationPattern {
  readonly invariant: string;
  readonly count: number;
  readonly distinctAgents: number;
  readonly distinctSessions: number;
}
