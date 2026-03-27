import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { GovernanceDecisionRecord } from '@red-codes/core';
import {
  buildTelemetryEvent,
  createTelemetryLogger,
  createTelemetryDecisionSink,
} from '../src/runtimeLogger.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDecisionRecord(
  overrides: Partial<GovernanceDecisionRecord> = {}
): GovernanceDecisionRecord {
  return {
    recordId: 'dec_1',
    runId: 'run_abc',
    timestamp: 1710000000000,
    action: {
      type: 'file.write',
      target: '/src/index.ts',
      agent: 'test-agent',
      destructive: false,
    },
    outcome: 'allow',
    reason: 'Matched capability',
    intervention: null,
    policy: {
      matchedPolicyId: 'policy-v1',
      matchedPolicyName: 'default',
      severity: 1,
    },
    invariants: {
      allHold: true,
      violations: [],
    },
    capabilityGrant: null,
    simulation: null,
    evidencePackId: null,
    agentRole: null,
    monitor: {
      escalationLevel: 0,
      totalEvaluations: 10,
      totalDenials: 0,
    },
    execution: {
      executed: true,
      success: true,
      durationMs: 42,
      error: null,
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// buildTelemetryEvent
// ---------------------------------------------------------------------------

describe('buildTelemetryEvent', () => {
  it('maps basic fields correctly', () => {
    const record = makeDecisionRecord();
    const event = buildTelemetryEvent(record);

    expect(event.agent).toBe('test-agent');
    expect(event.run_id).toBe('run_abc');
    expect(event.syscall).toBe('file.write');
    expect(event.target).toBe('/src/index.ts');
    expect(event.policy_result).toBe('allow');
    expect(event.invariant_result).toBe('pass');
    expect(event.capability).toBe('policy-v1');
    expect(event.timestamp).toBe(new Date(1710000000000).toISOString());
  });

  it('uses default-allow when matchedPolicyId is null', () => {
    const record = makeDecisionRecord({
      policy: { matchedPolicyId: null, matchedPolicyName: null, severity: 1 },
    });
    const event = buildTelemetryEvent(record);
    expect(event.capability).toBe('default-allow');
  });

  it('reports invariant_result as fail when invariants do not hold', () => {
    const record = makeDecisionRecord({
      invariants: {
        allHold: false,
        violations: [
          {
            invariantId: 'no-force-push',
            name: 'No Force Push',
            severity: 3,
            expected: 'false',
            actual: 'true',
          },
        ],
      },
    });
    const event = buildTelemetryEvent(record);
    expect(event.invariant_result).toBe('fail');
  });

  it('includes deny outcome', () => {
    const record = makeDecisionRecord({ outcome: 'deny' });
    const event = buildTelemetryEvent(record);
    expect(event.policy_result).toBe('deny');
  });

  it('includes persona model/provider/trust_tier/role when present', () => {
    const record = makeDecisionRecord({
      action: {
        type: 'git.push',
        target: 'origin/main',
        agent: 'agent-2',
        destructive: false,
        persona: {
          modelMeta: { model: 'claude-3-5-sonnet', provider: 'anthropic' },
          trustTier: 'elevated',
          role: 'developer',
        },
      },
    });
    const event = buildTelemetryEvent(record);
    expect(event.model).toBe('claude-3-5-sonnet');
    expect(event.provider).toBe('anthropic');
    expect(event.trust_tier).toBe('elevated');
    expect(event.role).toBe('developer');
  });

  it('omits persona fields when persona is absent', () => {
    const record = makeDecisionRecord();
    const event = buildTelemetryEvent(record);
    expect(event.model).toBeUndefined();
    expect(event.provider).toBeUndefined();
    expect(event.trust_tier).toBeUndefined();
    expect(event.role).toBeUndefined();
  });

  it('omits model/provider when persona has no modelMeta', () => {
    const record = makeDecisionRecord({
      action: {
        type: 'file.read',
        target: '/README.md',
        agent: 'agent-3',
        destructive: false,
        persona: { role: 'reviewer' },
      },
    });
    const event = buildTelemetryEvent(record);
    expect(event.model).toBeUndefined();
    expect(event.provider).toBeUndefined();
    expect(event.role).toBe('reviewer');
  });
});

// ---------------------------------------------------------------------------
// createTelemetryLogger
// ---------------------------------------------------------------------------

describe('createTelemetryLogger', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // best effort
      }
    }
    tmpDirs.length = 0;
  });

  it('writes a JSONL line to the specified log file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentguard-test-'));
    tmpDirs.push(dir);

    const logger = createTelemetryLogger({ logDir: dir, logFile: 'events.jsonl' });
    logger.write({
      timestamp: '2024-03-10T00:00:00.000Z',
      agent: 'test-agent',
      run_id: 'run_1',
      syscall: 'file.write',
      target: '/src/app.ts',
      capability: 'policy-v1',
      policy_result: 'allow',
      invariant_result: 'pass',
    });

    const filePath = join(dir, 'events.jsonl');
    expect(existsSync(filePath)).toBe(true);
    const contents = readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(contents.trim());
    expect(parsed.agent).toBe('test-agent');
    expect(parsed.syscall).toBe('file.write');
    expect(parsed.policy_result).toBe('allow');
  });

  it('appends multiple events as separate JSON lines', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentguard-test-'));
    tmpDirs.push(dir);

    const logger = createTelemetryLogger({ logDir: dir, logFile: 'events.jsonl' });

    for (let i = 0; i < 3; i++) {
      logger.write({
        timestamp: new Date().toISOString(),
        agent: `agent-${i}`,
        run_id: `run_${i}`,
        syscall: 'file.read',
        target: `/src/file${i}.ts`,
        capability: 'default-allow',
        policy_result: 'allow',
        invariant_result: 'pass',
      });
    }

    const contents = readFileSync(join(dir, 'events.jsonl'), 'utf8');
    const lines = contents.trim().split('\n');
    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[0]).agent).toBe('agent-0');
    expect(JSON.parse(lines[2]).agent).toBe('agent-2');
  });

  it('creates nested log directory if it does not exist', () => {
    const base = mkdtempSync(join(tmpdir(), 'agentguard-test-'));
    tmpDirs.push(base);
    const nested = join(base, 'deep', 'nested');

    const logger = createTelemetryLogger({ logDir: nested, logFile: 'out.jsonl' });
    logger.write({
      timestamp: new Date().toISOString(),
      agent: 'a',
      run_id: 'r',
      syscall: 'file.write',
      target: '/f',
      capability: 'c',
      policy_result: 'allow',
      invariant_result: 'pass',
    });

    expect(existsSync(join(nested, 'out.jsonl'))).toBe(true);
  });

  it('flush() does not throw', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentguard-test-'));
    tmpDirs.push(dir);

    const logger = createTelemetryLogger({ logDir: dir });
    expect(() => logger.flush?.()).not.toThrow();
  });

  it('uses default log dir and file names when no options given', () => {
    // We do not actually write to the real default path; just confirm no crash
    const logger = createTelemetryLogger();
    expect(typeof logger.write).toBe('function');
    expect(typeof logger.flush).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// createTelemetryDecisionSink
// ---------------------------------------------------------------------------

describe('createTelemetryDecisionSink', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // best effort
      }
    }
    tmpDirs.length = 0;
  });

  it('writes a governance decision record as a telemetry event', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentguard-test-'));
    tmpDirs.push(dir);

    const sink = createTelemetryDecisionSink({ logDir: dir, logFile: 'decisions.jsonl' });
    const record = makeDecisionRecord({
      action: {
        type: 'git.push',
        target: 'origin/main',
        agent: 'ci-agent',
        destructive: false,
      },
      outcome: 'deny',
    });
    sink.write(record);

    const contents = readFileSync(join(dir, 'decisions.jsonl'), 'utf8');
    const parsed = JSON.parse(contents.trim());
    expect(parsed.syscall).toBe('git.push');
    expect(parsed.policy_result).toBe('deny');
    expect(parsed.agent).toBe('ci-agent');
  });

  it('flush() on sink does not throw', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentguard-test-'));
    tmpDirs.push(dir);

    const sink = createTelemetryDecisionSink({ logDir: dir });
    expect(() => sink.flush?.()).not.toThrow();
  });

  it('writes multiple decision records in order', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentguard-test-'));
    tmpDirs.push(dir);

    const sink = createTelemetryDecisionSink({ logDir: dir, logFile: 'multi.jsonl' });
    const outcomes = ['allow', 'deny', 'allow'] as const;
    for (const outcome of outcomes) {
      sink.write(makeDecisionRecord({ outcome }));
    }

    const lines = readFileSync(join(dir, 'multi.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
    expect(lines).toHaveLength(3);
    expect(lines[0].policy_result).toBe('allow');
    expect(lines[1].policy_result).toBe('deny');
    expect(lines[2].policy_result).toBe('allow');
  });
});
