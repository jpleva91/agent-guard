// SQLite event and decision sinks — write-only, append-only.
// Mirrors the JSONL sink pattern: swallows write errors, never crashes the kernel.

import type Database from 'better-sqlite3';
import type { DomainEvent, EventSink, GovernanceDecisionRecord, DecisionSink } from '@red-codes/core';

/** Create an EventSink that writes events to the SQLite events table */
export function createSqliteEventSink(
  db: Database.Database,
  runId: string,
  onError?: (error: Error) => void
): EventSink {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO events (id, run_id, kind, timestamp, fingerprint, data, action_type)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  return {
    write(event: DomainEvent): void {
      try {
        const actionType = extractActionType(event);
        stmt.run(
          event.id,
          runId,
          event.kind,
          event.timestamp,
          event.fingerprint,
          JSON.stringify(event),
          actionType
        );
      } catch (err) {
        // Never crash the kernel — report via callback if available
        onError?.(err as Error);
      }
    },

    flush(): void {
      // No buffering needed — SQLite handles durability
    },
  };
}

/** Create a DecisionSink that writes decision records to the SQLite decisions table */
export function createSqliteDecisionSink(
  db: Database.Database,
  runId: string,
  onError?: (error: Error) => void
): DecisionSink {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO decisions (record_id, run_id, timestamp, outcome, action_type, target, reason, data, severity)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  return {
    write(record: GovernanceDecisionRecord): void {
      try {
        const severity = record.policy?.severity ?? null;
        stmt.run(
          record.recordId,
          runId,
          record.timestamp,
          record.outcome,
          record.action.type,
          record.action.target,
          record.reason,
          JSON.stringify(record),
          severity
        );
      } catch (err) {
        // Never crash the kernel — report via callback if available
        onError?.(err as Error);
      }
    },

    flush(): void {
      // No buffering needed
    },
  };
}

/** Extract actionType from event payload if present (reference monitor events) */
function extractActionType(event: DomainEvent): string | null {
  const rec = event as unknown as Record<string, unknown>;
  if (typeof rec.actionType === 'string') return rec.actionType;
  return null;
}
