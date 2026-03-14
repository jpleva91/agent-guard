import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '@red-codes/storage';
import { loadRunDecisions, loadRunEvents, listRunIds } from '@red-codes/storage';
import { createSqliteEventSink, createSqliteDecisionSink } from '@red-codes/storage';
import type { DomainEvent } from '@red-codes/core';
import type { GovernanceDecisionRecord } from '@red-codes/core';

function makeEvent(id: string, kind = 'ActionRequested', runId = 'run_1'): DomainEvent {
  return {
    id,
    kind,
    timestamp: Date.now(),
    fingerprint: 'fp_test',
    runId,
  } as DomainEvent;
}

function makeDecision(recordId: string, runId = 'run_1'): GovernanceDecisionRecord {
  return {
    recordId,
    runId,
    timestamp: Date.now(),
    action: { type: 'shell.exec', target: '/bin/ls', agent: 'claude', destructive: false },
    outcome: 'allow',
    reason: 'Policy allows shell.exec',
    intervention: null,
    policy: { matchedPolicyId: 'p1', matchedPolicyName: 'default', severity: 0 },
    invariants: { allHold: true, violations: [] },
    simulation: null,
    evidencePackId: null,
    monitor: { escalationLevel: 0, totalEvaluations: 1, totalDenials: 0 },
    execution: { executed: true, success: true, durationMs: 10, error: null },
  } as unknown as GovernanceDecisionRecord;
}

describe('loadRunDecisions', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  it('returns empty array for unknown run', () => {
    const decisions = loadRunDecisions(db, 'nonexistent');
    expect(decisions).toEqual([]);
  });

  it('loads decisions for a specific run', () => {
    const sink = createSqliteDecisionSink(db, 'run_1');
    sink.write(makeDecision('dec_1'));
    sink.write(makeDecision('dec_2'));

    const decisions = loadRunDecisions(db, 'run_1');
    expect(decisions).toHaveLength(2);
    expect(decisions[0].recordId).toBe('dec_1');
    expect(decisions[1].recordId).toBe('dec_2');
  });

  it('does not return decisions from other runs', () => {
    const sink1 = createSqliteDecisionSink(db, 'run_1');
    const sink2 = createSqliteDecisionSink(db, 'run_2');
    sink1.write(makeDecision('dec_1', 'run_1'));
    sink2.write(makeDecision('dec_2', 'run_2'));

    const decisions = loadRunDecisions(db, 'run_1');
    expect(decisions).toHaveLength(1);
    expect(decisions[0].recordId).toBe('dec_1');
  });

  it('returns decisions ordered by timestamp', () => {
    const sink = createSqliteDecisionSink(db, 'run_1');
    const dec1 = makeDecision('dec_early', 'run_1');
    dec1.timestamp = 1000;
    const dec2 = makeDecision('dec_late', 'run_1');
    dec2.timestamp = 2000;

    // Write in reverse order
    sink.write(dec2);
    sink.write(dec1);

    const decisions = loadRunDecisions(db, 'run_1');
    expect(decisions).toHaveLength(2);
    expect(decisions[0].recordId).toBe('dec_early');
    expect(decisions[1].recordId).toBe('dec_late');
  });
});

describe('SQLite-backed inspect/export data loading', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  it('loads events and decisions together for a run', () => {
    const eventSink = createSqliteEventSink(db, 'run_test');
    const decisionSink = createSqliteDecisionSink(db, 'run_test');

    eventSink.write(makeEvent('e1', 'ActionRequested', 'run_test'));
    eventSink.write(makeEvent('e2', 'ActionAllowed', 'run_test'));
    eventSink.write(makeEvent('e3', 'ActionExecuted', 'run_test'));
    decisionSink.write(makeDecision('d1', 'run_test'));

    const events = loadRunEvents(db, 'run_test');
    const decisions = loadRunDecisions(db, 'run_test');

    expect(events).toHaveLength(3);
    expect(decisions).toHaveLength(1);
    expect(events[0].kind).toBe('ActionRequested');
    expect(decisions[0].outcome).toBe('allow');
  });

  it('listRunIds includes runs with events', () => {
    const sink1 = createSqliteEventSink(db, 'run_a');
    const sink2 = createSqliteEventSink(db, 'run_b');

    const ev1 = makeEvent('e1', 'ActionRequested', 'run_a');
    ev1.timestamp = 1000;
    const ev2 = makeEvent('e2', 'ActionRequested', 'run_b');
    ev2.timestamp = 2000;

    sink1.write(ev1);
    sink2.write(ev2);

    const runs = listRunIds(db);
    expect(runs).toHaveLength(2);
    // Most recent first
    expect(runs[0]).toBe('run_b');
    expect(runs[1]).toBe('run_a');
  });
});

describe('SQLite-backed import round-trip', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  it('events written via sink can be read back', () => {
    const eventSink = createSqliteEventSink(db, 'imported_run');
    const decisionSink = createSqliteDecisionSink(db, 'imported_run');

    const event = makeEvent('imp_e1', 'ActionRequested', 'imported_run');
    const decision = makeDecision('imp_d1', 'imported_run');

    eventSink.write(event);
    decisionSink.write(decision);

    const events = loadRunEvents(db, 'imported_run');
    const decisions = loadRunDecisions(db, 'imported_run');

    expect(events).toHaveLength(1);
    expect(events[0].id).toBe('imp_e1');
    expect(decisions).toHaveLength(1);
    expect(decisions[0].recordId).toBe('imp_d1');
  });
});
