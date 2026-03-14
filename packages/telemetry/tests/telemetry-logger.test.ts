// Tests for runtime telemetry logger and DecisionSink adapter
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
  mkdirSync: vi.fn(),
  appendFileSync: vi.fn(),
}));

import {
  createTelemetryLogger,
  buildTelemetryEvent,
  createTelemetryDecisionSink,
} from '@red-codes/telemetry';
import { mkdirSync, appendFileSync } from 'node:fs';
import type { GovernanceDecisionRecord } from '@red-codes/core';
import type { TelemetryEvent } from '@red-codes/telemetry';

function makeFakeDecisionRecord(
  overrides: Partial<GovernanceDecisionRecord> = {}
): GovernanceDecisionRecord {
  return {
    recordId: 'dec_1',
    runId: 'run_1',
    timestamp: 1700000000000,
    action: { type: 'file.read', target: 'test.ts', agent: 'coder-agent', destructive: false },
    outcome: 'allow',
    reason: 'Allowed by default',
    intervention: null,
    policy: { matchedPolicyId: null, matchedPolicyName: null, severity: 0 },
    invariants: { allHold: true, violations: [] },
    simulation: null,
    evidencePackId: null,
    monitor: { escalationLevel: 'NORMAL', totalEvaluations: 1, totalDenials: 0 },
    execution: { executed: false, success: null, durationMs: null, error: null },
    ...overrides,
  } as GovernanceDecisionRecord;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createTelemetryLogger', () => {
  it('creates logs/ directory on first write', () => {
    const logger = createTelemetryLogger();
    const event: TelemetryEvent = {
      timestamp: '2023-11-14T22:13:20.000Z',
      agent: 'coder-agent',
      run_id: 'run_1',
      syscall: 'file.read',
      target: 'test.ts',
      capability: 'default-allow',
      policy_result: 'allow',
      invariant_result: 'pass',
    };
    logger.write(event);

    expect(mkdirSync).toHaveBeenCalledWith('logs', { recursive: true });
  });

  it('only creates directory once', () => {
    const logger = createTelemetryLogger();
    const event: TelemetryEvent = {
      timestamp: '2023-11-14T22:13:20.000Z',
      agent: 'coder-agent',
      run_id: 'run_1',
      syscall: 'file.read',
      target: 'test.ts',
      capability: 'default-allow',
      policy_result: 'allow',
      invariant_result: 'pass',
    };
    logger.write(event);
    logger.write(event);

    expect(mkdirSync).toHaveBeenCalledTimes(1);
  });

  it('writes telemetry event as JSON line', () => {
    const logger = createTelemetryLogger();
    const event: TelemetryEvent = {
      timestamp: '2023-11-14T22:13:20.000Z',
      agent: 'coder-agent',
      run_id: 'run_1',
      syscall: 'file.read',
      target: 'test.ts',
      capability: 'default-allow',
      policy_result: 'allow',
      invariant_result: 'pass',
    };
    logger.write(event);

    expect(appendFileSync).toHaveBeenCalledWith(
      expect.stringContaining('runtime-events.jsonl'),
      JSON.stringify(event) + '\n',
      'utf8'
    );
  });

  it('supports custom logDir and logFile', () => {
    const logger = createTelemetryLogger({ logDir: '/custom/dir', logFile: 'custom.jsonl' });
    const event: TelemetryEvent = {
      timestamp: '2023-11-14T22:13:20.000Z',
      agent: 'coder-agent',
      run_id: 'run_1',
      syscall: 'file.read',
      target: 'test.ts',
      capability: 'default-allow',
      policy_result: 'allow',
      invariant_result: 'pass',
    };
    logger.write(event);

    expect(mkdirSync).toHaveBeenCalledWith('/custom/dir', { recursive: true });
    expect(appendFileSync).toHaveBeenCalledWith(
      expect.stringContaining('custom.jsonl'),
      expect.any(String),
      'utf8'
    );
  });

  it('swallows mkdir errors gracefully', () => {
    vi.mocked(mkdirSync).mockImplementation(() => {
      throw new Error('EEXIST');
    });

    const logger = createTelemetryLogger();
    const event: TelemetryEvent = {
      timestamp: '2023-11-14T22:13:20.000Z',
      agent: 'coder-agent',
      run_id: 'run_1',
      syscall: 'file.read',
      target: 'test.ts',
      capability: 'default-allow',
      policy_result: 'allow',
      invariant_result: 'pass',
    };
    expect(() => logger.write(event)).not.toThrow();
  });

  it('swallows write errors gracefully', () => {
    vi.mocked(appendFileSync).mockImplementation(() => {
      throw new Error('ENOSPC');
    });

    const logger = createTelemetryLogger();
    const event: TelemetryEvent = {
      timestamp: '2023-11-14T22:13:20.000Z',
      agent: 'coder-agent',
      run_id: 'run_1',
      syscall: 'file.read',
      target: 'test.ts',
      capability: 'default-allow',
      policy_result: 'allow',
      invariant_result: 'pass',
    };
    expect(() => logger.write(event)).not.toThrow();
  });

  it('flush does not throw', () => {
    const logger = createTelemetryLogger();
    expect(() => logger.flush?.()).not.toThrow();
  });
});

describe('buildTelemetryEvent', () => {
  it('maps all required fields from GovernanceDecisionRecord', () => {
    const record = makeFakeDecisionRecord({
      timestamp: 1700000000000,
      runId: 'run_42',
      action: { type: 'git.push', target: 'origin/main', agent: 'deploy-agent', destructive: true },
      outcome: 'deny',
      policy: { matchedPolicyId: 'policy-1', matchedPolicyName: 'no-force-push', severity: 8 },
      invariants: {
        allHold: false,
        violations: [
          {
            invariantId: 'inv-1',
            name: 'no-force-push',
            severity: 8,
            expected: 'no force push',
            actual: 'force push detected',
          },
        ],
      },
    });

    const event = buildTelemetryEvent(record);

    expect(event.timestamp).toBe('2023-11-14T22:13:20.000Z');
    expect(event.agent).toBe('deploy-agent');
    expect(event.run_id).toBe('run_42');
    expect(event.syscall).toBe('git.push');
    expect(event.target).toBe('origin/main');
    expect(event.capability).toBe('policy-1');
    expect(event.policy_result).toBe('deny');
    expect(event.invariant_result).toBe('fail');
  });

  it('falls back to default-allow when matchedPolicyId is null', () => {
    const record = makeFakeDecisionRecord({
      policy: { matchedPolicyId: null, matchedPolicyName: null, severity: 0 },
    });

    const event = buildTelemetryEvent(record);
    expect(event.capability).toBe('default-allow');
  });

  it('sets invariant_result to pass when allHold is true', () => {
    const record = makeFakeDecisionRecord({
      invariants: { allHold: true, violations: [] },
    });

    const event = buildTelemetryEvent(record);
    expect(event.invariant_result).toBe('pass');
  });

  it('sets invariant_result to fail when allHold is false', () => {
    const record = makeFakeDecisionRecord({
      invariants: {
        allHold: false,
        violations: [
          {
            invariantId: 'inv-1',
            name: 'secret-check',
            severity: 10,
            expected: 'no secrets',
            actual: 'secret detected',
          },
        ],
      },
    });

    const event = buildTelemetryEvent(record);
    expect(event.invariant_result).toBe('fail');
  });
});

describe('createTelemetryDecisionSink', () => {
  it('converts GovernanceDecisionRecord to TelemetryEvent and writes', () => {
    const sink = createTelemetryDecisionSink();
    const record = makeFakeDecisionRecord();
    sink.write(record);

    expect(appendFileSync).toHaveBeenCalledWith(
      expect.stringContaining('runtime-events.jsonl'),
      expect.any(String),
      'utf8'
    );

    // Verify the written JSON contains telemetry fields
    const writtenLine = vi.mocked(appendFileSync).mock.calls[0][1] as string;
    const parsed = JSON.parse(writtenLine.trim()) as TelemetryEvent;
    expect(parsed.syscall).toBe('file.read');
    expect(parsed.agent).toBe('coder-agent');
    expect(parsed.policy_result).toBe('allow');
    expect(parsed.invariant_result).toBe('pass');
    expect(parsed.capability).toBe('default-allow');
  });

  it('maps denied outcome correctly', () => {
    const sink = createTelemetryDecisionSink();
    const record = makeFakeDecisionRecord({
      outcome: 'deny',
      invariants: {
        allHold: false,
        violations: [
          {
            invariantId: 'inv-1',
            name: 'blast-radius',
            severity: 7,
            expected: '< 10 files',
            actual: '25 files affected',
          },
        ],
      },
      policy: {
        matchedPolicyId: 'deny-large-changes',
        matchedPolicyName: 'Deny Large Changes',
        severity: 7,
      },
    });
    sink.write(record);

    const writtenLine = vi.mocked(appendFileSync).mock.calls[0][1] as string;
    const parsed = JSON.parse(writtenLine.trim()) as TelemetryEvent;
    expect(parsed.policy_result).toBe('deny');
    expect(parsed.invariant_result).toBe('fail');
    expect(parsed.capability).toBe('deny-large-changes');
  });

  it('flush does not throw', () => {
    const sink = createTelemetryDecisionSink();
    expect(() => sink.flush?.()).not.toThrow();
  });
});
