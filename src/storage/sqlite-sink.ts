// SQLite event and decision sinks — write-only, append-only.
// Mirrors the JSONL sink pattern: swallows write errors, never crashes the kernel.

import type Database from 'better-sqlite3';
import type { DomainEvent } from '../core/types.js';
import type { EventSink } from '../kernel/kernel.js';
import type { GovernanceDecisionRecord, DecisionSink } from '../kernel/decisions/types.js';

/** Create an EventSink that writes events to the SQLite events table */
export function createSqliteEventSink(db: Database.Database, runId: string): EventSink {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO events (id, run_id, kind, timestamp, fingerprint, data)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  return {
    write(event: DomainEvent): void {
      try {
        stmt.run(
          event.id,
          runId,
          event.kind,
          event.timestamp,
          event.fingerprint,
          JSON.stringify(event)
        );
      } catch {
        // Swallow write errors — don't crash the kernel
      }
    },

    flush(): void {
      // No buffering needed — SQLite handles durability
    },
  };
}

/** Create a DecisionSink that writes decision records to the SQLite decisions table */
export function createSqliteDecisionSink(db: Database.Database, runId: string): DecisionSink {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO decisions (record_id, run_id, timestamp, outcome, action_type, target, reason, data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  return {
    write(record: GovernanceDecisionRecord): void {
      try {
        stmt.run(
          record.recordId,
          runId,
          record.timestamp,
          record.outcome,
          record.action.type,
          record.action.target,
          record.reason,
          JSON.stringify(record)
        );
      } catch {
        // Swallow write errors — don't crash the kernel
      }
    },

    flush(): void {
      // No buffering needed
    },
  };
}
