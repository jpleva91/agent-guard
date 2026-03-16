// Tests for CLI migrate command — JSONL → SQLite bulk import
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { runMigrations } from '@red-codes/storage';
import type { DomainEvent, GovernanceDecisionRecord } from '@red-codes/core';
import type { StorageConfig } from '@red-codes/storage';

import { migrate } from '../src/commands/migrate.js';

function makeEvent(overrides: Record<string, unknown> = {}): DomainEvent {
  return {
    id: 'evt_1700000000000_1',
    kind: 'ActionRequested',
    timestamp: 1700000000000,
    fingerprint: 'fp_abc',
    actionType: 'file.read',
    target: 'test.ts',
    justification: 'testing',
    ...overrides,
  } as DomainEvent;
}

function makeDecision(overrides: Record<string, unknown> = {}): GovernanceDecisionRecord {
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
    ...overrides,
  } as unknown as GovernanceDecisionRecord;
}

let tmpDir: string;
let storageConfig: StorageConfig;
let baseDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ag-migrate-test-'));
  storageConfig = { backend: 'sqlite', dbPath: join(tmpDir, 'test.db') };
  baseDir = join(tmpDir, 'agentguard-data');

  // Initialize the database
  const db = new Database(storageConfig.dbPath!);
  runMigrations(db);
  db.close();

  vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  process.exitCode = undefined;
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(tmpDir, { recursive: true, force: true });
  process.exitCode = undefined;
});

describe('migrate CLI', () => {
  it('reports nothing to migrate when no JSONL files exist', async () => {
    mkdirSync(join(baseDir, 'events'), { recursive: true });
    mkdirSync(join(baseDir, 'decisions'), { recursive: true });

    const code = await migrate(['--dir', baseDir], storageConfig);

    expect(code).toBe(0);
    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('Nothing to migrate')
    );
  });

  it('reports nothing when base directory does not exist', async () => {
    const code = await migrate(['--dir', join(tmpDir, 'nonexistent')], storageConfig);

    expect(code).toBe(0);
    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('Nothing to migrate')
    );
  });

  it('imports event JSONL files into SQLite', async () => {
    mkdirSync(join(baseDir, 'events'), { recursive: true });
    mkdirSync(join(baseDir, 'decisions'), { recursive: true });

    // Write two event files
    const event1 = makeEvent({ id: 'evt_1', timestamp: 1700000000000 });
    const event2 = makeEvent({ id: 'evt_2', timestamp: 1700000001000 });
    const event3 = makeEvent({ id: 'evt_3', timestamp: 1700000002000 });

    writeFileSync(
      join(baseDir, 'events', 'run_001.jsonl'),
      JSON.stringify(event1) + '\n' + JSON.stringify(event2) + '\n',
      'utf8'
    );
    writeFileSync(join(baseDir, 'events', 'run_002.jsonl'), JSON.stringify(event3) + '\n', 'utf8');

    const code = await migrate(['--dir', baseDir], storageConfig);

    expect(code).toBe(0);
    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('Migration complete')
    );

    // Verify events in SQLite
    const db = new Database(storageConfig.dbPath!);
    const rows = db.prepare('SELECT * FROM events ORDER BY timestamp').all() as {
      id: string;
      run_id: string;
    }[];
    expect(rows).toHaveLength(3);
    expect(rows[0].run_id).toBe('run_001');
    expect(rows[2].run_id).toBe('run_002');
    db.close();
  });

  it('imports decision JSONL files into SQLite', async () => {
    mkdirSync(join(baseDir, 'events'), { recursive: true });
    mkdirSync(join(baseDir, 'decisions'), { recursive: true });

    const event1 = makeEvent({ id: 'evt_1' });
    const decision1 = makeDecision({ recordId: 'dec_1', timestamp: 1700000000100 });

    writeFileSync(join(baseDir, 'events', 'run_001.jsonl'), JSON.stringify(event1) + '\n', 'utf8');
    writeFileSync(
      join(baseDir, 'decisions', 'run_001.jsonl'),
      JSON.stringify(decision1) + '\n',
      'utf8'
    );

    const code = await migrate(['--dir', baseDir], storageConfig);

    expect(code).toBe(0);

    // Verify decisions in SQLite
    const db = new Database(storageConfig.dbPath!);
    const rows = db.prepare('SELECT * FROM decisions').all() as { record_id: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].record_id).toBe('dec_1');
    db.close();
  });

  it('reconstructs sessions from event timestamps', async () => {
    mkdirSync(join(baseDir, 'events'), { recursive: true });
    mkdirSync(join(baseDir, 'decisions'), { recursive: true });

    const event1 = makeEvent({ id: 'evt_1', timestamp: 1700000000000 });
    const event2 = makeEvent({ id: 'evt_2', timestamp: 1700000005000 });

    writeFileSync(
      join(baseDir, 'events', 'run_sess.jsonl'),
      JSON.stringify(event1) + '\n' + JSON.stringify(event2) + '\n',
      'utf8'
    );

    await migrate(['--dir', baseDir], storageConfig);

    // Verify session was created
    const db = new Database(storageConfig.dbPath!);
    const sessions = db.prepare('SELECT * FROM sessions').all() as {
      id: string;
      started_at: string;
      ended_at: string;
      data: string;
    }[];
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe('run_sess');
    expect(sessions[0].ended_at).not.toBeNull();

    const data = JSON.parse(sessions[0].data) as Record<string, unknown>;
    expect(data.source).toBe('jsonl-migration');
    expect(data.status).toBe('completed');
    db.close();
  });

  it('is idempotent — re-running does not duplicate records', async () => {
    mkdirSync(join(baseDir, 'events'), { recursive: true });
    mkdirSync(join(baseDir, 'decisions'), { recursive: true });

    const event1 = makeEvent({ id: 'evt_idem_1' });
    writeFileSync(join(baseDir, 'events', 'run_idem.jsonl'), JSON.stringify(event1) + '\n', 'utf8');

    // Run migration twice
    await migrate(['--dir', baseDir], storageConfig);
    await migrate(['--dir', baseDir], storageConfig);

    // Should still have only 1 event
    const db = new Database(storageConfig.dbPath!);
    const count = (db.prepare('SELECT COUNT(*) as c FROM events').get() as { c: number }).c;
    expect(count).toBe(1);
    db.close();
  });

  it('supports --dry-run flag', async () => {
    mkdirSync(join(baseDir, 'events'), { recursive: true });
    mkdirSync(join(baseDir, 'decisions'), { recursive: true });

    const event1 = makeEvent({ id: 'evt_dry_1' });
    writeFileSync(join(baseDir, 'events', 'run_dry.jsonl'), JSON.stringify(event1) + '\n', 'utf8');

    const code = await migrate(['--dir', baseDir, '--dry-run'], storageConfig);

    expect(code).toBe(0);
    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('[dry-run]'));

    // Verify nothing was written to SQLite
    const db = new Database(storageConfig.dbPath!);
    const count = (db.prepare('SELECT COUNT(*) as c FROM events').get() as { c: number }).c;
    expect(count).toBe(0);
    db.close();
  });

  it('supports --verbose flag', async () => {
    mkdirSync(join(baseDir, 'events'), { recursive: true });
    mkdirSync(join(baseDir, 'decisions'), { recursive: true });

    const event1 = makeEvent({ id: 'evt_verbose_1' });
    writeFileSync(
      join(baseDir, 'events', 'run_verbose.jsonl'),
      JSON.stringify(event1) + '\n',
      'utf8'
    );

    const code = await migrate(['--dir', baseDir, '--verbose'], storageConfig);

    expect(code).toBe(0);
    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('run_verbose.jsonl'));
  });

  it('skips invalid event lines gracefully', async () => {
    mkdirSync(join(baseDir, 'events'), { recursive: true });
    mkdirSync(join(baseDir, 'decisions'), { recursive: true });

    const validEvent = makeEvent({ id: 'evt_valid_1' });
    writeFileSync(
      join(baseDir, 'events', 'run_mixed.jsonl'),
      JSON.stringify(validEvent) + '\nnot-valid-json\n{"bad":"event"}\n',
      'utf8'
    );

    const code = await migrate(['--dir', baseDir], storageConfig);

    expect(code).toBe(0);

    // Only the valid event should be imported
    const db = new Database(storageConfig.dbPath!);
    const count = (db.prepare('SELECT COUNT(*) as c FROM events').get() as { c: number }).c;
    expect(count).toBe(1);
    db.close();
  });

  it('skips invalid decision lines gracefully', async () => {
    mkdirSync(join(baseDir, 'decisions'), { recursive: true });
    mkdirSync(join(baseDir, 'events'), { recursive: true });

    const validDecision = makeDecision({ recordId: 'dec_valid_1' });
    writeFileSync(
      join(baseDir, 'decisions', 'run_mixed_dec.jsonl'),
      JSON.stringify(validDecision) + '\nnot-valid-json\n{"bad":"decision"}\n',
      'utf8'
    );

    // Need at least one event file for the run to trigger import
    const event1 = makeEvent({ id: 'evt_for_dec' });
    writeFileSync(
      join(baseDir, 'events', 'run_mixed_dec.jsonl'),
      JSON.stringify(event1) + '\n',
      'utf8'
    );

    const code = await migrate(['--dir', baseDir], storageConfig);

    expect(code).toBe(0);

    const db = new Database(storageConfig.dbPath!);
    const count = (db.prepare('SELECT COUNT(*) as c FROM decisions').get() as { c: number }).c;
    expect(count).toBe(1);
    db.close();
  });

  it('handles multiple runs correctly', async () => {
    mkdirSync(join(baseDir, 'events'), { recursive: true });
    mkdirSync(join(baseDir, 'decisions'), { recursive: true });

    // Two separate runs
    writeFileSync(
      join(baseDir, 'events', 'run_a.jsonl'),
      JSON.stringify(makeEvent({ id: 'evt_a1', timestamp: 1700000000000 })) +
        '\n' +
        JSON.stringify(makeEvent({ id: 'evt_a2', timestamp: 1700000001000 })) +
        '\n',
      'utf8'
    );
    writeFileSync(
      join(baseDir, 'events', 'run_b.jsonl'),
      JSON.stringify(makeEvent({ id: 'evt_b1', timestamp: 1700000010000 })) + '\n',
      'utf8'
    );

    const code = await migrate(['--dir', baseDir], storageConfig);

    expect(code).toBe(0);

    const db = new Database(storageConfig.dbPath!);
    const events = db.prepare('SELECT * FROM events ORDER BY timestamp').all() as {
      run_id: string;
    }[];
    expect(events).toHaveLength(3);

    const sessions = db.prepare('SELECT * FROM sessions ORDER BY started_at').all() as {
      id: string;
    }[];
    expect(sessions).toHaveLength(2);
    db.close();
  });
});
