// SQLite EventStore implementation — drop-in replacement for the in-memory store.
// Implements the EventStore interface from src/core/types.ts.

import type Database from 'better-sqlite3';
import type { DomainEvent, EventFilter, EventStore } from '@red-codes/core';
import type { GovernanceDecisionRecord } from '@red-codes/core';

/**
 * Create an EventStore backed by SQLite.
 * If runId is provided, append() tags all events with that run_id.
 * If not, it extracts run_id from event metadata or defaults to 'unknown'.
 */
export function createSqliteEventStore(db: Database.Database, runId?: string): EventStore {
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO events (id, run_id, kind, timestamp, fingerprint, data, action_type)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const allStmt = db.prepare('SELECT data FROM events ORDER BY timestamp');

  const countStmt = db.prepare('SELECT COUNT(*) as c FROM events');

  // Pre-prepare replay helper statements
  const anchorStmt = db.prepare('SELECT timestamp FROM events WHERE id = ?');
  const replayFromStmt = db.prepare(
    'SELECT data FROM events WHERE timestamp >= ? ORDER BY timestamp'
  );

  // Prepared statement cache for dynamic query() SQL — keyed by SQL string.
  // The query() method builds SQL from up to 4 optional filter conditions,
  // producing at most 16 distinct SQL shapes. Caching avoids recompiling
  // the same statement on every call.
  const queryCache = new Map<string, Database.Statement>();

  function cachedPrepare(sql: string): Database.Statement {
    let stmt = queryCache.get(sql);
    if (!stmt) {
      stmt = db.prepare(sql);
      queryCache.set(sql, stmt);
    }
    return stmt;
  }

  return {
    append(event: DomainEvent): void {
      const rid = runId ?? extractRunId(event) ?? 'unknown';
      const actionType = extractActionType(event);
      insertStmt.run(
        event.id,
        rid,
        event.kind,
        event.timestamp,
        event.fingerprint,
        JSON.stringify(event),
        actionType
      );
    },

    query(filter: EventFilter = {}): DomainEvent[] {
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (filter.kind) {
        conditions.push('kind = ?');
        params.push(filter.kind);
      }
      if (filter.since !== undefined && filter.since !== null) {
        conditions.push('timestamp >= ?');
        params.push(filter.since);
      }
      if (filter.until !== undefined && filter.until !== null) {
        conditions.push('timestamp <= ?');
        params.push(filter.until);
      }
      if (filter.fingerprint) {
        conditions.push('fingerprint = ?');
        params.push(filter.fingerprint);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const sql = `SELECT data FROM events ${where} ORDER BY timestamp`;
      const rows = cachedPrepare(sql).all(...params) as { data: string }[];
      return rows.map((r) => JSON.parse(r.data) as DomainEvent);
    },

    replay(fromId?: string): DomainEvent[] {
      if (!fromId) {
        const rows = allStmt.all() as { data: string }[];
        return rows.map((r) => JSON.parse(r.data) as DomainEvent);
      }

      // Find the event's timestamp, then return all events from that point
      const anchor = anchorStmt.get(fromId) as { timestamp: number } | undefined;
      if (!anchor) return [];

      const rows = replayFromStmt.all(anchor.timestamp) as { data: string }[];
      return rows.map((r) => JSON.parse(r.data) as DomainEvent);
    },

    count(): number {
      return (countStmt.get() as { c: number }).c;
    },

    clear(): void {
      db.prepare('DELETE FROM events').run();
    },

    toNDJSON(): string {
      const rows = allStmt.all() as { data: string }[];
      return rows.map((r) => r.data).join('\n');
    },

    fromNDJSON(ndjson: string): number {
      const lines = ndjson.split('\n').filter((l) => l.trim());
      const bulkInsert = db.transaction(() => {
        let loaded = 0;
        for (const line of lines) {
          const event = JSON.parse(line) as DomainEvent;
          const rid = runId ?? extractRunId(event) ?? 'unknown';
          const actionType = extractActionType(event);
          insertStmt.run(
            event.id,
            rid,
            event.kind,
            event.timestamp,
            event.fingerprint,
            line,
            actionType
          );
          loaded++;
        }
        return loaded;
      });
      return bulkInsert();
    },
  };
}

/** List all distinct run IDs, most recent first */
export function listRunIds(db: Database.Database): string[] {
  const rows = db
    .prepare(
      'SELECT run_id, MAX(timestamp) as max_ts FROM events GROUP BY run_id ORDER BY max_ts DESC'
    )
    .all() as { run_id: string }[];
  return rows.map((r) => r.run_id);
}

/** Get the most recent run ID */
export function getLatestRunId(db: Database.Database): string | null {
  const row = db.prepare('SELECT run_id FROM events ORDER BY timestamp DESC LIMIT 1').get() as
    | { run_id: string }
    | undefined;
  return row?.run_id ?? null;
}

/** Load all events for a specific run ID */
export function loadRunEvents(db: Database.Database, rid: string): DomainEvent[] {
  const rows = db
    .prepare('SELECT data FROM events WHERE run_id = ? ORDER BY timestamp')
    .all(rid) as { data: string }[];
  return rows.map((r) => JSON.parse(r.data) as DomainEvent);
}

/** Load all decision records for a specific run ID */
export function loadRunDecisions(db: Database.Database, rid: string): GovernanceDecisionRecord[] {
  const rows = db
    .prepare('SELECT data FROM decisions WHERE run_id = ? ORDER BY timestamp')
    .all(rid) as { data: string }[];
  return rows.map((r) => JSON.parse(r.data) as GovernanceDecisionRecord);
}

/**
 * Query events of a specific kind across multiple runs.
 * Used by adoption analytics and denial learning to analyze patterns across sessions.
 *
 * @param db - The SQLite database instance
 * @param kind - The event kind to filter by (e.g. 'ActionDenied')
 * @param options.sessionLimit - Restrict results to the N most recent sessions (by most recent event timestamp)
 * @param options.since - ISO date string; only return events at or after this time
 */
export function queryEventsByKindAcrossRuns(
  db: Database.Database,
  kind: string,
  options?: { sessionLimit?: number; since?: string }
): Array<DomainEvent & { runId: string }> {
  const conditions = ['kind = ?'];
  const params: unknown[] = [kind];

  if (options?.since) {
    conditions.push('timestamp >= ?');
    params.push(new Date(options.since).getTime());
  }

  if (options?.sessionLimit !== undefined && options.sessionLimit > 0) {
    const recentRuns = db
      .prepare(
        'SELECT run_id FROM (SELECT run_id, MAX(timestamp) as max_ts FROM events GROUP BY run_id ORDER BY max_ts DESC LIMIT ?)'
      )
      .all(options.sessionLimit) as { run_id: string }[];

    if (recentRuns.length === 0) return [];

    const placeholders = recentRuns.map(() => '?').join(', ');
    conditions.push(`run_id IN (${placeholders})`);
    params.push(...recentRuns.map((r) => r.run_id));
  }

  const sql = `SELECT data, run_id FROM events WHERE ${conditions.join(' AND ')} ORDER BY timestamp DESC`;
  const rows = db.prepare(sql).all(...params) as { data: string; run_id: string }[];
  return rows.map((r) => ({
    ...(JSON.parse(r.data) as DomainEvent),
    runId: r.run_id,
  }));
}

/** Resolve agent identity for a run from its RunStarted event */
export function getRunAgent(db: Database.Database, runId: string): string | null {
  const row = db
    .prepare(
      `SELECT COALESCE(
        json_extract(data, '$.agentName'),
        json_extract(data, '$.agentId'),
        NULL
      ) as agent FROM events WHERE run_id = ? AND kind = 'RunStarted' LIMIT 1`
    )
    .get(runId) as { agent: string | null } | undefined;
  return row?.agent ?? null;
}

/** Resolve agent identity for multiple runs in a single query */
export function getRunAgents(db: Database.Database, runIds: string[]): Map<string, string> {
  if (runIds.length === 0) return new Map();
  const placeholders = runIds.map(() => '?').join(', ');
  const rows = db
    .prepare(
      `SELECT run_id, COALESCE(
        json_extract(data, '$.agentName'),
        json_extract(data, '$.agentId'),
        'unknown'
      ) as agent FROM events WHERE run_id IN (${placeholders}) AND kind = 'RunStarted'`
    )
    .all(...runIds) as Array<{ run_id: string; agent: string }>;
  const result = new Map<string, string>();
  for (const row of rows) {
    result.set(row.run_id, row.agent);
  }
  return result;
}

/** List run IDs that belong to a specific agent */
export function listRunIdsByAgent(db: Database.Database, agentName: string): string[] {
  const rows = db
    .prepare(
      `SELECT run_id FROM events WHERE kind = 'RunStarted' AND (
        json_extract(data, '$.agentName') = ? OR json_extract(data, '$.agentId') = ?
      ) ORDER BY timestamp DESC`
    )
    .all(agentName, agentName) as { run_id: string }[];
  return rows.map((r) => r.run_id);
}

/** Extract run_id from event metadata if present */
function extractRunId(event: DomainEvent): string | undefined {
  const meta = event.metadata as Record<string, unknown> | undefined;
  if (meta && typeof meta.runId === 'string') return meta.runId;
  if (typeof event.runId === 'string') return event.runId;
  return undefined;
}

/** Extract actionType from event payload if present (reference monitor events) */
function extractActionType(event: DomainEvent): string | null {
  const rec = event as unknown as Record<string, unknown>;
  if (typeof rec.actionType === 'string') return rec.actionType;
  return null;
}
