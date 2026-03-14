// SQLite-optimized violation aggregation — replaces full JSONL table scan
// with a single indexed query.

import type Database from 'better-sqlite3';
import type { DomainEvent } from '@red-codes/core';
import type { ViolationRecord } from '@red-codes/analytics';

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

/**
 * Load all events from the database for full analytics pipeline compatibility.
 * @deprecated Prefer {@link aggregateEventCountsSqlite} or {@link paginateEventsSqlite}
 * for large datasets — this function loads every event into memory.
 */
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
 * Uses a single LEFT JOIN query to avoid per-row round trips to the decisions table.
 */
export function querySessionStats(db: Database.Database): SessionSummary[] {
  const rows = db
    .prepare(
      `SELECT
         e.run_id,
         MIN(e.timestamp) as started_at,
         MAX(e.timestamp) as ended_at,
         COUNT(*) as action_count,
         COALESCE(d.denial_count, 0) as denial_count
       FROM events e
       LEFT JOIN (
         SELECT run_id, COUNT(*) as denial_count
         FROM decisions
         WHERE outcome = 'deny'
         GROUP BY run_id
       ) d ON e.run_id = d.run_id
       GROUP BY e.run_id
       ORDER BY started_at DESC`
    )
    .all() as {
    run_id: string;
    started_at: number;
    ended_at: number;
    action_count: number;
    denial_count: number;
  }[];

  return rows.map((r) => ({
    sessionId: r.run_id,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    durationMs: r.ended_at - r.started_at,
    actionCount: r.action_count,
    denialCount: r.denial_count,
  }));
}

// ---------------------------------------------------------------------------
// SQL-native aggregation — computes summaries without loading full event data.
// ---------------------------------------------------------------------------

/** Summary counts for events grouped by kind */
export interface EventCountsByKind {
  readonly byKind: Readonly<Record<string, number>>;
  readonly total: number;
  readonly sessionCount: number;
}

/** Summary counts for events grouped by run ID */
export interface EventCountsByRun {
  readonly byRun: Readonly<Record<string, number>>;
  readonly total: number;
  readonly sessionCount: number;
}

/** Per-run summary with violation, denial, and action counts */
export interface RunSummary {
  readonly runId: string;
  readonly totalEvents: number;
  readonly violationCount: number;
  readonly denialCount: number;
  readonly actionCount: number;
  readonly minTimestamp: number;
  readonly maxTimestamp: number;
}

/** Options for cursor-based event pagination */
export interface PaginateEventsOptions {
  /** Resume after this timestamp (exclusive). Omit to start from the beginning. */
  readonly cursor?: number;
  /** Maximum number of events to return. */
  readonly limit: number;
  /** Optional filter by event kind. */
  readonly kind?: string;
}

/** Paginated result set with a cursor for the next page */
export interface PaginatedEvents {
  readonly events: DomainEvent[];
  /** Timestamp cursor for the next page, or null if this is the last page. */
  readonly nextCursor: number | null;
  /** Total number of events matching the filter (without pagination). */
  readonly totalCount: number;
}

/**
 * Aggregate event counts by kind using SQL GROUP BY.
 * Returns categorical summaries without loading event data into memory.
 */
export function aggregateEventCountsSqlite(db: Database.Database): EventCountsByKind {
  const rows = db.prepare('SELECT kind, COUNT(*) as count FROM events GROUP BY kind').all() as {
    kind: string;
    count: number;
  }[];

  const byKind: Record<string, number> = {};
  let total = 0;
  for (const row of rows) {
    byKind[row.kind] = row.count;
    total += row.count;
  }

  const sessionRow = db.prepare('SELECT COUNT(DISTINCT run_id) as c FROM events').get() as {
    c: number;
  };

  return { byKind, total, sessionCount: sessionRow.c };
}

/**
 * Aggregate event counts by run ID using SQL GROUP BY.
 * Returns per-session event counts without loading event data.
 */
export function aggregateEventCountsByRunSqlite(db: Database.Database): EventCountsByRun {
  const rows = db.prepare('SELECT run_id, COUNT(*) as count FROM events GROUP BY run_id').all() as {
    run_id: string;
    count: number;
  }[];

  const byRun: Record<string, number> = {};
  let total = 0;
  for (const row of rows) {
    byRun[row.run_id] = row.count;
    total += row.count;
  }

  return { byRun, total, sessionCount: rows.length };
}

/** Event kinds that represent denials (used for per-run summary queries) */
const DENIAL_KINDS = ['ActionDenied', 'PolicyDenied'];

/** Event kinds that represent executed or requested actions (for action counts) */
const ACTION_KINDS = ['ActionExecuted', 'ActionRequested'];

/**
 * Compute per-run summaries using a single SQL GROUP BY query.
 * Returns violation, denial, and action counts per run without loading raw events.
 * This replaces the pattern of loading all events per run and counting in JS.
 */
export function aggregateRunSummariesSqlite(db: Database.Database): RunSummary[] {
  // Single query: get counts per (run_id, kind) pair, plus timestamp range
  const rows = db
    .prepare(
      `SELECT run_id, kind, COUNT(*) as count,
              MIN(timestamp) as min_ts, MAX(timestamp) as max_ts
       FROM events
       GROUP BY run_id, kind`
    )
    .all() as {
    run_id: string;
    kind: string;
    count: number;
    min_ts: number;
    max_ts: number;
  }[];

  // Pivot the (run_id, kind) rows into per-run summaries
  const runMap = new Map<
    string,
    {
      totalEvents: number;
      violationCount: number;
      denialCount: number;
      actionCount: number;
      minTimestamp: number;
      maxTimestamp: number;
    }
  >();

  const violationSet = new Set(VIOLATION_KINDS);
  const denialSet = new Set(DENIAL_KINDS);
  const actionSet = new Set(ACTION_KINDS);

  for (const row of rows) {
    let summary = runMap.get(row.run_id);
    if (!summary) {
      summary = {
        totalEvents: 0,
        violationCount: 0,
        denialCount: 0,
        actionCount: 0,
        minTimestamp: row.min_ts,
        maxTimestamp: row.max_ts,
      };
      runMap.set(row.run_id, summary);
    }

    summary.totalEvents += row.count;
    if (violationSet.has(row.kind)) summary.violationCount += row.count;
    if (denialSet.has(row.kind)) summary.denialCount += row.count;
    if (actionSet.has(row.kind)) summary.actionCount += row.count;
    if (row.min_ts < summary.minTimestamp) summary.minTimestamp = row.min_ts;
    if (row.max_ts > summary.maxTimestamp) summary.maxTimestamp = row.max_ts;
  }

  return [...runMap.entries()].map(([runId, s]) => ({
    runId,
    totalEvents: s.totalEvents,
    violationCount: s.violationCount,
    denialCount: s.denialCount,
    actionCount: s.actionCount,
    minTimestamp: s.minTimestamp,
    maxTimestamp: s.maxTimestamp,
  }));
}

/**
 * Paginate events using cursor-based pagination.
 * Uses the `timestamp` column as the cursor — events are returned in chronological order.
 * For large datasets, call repeatedly with the returned `nextCursor` to stream through results.
 */
export function paginateEventsSqlite(
  db: Database.Database,
  options: PaginateEventsOptions
): PaginatedEvents {
  const { cursor, limit, kind } = options;
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (cursor !== undefined) {
    conditions.push('timestamp > ?');
    params.push(cursor);
  }
  if (kind) {
    conditions.push('kind = ?');
    params.push(kind);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Fetch limit + 1 to detect whether there is a next page
  const rows = db
    .prepare(`SELECT data, timestamp FROM events ${where} ORDER BY timestamp LIMIT ?`)
    .all(...params, limit + 1) as { data: string; timestamp: number }[];

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const events = pageRows.map((r) => JSON.parse(r.data) as DomainEvent);
  const nextCursor = hasMore ? pageRows[pageRows.length - 1].timestamp : null;

  // Total count for the filter (without pagination)
  const countSql = `SELECT COUNT(*) as c FROM events ${kind ? 'WHERE kind = ?' : ''}`;
  const countParams = kind ? [kind] : [];
  const countRow = db.prepare(countSql).get(...countParams) as { c: number };

  return { events, nextCursor, totalCount: countRow.c };
}
