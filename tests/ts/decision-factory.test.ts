// Tests for decision record factory
import { describe, it, expect } from 'vitest';
import { buildDecisionRecord } from '../../src/kernel/decisions/factory.js';
import type { DecisionFactoryInput } from '../../src/kernel/decisions/factory.js';
import type { MonitorDecision } from '../../src/kernel/monitor.js';

function makeMonitorDecision(overrides: Partial<MonitorDecision> = {}): MonitorDecision {
  return {
    allowed: true,
    intent: {
      action: 'file.read',
      target: 'src/index.ts',
      agent: 'test-agent',
      destructive: false,
    },
    decision: {
      allowed: true,
      decision: 'allow',
      matchedRule: null,
      matchedPolicy: null,
      reason: 'Default allow',
      severity: 0,
    },
    violations: [],
    events: [],
    intervention: null,
    evidencePack: null,
    monitor: {
      escalationLevel: 'NORMAL',
      totalEvaluations: 1,
      totalDenials: 0,
    },
    ...overrides,
  };
}

function makeInput(overrides: Partial<DecisionFactoryInput> = {}): DecisionFactoryInput {
  return {
    runId: 'run_test_123',
    decision: makeMonitorDecision(),
    execution: null,
    executionDurationMs: null,
    simulation: null,
    ...overrides,
  };
}

describe('buildDecisionRecord', () => {
  it('builds a record for an allowed action', () => {
    const record = buildDecisionRecord(makeInput());

    expect(record.recordId).toMatch(/^dec_/);
    expect(record.runId).toBe('run_test_123');
    expect(record.outcome).toBe('allow');
    expect(record.action.type).toBe('file.read');
    expect(record.action.target).toBe('src/index.ts');
    expect(record.action.agent).toBe('test-agent');
    expect(record.action.destructive).toBe(false);
    expect(record.invariants.allHold).toBe(true);
    expect(record.invariants.violations).toHaveLength(0);
    expect(record.execution.executed).toBe(false);
    expect(record.execution.success).toBeNull();
  });

  it('builds a record for a denied action', () => {
    const decision = makeMonitorDecision({
      allowed: false,
      decision: {
        allowed: false,
        decision: 'deny',
        matchedRule: { action: 'git.push', effect: 'deny', reason: 'Protected' },
        matchedPolicy: { id: 'pol_1', name: 'Branch Protection', rules: [], severity: 4 },
        reason: 'Protected branch',
        severity: 4,
      },
    });

    const record = buildDecisionRecord(makeInput({ decision }));
    expect(record.outcome).toBe('deny');
    expect(record.reason).toBe('Protected branch');
    expect(record.policy.matchedPolicyId).toBe('pol_1');
    expect(record.policy.matchedPolicyName).toBe('Branch Protection');
    expect(record.policy.severity).toBe(4);
  });

  it('includes invariant violations', () => {
    const decision = makeMonitorDecision({
      allowed: false,
      violations: [
        {
          invariantId: 'no-secret-exposure',
          name: 'No Secret Exposure',
          severity: 5,
          expected: 'No sensitive files',
          actual: '.env detected',
        },
      ],
    });

    const record = buildDecisionRecord(makeInput({ decision }));
    expect(record.invariants.allHold).toBe(false);
    expect(record.invariants.violations).toHaveLength(1);
    expect(record.invariants.violations[0].invariantId).toBe('no-secret-exposure');
  });

  it('includes execution result when present', () => {
    const record = buildDecisionRecord(
      makeInput({
        execution: { success: true, result: { path: 'test.ts', size: 100 } },
        executionDurationMs: 42,
      })
    );

    expect(record.execution.executed).toBe(true);
    expect(record.execution.success).toBe(true);
    expect(record.execution.durationMs).toBe(42);
    expect(record.execution.error).toBeNull();
  });

  it('includes execution error when present', () => {
    const record = buildDecisionRecord(
      makeInput({
        execution: { success: false, error: 'ENOENT: file not found' },
        executionDurationMs: 5,
      })
    );

    expect(record.execution.executed).toBe(true);
    expect(record.execution.success).toBe(false);
    expect(record.execution.error).toBe('ENOENT: file not found');
  });

  it('includes simulation summary when present', () => {
    const simulation = {
      ran: true,
      riskLevel: 'high' as const,
      findings: ['Force push detected', 'Protected branch target'],
      simulatorsUsed: ['git'],
    };

    const record = buildDecisionRecord(makeInput({ simulation }));
    expect(record.simulation).toEqual(simulation);
  });

  it('includes monitor state', () => {
    const decision = makeMonitorDecision({
      monitor: {
        escalationLevel: 'ELEVATED',
        totalEvaluations: 10,
        totalDenials: 3,
      },
    });

    const record = buildDecisionRecord(makeInput({ decision }));
    expect(record.monitor.escalationLevel).toBe('ELEVATED');
    expect(record.monitor.totalEvaluations).toBe(10);
    expect(record.monitor.totalDenials).toBe(3);
  });

  it('includes evidence pack ID when present', () => {
    const decision = makeMonitorDecision({
      evidencePack: { packId: 'pack_abc123' } as never,
    });

    const record = buildDecisionRecord(makeInput({ decision }));
    expect(record.evidencePackId).toBe('pack_abc123');
  });

  it('generates unique record IDs', () => {
    const record1 = buildDecisionRecord(makeInput());
    const record2 = buildDecisionRecord(makeInput({ runId: 'run_other' }));
    expect(record1.recordId).not.toBe(record2.recordId);
  });
});
