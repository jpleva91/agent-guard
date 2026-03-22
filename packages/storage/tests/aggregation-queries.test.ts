import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '@red-codes/storage';
import { createSqliteEventStore } from '@red-codes/storage';
import {
  countEventsByKind,
  countDecisionsByOutcome,
  topDeniedActions,
  summarizeRuns,
  countViolationsByInvariant,
  eventTimeSeries,
  governanceStats,
  denialPatterns,
  statsByAgent,
  timeRollup,
  teamViolationPatterns,
} from '@red-codes/storage';
import type { DomainEvent } from '@red-codes/core';

function makeEvent(overrides: Partial<DomainEvent> & Record<string, unknown> = {}): DomainEvent {
  return {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    kind: 'ActionRequested',
    timestamp: Date.now(),
    fingerprint: 'fp_test',
    ...overrides,
  } as DomainEvent;
}

function insertDecision(
  db: Database.Database,
  overrides: {
    recordId?: string;
    runId?: string;
    outcome?: string;
    actionType?: string;
    target?: string;
    reason?: string;
    timestamp?: number;
    severity?: number;
  } = {}
): void {
  const record = {
    recordId: overrides.recordId ?? `dec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    runId: overrides.runId ?? 'run_1',
    outcome: overrides.outcome ?? 'allowed',
    actionType: overrides.actionType ?? 'file.write',
    target: overrides.target ?? 'src/main.ts',
    reason: overrides.reason ?? 'policy match',
    timestamp: overrides.timestamp ?? Date.now(),
    severity: overrides.severity ?? null,
  };

  db.prepare(
    `INSERT INTO decisions (record_id, run_id, timestamp, outcome, action_type, target, reason, data, severity)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    record.recordId,
    record.runId,
    record.timestamp,
    record.outcome,
    record.actionType,
    record.target,
    record.reason,
    JSON.stringify(record),
    record.severity
  );
}

describe('Aggregation Queries', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  describe('countEventsByKind', () => {
    it('returns empty array for empty database', () => {
      expect(countEventsByKind(db)).toEqual([]);
    });

    it('counts events grouped by kind', () => {
      const store = createSqliteEventStore(db, 'run_1');
      store.append(makeEvent({ id: 'e1', kind: 'ActionRequested' }));
      store.append(makeEvent({ id: 'e2', kind: 'ActionRequested' }));
      store.append(makeEvent({ id: 'e3', kind: 'ActionDenied' }));
      store.append(makeEvent({ id: 'e4', kind: 'ActionAllowed' }));

      const result = countEventsByKind(db);
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ kind: 'ActionRequested', count: 2 });
      expect(result.find((r) => r.kind === 'ActionDenied')?.count).toBe(1);
    });

    it('filters by time range', () => {
      const store = createSqliteEventStore(db, 'run_1');
      store.append(makeEvent({ id: 'e1', kind: 'ActionRequested', timestamp: 100 }));
      store.append(makeEvent({ id: 'e2', kind: 'ActionRequested', timestamp: 200 }));
      store.append(makeEvent({ id: 'e3', kind: 'ActionRequested', timestamp: 300 }));

      const result = countEventsByKind(db, { since: 150, until: 250 });
      expect(result).toHaveLength(1);
      expect(result[0].count).toBe(1);
    });

    it('filters by session limit', () => {
      const s1 = createSqliteEventStore(db, 'run_old');
      s1.append(makeEvent({ id: 'e1', kind: 'ActionRequested', timestamp: 100 }));
      s1.append(makeEvent({ id: 'e2', kind: 'ActionRequested', timestamp: 101 }));

      const s2 = createSqliteEventStore(db, 'run_new');
      s2.append(makeEvent({ id: 'e3', kind: 'ActionDenied', timestamp: 200 }));

      // Only the most recent session
      const result = countEventsByKind(db, { sessionLimit: 1 });
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ kind: 'ActionDenied', count: 1 });
    });
  });

  describe('countDecisionsByOutcome', () => {
    it('returns empty array for empty database', () => {
      expect(countDecisionsByOutcome(db)).toEqual([]);
    });

    it('counts decisions grouped by outcome', () => {
      insertDecision(db, { recordId: 'd1', outcome: 'allowed' });
      insertDecision(db, { recordId: 'd2', outcome: 'allowed' });
      insertDecision(db, { recordId: 'd3', outcome: 'denied' });

      const result = countDecisionsByOutcome(db);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ outcome: 'allowed', count: 2 });
      expect(result[1]).toEqual({ outcome: 'denied', count: 1 });
    });

    it('filters by time range', () => {
      insertDecision(db, { recordId: 'd1', outcome: 'allowed', timestamp: 100 });
      insertDecision(db, { recordId: 'd2', outcome: 'denied', timestamp: 200 });
      insertDecision(db, { recordId: 'd3', outcome: 'allowed', timestamp: 300 });

      const result = countDecisionsByOutcome(db, { since: 150, until: 250 });
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ outcome: 'denied', count: 1 });
    });
  });

  describe('topDeniedActions', () => {
    it('returns empty array when no denials', () => {
      insertDecision(db, { recordId: 'd1', outcome: 'allowed' });
      expect(topDeniedActions(db)).toEqual([]);
    });

    it('ranks denied actions by count', () => {
      insertDecision(db, { recordId: 'd1', outcome: 'denied', actionType: 'git.push', runId: 'r1' });
      insertDecision(db, { recordId: 'd2', outcome: 'denied', actionType: 'git.push', runId: 'r2' });
      insertDecision(db, { recordId: 'd3', outcome: 'denied', actionType: 'git.push', runId: 'r2' });
      insertDecision(db, { recordId: 'd4', outcome: 'denied', actionType: 'file.delete', runId: 'r1' });

      const result = topDeniedActions(db);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ actionType: 'git.push', count: 3, distinctSessions: 2 });
      expect(result[1]).toEqual({ actionType: 'file.delete', count: 1, distinctSessions: 1 });
    });

    it('respects limit parameter', () => {
      insertDecision(db, { recordId: 'd1', outcome: 'denied', actionType: 'git.push' });
      insertDecision(db, { recordId: 'd2', outcome: 'denied', actionType: 'file.delete' });
      insertDecision(db, { recordId: 'd3', outcome: 'denied', actionType: 'shell.exec' });

      const result = topDeniedActions(db, 2);
      expect(result).toHaveLength(2);
    });
  });

  describe('summarizeRuns', () => {
    it('returns empty array for empty database', () => {
      expect(summarizeRuns(db)).toEqual([]);
    });

    it('summarizes per-run event counts', () => {
      const s1 = createSqliteEventStore(db, 'run_1');
      s1.append(makeEvent({ id: 'e1', kind: 'ActionAllowed', timestamp: 100 }));
      s1.append(makeEvent({ id: 'e2', kind: 'ActionAllowed', timestamp: 200 }));
      s1.append(makeEvent({ id: 'e3', kind: 'ActionDenied', timestamp: 300 }));

      const s2 = createSqliteEventStore(db, 'run_2');
      s2.append(makeEvent({ id: 'e4', kind: 'ActionDenied', timestamp: 400 }));
      s2.append(makeEvent({ id: 'e5', kind: 'InvariantViolation', timestamp: 500 }));

      const result = summarizeRuns(db);
      expect(result).toHaveLength(2);

      // Most recent first
      const run2 = result[0];
      expect(run2.runId).toBe('run_2');
      expect(run2.totalEvents).toBe(2);
      expect(run2.denied).toBe(1);
      expect(run2.violations).toBe(1);

      const run1 = result[1];
      expect(run1.runId).toBe('run_1');
      expect(run1.totalEvents).toBe(3);
      expect(run1.allowed).toBe(2);
      expect(run1.denied).toBe(1);
      expect(run1.firstEventAt).toBe(100);
      expect(run1.lastEventAt).toBe(300);
    });
  });

  describe('countViolationsByInvariant', () => {
    it('returns empty array when no violations', () => {
      const store = createSqliteEventStore(db, 'run_1');
      store.append(makeEvent({ id: 'e1', kind: 'ActionAllowed' }));
      expect(countViolationsByInvariant(db)).toEqual([]);
    });

    it('groups violations by invariant name from JSON data', () => {
      const store = createSqliteEventStore(db, 'run_1');
      store.append(
        makeEvent({
          id: 'v1',
          kind: 'InvariantViolation',
          invariant: 'no-force-push',
          timestamp: 100,
        })
      );
      store.append(
        makeEvent({
          id: 'v2',
          kind: 'InvariantViolation',
          invariant: 'no-force-push',
          timestamp: 200,
        })
      );
      store.append(
        makeEvent({
          id: 'v3',
          kind: 'InvariantViolation',
          invariant: 'secret-exposure',
          timestamp: 300,
        })
      );

      const result = countViolationsByInvariant(db);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        invariant: 'no-force-push',
        count: 2,
        distinctSessions: 1,
      });
      expect(result[1]).toEqual({
        invariant: 'secret-exposure',
        count: 1,
        distinctSessions: 1,
      });
    });

    it('falls back to invariantId field', () => {
      const store = createSqliteEventStore(db, 'run_1');
      store.append(
        makeEvent({
          id: 'v1',
          kind: 'InvariantViolation',
          invariantId: 'blast-radius-check',
          timestamp: 100,
        })
      );

      const result = countViolationsByInvariant(db);
      expect(result).toHaveLength(1);
      expect(result[0].invariant).toBe('blast-radius-check');
    });
  });

  describe('eventTimeSeries', () => {
    it('returns empty array for empty database', () => {
      expect(eventTimeSeries(db)).toEqual([]);
    });

    it('buckets events by time interval', () => {
      const store = createSqliteEventStore(db, 'run_1');
      // Three events in the 0-99 bucket, one in the 100-199 bucket (bucket size 100)
      store.append(makeEvent({ id: 'e1', timestamp: 10 }));
      store.append(makeEvent({ id: 'e2', timestamp: 50 }));
      store.append(makeEvent({ id: 'e3', timestamp: 90 }));
      store.append(makeEvent({ id: 'e4', timestamp: 150 }));

      const result = eventTimeSeries(db, 100);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ bucketStart: 0, count: 3 });
      expect(result[1]).toEqual({ bucketStart: 100, count: 1 });
    });
  });

  describe('governanceStats', () => {
    it('returns zeros for empty database', () => {
      const stats = governanceStats(db);
      expect(stats.totalSessions).toBe(0);
      expect(stats.totalEvents).toBe(0);
      expect(stats.totalDecisions).toBe(0);
      expect(stats.allowedCount).toBe(0);
      expect(stats.deniedCount).toBe(0);
      expect(stats.escalatedCount).toBe(0);
      expect(stats.firstEventAt).toBeNull();
      expect(stats.lastEventAt).toBeNull();
    });

    it('computes overall statistics', () => {
      const s1 = createSqliteEventStore(db, 'run_1');
      s1.append(makeEvent({ id: 'e1', kind: 'ActionRequested', timestamp: 100 }));
      s1.append(makeEvent({ id: 'e2', kind: 'ActionAllowed', timestamp: 200 }));

      const s2 = createSqliteEventStore(db, 'run_2');
      s2.append(makeEvent({ id: 'e3', kind: 'ActionDenied', timestamp: 300 }));

      insertDecision(db, { recordId: 'd1', outcome: 'allowed', timestamp: 200 });
      insertDecision(db, { recordId: 'd2', outcome: 'denied', timestamp: 300 });
      insertDecision(db, { recordId: 'd3', outcome: 'escalated', timestamp: 350 });

      const stats = governanceStats(db);
      expect(stats.totalSessions).toBe(2);
      expect(stats.totalEvents).toBe(3);
      expect(stats.totalDecisions).toBe(3);
      expect(stats.allowedCount).toBe(1);
      expect(stats.deniedCount).toBe(1);
      expect(stats.escalatedCount).toBe(1);
      expect(stats.firstEventAt).toBe(100);
      expect(stats.lastEventAt).toBe(300);
    });

    it('respects time filter', () => {
      const store = createSqliteEventStore(db, 'run_1');
      store.append(makeEvent({ id: 'e1', kind: 'ActionRequested', timestamp: 100 }));
      store.append(makeEvent({ id: 'e2', kind: 'ActionAllowed', timestamp: 200 }));
      store.append(makeEvent({ id: 'e3', kind: 'ActionDenied', timestamp: 300 }));

      const stats = governanceStats(db, { since: 150, until: 250 });
      expect(stats.totalEvents).toBe(1);
    });
  });

  describe('denialPatterns', () => {
    it('returns empty array when no denials', () => {
      expect(denialPatterns(db)).toEqual([]);
    });

    it('groups denials by action_type and reason', () => {
      insertDecision(db, {
        recordId: 'd1',
        outcome: 'denied',
        actionType: 'git.push',
        reason: 'protected branch',
        runId: 'r1',
      });
      insertDecision(db, {
        recordId: 'd2',
        outcome: 'denied',
        actionType: 'git.push',
        reason: 'protected branch',
        runId: 'r2',
      });
      insertDecision(db, {
        recordId: 'd3',
        outcome: 'denied',
        actionType: 'git.push',
        reason: 'no tests',
        runId: 'r1',
      });
      insertDecision(db, {
        recordId: 'd4',
        outcome: 'denied',
        actionType: 'file.delete',
        reason: 'read-only',
        runId: 'r1',
      });

      const result = denialPatterns(db);
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        actionType: 'git.push',
        reason: 'protected branch',
        occurrences: 2,
        distinctSessions: 2,
      });
    });

    it('respects limit parameter', () => {
      insertDecision(db, { recordId: 'd1', outcome: 'denied', actionType: 'a', reason: 'r1' });
      insertDecision(db, { recordId: 'd2', outcome: 'denied', actionType: 'b', reason: 'r2' });
      insertDecision(db, { recordId: 'd3', outcome: 'denied', actionType: 'c', reason: 'r3' });

      const result = denialPatterns(db, 2);
      expect(result).toHaveLength(2);
    });
  });

  // ─── Team Observability Queries ────────────────────────────────────────────

  describe('statsByAgent', () => {
    it('returns empty array for empty database', () => {
      expect(statsByAgent(db)).toEqual([]);
    });

    it('groups decisions by agent identity', () => {
      // Insert decisions with agent field in the JSON data
      db.prepare(
        `INSERT INTO decisions (record_id, run_id, timestamp, outcome, action_type, target, reason, data, severity)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run('d1', 'r1', 100, 'allowed', 'file.write', 'a.ts', 'ok', JSON.stringify({ action: { agent: 'alice' } }), null);
      db.prepare(
        `INSERT INTO decisions (record_id, run_id, timestamp, outcome, action_type, target, reason, data, severity)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run('d2', 'r1', 200, 'denied', 'git.push', 'main', 'protected', JSON.stringify({ action: { agent: 'alice' } }), null);
      db.prepare(
        `INSERT INTO decisions (record_id, run_id, timestamp, outcome, action_type, target, reason, data, severity)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run('d3', 'r2', 300, 'allowed', 'file.read', 'b.ts', 'ok', JSON.stringify({ action: { agent: 'bob' } }), null);

      const result = statsByAgent(db);
      expect(result).toHaveLength(2);

      const alice = result.find((a) => a.agent === 'alice');
      expect(alice).toBeDefined();
      expect(alice!.totalDecisions).toBe(2);
      expect(alice!.allowed).toBe(1);
      expect(alice!.denied).toBe(1);
      expect(alice!.distinctSessions).toBe(1);

      const bob = result.find((a) => a.agent === 'bob');
      expect(bob).toBeDefined();
      expect(bob!.totalDecisions).toBe(1);
      expect(bob!.allowed).toBe(1);
    });

    it('uses "unknown" for decisions without agent field', () => {
      insertDecision(db, { recordId: 'd1', outcome: 'allowed' });

      const result = statsByAgent(db);
      expect(result).toHaveLength(1);
      expect(result[0].agent).toBe('unknown');
    });

    it('filters by time range', () => {
      db.prepare(
        `INSERT INTO decisions (record_id, run_id, timestamp, outcome, action_type, target, reason, data, severity)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run('d1', 'r1', 100, 'allowed', 'file.write', 'a.ts', 'ok', JSON.stringify({ action: { agent: 'alice' } }), null);
      db.prepare(
        `INSERT INTO decisions (record_id, run_id, timestamp, outcome, action_type, target, reason, data, severity)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run('d2', 'r1', 500, 'denied', 'git.push', 'main', 'no', JSON.stringify({ action: { agent: 'alice' } }), null);

      const result = statsByAgent(db, { since: 200 });
      expect(result).toHaveLength(1);
      expect(result[0].totalDecisions).toBe(1);
      expect(result[0].denied).toBe(1);
    });
  });

  describe('timeRollup', () => {
    it('returns empty array for empty database', () => {
      expect(timeRollup(db, 'daily')).toEqual([]);
    });

    it('buckets events by day', () => {
      const store = createSqliteEventStore(db, 'run_1');
      // 2024-01-01 00:00 UTC
      const day1 = new Date('2024-01-01T10:00:00Z').getTime();
      // 2024-01-02 00:00 UTC
      const day2 = new Date('2024-01-02T15:00:00Z').getTime();

      store.append(makeEvent({ id: 'e1', kind: 'ActionAllowed', timestamp: day1 }));
      store.append(makeEvent({ id: 'e2', kind: 'ActionDenied', timestamp: day1 + 1000 }));
      store.append(makeEvent({ id: 'e3', kind: 'ActionAllowed', timestamp: day2 }));

      const result = timeRollup(db, 'daily');
      expect(result).toHaveLength(2);
      expect(result[0].period).toBe('2024-01-01');
      expect(result[0].totalEvents).toBe(2);
      expect(result[1].period).toBe('2024-01-02');
      expect(result[1].totalEvents).toBe(1);
    });

    it('merges event and decision data per period', () => {
      const store = createSqliteEventStore(db, 'run_1');
      const ts = new Date('2024-01-15T12:00:00Z').getTime();

      store.append(makeEvent({ id: 'e1', kind: 'ActionAllowed', timestamp: ts }));
      insertDecision(db, { recordId: 'd1', outcome: 'allowed', timestamp: ts, runId: 'run_1' });
      insertDecision(db, { recordId: 'd2', outcome: 'denied', timestamp: ts + 1000, runId: 'run_1' });

      const result = timeRollup(db, 'daily');
      expect(result).toHaveLength(1);
      expect(result[0].totalEvents).toBe(1);
      expect(result[0].totalDecisions).toBe(2);
      expect(result[0].allowed).toBe(1);
      expect(result[0].denied).toBe(1);
    });

    it('supports monthly granularity', () => {
      const store = createSqliteEventStore(db, 'run_1');
      const jan = new Date('2024-01-15T12:00:00Z').getTime();
      const feb = new Date('2024-02-10T12:00:00Z').getTime();

      store.append(makeEvent({ id: 'e1', timestamp: jan }));
      store.append(makeEvent({ id: 'e2', timestamp: jan + 86400000 }));
      store.append(makeEvent({ id: 'e3', timestamp: feb }));

      const result = timeRollup(db, 'monthly');
      expect(result).toHaveLength(2);
      expect(result[0].period).toBe('2024-01');
      expect(result[0].totalEvents).toBe(2);
      expect(result[1].period).toBe('2024-02');
      expect(result[1].totalEvents).toBe(1);
    });
  });

  describe('teamViolationPatterns', () => {
    it('returns empty array when no violations', () => {
      const store = createSqliteEventStore(db, 'run_1');
      store.append(makeEvent({ id: 'e1', kind: 'ActionAllowed' }));
      expect(teamViolationPatterns(db)).toEqual([]);
    });

    it('groups violations with agent count', () => {
      const store = createSqliteEventStore(db, 'run_1');
      store.append(
        makeEvent({
          id: 'v1',
          kind: 'InvariantViolation',
          invariant: 'no-force-push',
          agent: 'alice',
          timestamp: 100,
        })
      );
      store.append(
        makeEvent({
          id: 'v2',
          kind: 'InvariantViolation',
          invariant: 'no-force-push',
          agent: 'bob',
          timestamp: 200,
        })
      );

      const s2 = createSqliteEventStore(db, 'run_2');
      s2.append(
        makeEvent({
          id: 'v3',
          kind: 'InvariantViolation',
          invariant: 'no-force-push',
          agent: 'alice',
          timestamp: 300,
        })
      );

      const result = teamViolationPatterns(db);
      expect(result).toHaveLength(1);
      expect(result[0].invariant).toBe('no-force-push');
      expect(result[0].count).toBe(3);
      expect(result[0].distinctAgents).toBe(2);
      expect(result[0].distinctSessions).toBe(2);
    });
  });
});
