// Tests for the replay comparator — verifies action-by-action diffing,
// missing/extra detection, summary comparison, and report formatting.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  compareReplaySessions,
  compareRunIds,
  compareSessionWithEvents,
  formatComparisonReport,
} from '@red-codes/kernel';
import { buildReplaySession } from '@red-codes/kernel';
import type { DomainEvent } from '@red-codes/core';
import { resetEventCounter } from '@red-codes/events';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const TEST_BASE_DIR = join('.agentguard-test-replay', 'comparator-test');
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

/** Create a minimal DomainEvent for testing. */
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

/** Create a full allowed action lifecycle. */
function createAllowedActionEvents(
  actionType: string,
  target: string,
  baseTimestamp: number
): DomainEvent[] {
  return [
    testEvent(
      'ActionRequested',
      { actionType, target, justification: 'test action', agentId: 'test-agent' },
      baseTimestamp
    ),
    testEvent(
      'ActionAllowed',
      { actionType, target, capability: 'default-allow', reason: 'No matching deny rule' },
      baseTimestamp + 1
    ),
    testEvent(
      'ActionExecuted',
      { actionType, target, result: 'success', duration: 10 },
      baseTimestamp + 2
    ),
    testEvent(
      'DecisionRecorded',
      {
        recordId: `rec_${baseTimestamp}`,
        outcome: 'allow',
        actionType,
        target,
        reason: 'No matching deny rule',
      },
      baseTimestamp + 3
    ),
  ];
}

/** Create a denied action lifecycle. */
function createDeniedActionEvents(
  actionType: string,
  target: string,
  reason: string,
  baseTimestamp: number
): DomainEvent[] {
  return [
    testEvent(
      'ActionRequested',
      { actionType, target, justification: 'test action', agentId: 'test-agent' },
      baseTimestamp
    ),
    testEvent(
      'PolicyDenied',
      { policy: 'test-policy', action: actionType, reason },
      baseTimestamp + 1
    ),
    testEvent('ActionDenied', { actionType, target, reason }, baseTimestamp + 2),
    testEvent(
      'DecisionRecorded',
      { recordId: `rec_${baseTimestamp}`, outcome: 'deny', actionType, target, reason },
      baseTimestamp + 3
    ),
  ];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('replay-comparator', () => {
  beforeEach(() => {
    resetEventCounter();
    cleanTestDir();
    ensureTestDir();
  });

  afterEach(() => {
    cleanTestDir();
  });

  // ── Identical Sessions ──

  describe('identical sessions', () => {
    it('reports identical when both sessions have the same actions', () => {
      const events = [
        ...createAllowedActionEvents('file.write', 'src/a.ts', 1000),
        ...createAllowedActionEvents('file.read', 'src/b.ts', 2000),
      ];

      const original = buildReplaySession('run-original', events);
      const replayed = buildReplaySession('run-replay', events);
      const report = compareReplaySessions(original, replayed);

      expect(report.identical).toBe(true);
      expect(report.matches).toBe(2);
      expect(report.divergences).toBe(0);
      expect(report.missing).toBe(0);
      expect(report.extra).toBe(0);
      expect(report.totalComparisons).toBe(2);
    });

    it('reports identical for empty sessions', () => {
      const original = buildReplaySession('run-a', []);
      const replayed = buildReplaySession('run-b', []);
      const report = compareReplaySessions(original, replayed);

      expect(report.identical).toBe(true);
      expect(report.totalComparisons).toBe(0);
    });
  });

  // ── Divergent Decisions ──

  describe('divergent decisions', () => {
    it('detects when an allowed action becomes denied', () => {
      const origEvents = createAllowedActionEvents('git.push', 'main', 1000);
      const replayEvents = createDeniedActionEvents('git.push', 'main', 'Protected branch', 1000);

      const original = buildReplaySession('run-original', origEvents);
      const replayed = buildReplaySession('run-replay', replayEvents);
      const report = compareReplaySessions(original, replayed);

      expect(report.identical).toBe(false);
      expect(report.divergences).toBe(1);
      expect(report.matches).toBe(0);

      const comp = report.comparisons[0];
      expect(comp.status).toBe('divergent');
      const allowedDiff = comp.differences.find((d) => d.field === 'allowed');
      expect(allowedDiff).toBeDefined();
      expect(allowedDiff!.original).toBe(true);
      expect(allowedDiff!.replayed).toBe(false);
    });

    it('detects when a denied action becomes allowed', () => {
      const origEvents = createDeniedActionEvents(
        'file.delete',
        'config.ts',
        'Protected path',
        1000
      );
      const replayEvents = createAllowedActionEvents('file.delete', 'config.ts', 1000);

      const original = buildReplaySession('run-original', origEvents);
      const replayed = buildReplaySession('run-replay', replayEvents);
      const report = compareReplaySessions(original, replayed);

      expect(report.identical).toBe(false);
      expect(report.divergences).toBe(1);

      const comp = report.comparisons[0];
      expect(comp.differences.some((d) => d.field === 'allowed')).toBe(true);
      expect(comp.differences.some((d) => d.field === 'executed')).toBe(true);
    });

    it('detects governance event count changes', () => {
      // Original has a PolicyDenied governance event
      const origEvents = createDeniedActionEvents('git.push', 'main', 'Blocked', 1000);

      // Replayed: same denial but with extra InvariantViolation
      const replayEvents = [
        testEvent(
          'ActionRequested',
          { actionType: 'git.push', target: 'main', justification: 'test' },
          1000
        ),
        testEvent(
          'PolicyDenied',
          { policy: 'test-policy', action: 'git.push', reason: 'Blocked' },
          1001
        ),
        testEvent(
          'InvariantViolation',
          { invariant: 'protected-branches', expected: 'not main', actual: 'main' },
          1002
        ),
        testEvent(
          'ActionDenied',
          { actionType: 'git.push', target: 'main', reason: 'Blocked' },
          1003
        ),
      ];

      const original = buildReplaySession('run-original', origEvents);
      const replayed = buildReplaySession('run-replay', replayEvents);
      const report = compareReplaySessions(original, replayed);

      // Both denied, but governance event counts differ
      const comp = report.comparisons[0];
      const govDiff = comp.differences.find((d) => d.field === 'governanceEventCount');
      expect(govDiff).toBeDefined();
      expect(govDiff!.original).toBe(1);
      expect(govDiff!.replayed).toBe(2);
    });

    it('detects multiple divergences in a mixed session', () => {
      const origEvents = [
        ...createAllowedActionEvents('file.write', 'a.ts', 1000),
        ...createAllowedActionEvents('git.push', 'main', 2000),
        ...createDeniedActionEvents('infra.destroy', 'prod', 'Blocked', 3000),
      ];

      const replayEvents = [
        ...createAllowedActionEvents('file.write', 'a.ts', 1000), // same
        ...createDeniedActionEvents('git.push', 'main', 'New policy', 2000), // changed
        ...createAllowedActionEvents('infra.destroy', 'prod', 3000), // changed
      ];

      const original = buildReplaySession('run-original', origEvents);
      const replayed = buildReplaySession('run-replay', replayEvents);
      const report = compareReplaySessions(original, replayed);

      expect(report.matches).toBe(1);
      expect(report.divergences).toBe(2);
    });
  });

  // ── Missing and Extra Actions ──

  describe('missing and extra actions', () => {
    it('detects missing actions when replayed has fewer', () => {
      const origEvents = [
        ...createAllowedActionEvents('file.write', 'a.ts', 1000),
        ...createAllowedActionEvents('file.write', 'b.ts', 2000),
        ...createAllowedActionEvents('file.write', 'c.ts', 3000),
      ];

      const replayEvents = [...createAllowedActionEvents('file.write', 'a.ts', 1000)];

      const original = buildReplaySession('run-original', origEvents);
      const replayed = buildReplaySession('run-replay', replayEvents);
      const report = compareReplaySessions(original, replayed);

      expect(report.matches).toBe(1);
      expect(report.missing).toBe(2);
      expect(report.extra).toBe(0);
      expect(report.totalComparisons).toBe(3);

      const missingComps = report.comparisons.filter((c) => c.status === 'missing');
      expect(missingComps).toHaveLength(2);
      expect(missingComps[0].original).not.toBeNull();
      expect(missingComps[0].replayed).toBeNull();
    });

    it('detects extra actions when replayed has more', () => {
      const origEvents = [...createAllowedActionEvents('file.write', 'a.ts', 1000)];

      const replayEvents = [
        ...createAllowedActionEvents('file.write', 'a.ts', 1000),
        ...createAllowedActionEvents('file.write', 'b.ts', 2000),
      ];

      const original = buildReplaySession('run-original', origEvents);
      const replayed = buildReplaySession('run-replay', replayEvents);
      const report = compareReplaySessions(original, replayed);

      expect(report.matches).toBe(1);
      expect(report.extra).toBe(1);
      expect(report.missing).toBe(0);

      const extraComps = report.comparisons.filter((c) => c.status === 'extra');
      expect(extraComps).toHaveLength(1);
      expect(extraComps[0].original).toBeNull();
      expect(extraComps[0].replayed).not.toBeNull();
    });
  });

  // ── Summary Diff ──

  describe('summary diff', () => {
    it('reports summary differences between sessions', () => {
      const origEvents = [
        ...createAllowedActionEvents('file.write', 'a.ts', 1000),
        ...createAllowedActionEvents('file.write', 'b.ts', 2000),
      ];

      const replayEvents = [
        ...createAllowedActionEvents('file.write', 'a.ts', 1000),
        ...createDeniedActionEvents('file.write', 'b.ts', 'New deny rule', 2000),
      ];

      const original = buildReplaySession('run-original', origEvents);
      const replayed = buildReplaySession('run-replay', replayEvents);
      const report = compareReplaySessions(original, replayed);

      expect(report.summaryDiff.differences.length).toBeGreaterThan(0);
      const allowedDiff = report.summaryDiff.differences.find((d) => d.field === 'allowed');
      expect(allowedDiff).toBeDefined();
      expect(allowedDiff!.original).toBe(2);
      expect(allowedDiff!.replayed).toBe(1);
    });

    it('reports no summary differences for identical sessions', () => {
      const events = createAllowedActionEvents('file.write', 'a.ts', 1000);

      const original = buildReplaySession('run-a', events);
      const replayed = buildReplaySession('run-b', events);
      const report = compareReplaySessions(original, replayed);

      expect(report.summaryDiff.differences).toHaveLength(0);
    });
  });

  // ── Run ID-based Comparison ──

  describe('compareRunIds', () => {
    it('loads and compares two sessions by run ID', () => {
      const origEvents = createAllowedActionEvents('file.write', 'a.ts', 1000);
      const replayEvents = createDeniedActionEvents('file.write', 'a.ts', 'Denied', 1000);

      writeTestJsonl('run-orig', origEvents);
      writeTestJsonl('run-replay', replayEvents);

      const report = compareRunIds('run-orig', 'run-replay', { baseDir: TEST_BASE_DIR });
      expect(report).not.toBeNull();
      expect(report!.originalRunId).toBe('run-orig');
      expect(report!.replayedRunId).toBe('run-replay');
      expect(report!.divergences).toBe(1);
    });

    it('returns null when original session does not exist', () => {
      writeTestJsonl('run-exists', createAllowedActionEvents('file.write', 'a.ts', 1000));

      const report = compareRunIds('run-missing', 'run-exists', { baseDir: TEST_BASE_DIR });
      expect(report).toBeNull();
    });

    it('returns null when replayed session does not exist', () => {
      writeTestJsonl('run-exists', createAllowedActionEvents('file.write', 'a.ts', 1000));

      const report = compareRunIds('run-exists', 'run-missing', { baseDir: TEST_BASE_DIR });
      expect(report).toBeNull();
    });
  });

  // ── In-memory Event Comparison ──

  describe('compareSessionWithEvents', () => {
    it('compares a loaded session against in-memory events', () => {
      const origEvents = createAllowedActionEvents('file.write', 'a.ts', 1000);
      const original = buildReplaySession('run-original', origEvents);

      const replayEvents = createDeniedActionEvents('file.write', 'a.ts', 'New policy', 1000);

      const report = compareSessionWithEvents(original, replayEvents);
      expect(report.originalRunId).toBe('run-original');
      expect(report.replayedRunId).toBe('run-original-replay');
      expect(report.divergences).toBe(1);
    });

    it('uses custom replay run ID when provided', () => {
      const origEvents = createAllowedActionEvents('file.write', 'a.ts', 1000);
      const original = buildReplaySession('run-original', origEvents);

      const report = compareSessionWithEvents(original, origEvents, 'custom-replay-id');
      expect(report.replayedRunId).toBe('custom-replay-id');
    });
  });

  // ── Report Formatting ──

  describe('formatComparisonReport', () => {
    it('formats an identical report', () => {
      const events = createAllowedActionEvents('file.write', 'a.ts', 1000);
      const original = buildReplaySession('run-a', events);
      const replayed = buildReplaySession('run-b', events);
      const report = compareReplaySessions(original, replayed);

      const formatted = formatComparisonReport(report);
      expect(formatted).toContain('IDENTICAL');
      expect(formatted).toContain('run-a');
      expect(formatted).toContain('run-b');
      expect(formatted).toContain('Matches:           1');
    });

    it('formats a divergent report with action details', () => {
      const origEvents = createAllowedActionEvents('git.push', 'main', 1000);
      const replayEvents = createDeniedActionEvents('git.push', 'main', 'Protected', 1000);

      const original = buildReplaySession('run-orig', origEvents);
      const replayed = buildReplaySession('run-replay', replayEvents);
      const report = compareReplaySessions(original, replayed);

      const formatted = formatComparisonReport(report);
      expect(formatted).toContain('DIVERGENT');
      expect(formatted).toContain('Divergent Actions:');
      expect(formatted).toContain('git.push');
      expect(formatted).toContain('allowed');
    });

    it('formats missing and extra actions', () => {
      const origEvents = [
        ...createAllowedActionEvents('file.write', 'a.ts', 1000),
        ...createAllowedActionEvents('file.write', 'b.ts', 2000),
      ];
      const replayEvents = [
        ...createAllowedActionEvents('file.write', 'a.ts', 1000),
        ...createAllowedActionEvents('file.write', 'c.ts', 2000),
        ...createAllowedActionEvents('file.write', 'd.ts', 3000),
      ];

      const original = buildReplaySession('run-orig', origEvents);
      const replayed = buildReplaySession('run-replay', replayEvents);
      const report = compareReplaySessions(original, replayed);

      const formatted = formatComparisonReport(report);
      expect(formatted).toContain('run-orig');
      expect(formatted).toContain('run-replay');
    });

    it('formats summary differences', () => {
      const origEvents = [
        ...createAllowedActionEvents('file.write', 'a.ts', 1000),
        ...createAllowedActionEvents('file.write', 'b.ts', 2000),
      ];
      const replayEvents = [
        ...createAllowedActionEvents('file.write', 'a.ts', 1000),
        ...createDeniedActionEvents('file.write', 'b.ts', 'Denied', 2000),
      ];

      const original = buildReplaySession('run-orig', origEvents);
      const replayed = buildReplaySession('run-replay', replayEvents);
      const report = compareReplaySessions(original, replayed);

      const formatted = formatComparisonReport(report);
      expect(formatted).toContain('Summary Differences:');
    });
  });

  // ── Edge Cases ──

  describe('edge cases', () => {
    it('handles comparison when both sessions are empty', () => {
      const original = buildReplaySession('empty-a', []);
      const replayed = buildReplaySession('empty-b', []);
      const report = compareReplaySessions(original, replayed);

      expect(report.identical).toBe(true);
      expect(report.comparisons).toHaveLength(0);
    });

    it('handles comparison of original empty vs replayed with actions', () => {
      const original = buildReplaySession('empty', []);
      const replayEvents = createAllowedActionEvents('file.write', 'a.ts', 1000);
      const replayed = buildReplaySession('has-actions', replayEvents);
      const report = compareReplaySessions(original, replayed);

      expect(report.identical).toBe(false);
      expect(report.extra).toBe(1);
      expect(report.missing).toBe(0);
    });

    it('handles comparison of original with actions vs replayed empty', () => {
      const origEvents = createAllowedActionEvents('file.write', 'a.ts', 1000);
      const original = buildReplaySession('has-actions', origEvents);
      const replayed = buildReplaySession('empty', []);
      const report = compareReplaySessions(original, replayed);

      expect(report.identical).toBe(false);
      expect(report.missing).toBe(1);
      expect(report.extra).toBe(0);
    });

    it('detects decision reason changes even when outcome is the same', () => {
      // Both denied, but for different reasons
      const origEvents = createDeniedActionEvents('git.push', 'main', 'Protected branch', 1000);
      const replayEvents = createDeniedActionEvents('git.push', 'main', 'No permission', 1000);

      const original = buildReplaySession('run-original', origEvents);
      const replayed = buildReplaySession('run-replay', replayEvents);
      const report = compareReplaySessions(original, replayed);

      // Still divergent because the reason changed
      expect(report.divergences).toBe(1);
      const comp = report.comparisons[0];
      const reasonDiff = comp.differences.find((d) => d.field === 'decisionReason');
      expect(reasonDiff).toBeDefined();
      expect(reasonDiff!.original).toBe('Protected branch');
      expect(reasonDiff!.replayed).toBe('No permission');
    });

    it('preserves run IDs in the report', () => {
      const events = createAllowedActionEvents('file.write', 'a.ts', 1000);
      const original = buildReplaySession('session-alpha', events);
      const replayed = buildReplaySession('session-beta', events);
      const report = compareReplaySessions(original, replayed);

      expect(report.originalRunId).toBe('session-alpha');
      expect(report.replayedRunId).toBe('session-beta');
    });
  });
});
