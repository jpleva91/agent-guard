import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/storage/migrations.js';
import { createSqliteEventSink } from '../../src/storage/sqlite-sink.js';
import { aggregateViolationsSqlite, loadAllEventsSqlite } from '../../src/storage/sqlite-analytics.js';
import type { DomainEvent } from '../../src/core/types.js';

function makeEvent(id: string, kind: string, runId: string, extra: Record<string, unknown> = {}): DomainEvent {
  return {
    id,
    kind,
    timestamp: Date.now(),
    fingerprint: `fp_${id}`,
    ...extra,
  } as DomainEvent;
}

describe('SQLite analytics', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  describe('aggregateViolationsSqlite', () => {
    it('returns empty results for an empty database', () => {
      const result = aggregateViolationsSqlite(db);
      expect(result.violations).toHaveLength(0);
      expect(result.sessionCount).toBe(0);
      expect(result.allEvents).toHaveLength(0);
    });

    it('extracts only violation events', () => {
      const sink1 = createSqliteEventSink(db, 'run_1');
      sink1.write(makeEvent('e1', 'ActionRequested', 'run_1'));
      sink1.write(makeEvent('e2', 'PolicyDenied', 'run_1', { reason: 'blocked' }));
      sink1.write(makeEvent('e3', 'ActionAllowed', 'run_1'));
      sink1.write(makeEvent('e4', 'InvariantViolation', 'run_1', { invariantId: 'iv_1' }));

      const result = aggregateViolationsSqlite(db);
      expect(result.violations).toHaveLength(2);
      const kinds = result.violations.map((v) => v.kind).sort();
      expect(kinds).toEqual(['InvariantViolation', 'PolicyDenied']);
    });

    it('counts sessions correctly across multiple runs', () => {
      const sink1 = createSqliteEventSink(db, 'run_1');
      sink1.write(makeEvent('e1', 'PolicyDenied', 'run_1'));
      const sink2 = createSqliteEventSink(db, 'run_2');
      sink2.write(makeEvent('e2', 'ActionDenied', 'run_2'));

      const result = aggregateViolationsSqlite(db);
      expect(result.sessionCount).toBe(2);
      expect(result.violations).toHaveLength(2);
    });

    it('extracts violation metadata fields', () => {
      const sink = createSqliteEventSink(db, 'run_1');
      sink.write(
        makeEvent('e1', 'PolicyDenied', 'run_1', {
          actionType: 'git.push',
          target: 'main',
          reason: 'Protected branch',
          metadata: { extra: true },
        })
      );

      const result = aggregateViolationsSqlite(db);
      expect(result.violations[0].actionType).toBe('git.push');
      expect(result.violations[0].target).toBe('main');
      expect(result.violations[0].reason).toBe('Protected branch');
    });

    it('handles all violation kinds', () => {
      const kinds = [
        'InvariantViolation',
        'PolicyDenied',
        'ActionDenied',
        'BlastRadiusExceeded',
        'MergeGuardFailure',
        'UnauthorizedAction',
      ];
      const sink = createSqliteEventSink(db, 'run_1');
      kinds.forEach((kind, i) => sink.write(makeEvent(`e${i}`, kind, 'run_1')));

      const result = aggregateViolationsSqlite(db);
      expect(result.violations).toHaveLength(6);
    });
  });

  describe('loadAllEventsSqlite', () => {
    it('loads all events across all runs', () => {
      const sink1 = createSqliteEventSink(db, 'run_1');
      sink1.write(makeEvent('e1', 'ActionRequested', 'run_1'));
      const sink2 = createSqliteEventSink(db, 'run_2');
      sink2.write(makeEvent('e2', 'ActionAllowed', 'run_2'));

      const result = loadAllEventsSqlite(db);
      expect(result.events).toHaveLength(2);
      expect(result.sessionCount).toBe(2);
    });
  });
});
