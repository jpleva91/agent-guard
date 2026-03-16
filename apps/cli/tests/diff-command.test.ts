// Tests for the diff CLI command — verifies argument parsing, session loading,
// terminal and JSON output, and error handling.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { runMigrations, createSqliteEventSink } from '@red-codes/storage';
import type { StorageConfig } from '@red-codes/storage';
import type { DomainEvent } from '@red-codes/core';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let tmpDir: string;
let storageConfig: StorageConfig;

function testEvent(
  kind: string,
  data: Record<string, unknown> = {},
  timestamp?: number
): DomainEvent {
  return {
    id: `evt_test_${Math.random().toString(36).slice(2, 6)}`,
    kind: kind as DomainEvent['kind'],
    timestamp: timestamp || Date.now(),
    fingerprint: 'test',
    ...data,
  };
}

function createAllowedActionEvents(
  actionType: string,
  target: string,
  baseTimestamp: number
): DomainEvent[] {
  return [
    testEvent('ActionRequested', { actionType, target, agentId: 'test' }, baseTimestamp),
    testEvent(
      'ActionAllowed',
      { actionType, target, reason: 'No matching deny rule' },
      baseTimestamp + 1
    ),
    testEvent('ActionExecuted', { actionType, target, result: 'success' }, baseTimestamp + 2),
  ];
}

function createDeniedActionEvents(
  actionType: string,
  target: string,
  reason: string,
  baseTimestamp: number
): DomainEvent[] {
  return [
    testEvent('ActionRequested', { actionType, target, agentId: 'test' }, baseTimestamp),
    testEvent('PolicyDenied', { policy: 'test', action: actionType, reason }, baseTimestamp + 1),
    testEvent('ActionDenied', { actionType, target, reason }, baseTimestamp + 2),
  ];
}

function seedEvents(runId: string, events: DomainEvent[]): void {
  const db = new Database(storageConfig.dbPath!);
  const sink = createSqliteEventSink(db, runId);
  for (const e of events) {
    // Clone with unique ID to avoid INSERT OR IGNORE conflicts across runs
    const cloned = { ...e, id: `${e.id}_${runId}` };
    sink.write(cloned);
  }
  db.close();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('diff command', () => {
  let stderrOutput: string;
  let stdoutOutput: string;
  let originalExitCode: number | undefined;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ag-diff-test-'));
    storageConfig = { backend: 'sqlite', dbPath: join(tmpDir, 'test.db') };
    const db = new Database(storageConfig.dbPath!);
    runMigrations(db);
    db.close();

    stderrOutput = '';
    stdoutOutput = '';
    originalExitCode = process.exitCode;

    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
      stderrOutput += chunk.toString();
      return true;
    });
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
      stdoutOutput += chunk.toString();
      return true;
    });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
    process.exitCode = originalExitCode;
  });

  // ── Import the module under test ──

  async function runDiff(args: string[]): Promise<void> {
    const { diff } = await import('../src/commands/diff.js');
    await diff(args, storageConfig);
  }

  // ── Usage / Error Cases ──

  describe('usage and errors', () => {
    it('shows usage when no arguments provided', async () => {
      await runDiff([]);
      expect(stderrOutput).toContain('Usage:');
      expect(stderrOutput).toContain('agentguard diff');
      expect(process.exitCode).toBe(1);
    });

    it('shows usage when only one run ID provided', async () => {
      await runDiff(['run-a']);
      expect(stderrOutput).toContain('Usage:');
      expect(process.exitCode).toBe(1);
    });

    it('reports error when sessions cannot be loaded', async () => {
      await runDiff(['nonexistent-a', 'nonexistent-b']);
      expect(stderrOutput).toContain('Error:');
      expect(stderrOutput).toContain('nonexistent-a');
      expect(stderrOutput).toContain('nonexistent-b');
      expect(process.exitCode).toBe(1);
    });

    it('reports error for --last with fewer than 2 runs', async () => {
      seedEvents('only-one', createAllowedActionEvents('file.write', 'a.ts', 1000));
      await runDiff(['--last']);
      expect(stderrOutput).toContain('Need at least 2');
      expect(process.exitCode).toBe(1);
    });
  });

  // ── Identical Sessions ──

  describe('identical sessions', () => {
    it('reports identical sessions with zero exit code', async () => {
      const events = createAllowedActionEvents('file.write', 'a.ts', 1000);
      seedEvents('run-a', events);
      seedEvents('run-b', events);

      await runDiff(['run-a', 'run-b']);
      expect(stderrOutput).toContain('IDENTICAL');
      expect(stderrOutput).toContain('run-a');
      expect(stderrOutput).toContain('run-b');
      // Identical sessions should not set exitCode to 1
      expect(process.exitCode).not.toBe(1);
    });
  });

  // ── Divergent Sessions ──

  describe('divergent sessions', () => {
    it('reports divergent sessions with details', async () => {
      const origEvents = createAllowedActionEvents('git.push', 'main', 1000);
      const replayEvents = createDeniedActionEvents('git.push', 'main', 'Protected branch', 1000);

      seedEvents('run-orig', origEvents);
      seedEvents('run-changed', replayEvents);

      await runDiff(['run-orig', 'run-changed']);
      expect(stderrOutput).toContain('DIVERGENT');
      expect(stderrOutput).toContain('git.push');
      expect(process.exitCode).toBe(1);
    });

    it('shows field-level differences for divergent actions', async () => {
      const origEvents = createAllowedActionEvents('file.delete', 'config.ts', 1000);
      const replayEvents = createDeniedActionEvents('file.delete', 'config.ts', 'Blocked', 1000);

      seedEvents('run-a', origEvents);
      seedEvents('run-b', replayEvents);

      await runDiff(['run-a', 'run-b']);
      expect(stderrOutput).toContain('allowed');
    });
  });

  // ── JSON Output ──

  describe('JSON output', () => {
    it('outputs valid JSON with --json flag', async () => {
      const events = createAllowedActionEvents('file.write', 'a.ts', 1000);
      seedEvents('run-a', events);
      seedEvents('run-b', events);

      await runDiff(['run-a', 'run-b', '--json']);

      const parsed = JSON.parse(stdoutOutput);
      expect(parsed.originalRunId).toBe('run-a');
      expect(parsed.replayedRunId).toBe('run-b');
      expect(parsed.identical).toBe(true);
      expect(typeof parsed.totalComparisons).toBe('number');
    });

    it('outputs divergent JSON with field differences', async () => {
      const origEvents = createAllowedActionEvents('git.push', 'main', 1000);
      const replayEvents = createDeniedActionEvents('git.push', 'main', 'Blocked', 1000);

      seedEvents('run-a', origEvents);
      seedEvents('run-b', replayEvents);

      await runDiff(['run-a', 'run-b', '--json']);

      const parsed = JSON.parse(stdoutOutput);
      expect(parsed.identical).toBe(false);
      expect(parsed.divergences).toBe(1);
      expect(parsed.comparisons[0].status).toBe('divergent');
      expect(parsed.comparisons[0].differences.length).toBeGreaterThan(0);
    });
  });

  // ── --last Flag ──

  describe('--last flag', () => {
    it('compares the two most recent runs', async () => {
      const eventsA = createAllowedActionEvents('file.write', 'a.ts', 1000);
      const eventsB = createDeniedActionEvents('file.write', 'a.ts', 'Blocked', 1000);

      seedEvents('run-001-earlier', eventsA);
      seedEvents('run-002-latest', eventsB);

      await runDiff(['--last']);
      // Should compare the two runs (second-most-recent vs most-recent)
      expect(stderrOutput).toContain('run-001-earlier');
      expect(stderrOutput).toContain('run-002-latest');
    });
  });

  // ── Missing and Extra Actions ──

  describe('missing and extra actions', () => {
    it('reports missing actions in terminal output', async () => {
      const origEvents = [
        ...createAllowedActionEvents('file.write', 'a.ts', 1000),
        ...createAllowedActionEvents('file.write', 'b.ts', 2000),
      ];
      const replayEvents = createAllowedActionEvents('file.write', 'a.ts', 1000);

      seedEvents('run-a', origEvents);
      seedEvents('run-b', replayEvents);

      await runDiff(['run-a', 'run-b']);
      expect(stderrOutput).toContain('MISSING');
      expect(stderrOutput).toContain('Only in Session A');
    });

    it('reports extra actions in terminal output', async () => {
      const origEvents = createAllowedActionEvents('file.write', 'a.ts', 1000);
      const replayEvents = [
        ...createAllowedActionEvents('file.write', 'a.ts', 1000),
        ...createAllowedActionEvents('file.write', 'b.ts', 2000),
      ];

      seedEvents('run-a', origEvents);
      seedEvents('run-b', replayEvents);

      await runDiff(['run-a', 'run-b']);
      expect(stderrOutput).toContain('EXTRA');
      expect(stderrOutput).toContain('Only in Session B');
    });
  });

  // ── Summary Differences ──

  describe('summary differences', () => {
    it('shows summary-level differences', async () => {
      const origEvents = [
        ...createAllowedActionEvents('file.write', 'a.ts', 1000),
        ...createAllowedActionEvents('file.write', 'b.ts', 2000),
      ];
      const replayEvents = [
        ...createAllowedActionEvents('file.write', 'a.ts', 1000),
        ...createDeniedActionEvents('file.write', 'b.ts', 'Blocked', 2000),
      ];

      seedEvents('run-a', origEvents);
      seedEvents('run-b', replayEvents);

      await runDiff(['run-a', 'run-b']);
      expect(stderrOutput).toContain('Summary Differences');
    });
  });

  // ── Escalation Level Comparison ──

  describe('escalation level comparison', () => {
    it('shows escalation level changes between sessions', async () => {
      const origEvents = createAllowedActionEvents('file.write', 'a.ts', 1000);
      const replayEvents = [
        testEvent(
          'ActionRequested',
          { actionType: 'file.write', target: 'a.ts', agentId: 'test' },
          1000
        ),
        testEvent(
          'ActionEscalated',
          { actionType: 'file.write', target: 'a.ts', escalationLevel: 'ELEVATED' },
          1001
        ),
        testEvent(
          'ActionAllowed',
          { actionType: 'file.write', target: 'a.ts', reason: 'Allowed after escalation' },
          1002
        ),
        testEvent(
          'ActionExecuted',
          { actionType: 'file.write', target: 'a.ts', result: 'success' },
          1003
        ),
      ];

      seedEvents('run-a', origEvents);
      seedEvents('run-b', replayEvents);

      await runDiff(['run-a', 'run-b']);
      expect(stderrOutput).toContain('Escalation Levels');
      expect(stderrOutput).toContain('NORMAL');
      expect(stderrOutput).toContain('ELEVATED');
    });

    it('does not show escalation section when levels are the same', async () => {
      const events = createAllowedActionEvents('file.write', 'a.ts', 1000);
      seedEvents('run-a', events);
      seedEvents('run-b', events);

      await runDiff(['run-a', 'run-b']);
      expect(stderrOutput).not.toContain('Escalation Levels');
    });
  });

  // ── Invariant Violation Highlighting ──

  describe('invariant violation highlighting', () => {
    it('shows invariant violations that differ between sessions', async () => {
      const origEvents = createAllowedActionEvents('file.write', 'a.ts', 1000);
      const replayEvents = [
        testEvent(
          'ActionRequested',
          { actionType: 'file.write', target: 'a.ts', agentId: 'test' },
          1000
        ),
        testEvent(
          'InvariantViolation',
          { invariant: 'secret-exposure', action: 'file.write', reason: 'Secrets detected' },
          1001
        ),
        testEvent(
          'ActionDenied',
          { actionType: 'file.write', target: 'a.ts', reason: 'Invariant violation' },
          1002
        ),
      ];

      seedEvents('run-a', origEvents);
      seedEvents('run-b', replayEvents);

      await runDiff(['run-a', 'run-b']);
      expect(stderrOutput).toContain('Invariant Violations');
      expect(stderrOutput).toContain('secret-exposure');
    });

    it('shows per-action governance details for divergent actions', async () => {
      const origEvents = createAllowedActionEvents('file.write', 'a.ts', 1000);
      const replayEvents = [
        testEvent(
          'ActionRequested',
          { actionType: 'file.write', target: 'a.ts', agentId: 'test' },
          1000
        ),
        testEvent(
          'InvariantViolation',
          { invariant: 'blast-radius', action: 'file.write', reason: 'Too many files' },
          1001
        ),
        testEvent(
          'ActionDenied',
          { actionType: 'file.write', target: 'a.ts', reason: 'blast-radius violation' },
          1002
        ),
      ];

      seedEvents('run-a', origEvents);
      seedEvents('run-b', replayEvents);

      await runDiff(['run-a', 'run-b']);
      expect(stderrOutput).toContain('violation: blast-radius');
    });
  });

  // ── Enriched JSON Output ──

  describe('enriched JSON output', () => {
    it('includes escalation metadata in JSON output', async () => {
      const origEvents = createAllowedActionEvents('file.write', 'a.ts', 1000);
      const replayEvents = [
        testEvent(
          'ActionRequested',
          { actionType: 'file.write', target: 'a.ts', agentId: 'test' },
          1000
        ),
        testEvent(
          'ActionEscalated',
          { actionType: 'file.write', target: 'a.ts', escalationLevel: 'HIGH' },
          1001
        ),
        testEvent(
          'ActionAllowed',
          { actionType: 'file.write', target: 'a.ts', reason: 'Allowed' },
          1002
        ),
        testEvent(
          'ActionExecuted',
          { actionType: 'file.write', target: 'a.ts', result: 'success' },
          1003
        ),
      ];

      seedEvents('run-a', origEvents);
      seedEvents('run-b', replayEvents);

      await runDiff(['run-a', 'run-b', '--json']);
      const parsed = JSON.parse(stdoutOutput);
      expect(parsed.escalation).toBeDefined();
      expect(parsed.escalation.sessionA).toBe('NORMAL');
      expect(parsed.escalation.sessionB).toBe('HIGH');
      expect(parsed.escalation.changed).toBe(true);
    });

    it('includes invariant violations in JSON output', async () => {
      const origEvents = createAllowedActionEvents('file.write', 'a.ts', 1000);
      const replayEvents = [
        testEvent(
          'ActionRequested',
          { actionType: 'file.write', target: 'a.ts', agentId: 'test' },
          1000
        ),
        testEvent(
          'InvariantViolation',
          { invariant: 'no-force-push', reason: 'Force push detected' },
          1001
        ),
        testEvent(
          'ActionDenied',
          { actionType: 'file.write', target: 'a.ts', reason: 'Violation' },
          1002
        ),
      ];

      seedEvents('run-a', origEvents);
      seedEvents('run-b', replayEvents);

      await runDiff(['run-a', 'run-b', '--json']);
      const parsed = JSON.parse(stdoutOutput);
      expect(parsed.invariantViolations).toBeDefined();
      expect(parsed.invariantViolations.sessionA).toEqual({});
      expect(parsed.invariantViolations.sessionB).toEqual({ 'no-force-push': 1 });
    });

    it('shows store flag in usage help', async () => {
      await runDiff([]);
      expect(stderrOutput).toContain('--store');
      expect(stderrOutput).toContain('sqlite');
    });
  });
});
