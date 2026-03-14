// Tests for the replay engine — verifies event loading, action grouping,
// session reconstruction, and summary statistics.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  loadEventsFromJsonl,
  resolveEventFilePath,
  listRunIds,
  loadReplaySession,
  buildReplaySession,
  iterateActions,
  filterActions,
  getLatestRunId,
  getEventKindCounts,
} from '@red-codes/kernel';
import type { ReplayAction } from '@red-codes/kernel';
import type { DomainEvent } from '@red-codes/core';
import { resetEventCounter } from '@red-codes/events';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const TEST_BASE_DIR = join('.agentguard-test-replay', 'replay-engine-test');
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

/** Create a minimal DomainEvent for testing */
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

/** Create a full action lifecycle (requested → allowed → executed → decision recorded) */
function createAllowedActionEvents(
  actionType: string,
  target: string,
  baseTimestamp: number
): DomainEvent[] {
  return [
    testEvent(
      'ActionRequested',
      {
        actionType,
        target,
        justification: 'test action',
        agentId: 'test-agent',
        metadata: { runId: 'test-run' },
      },
      baseTimestamp
    ),
    testEvent(
      'ActionAllowed',
      {
        actionType,
        target,
        capability: 'default-allow',
        reason: 'No matching deny rule',
      },
      baseTimestamp + 1
    ),
    testEvent(
      'ActionExecuted',
      {
        actionType,
        target,
        result: 'success',
        duration: 10,
      },
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

/** Create a denied action lifecycle */
function createDeniedActionEvents(
  actionType: string,
  target: string,
  reason: string,
  baseTimestamp: number
): DomainEvent[] {
  return [
    testEvent(
      'ActionRequested',
      {
        actionType,
        target,
        justification: 'test action',
        agentId: 'test-agent',
      },
      baseTimestamp
    ),
    testEvent(
      'PolicyDenied',
      {
        policy: 'test-policy',
        action: actionType,
        reason,
      },
      baseTimestamp + 1
    ),
    testEvent(
      'ActionDenied',
      {
        actionType,
        target,
        reason,
      },
      baseTimestamp + 2
    ),
    testEvent(
      'DecisionRecorded',
      {
        recordId: `rec_${baseTimestamp}`,
        outcome: 'deny',
        actionType,
        target,
        reason,
      },
      baseTimestamp + 3
    ),
  ];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('replay-engine', () => {
  beforeEach(() => {
    resetEventCounter();
    cleanTestDir();
    ensureTestDir();
  });

  afterEach(() => {
    cleanTestDir();
  });

  // ── JSONL Loading ──

  describe('loadEventsFromJsonl', () => {
    it('loads events from a valid JSONL file', () => {
      const events = [
        testEvent(
          'ActionRequested',
          { actionType: 'file.write', target: 'foo.ts', justification: 'test' },
          1000
        ),
        testEvent(
          'ActionAllowed',
          { actionType: 'file.write', target: 'foo.ts', capability: 'default' },
          1001
        ),
      ];
      const filePath = join(TEST_EVENTS_DIR, 'test-run.jsonl');
      writeFileSync(filePath, events.map((e) => JSON.stringify(e)).join('\n') + '\n');

      const loaded = loadEventsFromJsonl(filePath);
      expect(loaded).toHaveLength(2);
      expect(loaded[0].kind).toBe('ActionRequested');
      expect(loaded[1].kind).toBe('ActionAllowed');
    });

    it('returns empty array for non-existent file', () => {
      const loaded = loadEventsFromJsonl('/non/existent/path.jsonl');
      expect(loaded).toHaveLength(0);
    });

    it('skips malformed lines', () => {
      const filePath = join(TEST_EVENTS_DIR, 'bad-lines.jsonl');
      const content = [
        JSON.stringify(
          testEvent('ActionRequested', {
            actionType: 'file.write',
            target: 'a',
            justification: 'test',
          })
        ),
        'this is not valid json',
        '',
        JSON.stringify(
          testEvent('ActionAllowed', {
            actionType: 'file.write',
            target: 'a',
            capability: 'default',
          })
        ),
      ].join('\n');
      writeFileSync(filePath, content);

      const loaded = loadEventsFromJsonl(filePath);
      expect(loaded).toHaveLength(2);
    });
  });

  // ── Path Resolution ──

  describe('resolveEventFilePath', () => {
    it('resolves path with default base dir', () => {
      const path = resolveEventFilePath('run_123');
      expect(path).toBe(join('.agentguard', 'events', 'run_123.jsonl'));
    });

    it('resolves path with custom base dir', () => {
      const path = resolveEventFilePath('run_123', '/custom/dir');
      expect(path).toBe(join('/custom/dir', 'events', 'run_123.jsonl'));
    });
  });

  // ── Run ID Listing ──

  describe('listRunIds', () => {
    it('lists available run IDs sorted in reverse', () => {
      writeTestJsonl('run_001', [
        testEvent('ActionRequested', { actionType: 'a', target: 'b', justification: 'c' }),
      ]);
      writeTestJsonl('run_003', [
        testEvent('ActionRequested', { actionType: 'a', target: 'b', justification: 'c' }),
      ]);
      writeTestJsonl('run_002', [
        testEvent('ActionRequested', { actionType: 'a', target: 'b', justification: 'c' }),
      ]);

      const ids = listRunIds(TEST_BASE_DIR);
      expect(ids).toEqual(['run_003', 'run_002', 'run_001']);
    });

    it('returns empty array when no runs exist', () => {
      const ids = listRunIds(TEST_BASE_DIR);
      expect(ids).toEqual([]);
    });

    it('returns empty array for non-existent directory', () => {
      const ids = listRunIds('/non/existent');
      expect(ids).toEqual([]);
    });
  });

  // ── getLatestRunId ──

  describe('getLatestRunId', () => {
    it('returns the most recent run ID', () => {
      writeTestJsonl('run_aaa', [
        testEvent('ActionRequested', { actionType: 'a', target: 'b', justification: 'c' }),
      ]);
      writeTestJsonl('run_zzz', [
        testEvent('ActionRequested', { actionType: 'a', target: 'b', justification: 'c' }),
      ]);

      const latest = getLatestRunId(TEST_BASE_DIR);
      expect(latest).toBe('run_zzz');
    });

    it('returns null when no runs exist', () => {
      const latest = getLatestRunId(TEST_BASE_DIR);
      expect(latest).toBeNull();
    });
  });

  // ── Session Loading ──

  describe('loadReplaySession', () => {
    it('loads a session from JSONL events', () => {
      const events = [
        ...createAllowedActionEvents('file.write', 'src/app.ts', 1000),
        ...createDeniedActionEvents('git.push', 'main', 'Protected branch', 2000),
      ];
      writeTestJsonl('run_test', events);

      const session = loadReplaySession('run_test', { baseDir: TEST_BASE_DIR });
      expect(session).not.toBeNull();
      expect(session!.runId).toBe('run_test');
      expect(session!.events).toHaveLength(8);
      expect(session!.actions).toHaveLength(2);
    });

    it('returns null for non-existent run', () => {
      const session = loadReplaySession('run_nonexistent', { baseDir: TEST_BASE_DIR });
      expect(session).toBeNull();
    });

    it('returns null for empty JSONL file', () => {
      ensureTestDir();
      writeFileSync(join(TEST_EVENTS_DIR, 'run_empty.jsonl'), '');

      const session = loadReplaySession('run_empty', { baseDir: TEST_BASE_DIR });
      expect(session).toBeNull();
    });
  });

  // ── Session Building ──

  describe('buildReplaySession', () => {
    it('groups events into action encounters', () => {
      const events = [
        ...createAllowedActionEvents('file.write', 'src/a.ts', 1000),
        ...createAllowedActionEvents('file.write', 'src/b.ts', 2000),
      ];

      const session = buildReplaySession('test-run', events);
      expect(session.actions).toHaveLength(2);
      expect(session.actions[0].actionType).toBe('file.write');
      expect(session.actions[0].target).toBe('src/a.ts');
      expect(session.actions[1].target).toBe('src/b.ts');
    });

    it('marks allowed actions correctly', () => {
      const events = createAllowedActionEvents('file.write', 'test.ts', 1000);
      const session = buildReplaySession('test-run', events);

      expect(session.actions).toHaveLength(1);
      const action = session.actions[0];
      expect(action.allowed).toBe(true);
      expect(action.executed).toBe(true);
      expect(action.succeeded).toBe(true);
    });

    it('marks denied actions correctly', () => {
      const events = createDeniedActionEvents('git.push', 'main', 'Protected branch', 1000);
      const session = buildReplaySession('test-run', events);

      expect(session.actions).toHaveLength(1);
      const action = session.actions[0];
      expect(action.allowed).toBe(false);
      expect(action.executed).toBe(false);
      expect(action.succeeded).toBe(false);
    });

    it('attaches governance events to actions', () => {
      const events = createDeniedActionEvents('git.push', 'main', 'Protected branch', 1000);
      const session = buildReplaySession('test-run', events);

      const action = session.actions[0];
      expect(action.governanceEvents).toHaveLength(1);
      expect(action.governanceEvents[0].kind).toBe('PolicyDenied');
    });

    it('attaches simulation events to actions', () => {
      const events = [
        testEvent(
          'ActionRequested',
          {
            actionType: 'file.write',
            target: 'big-change.ts',
            justification: 'test',
          },
          1000
        ),
        testEvent(
          'SimulationCompleted',
          {
            simulatorId: 'filesystem',
            riskLevel: 'medium',
            blastRadius: 15,
          },
          1001
        ),
        testEvent(
          'ActionAllowed',
          {
            actionType: 'file.write',
            target: 'big-change.ts',
            capability: 'default',
          },
          1002
        ),
        testEvent(
          'ActionExecuted',
          {
            actionType: 'file.write',
            target: 'big-change.ts',
            result: 'success',
          },
          1003
        ),
      ];

      const session = buildReplaySession('test-run', events);
      const action = session.actions[0];
      expect(action.simulationEvent).not.toBeNull();
      expect(action.simulationEvent!.riskLevel).toBe('medium');
    });

    it('attaches escalation events to actions', () => {
      const events = [
        testEvent(
          'ActionRequested',
          {
            actionType: 'infra.destroy',
            target: 'production',
            justification: 'test',
          },
          1000
        ),
        testEvent(
          'ActionEscalated',
          {
            actionType: 'infra.destroy',
            target: 'production',
            reason: 'Destructive infrastructure action',
          },
          1001
        ),
        testEvent(
          'ActionDenied',
          {
            actionType: 'infra.destroy',
            target: 'production',
            reason: 'Requires human approval',
          },
          1002
        ),
      ];

      const session = buildReplaySession('test-run', events);
      const action = session.actions[0];
      expect(action.escalationEvent).not.toBeNull();
      expect(action.escalationEvent!.kind).toBe('ActionEscalated');
    });

    it('detects RunStarted and RunEnded events', () => {
      const events = [
        testEvent('RunStarted', { runId: 'test-run' }, 1000),
        ...createAllowedActionEvents('file.read', 'config.ts', 2000),
        testEvent('RunEnded', { runId: 'test-run', result: 'completed' }, 3000),
      ];

      const session = buildReplaySession('test-run', events);
      expect(session.startEvent).not.toBeNull();
      expect(session.startEvent!.kind).toBe('RunStarted');
      expect(session.endEvent).not.toBeNull();
      expect(session.endEvent!.kind).toBe('RunEnded');
    });

    it('sorts events by timestamp', () => {
      // Provide events out of order
      const events = [
        testEvent(
          'ActionAllowed',
          { actionType: 'file.write', target: 'a', capability: 'default' },
          2000
        ),
        testEvent(
          'ActionRequested',
          { actionType: 'file.write', target: 'a', justification: 'test' },
          1000
        ),
        testEvent(
          'ActionExecuted',
          { actionType: 'file.write', target: 'a', result: 'success' },
          3000
        ),
      ];

      const session = buildReplaySession('test-run', events);
      expect(session.events[0].timestamp).toBe(1000);
      expect(session.events[1].timestamp).toBe(2000);
      expect(session.events[2].timestamp).toBe(3000);
    });

    it('handles empty event array', () => {
      const session = buildReplaySession('empty', []);
      expect(session.actions).toHaveLength(0);
      expect(session.summary.totalActions).toBe(0);
    });

    it('skips orphan events without ActionRequested', () => {
      const events = [
        testEvent(
          'ActionAllowed',
          { actionType: 'file.write', target: 'a', capability: 'default' },
          1000
        ),
        testEvent(
          'ActionExecuted',
          { actionType: 'file.write', target: 'a', result: 'success' },
          2000
        ),
      ];

      const session = buildReplaySession('test-run', events);
      expect(session.actions).toHaveLength(0);
    });
  });

  // ── Summary Statistics ──

  describe('summary statistics', () => {
    it('computes correct totals for mixed sessions', () => {
      const events = [
        ...createAllowedActionEvents('file.write', 'a.ts', 1000),
        ...createAllowedActionEvents('file.write', 'b.ts', 2000),
        ...createDeniedActionEvents('git.push', 'main', 'Protected branch', 3000),
        ...createAllowedActionEvents('test.run', 'suite', 4000),
      ];

      const session = buildReplaySession('test', events);
      const s = session.summary;
      expect(s.totalActions).toBe(4);
      expect(s.allowed).toBe(3);
      expect(s.denied).toBe(1);
      expect(s.executed).toBe(3);
      expect(s.failed).toBe(0);
      expect(s.violations).toBe(1); // PolicyDenied from the denied action
    });

    it('counts action types', () => {
      const events = [
        ...createAllowedActionEvents('file.write', 'a.ts', 1000),
        ...createAllowedActionEvents('file.write', 'b.ts', 2000),
        ...createAllowedActionEvents('git.push', 'origin', 3000),
      ];

      const session = buildReplaySession('test', events);
      expect(session.summary.actionTypes['file.write']).toBe(2);
      expect(session.summary.actionTypes['git.push']).toBe(1);
    });

    it('collects denial reasons', () => {
      const events = [
        ...createDeniedActionEvents('git.push', 'main', 'Protected branch', 1000),
        ...createDeniedActionEvents('infra.destroy', 'prod', 'Destructive action blocked', 2000),
      ];

      const session = buildReplaySession('test', events);
      expect(session.summary.denialReasons).toHaveLength(2);
      expect(session.summary.denialReasons).toContain('Protected branch');
      expect(session.summary.denialReasons).toContain('Destructive action blocked');
    });

    it('calculates duration from event timestamps', () => {
      const events = [
        ...createAllowedActionEvents('file.write', 'a.ts', 1000),
        ...createAllowedActionEvents('file.write', 'b.ts', 5000),
      ];

      const session = buildReplaySession('test', events);
      // Duration spans from first event (1000) to last event (5003)
      expect(session.summary.durationMs).toBe(5003 - 1000);
    });
  });

  // ── Iteration ──

  describe('iterateActions', () => {
    it('yields actions in order', () => {
      const events = [
        ...createAllowedActionEvents('file.write', 'a.ts', 1000),
        ...createDeniedActionEvents('git.push', 'main', 'Denied', 2000),
      ];

      const session = buildReplaySession('test', events);
      const actions: ReplayAction[] = [];
      for (const action of iterateActions(session)) {
        actions.push(action);
      }

      expect(actions).toHaveLength(2);
      expect(actions[0].index).toBe(0);
      expect(actions[0].actionType).toBe('file.write');
      expect(actions[1].index).toBe(1);
      expect(actions[1].actionType).toBe('git.push');
    });

    it('yields nothing for empty session', () => {
      const session = buildReplaySession('empty', []);
      const actions: ReplayAction[] = [];
      for (const action of iterateActions(session)) {
        actions.push(action);
      }
      expect(actions).toHaveLength(0);
    });
  });

  // ── Filtering ──

  describe('filterActions', () => {
    it('filters actions by predicate', () => {
      const events = [
        ...createAllowedActionEvents('file.write', 'a.ts', 1000),
        ...createDeniedActionEvents('git.push', 'main', 'Denied', 2000),
        ...createAllowedActionEvents('file.read', 'b.ts', 3000),
      ];

      const session = buildReplaySession('test', events);
      const denied = filterActions(session, (a) => !a.allowed);

      expect(denied.actions).toHaveLength(1);
      expect(denied.actions[0].actionType).toBe('git.push');
      expect(denied.summary.totalActions).toBe(1);
      expect(denied.summary.denied).toBe(1);
    });

    it('preserves original events in filtered session', () => {
      const events = [
        ...createAllowedActionEvents('file.write', 'a.ts', 1000),
        ...createDeniedActionEvents('git.push', 'main', 'Denied', 2000),
      ];

      const session = buildReplaySession('test', events);
      const filtered = filterActions(session, (a) => a.allowed);

      // All events remain, only actions are filtered
      expect(filtered.events).toHaveLength(session.events.length);
      expect(filtered.actions).toHaveLength(1);
    });
  });

  // ── Event Kind Counts ──

  describe('getEventKindCounts', () => {
    it('returns frequency map of event kinds', () => {
      const events = [
        ...createAllowedActionEvents('file.write', 'a.ts', 1000),
        ...createDeniedActionEvents('git.push', 'main', 'Denied', 2000),
      ];

      const session = buildReplaySession('test', events);
      const counts = getEventKindCounts(session);

      expect(counts['ActionRequested']).toBe(2);
      expect(counts['ActionAllowed']).toBe(1);
      expect(counts['ActionDenied']).toBe(1);
      expect(counts['ActionExecuted']).toBe(1);
      expect(counts['PolicyDenied']).toBe(1);
      expect(counts['DecisionRecorded']).toBe(2);
    });
  });

  // ── Action lifecycle edge cases ──

  describe('edge cases', () => {
    it('handles action with failed execution', () => {
      const events = [
        testEvent(
          'ActionRequested',
          {
            actionType: 'shell.exec',
            target: 'rm -rf /',
            justification: 'test',
          },
          1000
        ),
        testEvent(
          'ActionAllowed',
          {
            actionType: 'shell.exec',
            target: 'rm -rf /',
            capability: 'default',
          },
          1001
        ),
        testEvent(
          'ActionFailed',
          {
            actionType: 'shell.exec',
            target: 'rm -rf /',
            error: 'Permission denied',
          },
          1002
        ),
      ];

      const session = buildReplaySession('test', events);
      const action = session.actions[0];
      expect(action.allowed).toBe(true);
      expect(action.executed).toBe(true);
      expect(action.succeeded).toBe(false);
      expect(session.summary.failed).toBe(1);
    });

    it('handles truncated action stream (only ActionRequested)', () => {
      const events = [
        testEvent(
          'ActionRequested',
          {
            actionType: 'file.write',
            target: 'a.ts',
            justification: 'test',
          },
          1000
        ),
      ];

      const session = buildReplaySession('test', events);
      expect(session.actions).toHaveLength(1);
      const action = session.actions[0];
      expect(action.decisionEvent).toBeNull();
      expect(action.executionEvent).toBeNull();
      expect(action.allowed).toBe(false); // No ActionAllowed found
    });

    it('handles multiple invariant violations in one action', () => {
      const events = [
        testEvent(
          'ActionRequested',
          {
            actionType: 'git.push',
            target: 'main',
            justification: 'deploy',
          },
          1000
        ),
        testEvent(
          'InvariantViolation',
          {
            invariant: 'protected-branches',
            expected: 'not main',
            actual: 'main',
          },
          1001
        ),
        testEvent(
          'BlastRadiusExceeded',
          {
            filesAffected: 100,
            limit: 50,
          },
          1002
        ),
        testEvent(
          'ActionDenied',
          {
            actionType: 'git.push',
            target: 'main',
            reason: 'Multiple violations',
          },
          1003
        ),
      ];

      const session = buildReplaySession('test', events);
      const action = session.actions[0];
      expect(action.governanceEvents).toHaveLength(2);
      expect(session.summary.violations).toBe(2);
    });
  });
});
