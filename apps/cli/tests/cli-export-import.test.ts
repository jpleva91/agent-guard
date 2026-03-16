// Tests for CLI export and import commands (SQLite backend)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import {
  runMigrations,
  createSqliteEventSink,
  createSqliteDecisionSink,
  loadRunEvents,
} from '@red-codes/storage';
import type { DomainEvent, GovernanceDecisionRecord } from '@red-codes/core';

import { exportSession, EXPORT_SCHEMA_VERSION } from '../src/commands/export.js';
import { importSession } from '../src/commands/import.js';
import type { StorageConfig } from '@red-codes/storage';

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

function makeDecision(): GovernanceDecisionRecord {
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
  tmpDir = mkdtempSync(join(tmpdir(), 'ag-export-import-test-'));
  storageConfig = { backend: 'sqlite', dbPath: join(tmpDir, 'test.db') };
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

describe('exportSession CLI', () => {
  it('shows usage when no arguments provided', async () => {
    await exportSession([], storageConfig);

    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('Usage:'));
    expect(process.exitCode).toBe(1);
  });

  it('exports a run with events and decisions', async () => {
    // Seed the database with events and a decision
    const db = new Database(storageConfig.dbPath!);
    const eventSink = createSqliteEventSink(db, 'run_test');
    const decisionSink = createSqliteDecisionSink(db, 'run_test');

    eventSink.write(makeEvent({ id: 'evt_1' }));
    eventSink.write(makeEvent({ id: 'evt_2', timestamp: 1700000001000 }));
    decisionSink.write(makeDecision());
    db.close();

    const outputPath = join(tmpDir, 'export-output.jsonl');
    await exportSession(['run_test', '--output', outputPath], storageConfig);

    // Read the output file
    const { readFileSync } = await import('node:fs');
    const content = readFileSync(outputPath, 'utf8');
    const lines = content.trim().split('\n');

    // header + 2 events + 1 decision
    expect(lines).toHaveLength(4);

    const header = JSON.parse(lines[0]);
    expect(header.__agentguard_export).toBe(true);
    expect(header.version).toBe(1);
    expect(header.schemaVersion).toBe(EXPORT_SCHEMA_VERSION);
    expect(header.runId).toBe('run_test');
    expect(header.eventCount).toBe(2);
    expect(header.decisionCount).toBe(1);
    expect(header.sourceBackend).toBe('sqlite');

    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('Exported run'));
  });

  it('exports using --last flag', async () => {
    // Seed with two runs
    const db = new Database(storageConfig.dbPath!);
    const sink1 = createSqliteEventSink(db, 'run_001');
    sink1.write(makeEvent({ id: 'e1', timestamp: 1000 }));
    const sink2 = createSqliteEventSink(db, 'run_002');
    sink2.write(makeEvent({ id: 'e2', timestamp: 2000 }));
    db.close();

    const outputPath = join(tmpDir, 'last-export.jsonl');
    await exportSession(['--last', '--output', outputPath], storageConfig);

    const { readFileSync } = await import('node:fs');
    const content = readFileSync(outputPath, 'utf8');
    const header = JSON.parse(content.split('\n')[0]);
    // The latest run should be exported
    expect(header.runId).toBeDefined();
  });

  it('errors when run has no events', async () => {
    await exportSession(['run_missing'], storageConfig);

    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('no events to export')
    );
    expect(process.exitCode).toBe(1);
  });
});

describe('importSession CLI', () => {
  it('shows usage when no arguments provided', async () => {
    await importSession([], storageConfig);

    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('Usage:'));
    expect(process.exitCode).toBe(1);
  });

  it('imports events from an exported file', async () => {
    const event = makeEvent();
    const header = {
      __agentguard_export: true,
      version: 1,
      schemaVersion: EXPORT_SCHEMA_VERSION,
      runId: 'run_imported',
      exportedAt: Date.now(),
      eventCount: 1,
      decisionCount: 0,
    };
    const fileContent = JSON.stringify(header) + '\n' + JSON.stringify(event) + '\n';

    const importFile = join(tmpDir, 'import.jsonl');
    const { writeFileSync } = await import('node:fs');
    writeFileSync(importFile, fileContent, 'utf8');

    await importSession([importFile], storageConfig);

    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('Imported run'));

    // Verify events were written to SQLite
    const db = new Database(storageConfig.dbPath!);
    const events = loadRunEvents(db, 'run_imported');
    expect(events.length).toBe(1);
    db.close();
  });

  it('imports events and decisions', async () => {
    const event = makeEvent();
    const decision = makeDecision();
    const header = {
      __agentguard_export: true,
      version: 1,
      schemaVersion: EXPORT_SCHEMA_VERSION,
      runId: 'run_full',
      exportedAt: Date.now(),
      eventCount: 1,
      decisionCount: 1,
    };
    const fileContent =
      JSON.stringify(header) + '\n' + JSON.stringify(event) + '\n' + JSON.stringify(decision) + '\n';

    const importFile = join(tmpDir, 'import-full.jsonl');
    const { writeFileSync } = await import('node:fs');
    writeFileSync(importFile, fileContent, 'utf8');

    await importSession([importFile], storageConfig);

    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('Decisions: 1'));
  });

  it('errors when file does not exist', async () => {
    await importSession([join(tmpDir, 'missing.jsonl')], storageConfig);

    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('File not found'));
    expect(process.exitCode).toBe(1);
  });

  it('errors on empty file', async () => {
    const emptyFile = join(tmpDir, 'empty.jsonl');
    const { writeFileSync } = await import('node:fs');
    writeFileSync(emptyFile, '', 'utf8');

    await importSession([emptyFile], storageConfig);

    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('Import file is empty')
    );
    expect(process.exitCode).toBe(1);
  });

  it('errors on invalid header', async () => {
    const badFile = join(tmpDir, 'bad.jsonl');
    const { writeFileSync } = await import('node:fs');
    writeFileSync(badFile, 'not-valid-json\n', 'utf8');

    await importSession([badFile], storageConfig);

    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('invalid header'));
    expect(process.exitCode).toBe(1);
  });

  it('errors on missing export marker', async () => {
    const badFile = join(tmpDir, 'bad-marker.jsonl');
    const { writeFileSync } = await import('node:fs');
    writeFileSync(badFile, JSON.stringify({ version: 1 }) + '\n', 'utf8');

    await importSession([badFile], storageConfig);

    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('Not a valid AgentGuard export')
    );
    expect(process.exitCode).toBe(1);
  });

  it('errors when no valid events found', async () => {
    const header = {
      __agentguard_export: true,
      version: 1,
      runId: 'run_bad',
      exportedAt: Date.now(),
      eventCount: 1,
      decisionCount: 0,
    };
    const badEventsFile = join(tmpDir, 'bad-events.jsonl');
    const { writeFileSync } = await import('node:fs');
    writeFileSync(badEventsFile, JSON.stringify(header) + '\ngarbage\n', 'utf8');

    await importSession([badEventsFile], storageConfig);

    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('no valid events'));
    expect(process.exitCode).toBe(1);
  });

  it('rejects exports with unsupported schemaVersion', async () => {
    const header = {
      __agentguard_export: true,
      version: 1,
      schemaVersion: 999,
      runId: 'run_future',
      exportedAt: Date.now(),
      eventCount: 1,
      decisionCount: 0,
    };
    const futureFile = join(tmpDir, 'future.jsonl');
    const { writeFileSync } = await import('node:fs');
    writeFileSync(futureFile, JSON.stringify(header) + '\n' + JSON.stringify(makeEvent()) + '\n', 'utf8');

    await importSession([futureFile], storageConfig);

    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('schema version 999')
    );
    expect(process.exitCode).toBe(1);
  });

  it('accepts exports with current schemaVersion', async () => {
    const event = makeEvent();
    const header = {
      __agentguard_export: true,
      version: 1,
      schemaVersion: EXPORT_SCHEMA_VERSION,
      runId: 'run_current',
      exportedAt: Date.now(),
      eventCount: 1,
      decisionCount: 0,
    };
    const currentFile = join(tmpDir, 'current.jsonl');
    const { writeFileSync } = await import('node:fs');
    writeFileSync(currentFile, JSON.stringify(header) + '\n' + JSON.stringify(event) + '\n', 'utf8');

    await importSession([currentFile], storageConfig);

    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('Imported run'));
  });

  it('accepts exports without schemaVersion (backward compatibility)', async () => {
    const event = makeEvent();
    const header = {
      __agentguard_export: true,
      version: 1,
      // no schemaVersion — old-format export
      runId: 'run_old_format',
      exportedAt: Date.now(),
      eventCount: 1,
      decisionCount: 0,
    };
    const oldFile = join(tmpDir, 'old.jsonl');
    const { writeFileSync } = await import('node:fs');
    writeFileSync(oldFile, JSON.stringify(header) + '\n' + JSON.stringify(event) + '\n', 'utf8');

    await importSession([oldFile], storageConfig);

    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('Imported run'));
  });
});
