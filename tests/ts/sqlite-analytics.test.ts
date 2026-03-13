import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/storage/migrations.js';
import { createSqliteEventSink } from '../../src/storage/sqlite-sink.js';
import {
  aggregateViolationsSqlite,
  loadAllEventsSqlite,
  queryTopDeniedActions,
  queryViolationRateOverTime,
  querySessionStats,
} from '../../src/storage/sqlite-analytics.js';
import { createSqliteDecisionSink } from '../../src/storage/sqlite-sink.js';
import type { DomainEvent } from '../../src/core/types.js';
import type { GovernanceDecisionRecord } from '../../src/kernel/decisions/types.js';

function makeEvent(
  id: string,
  kind: string,
  runId: string,
  extra: Record<string, unknown> = {},
  timestamp?: number
): DomainEvent {
  return {
    id,
    kind,
    timestamp: timestamp ?? Date.now(),
    fingerprint: `fp_${id}`,
    ...extra,
  } as DomainEvent;
}

function makeDecision(
  recordId: string,
  _runId: string,
  outcome: 'allow' | 'deny',
  actionType: string,
  target: string,
  reason: string = ''
): GovernanceDecisionRecord {
  return {
    recordId,
    timestamp: Date.now(),
    outcome,
    action: { type: actionType, target },
    reason,
  } as unknown as GovernanceDecisionRecord;
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

  describe('queryTopDeniedActions', () => {
    it('returns empty array when no denials exist', () => {
      const result = queryTopDeniedActions(db);
      expect(result).toHaveLength(0);
    });

    it('returns denied actions grouped by action_type, ordered by count', () => {
      const sink = createSqliteDecisionSink(db, 'run_1');
      sink.write(makeDecision('d1', 'run_1', 'deny', 'git.push', 'main', 'blocked'));
      sink.write(makeDecision('d2', 'run_1', 'deny', 'git.push', 'main', 'blocked'));
      sink.write(makeDecision('d3', 'run_1', 'deny', 'file.delete', '/src/core', 'protected'));
      sink.write(makeDecision('d4', 'run_1', 'allow', 'file.read', '/src/core', ''));

      const result = queryTopDeniedActions(db);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ actionType: 'git.push', count: 2 });
      expect(result[1]).toEqual({ actionType: 'file.delete', count: 1 });
    });

    it('respects the limit parameter', () => {
      const sink = createSqliteDecisionSink(db, 'run_1');
      sink.write(makeDecision('d1', 'run_1', 'deny', 'git.push', 'main', 'a'));
      sink.write(makeDecision('d2', 'run_1', 'deny', 'git.push', 'main', 'b'));
      sink.write(makeDecision('d3', 'run_1', 'deny', 'file.delete', '/x', 'c'));
      sink.write(makeDecision('d4', 'run_1', 'deny', 'shell.exec', 'rm', 'd'));

      const result = queryTopDeniedActions(db, 2);
      expect(result).toHaveLength(2);
      expect(result[0].actionType).toBe('git.push');
    });
  });

  describe('queryViolationRateOverTime', () => {
    it('returns empty array when no violations exist', () => {
      const result = queryViolationRateOverTime(db);
      expect(result).toHaveLength(0);
    });

    it('groups violations by daily bucket', () => {
      const sink = createSqliteEventSink(db, 'run_1');
      const day1 = new Date('2026-03-10T10:00:00Z').getTime();
      const day1b = new Date('2026-03-10T14:00:00Z').getTime();
      const day2 = new Date('2026-03-11T09:00:00Z').getTime();

      sink.write(makeEvent('e1', 'PolicyDenied', 'run_1', {}, day1));
      sink.write(makeEvent('e2', 'InvariantViolation', 'run_1', {}, day1b));
      sink.write(makeEvent('e3', 'ActionDenied', 'run_1', {}, day2));

      const result = queryViolationRateOverTime(db, 'daily');
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ bucket: '2026-03-10', count: 2 });
      expect(result[1]).toEqual({ bucket: '2026-03-11', count: 1 });
    });

    it('groups violations by hourly bucket', () => {
      const sink = createSqliteEventSink(db, 'run_1');
      const hour1 = new Date('2026-03-10T10:15:00Z').getTime();
      const hour1b = new Date('2026-03-10T10:45:00Z').getTime();
      const hour2 = new Date('2026-03-10T11:30:00Z').getTime();

      sink.write(makeEvent('e1', 'PolicyDenied', 'run_1', {}, hour1));
      sink.write(makeEvent('e2', 'ActionDenied', 'run_1', {}, hour1b));
      sink.write(makeEvent('e3', 'BlastRadiusExceeded', 'run_1', {}, hour2));

      const result = queryViolationRateOverTime(db, 'hourly');
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ bucket: '2026-03-10T10:00:00Z', count: 2 });
      expect(result[1]).toEqual({ bucket: '2026-03-10T11:00:00Z', count: 1 });
    });

    it('excludes non-violation events', () => {
      const sink = createSqliteEventSink(db, 'run_1');
      const ts = new Date('2026-03-10T10:00:00Z').getTime();
      sink.write(makeEvent('e1', 'ActionRequested', 'run_1', {}, ts));
      sink.write(makeEvent('e2', 'ActionAllowed', 'run_1', {}, ts));
      sink.write(makeEvent('e3', 'PolicyDenied', 'run_1', {}, ts));

      const result = queryViolationRateOverTime(db, 'daily');
      expect(result).toHaveLength(1);
      expect(result[0].count).toBe(1);
    });
  });

  describe('querySessionStats', () => {
    it('returns empty array when no sessions exist', () => {
      const result = querySessionStats(db);
      expect(result).toHaveLength(0);
    });

    it('computes session duration, action count, and denial count', () => {
      const eventSink = createSqliteEventSink(db, 'run_1');
      const t0 = 1000000;
      const t1 = 1005000;
      eventSink.write(makeEvent('e1', 'ActionRequested', 'run_1', {}, t0));
      eventSink.write(makeEvent('e2', 'ActionAllowed', 'run_1', {}, t0 + 1000));
      eventSink.write(makeEvent('e3', 'ActionExecuted', 'run_1', {}, t1));

      const decisionSink = createSqliteDecisionSink(db, 'run_1');
      decisionSink.write(makeDecision('d1', 'run_1', 'deny', 'git.push', 'main', 'blocked'));

      const result = querySessionStats(db);
      expect(result).toHaveLength(1);
      expect(result[0].sessionId).toBe('run_1');
      expect(result[0].startedAt).toBe(t0);
      expect(result[0].endedAt).toBe(t1);
      expect(result[0].durationMs).toBe(5000);
      expect(result[0].actionCount).toBe(3);
      expect(result[0].denialCount).toBe(1);
    });

    it('handles multiple sessions ordered by start time descending', () => {
      const sink1 = createSqliteEventSink(db, 'run_older');
      sink1.write(makeEvent('e1', 'ActionRequested', 'run_older', {}, 1000));
      sink1.write(makeEvent('e2', 'ActionAllowed', 'run_older', {}, 2000));

      const sink2 = createSqliteEventSink(db, 'run_newer');
      sink2.write(makeEvent('e3', 'ActionRequested', 'run_newer', {}, 5000));
      sink2.write(makeEvent('e4', 'ActionAllowed', 'run_newer', {}, 8000));
      sink2.write(makeEvent('e5', 'ActionExecuted', 'run_newer', {}, 9000));

      const result = querySessionStats(db);
      expect(result).toHaveLength(2);
      expect(result[0].sessionId).toBe('run_newer');
      expect(result[0].actionCount).toBe(3);
      expect(result[1].sessionId).toBe('run_older');
      expect(result[1].actionCount).toBe(2);
    });

    it('reports zero denials when no decisions exist for a session', () => {
      const sink = createSqliteEventSink(db, 'run_1');
      sink.write(makeEvent('e1', 'ActionRequested', 'run_1', {}, 1000));

      const result = querySessionStats(db);
      expect(result[0].denialCount).toBe(0);
    });
  });
});
