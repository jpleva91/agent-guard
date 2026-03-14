// Tests for the diff CLI command — verifies argument parsing, session loading,
// terminal and JSON output, and error handling.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { DomainEvent } from '@red-codes/core';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const TEST_BASE_DIR = join('.agentguard-test-diff');
const TEST_EVENTS_DIR = join(TEST_BASE_DIR, 'events');

function ensureTestDir(): void {
  mkdirSync(TEST_EVENTS_DIR, { recursive: true });
}

function cleanTestDir(): void {
  if (existsSync(TEST_BASE_DIR)) {
    rmSync(TEST_BASE_DIR, { recursive: true, force: true });
  }
}

function writeTestJsonl(runId: string, events: DomainEvent[]): void {
  ensureTestDir();
  const filePath = join(TEST_EVENTS_DIR, `${runId}.jsonl`);
  const content = events.map((e) => JSON.stringify(e)).join('\n') + '\n';
  writeFileSync(filePath, content, 'utf8');
}

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('diff command', () => {
  let stderrOutput: string;
  let stdoutOutput: string;
  let originalExitCode: number | undefined;

  beforeEach(() => {
    cleanTestDir();
    ensureTestDir();
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
    cleanTestDir();
    vi.restoreAllMocks();
    process.exitCode = originalExitCode;
  });

  // ── Import the module under test ──

  async function runDiff(args: string[]): Promise<void> {
    const { diff } = await import('../src/commands/diff.js');
    await diff(args);
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
      await runDiff(['nonexistent-a', 'nonexistent-b', '--dir', TEST_BASE_DIR]);
      expect(stderrOutput).toContain('Error:');
      expect(stderrOutput).toContain('nonexistent-a');
      expect(stderrOutput).toContain('nonexistent-b');
      expect(process.exitCode).toBe(1);
    });

    it('reports error for --last with fewer than 2 runs', async () => {
      writeTestJsonl('only-one', createAllowedActionEvents('file.write', 'a.ts', 1000));
      await runDiff(['--last', '--dir', TEST_BASE_DIR]);
      expect(stderrOutput).toContain('Need at least 2');
      expect(process.exitCode).toBe(1);
    });
  });

  // ── Identical Sessions ──

  describe('identical sessions', () => {
    it('reports identical sessions with zero exit code', async () => {
      const events = createAllowedActionEvents('file.write', 'a.ts', 1000);
      writeTestJsonl('run-a', events);
      writeTestJsonl('run-b', events);

      await runDiff(['run-a', 'run-b', '--dir', TEST_BASE_DIR]);
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

      writeTestJsonl('run-orig', origEvents);
      writeTestJsonl('run-changed', replayEvents);

      await runDiff(['run-orig', 'run-changed', '--dir', TEST_BASE_DIR]);
      expect(stderrOutput).toContain('DIVERGENT');
      expect(stderrOutput).toContain('git.push');
      expect(process.exitCode).toBe(1);
    });

    it('shows field-level differences for divergent actions', async () => {
      const origEvents = createAllowedActionEvents('file.delete', 'config.ts', 1000);
      const replayEvents = createDeniedActionEvents('file.delete', 'config.ts', 'Blocked', 1000);

      writeTestJsonl('run-a', origEvents);
      writeTestJsonl('run-b', replayEvents);

      await runDiff(['run-a', 'run-b', '--dir', TEST_BASE_DIR]);
      expect(stderrOutput).toContain('allowed');
    });
  });

  // ── JSON Output ──

  describe('JSON output', () => {
    it('outputs valid JSON with --json flag', async () => {
      const events = createAllowedActionEvents('file.write', 'a.ts', 1000);
      writeTestJsonl('run-a', events);
      writeTestJsonl('run-b', events);

      await runDiff(['run-a', 'run-b', '--json', '--dir', TEST_BASE_DIR]);

      const parsed = JSON.parse(stdoutOutput);
      expect(parsed.originalRunId).toBe('run-a');
      expect(parsed.replayedRunId).toBe('run-b');
      expect(parsed.identical).toBe(true);
      expect(typeof parsed.totalComparisons).toBe('number');
    });

    it('outputs divergent JSON with field differences', async () => {
      const origEvents = createAllowedActionEvents('git.push', 'main', 1000);
      const replayEvents = createDeniedActionEvents('git.push', 'main', 'Blocked', 1000);

      writeTestJsonl('run-a', origEvents);
      writeTestJsonl('run-b', replayEvents);

      await runDiff(['run-a', 'run-b', '--json', '--dir', TEST_BASE_DIR]);

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
      // Create runs with names that sort chronologically
      const eventsA = createAllowedActionEvents('file.write', 'a.ts', 1000);
      const eventsB = createDeniedActionEvents('file.write', 'a.ts', 'Blocked', 1000);

      writeTestJsonl('run-001-earlier', eventsA);
      writeTestJsonl('run-002-latest', eventsB);

      await runDiff(['--last', '--dir', TEST_BASE_DIR]);
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

      writeTestJsonl('run-a', origEvents);
      writeTestJsonl('run-b', replayEvents);

      await runDiff(['run-a', 'run-b', '--dir', TEST_BASE_DIR]);
      expect(stderrOutput).toContain('MISSING');
      expect(stderrOutput).toContain('Only in Session A');
    });

    it('reports extra actions in terminal output', async () => {
      const origEvents = createAllowedActionEvents('file.write', 'a.ts', 1000);
      const replayEvents = [
        ...createAllowedActionEvents('file.write', 'a.ts', 1000),
        ...createAllowedActionEvents('file.write', 'b.ts', 2000),
      ];

      writeTestJsonl('run-a', origEvents);
      writeTestJsonl('run-b', replayEvents);

      await runDiff(['run-a', 'run-b', '--dir', TEST_BASE_DIR]);
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

      writeTestJsonl('run-a', origEvents);
      writeTestJsonl('run-b', replayEvents);

      await runDiff(['run-a', 'run-b', '--dir', TEST_BASE_DIR]);
      expect(stderrOutput).toContain('Summary Differences');
    });
  });

  // ── Escalation Level Comparison ──

  describe('escalation level comparison', () => {
    it('shows escalation level changes between sessions', async () => {
      const origEvents = createAllowedActionEvents('file.write', 'a.ts', 1000);
      const replayEvents = [
        testEvent('ActionRequested', { actionType: 'file.write', target: 'a.ts', agentId: 'test' }, 1000),
        testEvent('ActionEscalated', { actionType: 'file.write', target: 'a.ts', escalationLevel: 'ELEVATED' }, 1001),
        testEvent('ActionAllowed', { actionType: 'file.write', target: 'a.ts', reason: 'Allowed after escalation' }, 1002),
        testEvent('ActionExecuted', { actionType: 'file.write', target: 'a.ts', result: 'success' }, 1003),
      ];

      writeTestJsonl('run-a', origEvents);
      writeTestJsonl('run-b', replayEvents);

      await runDiff(['run-a', 'run-b', '--dir', TEST_BASE_DIR]);
      expect(stderrOutput).toContain('Escalation Levels');
      expect(stderrOutput).toContain('NORMAL');
      expect(stderrOutput).toContain('ELEVATED');
    });

    it('does not show escalation section when levels are the same', async () => {
      const events = createAllowedActionEvents('file.write', 'a.ts', 1000);
      writeTestJsonl('run-a', events);
      writeTestJsonl('run-b', events);

      await runDiff(['run-a', 'run-b', '--dir', TEST_BASE_DIR]);
      expect(stderrOutput).not.toContain('Escalation Levels');
    });
  });

  // ── Invariant Violation Highlighting ──

  describe('invariant violation highlighting', () => {
    it('shows invariant violations that differ between sessions', async () => {
      const origEvents = createAllowedActionEvents('file.write', 'a.ts', 1000);
      const replayEvents = [
        testEvent('ActionRequested', { actionType: 'file.write', target: 'a.ts', agentId: 'test' }, 1000),
        testEvent('InvariantViolation', { invariant: 'secret-exposure', action: 'file.write', reason: 'Secrets detected' }, 1001),
        testEvent('ActionDenied', { actionType: 'file.write', target: 'a.ts', reason: 'Invariant violation' }, 1002),
      ];

      writeTestJsonl('run-a', origEvents);
      writeTestJsonl('run-b', replayEvents);

      await runDiff(['run-a', 'run-b', '--dir', TEST_BASE_DIR]);
      expect(stderrOutput).toContain('Invariant Violations');
      expect(stderrOutput).toContain('secret-exposure');
    });

    it('shows per-action governance details for divergent actions', async () => {
      const origEvents = createAllowedActionEvents('file.write', 'a.ts', 1000);
      const replayEvents = [
        testEvent('ActionRequested', { actionType: 'file.write', target: 'a.ts', agentId: 'test' }, 1000),
        testEvent('InvariantViolation', { invariant: 'blast-radius', action: 'file.write', reason: 'Too many files' }, 1001),
        testEvent('ActionDenied', { actionType: 'file.write', target: 'a.ts', reason: 'blast-radius violation' }, 1002),
      ];

      writeTestJsonl('run-a', origEvents);
      writeTestJsonl('run-b', replayEvents);

      await runDiff(['run-a', 'run-b', '--dir', TEST_BASE_DIR]);
      expect(stderrOutput).toContain('violation: blast-radius');
    });
  });

  // ── Enriched JSON Output ──

  describe('enriched JSON output', () => {
    it('includes escalation metadata in JSON output', async () => {
      const origEvents = createAllowedActionEvents('file.write', 'a.ts', 1000);
      const replayEvents = [
        testEvent('ActionRequested', { actionType: 'file.write', target: 'a.ts', agentId: 'test' }, 1000),
        testEvent('ActionEscalated', { actionType: 'file.write', target: 'a.ts', escalationLevel: 'HIGH' }, 1001),
        testEvent('ActionAllowed', { actionType: 'file.write', target: 'a.ts', reason: 'Allowed' }, 1002),
        testEvent('ActionExecuted', { actionType: 'file.write', target: 'a.ts', result: 'success' }, 1003),
      ];

      writeTestJsonl('run-a', origEvents);
      writeTestJsonl('run-b', replayEvents);

      await runDiff(['run-a', 'run-b', '--json', '--dir', TEST_BASE_DIR]);
      const parsed = JSON.parse(stdoutOutput);
      expect(parsed.escalation).toBeDefined();
      expect(parsed.escalation.sessionA).toBe('NORMAL');
      expect(parsed.escalation.sessionB).toBe('HIGH');
      expect(parsed.escalation.changed).toBe(true);
    });

    it('includes invariant violations in JSON output', async () => {
      const origEvents = createAllowedActionEvents('file.write', 'a.ts', 1000);
      const replayEvents = [
        testEvent('ActionRequested', { actionType: 'file.write', target: 'a.ts', agentId: 'test' }, 1000),
        testEvent('InvariantViolation', { invariant: 'no-force-push', reason: 'Force push detected' }, 1001),
        testEvent('ActionDenied', { actionType: 'file.write', target: 'a.ts', reason: 'Violation' }, 1002),
      ];

      writeTestJsonl('run-a', origEvents);
      writeTestJsonl('run-b', replayEvents);

      await runDiff(['run-a', 'run-b', '--json', '--dir', TEST_BASE_DIR]);
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
