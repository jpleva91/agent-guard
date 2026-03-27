import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  runMigrations,
  agentSummaries,
  teamReport,
  insertSession,
  countEventsByKind,
  countDecisionsByOutcome,
} from '@red-codes/storage';

function insertEvent(
  db: Database.Database,
  overrides: {
    id?: string;
    runId?: string;
    kind?: string;
    timestamp?: number;
    data?: Record<string, unknown>;
  } = {}
): void {
  const id = overrides.id ?? `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const runId = overrides.runId ?? 'run_1';
  const kind = overrides.kind ?? 'ActionRequested';
  const timestamp = overrides.timestamp ?? Date.now();
  const data = overrides.data ?? {};

  db.prepare(
    'INSERT INTO events (id, run_id, kind, timestamp, fingerprint, data) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, runId, kind, timestamp, 'fp_test', JSON.stringify(data));
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
  } = {}
): void {
  const recordId =
    overrides.recordId ?? `dec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const runId = overrides.runId ?? 'run_1';
  const outcome = overrides.outcome ?? 'allowed';
  const actionType = overrides.actionType ?? 'file.write';
  const target = overrides.target ?? 'src/main.ts';
  const reason = overrides.reason ?? 'policy match';
  const timestamp = overrides.timestamp ?? Date.now();

  db.prepare(
    `INSERT INTO decisions (record_id, run_id, timestamp, outcome, action_type, target, reason, data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(recordId, runId, timestamp, outcome, actionType, target, reason, JSON.stringify({}));
}

describe('Team Aggregation Queries', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  describe('agentSummaries', () => {
    it('returns empty array for empty database', () => {
      expect(agentSummaries(db)).toEqual([]);
    });

    it('groups sessions by agent name from RunStarted events', () => {
      const now = Date.now();

      // Agent 1: two sessions
      insertEvent(db, {
        runId: 'run_1',
        kind: 'RunStarted',
        timestamp: now - 3000,
        data: { agentName: 'agent-alpha' },
      });
      insertDecision(db, { runId: 'run_1', outcome: 'allowed', timestamp: now - 2000 });
      insertDecision(db, { runId: 'run_1', outcome: 'allowed', timestamp: now - 1000 });

      insertEvent(db, {
        runId: 'run_2',
        kind: 'RunStarted',
        timestamp: now - 500,
        data: { agentName: 'agent-alpha' },
      });
      insertDecision(db, { runId: 'run_2', outcome: 'denied', timestamp: now - 400 });

      // Agent 2: one session
      insertEvent(db, {
        runId: 'run_3',
        kind: 'RunStarted',
        timestamp: now - 200,
        data: { agentName: 'agent-beta' },
      });
      insertDecision(db, { runId: 'run_3', outcome: 'allowed', timestamp: now - 100 });

      const summaries = agentSummaries(db);

      expect(summaries).toHaveLength(2);

      const alpha = summaries.find((s) => s.agent === 'agent-alpha');
      expect(alpha).toBeDefined();
      expect(alpha!.sessions).toBe(2);
      expect(alpha!.totalActions).toBe(3);
      expect(alpha!.allowed).toBe(2);
      expect(alpha!.denied).toBe(1);

      const beta = summaries.find((s) => s.agent === 'agent-beta');
      expect(beta).toBeDefined();
      expect(beta!.sessions).toBe(1);
      expect(beta!.totalActions).toBe(1);
      expect(beta!.allowed).toBe(1);
      expect(beta!.denied).toBe(0);
    });

    it('falls back to agentId when agentName is absent', () => {
      const now = Date.now();

      insertEvent(db, {
        runId: 'run_1',
        kind: 'RunStarted',
        timestamp: now,
        data: { agentId: 'user-123' },
      });
      insertDecision(db, { runId: 'run_1', outcome: 'allowed', timestamp: now });

      const summaries = agentSummaries(db);
      expect(summaries).toHaveLength(1);
      expect(summaries[0].agent).toBe('user-123');
    });

    it('labels sessions without agent identity as "unknown"', () => {
      const now = Date.now();

      insertEvent(db, {
        runId: 'run_1',
        kind: 'RunStarted',
        timestamp: now,
        data: {},
      });
      insertDecision(db, { runId: 'run_1', outcome: 'allowed', timestamp: now });

      const summaries = agentSummaries(db);
      expect(summaries).toHaveLength(1);
      expect(summaries[0].agent).toBe('unknown');
    });

    it('computes compliance rate correctly', () => {
      const now = Date.now();

      insertEvent(db, {
        runId: 'run_1',
        kind: 'RunStarted',
        timestamp: now,
        data: { agentName: 'test-agent' },
      });
      // 7 allowed, 3 denied = 70% compliance
      for (let i = 0; i < 7; i++) {
        insertDecision(db, { runId: 'run_1', outcome: 'allowed', timestamp: now + i });
      }
      for (let i = 0; i < 3; i++) {
        insertDecision(db, { runId: 'run_1', outcome: 'denied', timestamp: now + 10 + i });
      }

      const summaries = agentSummaries(db);
      expect(summaries[0].complianceRate).toBe(70);
    });

    it('counts violations from InvariantViolation events', () => {
      const now = Date.now();

      insertEvent(db, {
        runId: 'run_1',
        kind: 'RunStarted',
        timestamp: now,
        data: { agentName: 'risky-agent' },
      });
      insertEvent(db, {
        runId: 'run_1',
        kind: 'InvariantViolation',
        timestamp: now + 1,
        data: { invariant: 'no-secret-exposure' },
      });
      insertEvent(db, {
        runId: 'run_1',
        kind: 'InvariantViolation',
        timestamp: now + 2,
        data: { invariant: 'protected-branch' },
      });
      insertDecision(db, { runId: 'run_1', outcome: 'denied', timestamp: now + 3 });

      const summaries = agentSummaries(db);
      expect(summaries[0].violations).toBe(2);
    });

    it('sorts agents by session count descending', () => {
      const now = Date.now();

      insertEvent(db, {
        runId: 'run_1',
        kind: 'RunStarted',
        timestamp: now,
        data: { agentName: 'few-sessions' },
      });
      insertDecision(db, { runId: 'run_1', outcome: 'allowed', timestamp: now });

      insertEvent(db, {
        runId: 'run_2',
        kind: 'RunStarted',
        timestamp: now + 1,
        data: { agentName: 'many-sessions' },
      });
      insertDecision(db, { runId: 'run_2', outcome: 'allowed', timestamp: now + 1 });
      insertEvent(db, {
        runId: 'run_3',
        kind: 'RunStarted',
        timestamp: now + 2,
        data: { agentName: 'many-sessions' },
      });
      insertDecision(db, { runId: 'run_3', outcome: 'allowed', timestamp: now + 2 });

      const summaries = agentSummaries(db);
      expect(summaries[0].agent).toBe('many-sessions');
      expect(summaries[1].agent).toBe('few-sessions');
    });
  });

  describe('teamReport', () => {
    it('returns a complete report structure', () => {
      const now = Date.now();

      insertEvent(db, {
        runId: 'run_1',
        kind: 'RunStarted',
        timestamp: now,
        data: { agentName: 'dev-agent' },
      });
      insertEvent(db, {
        runId: 'run_1',
        kind: 'ActionAllowed',
        timestamp: now + 1,
      });
      insertDecision(db, { runId: 'run_1', outcome: 'allowed', timestamp: now + 1 });

      const report = teamReport(db);

      expect(report.overview).toBeDefined();
      expect(report.overview.totalSessions).toBeGreaterThan(0);
      expect(report.agents).toHaveLength(1);
      expect(report.agents[0].agent).toBe('dev-agent');
      expect(report.topDeniedActions).toBeDefined();
      expect(report.topViolatedInvariants).toBeDefined();
      expect(report.denialTrends).toBeDefined();
    });

    it('returns empty report for empty database', () => {
      const report = teamReport(db);

      expect(report.overview.totalSessions).toBe(0);
      expect(report.overview.totalEvents).toBe(0);
      expect(report.agents).toEqual([]);
    });

    it('aggregates across multiple agents', () => {
      const now = Date.now();

      // Two agents, each with one session
      insertEvent(db, {
        runId: 'run_1',
        kind: 'RunStarted',
        timestamp: now,
        data: { agentName: 'agent-a' },
      });
      insertDecision(db, { runId: 'run_1', outcome: 'allowed', timestamp: now });

      insertEvent(db, {
        runId: 'run_2',
        kind: 'RunStarted',
        timestamp: now + 1,
        data: { agentName: 'agent-b' },
      });
      insertDecision(db, { runId: 'run_2', outcome: 'denied', timestamp: now + 1 });
      insertDecision(db, {
        runId: 'run_2',
        outcome: 'denied',
        actionType: 'git.push',
        reason: 'policy deny',
        timestamp: now + 2,
      });

      const report = teamReport(db);

      expect(report.overview.totalDecisions).toBe(3);
      expect(report.agents).toHaveLength(2);
      expect(report.topDeniedActions.length).toBeGreaterThan(0);
    });

    it('respects time filter', () => {
      const now = Date.now();
      const oneHourAgo = now - 3_600_000;
      const twoHoursAgo = now - 7_200_000;

      insertEvent(db, {
        runId: 'run_old',
        kind: 'RunStarted',
        timestamp: twoHoursAgo,
        data: { agentName: 'old-agent' },
      });
      insertDecision(db, { runId: 'run_old', outcome: 'allowed', timestamp: twoHoursAgo });

      insertEvent(db, {
        runId: 'run_new',
        kind: 'RunStarted',
        timestamp: now,
        data: { agentName: 'new-agent' },
      });
      insertDecision(db, { runId: 'run_new', outcome: 'allowed', timestamp: now });

      const report = teamReport(db, { since: oneHourAgo });

      // Should only include the recent agent
      expect(report.agents).toHaveLength(1);
      expect(report.agents[0].agent).toBe('new-agent');
    });
  });

  describe('agentId filter', () => {
    it('filters agentSummaries to a single agent by sessions.agent_id', () => {
      const now = Date.now();

      // Create sessions with agent_id via insertSession
      insertSession(db, 'run_1', 'guard', { agentId: 'agent-alpha' });
      insertSession(db, 'run_2', 'guard', { agentId: 'agent-beta' });

      // Agent alpha: one session with events
      insertEvent(db, {
        runId: 'run_1',
        kind: 'RunStarted',
        timestamp: now - 2000,
        data: { agentName: 'agent-alpha' },
      });
      insertDecision(db, { runId: 'run_1', outcome: 'allowed', timestamp: now - 1000 });
      insertDecision(db, { runId: 'run_1', outcome: 'denied', timestamp: now - 900 });

      // Agent beta: one session with events
      insertEvent(db, {
        runId: 'run_2',
        kind: 'RunStarted',
        timestamp: now - 500,
        data: { agentName: 'agent-beta' },
      });
      insertDecision(db, { runId: 'run_2', outcome: 'allowed', timestamp: now - 400 });

      // Without filter: both agents
      const all = agentSummaries(db);
      expect(all).toHaveLength(2);

      // With agentId filter: only alpha
      const filtered = agentSummaries(db, { agentId: 'agent-alpha' });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].agent).toBe('agent-alpha');
      expect(filtered[0].totalActions).toBe(2);
      expect(filtered[0].denied).toBe(1);
    });

    it('filters countEventsByKind by agentId', () => {
      const now = Date.now();

      insertSession(db, 'run_1', 'guard', { agentId: 'agent-alpha' });
      insertSession(db, 'run_2', 'guard', { agentId: 'agent-beta' });

      insertEvent(db, {
        runId: 'run_1',
        kind: 'ActionAllowed',
        timestamp: now - 1000,
      });
      insertEvent(db, {
        runId: 'run_1',
        kind: 'ActionDenied',
        timestamp: now - 900,
      });
      insertEvent(db, {
        runId: 'run_2',
        kind: 'ActionAllowed',
        timestamp: now - 500,
      });

      // Without filter: 2 ActionAllowed + 1 ActionDenied
      const all = countEventsByKind(db);
      expect(all.find((r) => r.kind === 'ActionAllowed')?.count).toBe(2);

      // With agentId filter: only run_1 events
      const filtered = countEventsByKind(db, { agentId: 'agent-alpha' });
      expect(filtered.find((r) => r.kind === 'ActionAllowed')?.count).toBe(1);
      expect(filtered.find((r) => r.kind === 'ActionDenied')?.count).toBe(1);
    });

    it('filters countDecisionsByOutcome by agentId', () => {
      const now = Date.now();

      insertSession(db, 'run_1', 'guard', { agentId: 'agent-alpha' });
      insertSession(db, 'run_2', 'guard', { agentId: 'agent-beta' });

      insertDecision(db, { runId: 'run_1', outcome: 'allowed', timestamp: now - 1000 });
      insertDecision(db, { runId: 'run_1', outcome: 'denied', timestamp: now - 900 });
      insertDecision(db, { runId: 'run_2', outcome: 'allowed', timestamp: now - 500 });

      const filtered = countDecisionsByOutcome(db, { agentId: 'agent-beta' });
      expect(filtered).toHaveLength(1);
      expect(filtered[0]).toEqual({ outcome: 'allowed', count: 1 });
    });

    it('filters teamReport by agentId', () => {
      const now = Date.now();

      insertSession(db, 'run_1', 'guard', { agentId: 'agent-alpha' });
      insertSession(db, 'run_2', 'guard', { agentId: 'agent-beta' });

      insertEvent(db, {
        runId: 'run_1',
        kind: 'RunStarted',
        timestamp: now - 2000,
        data: { agentName: 'agent-alpha' },
      });
      insertDecision(db, { runId: 'run_1', outcome: 'allowed', timestamp: now - 1000 });

      insertEvent(db, {
        runId: 'run_2',
        kind: 'RunStarted',
        timestamp: now - 500,
        data: { agentName: 'agent-beta' },
      });
      insertDecision(db, { runId: 'run_2', outcome: 'denied', timestamp: now - 400 });

      const report = teamReport(db, { agentId: 'agent-alpha' });
      expect(report.agents).toHaveLength(1);
      expect(report.agents[0].agent).toBe('agent-alpha');
      expect(report.overview.totalDecisions).toBe(1);
    });

    it('returns empty results for non-existent agentId', () => {
      const now = Date.now();

      insertSession(db, 'run_1', 'guard', { agentId: 'agent-alpha' });
      insertEvent(db, {
        runId: 'run_1',
        kind: 'RunStarted',
        timestamp: now,
        data: { agentName: 'agent-alpha' },
      });
      insertDecision(db, { runId: 'run_1', outcome: 'allowed', timestamp: now });

      const summaries = agentSummaries(db, { agentId: 'nonexistent' });
      expect(summaries).toEqual([]);
    });

    it('agentSummaries prefers sessions.agent_id over event JSON', () => {
      const now = Date.now();

      // Session has agent_id set via insertSession
      insertSession(db, 'run_1', 'guard', { agentId: 'canonical-name' });

      // RunStarted event has a different agentName in JSON
      insertEvent(db, {
        runId: 'run_1',
        kind: 'RunStarted',
        timestamp: now,
        data: { agentName: 'json-name' },
      });
      insertDecision(db, { runId: 'run_1', outcome: 'allowed', timestamp: now });

      const summaries = agentSummaries(db);
      expect(summaries).toHaveLength(1);
      // sessions.agent_id takes precedence via COALESCE
      expect(summaries[0].agent).toBe('canonical-name');
    });
  });
});
