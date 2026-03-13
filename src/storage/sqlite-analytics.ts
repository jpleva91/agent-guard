// SQLite-optimized violation aggregation — replaces full JSONL table scan
// with a single indexed query.

import type Database from 'better-sqlite3';
import type { DomainEvent } from '../core/types.js';
import type { ViolationRecord } from '../analytics/types.js';

/** Event kinds that represent governance violations */
const VIOLATION_KINDS = [
  'InvariantViolation',
  'PolicyDenied',
  'ActionDenied',
  'BlastRadiusExceeded',
  'MergeGuardFailure',
  'UnauthorizedAction',
];

/**
 * Aggregate violations from SQLite using an indexed query.
 * This replaces the file-scanning aggregateViolations() from src/analytics/aggregator.ts
 * and is the biggest performance win of the SQLite backend.
 */
export function aggregateViolationsSqlite(db: Database.Database): {
  violations: ViolationRecord[];
  sessionCount: number;
  allEvents: DomainEvent[];
} {
  // Count distinct sessions
  const sessionRow = db.prepare('SELECT COUNT(DISTINCT run_id) as c FROM events').get() as {
    c: number;
  };

  // Query only violation events (uses idx_events_kind)
  const placeholders = VIOLATION_KINDS.map(() => '?').join(',');
  const violationRows = db
    .prepare(`SELECT run_id, data FROM events WHERE kind IN (${placeholders}) ORDER BY timestamp`)
    .all(...VIOLATION_KINDS) as { run_id: string; data: string }[];

  const violations: ViolationRecord[] = [];
  const allEvents: DomainEvent[] = [];

  for (const row of violationRows) {
    const event = JSON.parse(row.data) as DomainEvent;
    allEvents.push(event);

    const rec = event as unknown as Record<string, unknown>;
    const metadata = (rec.metadata as Record<string, unknown>) ?? {};

    violations.push({
      sessionId: row.run_id,
      eventId: event.id,
      kind: event.kind,
      timestamp: event.timestamp,
      actionType: (rec.actionType as string) ?? (rec.action as string) ?? undefined,
      target: (rec.target as string) ?? (rec.file as string) ?? undefined,
      reason: (rec.reason as string) ?? undefined,
      invariantId: (rec.invariant as string) ?? (rec.invariantId as string) ?? undefined,
      metadata,
    });
  }

  return { violations, sessionCount: sessionRow.c, allEvents };
}

/** Load all events from the database for full analytics pipeline compatibility */
export function loadAllEventsSqlite(db: Database.Database): {
  events: DomainEvent[];
  sessionCount: number;
} {
  const sessionRow = db.prepare('SELECT COUNT(DISTINCT run_id) as c FROM events').get() as {
    c: number;
  };
  const rows = db.prepare('SELECT data FROM events ORDER BY timestamp').all() as {
    data: string;
  }[];
  return {
    events: rows.map((r) => JSON.parse(r.data) as DomainEvent),
    sessionCount: sessionRow.c,
  };
}

// ── Built-in SQL analytics queries ──────────────────────────────────────────

/** A denied action type with its frequency count */
export interface TopDeniedAction {
  readonly actionType: string;
  readonly count: number;
}

/** A time-bucketed violation count */
export interface ViolationTimeBucket {
  readonly bucket: string;
  readonly count: number;
}

/** Per-session summary statistics */
export interface SessionSummary {
  readonly sessionId: string;
  readonly startedAt: number;
  readonly endedAt: number;
  readonly durationMs: number;
  readonly actionCount: number;
  readonly denialCount: number;
}

/**
 * Top denied actions — GROUP BY action_type on the decisions table,
 * filtered to deny outcomes, ordered by frequency descending.
 * Uses idx_decisions_outcome for the WHERE clause.
 */
export function queryTopDeniedActions(
  db: Database.Database,
  limit: number = 10
): TopDeniedAction[] {
  const rows = db
    .prepare(
      `SELECT action_type, COUNT(*) as cnt
       FROM decisions
       WHERE outcome = 'deny'
       GROUP BY action_type
       ORDER BY cnt DESC
       LIMIT ?`
    )
    .all(limit) as { action_type: string; cnt: number }[];

  return rows.map((r) => ({ actionType: r.action_type, count: r.cnt }));
}

/** Valid time bucket granularities for violation rate queries */
export type TimeBucketGranularity = 'hourly' | 'daily';

/**
 * Violation rate over time — time-bucketed violation counts for trend analysis.
 * Uses idx_events_kind for the WHERE clause and idx_events_timestamp for ordering.
 */
export function queryViolationRateOverTime(
  db: Database.Database,
  granularity: TimeBucketGranularity = 'daily'
): ViolationTimeBucket[] {
  const format = granularity === 'hourly' ? '%Y-%m-%dT%H:00:00Z' : '%Y-%m-%d';

  const placeholders = VIOLATION_KINDS.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT strftime('${format}', timestamp / 1000, 'unixepoch') as bucket,
              COUNT(*) as cnt
       FROM events
       WHERE kind IN (${placeholders})
       GROUP BY bucket
       ORDER BY bucket`
    )
    .all(...VIOLATION_KINDS) as { bucket: string; cnt: number }[];

  return rows.map((r) => ({ bucket: r.bucket, count: r.cnt }));
}

/**
 * Session duration and action count — per-session summary statistics.
 * Computes duration from MIN/MAX timestamps, counts total events and denials.
 */
export function querySessionStats(db: Database.Database): SessionSummary[] {
  const rows = db
    .prepare(
      `SELECT
         run_id,
         MIN(timestamp) as started_at,
         MAX(timestamp) as ended_at,
         COUNT(*) as action_count
       FROM events
       GROUP BY run_id
       ORDER BY started_at DESC`
    )
    .all() as {
    run_id: string;
    started_at: number;
    ended_at: number;
    action_count: number;
  }[];

  // Batch-fetch denial counts per session
  const denialStmt = db.prepare(
    `SELECT COUNT(*) as cnt FROM decisions WHERE run_id = ? AND outcome = 'deny'`
  );

  return rows.map((r) => ({
    sessionId: r.run_id,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    durationMs: r.ended_at - r.started_at,
    actionCount: r.action_count,
    denialCount: (denialStmt.get(r.run_id) as { cnt: number }).cnt,
  }));
}
