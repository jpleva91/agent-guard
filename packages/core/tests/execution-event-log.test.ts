import { describe, it, expect, beforeEach } from 'vitest';
import {
  createExecutionEvent,
  validateExecutionEvent,
  resetExecutionEventCounter,
  AGENT_EDIT_FILE,
  RUNTIME_EXCEPTION,
  TEST_SUITE_FAILED,
  BUILD_FAILED,
  DEPLOYMENT_FAILED,
  TESTS_SKIPPED,
  POLICY_VIOLATION_DETECTED,
  ALL_EXECUTION_EVENT_KINDS,
  FAILURE_KINDS,
  VIOLATION_KINDS,
  AGENT_ACTION_KINDS,
} from '@red-codes/core';
import { createExecutionEventLog } from '@red-codes/core';
import { buildCausalChain, scoreAgentRun, clusterFailures, mapToEncounter } from '@red-codes/core';

describe('execution-log/event-schema', () => {
  beforeEach(() => {
    resetExecutionEventCounter();
  });

  it('creates a valid execution event', () => {
    const event = createExecutionEvent(AGENT_EDIT_FILE, {
      actor: 'agent',
      source: 'cli',
      context: { file: 'auth.ts', agentRunId: 'run-1' },
      payload: { linesChanged: 42 },
    });

    expect(event.id).toMatch(/^xev_/);
    expect(event.kind).toBe(AGENT_EDIT_FILE);
    expect(event.actor).toBe('agent');
    expect(event.source).toBe('cli');
    expect(event.context.file).toBe('auth.ts');
    expect(event.payload.linesChanged).toBe(42);
    expect(event.fingerprint).toBeTruthy();
  });

  it('generates unique IDs', () => {
    const e1 = createExecutionEvent(AGENT_EDIT_FILE, {
      actor: 'agent',
      source: 'cli',
    });
    const e2 = createExecutionEvent(AGENT_EDIT_FILE, {
      actor: 'agent',
      source: 'cli',
    });
    expect(e1.id).not.toBe(e2.id);
  });

  it('generates deterministic fingerprints', () => {
    const opts = {
      actor: 'agent' as const,
      source: 'cli' as const,
      payload: { file: 'test.ts' },
      timestamp: 1000,
    };
    resetExecutionEventCounter();
    const e1 = createExecutionEvent(AGENT_EDIT_FILE, opts);
    resetExecutionEventCounter();
    const e2 = createExecutionEvent(AGENT_EDIT_FILE, opts);
    expect(e1.fingerprint).toBe(e2.fingerprint);
  });

  it('validates required fields', () => {
    const result = validateExecutionEvent({});
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('validates actor values', () => {
    const result = validateExecutionEvent({
      id: 'test',
      timestamp: 1000,
      actor: 'invalid',
      source: 'cli',
      kind: 'Test',
      context: {},
      payload: {},
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('actor'))).toBe(true);
  });

  it('validates source values', () => {
    const result = validateExecutionEvent({
      id: 'test',
      timestamp: 1000,
      actor: 'human',
      source: 'invalid',
      kind: 'Test',
      context: {},
      payload: {},
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('source'))).toBe(true);
  });

  it('includes causedBy when provided', () => {
    const event = createExecutionEvent(RUNTIME_EXCEPTION, {
      actor: 'system',
      source: 'runtime',
      payload: { message: 'null ref' },
      causedBy: 'xev_123_1',
    });
    expect(event.causedBy).toBe('xev_123_1');
  });

  it('defines all expected event kind sets', () => {
    expect(ALL_EXECUTION_EVENT_KINDS.size).toBeGreaterThan(20);
    expect(FAILURE_KINDS.size).toBeGreaterThan(0);
    expect(VIOLATION_KINDS.size).toBeGreaterThan(0);
    expect(AGENT_ACTION_KINDS.size).toBeGreaterThan(0);
  });
});

describe('execution-log/event-log', () => {
  beforeEach(() => {
    resetExecutionEventCounter();
  });

  it('creates an empty log', () => {
    const log = createExecutionEventLog();
    expect(log.count()).toBe(0);
    expect(log.replay()).toHaveLength(0);
  });

  it('appends and counts events', () => {
    const log = createExecutionEventLog();
    const event = createExecutionEvent(AGENT_EDIT_FILE, {
      actor: 'agent',
      source: 'cli',
    });
    log.append(event);
    expect(log.count()).toBe(1);
  });

  it('rejects invalid events', () => {
    const log = createExecutionEventLog();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => log.append({ kind: 'Fake' } as any)).toThrow();
  });

  it('queries by kind', () => {
    const log = createExecutionEventLog();
    log.append(createExecutionEvent(AGENT_EDIT_FILE, { actor: 'agent', source: 'cli' }));
    log.append(
      createExecutionEvent(RUNTIME_EXCEPTION, {
        actor: 'system',
        source: 'runtime',
        payload: { message: 'error' },
      })
    );
    log.append(createExecutionEvent(AGENT_EDIT_FILE, { actor: 'agent', source: 'cli' }));

    expect(log.query({ kind: AGENT_EDIT_FILE })).toHaveLength(2);
    expect(log.query({ kind: RUNTIME_EXCEPTION })).toHaveLength(1);
  });

  it('queries by actor', () => {
    const log = createExecutionEventLog();
    log.append(createExecutionEvent(AGENT_EDIT_FILE, { actor: 'agent', source: 'cli' }));
    log.append(
      createExecutionEvent(RUNTIME_EXCEPTION, {
        actor: 'system',
        source: 'runtime',
        payload: { message: 'err' },
      })
    );

    expect(log.query({ actor: 'agent' })).toHaveLength(1);
    expect(log.query({ actor: 'system' })).toHaveLength(1);
  });

  it('queries by agentRunId', () => {
    const log = createExecutionEventLog();
    log.append(
      createExecutionEvent(AGENT_EDIT_FILE, {
        actor: 'agent',
        source: 'cli',
        context: { agentRunId: 'run-1' },
      })
    );
    log.append(
      createExecutionEvent(AGENT_EDIT_FILE, {
        actor: 'agent',
        source: 'cli',
        context: { agentRunId: 'run-2' },
      })
    );

    expect(log.query({ agentRunId: 'run-1' })).toHaveLength(1);
  });

  it('queries by file', () => {
    const log = createExecutionEventLog();
    log.append(
      createExecutionEvent(AGENT_EDIT_FILE, {
        actor: 'agent',
        source: 'cli',
        context: { file: 'auth.ts' },
      })
    );
    log.append(
      createExecutionEvent(AGENT_EDIT_FILE, {
        actor: 'agent',
        source: 'cli',
        context: { file: 'index.ts' },
      })
    );

    expect(log.query({ file: 'auth.ts' })).toHaveLength(1);
  });

  it('replays from a given ID', () => {
    const log = createExecutionEventLog();
    const e1 = createExecutionEvent(AGENT_EDIT_FILE, { actor: 'agent', source: 'cli' });
    const e2 = createExecutionEvent(AGENT_EDIT_FILE, { actor: 'agent', source: 'cli' });
    const e3 = createExecutionEvent(AGENT_EDIT_FILE, { actor: 'agent', source: 'cli' });
    log.append(e1);
    log.append(e2);
    log.append(e3);

    const replayed = log.replay(e2.id);
    expect(replayed).toHaveLength(2);
    expect(replayed[0].id).toBe(e2.id);
  });

  it('traces causal chain', () => {
    const log = createExecutionEventLog();

    const root = createExecutionEvent(AGENT_EDIT_FILE, {
      actor: 'agent',
      source: 'cli',
      context: { file: 'auth.ts' },
    });
    log.append(root);

    const middle = createExecutionEvent(TESTS_SKIPPED, {
      actor: 'system',
      source: 'ci',
      causedBy: root.id,
    });
    log.append(middle);

    const leaf = createExecutionEvent(RUNTIME_EXCEPTION, {
      actor: 'system',
      source: 'runtime',
      payload: { message: 'null ref in auth' },
      causedBy: middle.id,
    });
    log.append(leaf);

    const chain = log.trace(leaf.id);
    expect(chain).toHaveLength(3);
    expect(chain[0].id).toBe(root.id);
    expect(chain[1].id).toBe(middle.id);
    expect(chain[2].id).toBe(leaf.id);
  });

  it('trace returns single event if no causedBy', () => {
    const log = createExecutionEventLog();
    const event = createExecutionEvent(AGENT_EDIT_FILE, { actor: 'agent', source: 'cli' });
    log.append(event);

    const chain = log.trace(event.id);
    expect(chain).toHaveLength(1);
    expect(chain[0].id).toBe(event.id);
  });

  it('trace returns empty for unknown event', () => {
    const log = createExecutionEventLog();
    expect(log.trace('unknown')).toHaveLength(0);
  });

  it('round-trips via NDJSON', () => {
    const log = createExecutionEventLog();
    log.append(
      createExecutionEvent(AGENT_EDIT_FILE, {
        actor: 'agent',
        source: 'cli',
        context: { file: 'test.ts' },
        payload: { lines: 10 },
      })
    );
    log.append(
      createExecutionEvent(RUNTIME_EXCEPTION, {
        actor: 'system',
        source: 'runtime',
        payload: { message: 'error' },
      })
    );

    const ndjson = log.toNDJSON();
    expect(ndjson.split('\n')).toHaveLength(2);

    const log2 = createExecutionEventLog();
    const loaded = log2.fromNDJSON(ndjson);
    expect(loaded).toBe(2);
    expect(log2.count()).toBe(2);

    const events = log2.replay();
    expect(events[0].kind).toBe(AGENT_EDIT_FILE);
    expect(events[0].context.file).toBe('test.ts');
    expect(events[1].kind).toBe(RUNTIME_EXCEPTION);
  });

  it('clears all events', () => {
    const log = createExecutionEventLog();
    log.append(createExecutionEvent(AGENT_EDIT_FILE, { actor: 'agent', source: 'cli' }));
    log.clear();
    expect(log.count()).toBe(0);
  });
});

describe('execution-log/event-projections', () => {
  beforeEach(() => {
    resetExecutionEventCounter();
  });

  describe('buildCausalChain', () => {
    it('returns the trace from log', () => {
      const log = createExecutionEventLog();
      const root = createExecutionEvent(AGENT_EDIT_FILE, {
        actor: 'agent',
        source: 'cli',
      });
      log.append(root);

      const child = createExecutionEvent(TEST_SUITE_FAILED, {
        actor: 'system',
        source: 'ci',
        payload: { suite: 'auth' },
        causedBy: root.id,
      });
      log.append(child);

      const chain = buildCausalChain(log, child.id);
      expect(chain).toHaveLength(2);
      expect(chain[0].id).toBe(root.id);
    });
  });

  describe('scoreAgentRun', () => {
    it('scores a clean run as low risk', () => {
      const log = createExecutionEventLog();
      log.append(
        createExecutionEvent(AGENT_EDIT_FILE, {
          actor: 'agent',
          source: 'cli',
          context: { agentRunId: 'run-1', file: 'utils.ts' },
        })
      );

      const risk = scoreAgentRun(log, 'run-1');
      expect(risk.level).toBe('low');
      expect(risk.score).toBe(0);
      expect(risk.failureCount).toBe(0);
    });

    it('scores failures', () => {
      const log = createExecutionEventLog();
      log.append(
        createExecutionEvent(TEST_SUITE_FAILED, {
          actor: 'system',
          source: 'ci',
          context: { agentRunId: 'run-2' },
          payload: { suite: 'auth' },
        })
      );
      log.append(
        createExecutionEvent(BUILD_FAILED, {
          actor: 'system',
          source: 'ci',
          context: { agentRunId: 'run-2' },
          payload: { reason: 'type error' },
        })
      );

      const risk = scoreAgentRun(log, 'run-2');
      expect(risk.failureCount).toBe(2);
      expect(risk.score).toBeGreaterThan(0);
    });

    it('scores violations as high risk', () => {
      const log = createExecutionEventLog();
      log.append(
        createExecutionEvent(POLICY_VIOLATION_DETECTED, {
          actor: 'system',
          source: 'governance',
          context: { agentRunId: 'run-3' },
          payload: { policy: 'no-auth-edit' },
        })
      );

      const risk = scoreAgentRun(log, 'run-3');
      expect(risk.violationCount).toBe(1);
      expect(risk.score).toBeGreaterThanOrEqual(25);
    });

    it('scores sensitive file edits', () => {
      const log = createExecutionEventLog();
      log.append(
        createExecutionEvent(AGENT_EDIT_FILE, {
          actor: 'agent',
          source: 'cli',
          context: { agentRunId: 'run-4', file: 'auth/passwords.ts' },
        })
      );

      const risk = scoreAgentRun(log, 'run-4');
      expect(risk.factors.some((f) => f.name === 'sensitive_file_edits')).toBe(true);
    });

    it('returns empty score for unknown run', () => {
      const log = createExecutionEventLog();
      const risk = scoreAgentRun(log, 'nonexistent');
      expect(risk.score).toBe(0);
      expect(risk.level).toBe('low');
    });
  });

  describe('clusterFailures', () => {
    it('clusters failures by file', () => {
      const log = createExecutionEventLog();
      const now = Date.now();

      log.append(
        createExecutionEvent(TEST_SUITE_FAILED, {
          actor: 'system',
          source: 'ci',
          context: { file: 'auth.ts' },
          payload: { suite: 'test1' },
          timestamp: now,
        })
      );
      log.append(
        createExecutionEvent(RUNTIME_EXCEPTION, {
          actor: 'system',
          source: 'runtime',
          context: { file: 'auth.ts' },
          payload: { message: 'null ref' },
          timestamp: now + 1000,
        })
      );
      log.append(
        createExecutionEvent(BUILD_FAILED, {
          actor: 'system',
          source: 'ci',
          context: { file: 'other.ts' },
          payload: { reason: 'syntax' },
          timestamp: now + 2000,
        })
      );

      const clusters = clusterFailures(log);
      expect(clusters.length).toBeGreaterThanOrEqual(2);

      const authCluster = clusters.find((c) => c.commonFile === 'auth.ts');
      expect(authCluster).toBeTruthy();
      expect(authCluster!.events).toHaveLength(2);
    });

    it('returns empty for no failures', () => {
      const log = createExecutionEventLog();
      log.append(createExecutionEvent(AGENT_EDIT_FILE, { actor: 'agent', source: 'cli' }));
      expect(clusterFailures(log)).toHaveLength(0);
    });
  });

  describe('mapToEncounter', () => {
    it('maps RuntimeException to monster encounter', () => {
      const event = createExecutionEvent(RUNTIME_EXCEPTION, {
        actor: 'system',
        source: 'runtime',
        context: { file: 'auth.ts' },
        payload: { message: 'null pointer in auth module' },
      });

      const mapping = mapToEncounter(event);
      expect(mapping).not.toBeNull();
      expect(mapping!.encounterType).toBe('monster');
      expect(mapping!.name).toBe('Runtime Wraith');
      expect(mapping!.severity).toBe(3);
    });

    it('maps DeploymentFailed to boss encounter', () => {
      const event = createExecutionEvent(DEPLOYMENT_FAILED, {
        actor: 'system',
        source: 'ci',
        payload: { message: 'deploy timeout' },
      });

      const mapping = mapToEncounter(event);
      expect(mapping).not.toBeNull();
      expect(mapping!.encounterType).toBe('boss');
      expect(mapping!.name).toBe('Deploy Colossus');
    });

    it('returns null for non-failure events', () => {
      const event = createExecutionEvent(AGENT_EDIT_FILE, {
        actor: 'agent',
        source: 'cli',
      });
      expect(mapToEncounter(event)).toBeNull();
    });
  });
});
