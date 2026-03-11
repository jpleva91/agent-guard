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
