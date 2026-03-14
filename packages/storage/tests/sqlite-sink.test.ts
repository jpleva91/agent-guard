import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '@red-codes/storage';
import { createSqliteEventSink, createSqliteDecisionSink } from '@red-codes/storage';
import type { DomainEvent } from '@red-codes/core';
import type { GovernanceDecisionRecord } from '@red-codes/core';

function makeEvent(id: string): DomainEvent {
  return {
    id,
    kind: 'ActionRequested',
    timestamp: Date.now(),
    fingerprint: 'fp_test',
  } as DomainEvent;
}

function makeDecision(recordId: string): GovernanceDecisionRecord {
  return {
    recordId,
    runId: 'run_1',
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

describe('SQLite EventSink', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  it('writes events to the database', () => {
    const sink = createSqliteEventSink(db, 'run_1');
    sink.write(makeEvent('e1'));
    sink.write(makeEvent('e2'));

    const count = (db.prepare('SELECT COUNT(*) as c FROM events').get() as { c: number }).c;
    expect(count).toBe(2);
  });

  it('tags events with the run_id', () => {
    const sink = createSqliteEventSink(db, 'run_abc');
    sink.write(makeEvent('e1'));

    const row = db.prepare('SELECT run_id FROM events WHERE id = ?').get('e1') as {
      run_id: string;
    };
    expect(row.run_id).toBe('run_abc');
  });

  it('ignores duplicate event IDs', () => {
    const sink = createSqliteEventSink(db, 'run_1');
    sink.write(makeEvent('e1'));
    sink.write(makeEvent('e1'));

    const count = (db.prepare('SELECT COUNT(*) as c FROM events').get() as { c: number }).c;
    expect(count).toBe(1);
  });

  it('populates action_type column from event payload', () => {
    const sink = createSqliteEventSink(db, 'run_1');
    const event = {
      ...makeEvent('e_at'),
      actionType: 'file.write',
    } as DomainEvent;
    sink.write(event);

    const row = db.prepare('SELECT action_type FROM events WHERE id = ?').get('e_at') as {
      action_type: string | null;
    };
    expect(row.action_type).toBe('file.write');
  });

  it('sets action_type to null when not present in event', () => {
    const sink = createSqliteEventSink(db, 'run_1');
    const event = {
      id: 'e_no_at',
      kind: 'RunStarted',
      timestamp: Date.now(),
      fingerprint: 'fp',
    } as DomainEvent;
    sink.write(event);

    const row = db.prepare('SELECT action_type FROM events WHERE id = ?').get('e_no_at') as {
      action_type: string | null;
    };
    expect(row.action_type).toBeNull();
  });

  it('does not throw on write errors', () => {
    const sink = createSqliteEventSink(db, 'run_1');
    db.close(); // Force errors
    expect(() => sink.write(makeEvent('e1'))).not.toThrow();
  });

  it('flush is a no-op', () => {
    const sink = createSqliteEventSink(db, 'run_1');
    expect(() => sink.flush?.()).not.toThrow();
  });
});

describe('SQLite DecisionSink', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  it('writes decision records to the database', () => {
    const sink = createSqliteDecisionSink(db, 'run_1');
    sink.write(makeDecision('dec_1'));

    const count = (db.prepare('SELECT COUNT(*) as c FROM decisions').get() as { c: number }).c;
    expect(count).toBe(1);
  });

  it('stores the full record as JSON in the data column', () => {
    const sink = createSqliteDecisionSink(db, 'run_1');
    const record = makeDecision('dec_1');
    sink.write(record);

    const row = db.prepare('SELECT data FROM decisions WHERE record_id = ?').get('dec_1') as {
      data: string;
    };
    const parsed = JSON.parse(row.data);
    expect(parsed.recordId).toBe('dec_1');
    expect(parsed.outcome).toBe('allow');
  });

  it('extracts indexed columns correctly', () => {
    const sink = createSqliteDecisionSink(db, 'run_1');
    sink.write(makeDecision('dec_1'));

    const row = db
      .prepare('SELECT outcome, action_type, target FROM decisions WHERE record_id = ?')
      .get('dec_1') as {
      outcome: string;
      action_type: string;
      target: string;
    };
    expect(row.outcome).toBe('allow');
    expect(row.action_type).toBe('shell.exec');
    expect(row.target).toBe('/bin/ls');
  });

  it('populates severity column from policy', () => {
    const sink = createSqliteDecisionSink(db, 'run_1');
    const record = {
      ...makeDecision('dec_sev'),
      policy: { matchedPolicyId: 'p1', matchedPolicyName: 'default', severity: 3 },
    } as unknown as GovernanceDecisionRecord;
    sink.write(record);

    const row = db.prepare('SELECT severity FROM decisions WHERE record_id = ?').get('dec_sev') as {
      severity: number | null;
    };
    expect(row.severity).toBe(3);
  });

  it('does not throw on write errors', () => {
    const sink = createSqliteDecisionSink(db, 'run_1');
    db.close();
    expect(() => sink.write(makeDecision('dec_1'))).not.toThrow();
  });
});
