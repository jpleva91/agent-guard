// SQLite EventStore implementation — drop-in replacement for the in-memory store.
// Implements the EventStore interface from src/core/types.ts.

import type Database from 'better-sqlite3';
import type { DomainEvent, EventFilter, EventStore } from '../core/types.js';
import type { GovernanceDecisionRecord } from '../kernel/decisions/types.js';

/**
 * Create an EventStore backed by SQLite.
 * If runId is provided, append() tags all events with that run_id.
 * If not, it extracts run_id from event metadata or defaults to 'unknown'.
 */
export function createSqliteEventStore(db: Database.Database, runId?: string): EventStore {
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO events (id, run_id, kind, timestamp, fingerprint, data)
    VALUES (?, ?, ?, ?, ?, ?)
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
      insertStmt.run(
        event.id,
        rid,
        event.kind,
        event.timestamp,
        event.fingerprint,
        JSON.stringify(event)
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
          insertStmt.run(event.id, rid, event.kind, event.timestamp, event.fingerprint, line);
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

/** Extract run_id from event metadata if present */
function extractRunId(event: DomainEvent): string | undefined {
  const meta = event.metadata as Record<string, unknown> | undefined;
  if (meta && typeof meta.runId === 'string') return meta.runId;
  if (typeof event.runId === 'string') return event.runId;
  return undefined;
}
