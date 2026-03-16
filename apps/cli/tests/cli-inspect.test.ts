// Tests for inspect CLI command (SQLite backend)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import {
  runMigrations,
  createSqliteEventSink,
  createSqliteDecisionSink,
} from '@red-codes/storage';
import type { StorageConfig } from '@red-codes/storage';
import type { DomainEvent, GovernanceDecisionRecord } from '@red-codes/core';

import { inspect, events } from '../src/commands/inspect.js';

function makeActionEvent(kind: string, overrides: Record<string, unknown> = {}): DomainEvent {
  return {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    kind,
    timestamp: 1700000000000,
    fingerprint: 'fp_1',
    actionType: 'file.write',
    target: 'src/app.ts',
    reason: 'test reason',
    ...overrides,
  } as DomainEvent;
}

function makeDecisionRecord(): GovernanceDecisionRecord {
  return {
    recordId: 'dec_123',
    runId: 'run_1',
    timestamp: 1700000000000,
    action: { type: 'file.write', target: 'src/app.ts', agent: 'test', destructive: false },
    outcome: 'allow',
    reason: 'Default allow',
    intervention: null,
    policy: { matchedPolicyId: null, matchedPolicyName: null, severity: 3 },
    invariants: { allHold: true, violations: [] },
    simulation: null,
    evidencePackId: null,
    monitor: { escalationLevel: 0, totalEvaluations: 1, totalDenials: 0 },
    execution: { executed: true, success: true, durationMs: 5, error: null },
  } as unknown as GovernanceDecisionRecord;
}

let tmpDir: string;
let storageConfig: StorageConfig;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ag-inspect-test-'));
  storageConfig = { backend: 'sqlite', dbPath: join(tmpDir, 'test.db') };
  const db = new Database(storageConfig.dbPath!);
  runMigrations(db);
  db.close();

  vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(tmpDir, { recursive: true, force: true });
});

function seedEvents(runId: string, evts: DomainEvent[]): void {
  const db = new Database(storageConfig.dbPath!);
  const sink = createSqliteEventSink(db, runId);
  for (const e of evts) sink.write(e);
  db.close();
}

function seedDecisions(runId: string, decs: GovernanceDecisionRecord[]): void {
  const db = new Database(storageConfig.dbPath!);
  const sink = createSqliteDecisionSink(db, runId);
  for (const d of decs) sink.write(d);
  db.close();
}

describe('inspect', () => {
  it('shows "no runs" message when database is empty', async () => {
    await inspect([], storageConfig);

    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('No runs recorded yet')
    );
  });

  it('lists runs when called with --list', async () => {
    seedEvents('run_001', [makeActionEvent('ActionAllowed')]);
    seedEvents('run_002', [makeActionEvent('ActionAllowed')]);

    await inspect(['--list'], storageConfig);

    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('Recorded Runs'));
  });

  it('loads specific run by ID', async () => {
    seedEvents('run_001', [
      makeActionEvent('ActionAllowed'),
      makeActionEvent('ActionExecuted'),
    ]);

    await inspect(['run_001'], storageConfig);

    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('run_001'));
  });

  it('loads most recent run with --last', async () => {
    seedEvents('run_001', [makeActionEvent('ActionAllowed', { timestamp: 1000 })]);
    seedEvents('run_002', [makeActionEvent('ActionAllowed', { timestamp: 2000 })]);

    await inspect(['--last'], storageConfig);

    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('run_00'));
  });

  it('shows decision records with --decisions flag', async () => {
    seedEvents('run_001', [makeActionEvent('ActionAllowed')]);
    seedDecisions('run_001', [makeDecisionRecord()]);

    await inspect(['run_001', '--decisions'], storageConfig);

    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('Decision Records'));
  });

  it('handles no events found for a run', async () => {
    await inspect(['run_missing'], storageConfig);

    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('No events found'));
  });

  it('shows policy traces with --traces flag', async () => {
    const traceEvent = {
      id: 'evt_trace_1',
      kind: 'PolicyTraceRecorded',
      timestamp: 1700000000000,
      fingerprint: 'fp_trace',
      actionType: 'file.write',
      target: 'src/app.ts',
      decision: 'allow',
      totalRulesChecked: 2,
      phaseThatMatched: 'allow',
      rulesEvaluated: [
        {
          policyId: 'security',
          policyName: 'Security Policy',
          ruleIndex: 0,
          effect: 'deny',
          actionPattern: 'git.push',
          actionMatched: false,
          conditionsMatched: false,
          conditionDetails: {},
          outcome: 'no-match',
        },
      ],
      durationMs: 0.15,
    } as DomainEvent;

    seedEvents('run_001', [makeActionEvent('ActionAllowed'), traceEvent]);

    await inspect(['run_001', '--traces'], storageConfig);

    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('Policy Evaluation Traces')
    );
  });

  it('shows no traces message when no trace events exist', async () => {
    seedEvents('run_001', [makeActionEvent('ActionAllowed')]);

    await inspect(['run_001', '--traces'], storageConfig);

    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('No policy evaluation traces found')
    );
  });

  it('shows denied actions with reason', async () => {
    seedEvents('run_001', [
      makeActionEvent('ActionDenied', {
        reason: 'Protected branch policy',
        metadata: { violations: [{ name: 'no-force-push' }] },
      }),
    ]);

    await inspect(['run_001'], storageConfig);

    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('DENIED'));
  });
});

describe('events', () => {
  it('shows usage when no run ID provided', async () => {
    await events([], storageConfig);

    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('Usage:'));
  });

  it('dumps raw events as JSON to stdout', async () => {
    seedEvents('run_001', [makeActionEvent('ActionRequested')]);

    await events(['run_001'], storageConfig);

    expect(process.stdout.write).toHaveBeenCalled();
    const written = vi.mocked(process.stdout.write).mock.calls[0][0] as string;
    const parsed = JSON.parse(written.trim());
    expect(parsed.kind).toBe('ActionRequested');
  });

  it('handles --last flag', async () => {
    seedEvents('run_latest', [makeActionEvent('ActionAllowed')]);

    await events(['--last'], storageConfig);

    expect(process.stdout.write).toHaveBeenCalled();
  });

  it('shows no runs message for --last when no runs exist', async () => {
    await events(['--last'], storageConfig);

    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('No runs recorded'));
  });
});
