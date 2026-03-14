import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '@red-codes/storage';
import { createSqliteEventSink } from '@red-codes/storage';
import {
  aggregateViolationsSqlite,
  loadAllEventsSqlite,
  queryTopDeniedActions,
  queryViolationRateOverTime,
  querySessionStats,
  aggregateEventCountsSqlite,
  aggregateEventCountsByRunSqlite,
  aggregateRunSummariesSqlite,
  paginateEventsSqlite,
} from '@red-codes/storage';
import { createSqliteDecisionSink } from '@red-codes/storage';
import type { DomainEvent } from '@red-codes/core';
import type { GovernanceDecisionRecord } from '@red-codes/core';

let tsCounter = 1000;

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
    timestamp: timestamp ?? tsCounter++,
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

  describe('aggregateEventCountsSqlite', () => {
    it('returns empty counts for an empty database', () => {
      const result = aggregateEventCountsSqlite(db);
      expect(result.byKind).toEqual({});
      expect(result.total).toBe(0);
      expect(result.sessionCount).toBe(0);
    });

    it('groups event counts by kind', () => {
      const sink = createSqliteEventSink(db, 'run_1');
      sink.write(makeEvent('e1', 'ActionRequested', 'run_1'));
      sink.write(makeEvent('e2', 'ActionRequested', 'run_1'));
      sink.write(makeEvent('e3', 'PolicyDenied', 'run_1'));
      sink.write(makeEvent('e4', 'ActionAllowed', 'run_1'));

      const result = aggregateEventCountsSqlite(db);
      expect(result.byKind).toEqual({
        ActionRequested: 2,
        PolicyDenied: 1,
        ActionAllowed: 1,
      });
      expect(result.total).toBe(4);
      expect(result.sessionCount).toBe(1);
    });

    it('counts sessions across multiple runs', () => {
      const sink1 = createSqliteEventSink(db, 'run_1');
      sink1.write(makeEvent('e1', 'ActionRequested', 'run_1'));
      const sink2 = createSqliteEventSink(db, 'run_2');
      sink2.write(makeEvent('e2', 'ActionRequested', 'run_2'));

      const result = aggregateEventCountsSqlite(db);
      expect(result.sessionCount).toBe(2);
      expect(result.total).toBe(2);
    });
  });

  describe('aggregateEventCountsByRunSqlite', () => {
    it('returns empty for an empty database', () => {
      const result = aggregateEventCountsByRunSqlite(db);
      expect(result.byRun).toEqual({});
      expect(result.total).toBe(0);
      expect(result.sessionCount).toBe(0);
    });

    it('groups event counts by run ID', () => {
      const sink1 = createSqliteEventSink(db, 'run_1');
      sink1.write(makeEvent('e1', 'ActionRequested', 'run_1'));
      sink1.write(makeEvent('e2', 'PolicyDenied', 'run_1'));
      const sink2 = createSqliteEventSink(db, 'run_2');
      sink2.write(makeEvent('e3', 'ActionAllowed', 'run_2'));

      const result = aggregateEventCountsByRunSqlite(db);
      expect(result.byRun).toEqual({ run_1: 2, run_2: 1 });
      expect(result.total).toBe(3);
      expect(result.sessionCount).toBe(2);
    });
  });

  describe('aggregateRunSummariesSqlite', () => {
    it('returns empty for an empty database', () => {
      const result = aggregateRunSummariesSqlite(db);
      expect(result).toHaveLength(0);
    });

    it('computes per-run violation and denial counts', () => {
      const sink1 = createSqliteEventSink(db, 'run_1');
      sink1.write(makeEvent('e1', 'ActionRequested', 'run_1'));
      sink1.write(makeEvent('e2', 'PolicyDenied', 'run_1'));
      sink1.write(makeEvent('e3', 'InvariantViolation', 'run_1'));
      sink1.write(makeEvent('e4', 'ActionExecuted', 'run_1'));

      const summaries = aggregateRunSummariesSqlite(db);
      expect(summaries).toHaveLength(1);
      const s = summaries[0];
      expect(s.runId).toBe('run_1');
      expect(s.totalEvents).toBe(4);
      // PolicyDenied + InvariantViolation are both violations
      expect(s.violationCount).toBe(2);
      // PolicyDenied is a denial
      expect(s.denialCount).toBe(1);
      // ActionExecuted + ActionRequested are actions
      expect(s.actionCount).toBe(2);
    });

    it('handles multiple runs independently', () => {
      const sink1 = createSqliteEventSink(db, 'run_1');
      sink1.write(makeEvent('e1', 'ActionDenied', 'run_1'));
      sink1.write(makeEvent('e2', 'ActionDenied', 'run_1'));
      const sink2 = createSqliteEventSink(db, 'run_2');
      sink2.write(makeEvent('e3', 'ActionAllowed', 'run_2'));

      const summaries = aggregateRunSummariesSqlite(db);
      expect(summaries).toHaveLength(2);

      const run1 = summaries.find((s) => s.runId === 'run_1')!;
      expect(run1.totalEvents).toBe(2);
      expect(run1.violationCount).toBe(2);
      expect(run1.denialCount).toBe(2);
      expect(run1.actionCount).toBe(0);

      const run2 = summaries.find((s) => s.runId === 'run_2')!;
      expect(run2.totalEvents).toBe(1);
      expect(run2.violationCount).toBe(0);
      expect(run2.denialCount).toBe(0);
    });

    it('tracks timestamp ranges per run', () => {
      const sink = createSqliteEventSink(db, 'run_1');
      sink.write(makeEvent('e1', 'ActionRequested', 'run_1'));
      sink.write(makeEvent('e2', 'ActionAllowed', 'run_1'));

      const summaries = aggregateRunSummariesSqlite(db);
      expect(summaries[0].minTimestamp).toBeLessThanOrEqual(summaries[0].maxTimestamp);
    });
  });

  describe('paginateEventsSqlite', () => {
    it('returns empty for an empty database', () => {
      const result = paginateEventsSqlite(db, { limit: 10 });
      expect(result.events).toHaveLength(0);
      expect(result.nextCursor).toBeNull();
      expect(result.totalCount).toBe(0);
    });

    it('returns all events when limit exceeds count', () => {
      const sink = createSqliteEventSink(db, 'run_1');
      sink.write(makeEvent('e1', 'ActionRequested', 'run_1'));
      sink.write(makeEvent('e2', 'ActionAllowed', 'run_1'));

      const result = paginateEventsSqlite(db, { limit: 10 });
      expect(result.events).toHaveLength(2);
      expect(result.nextCursor).toBeNull();
      expect(result.totalCount).toBe(2);
    });

    it('paginates with a cursor', () => {
      const sink = createSqliteEventSink(db, 'run_1');
      sink.write(makeEvent('p1', 'ActionRequested', 'run_1'));
      sink.write(makeEvent('p2', 'ActionAllowed', 'run_1'));
      sink.write(makeEvent('p3', 'ActionExecuted', 'run_1'));

      // First page: limit 1
      const page1 = paginateEventsSqlite(db, { limit: 1 });
      expect(page1.events).toHaveLength(1);
      expect(page1.events[0].id).toBe('p1');
      expect(page1.nextCursor).not.toBeNull();
      expect(page1.totalCount).toBe(3);

      // Second page using cursor
      const page2 = paginateEventsSqlite(db, { limit: 1, cursor: page1.nextCursor! });
      expect(page2.events).toHaveLength(1);
      expect(page2.events[0].id).toBe('p2');
      expect(page2.nextCursor).not.toBeNull();

      // Third page
      const page3 = paginateEventsSqlite(db, { limit: 1, cursor: page2.nextCursor! });
      expect(page3.events).toHaveLength(1);
      expect(page3.events[0].id).toBe('p3');
      expect(page3.nextCursor).toBeNull();
    });

    it('filters by event kind', () => {
      const sink = createSqliteEventSink(db, 'run_1');
      sink.write(makeEvent('f1', 'ActionRequested', 'run_1'));
      sink.write(makeEvent('f2', 'PolicyDenied', 'run_1'));
      sink.write(makeEvent('f3', 'ActionRequested', 'run_1'));

      const result = paginateEventsSqlite(db, { limit: 10, kind: 'PolicyDenied' });
      expect(result.events).toHaveLength(1);
      expect(result.events[0].kind).toBe('PolicyDenied');
      expect(result.totalCount).toBe(1);
    });

    it('combines cursor and kind filter', () => {
      const sink = createSqliteEventSink(db, 'run_1');
      sink.write(makeEvent('c1', 'ActionRequested', 'run_1'));
      sink.write(makeEvent('c2', 'ActionRequested', 'run_1'));
      sink.write(makeEvent('c3', 'PolicyDenied', 'run_1'));
      sink.write(makeEvent('c4', 'ActionRequested', 'run_1'));

      // Get first ActionRequested, then paginate
      const page1 = paginateEventsSqlite(db, { limit: 1, kind: 'ActionRequested' });
      expect(page1.events).toHaveLength(1);
      expect(page1.events[0].id).toBe('c1');
      expect(page1.nextCursor).not.toBeNull();

      const page2 = paginateEventsSqlite(db, {
        limit: 1,
        cursor: page1.nextCursor!,
        kind: 'ActionRequested',
      });
      expect(page2.events).toHaveLength(1);
      expect(page2.events[0].id).toBe('c2');
    });
  });
});
