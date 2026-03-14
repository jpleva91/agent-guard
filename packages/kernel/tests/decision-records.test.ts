// Tests for Governance Decision Records
import { describe, it, expect, beforeEach } from 'vitest';
import { buildDecisionRecord } from '@red-codes/kernel';
import type { DecisionFactoryInput } from '@red-codes/kernel';
import type { MonitorDecision } from '@red-codes/kernel';
import { createKernel } from '@red-codes/kernel';
import type { EventSink } from '@red-codes/kernel';
import type { GovernanceDecisionRecord, DecisionSink } from '@red-codes/core';
import { resetActionCounter } from '@red-codes/core';
import { resetEventCounter } from '@red-codes/events';
import type { DomainEvent } from '@red-codes/core';

beforeEach(() => {
  resetActionCounter();
  resetEventCounter();
});

function makeDecision(overrides: Partial<MonitorDecision> = {}): MonitorDecision {
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
      reason: 'No matching policy — default allow',
      severity: 0,
    },
    violations: [],
    events: [],
    evidencePack: null,
    intervention: null,
    monitor: {
      escalationLevel: 0,
      totalEvaluations: 1,
      totalDenials: 0,
      totalViolations: 0,
    },
    ...overrides,
  };
}

describe('Decision Record Factory', () => {
  it('builds a record for an allowed action', () => {
    const input: DecisionFactoryInput = {
      runId: 'test-run-1',
      decision: makeDecision(),
      execution: { success: true },
      executionDurationMs: 42,
      simulation: null,
    };

    const record = buildDecisionRecord(input);

    expect(record.recordId).toMatch(/^dec_/);
    expect(record.runId).toBe('test-run-1');
    expect(record.outcome).toBe('allow');
    expect(record.action.type).toBe('file.read');
    expect(record.action.target).toBe('src/index.ts');
    expect(record.action.agent).toBe('test-agent');
    expect(record.action.destructive).toBe(false);
    expect(record.reason).toBe('No matching policy — default allow');
    expect(record.intervention).toBeNull();
    expect(record.policy.matchedPolicyId).toBeNull();
    expect(record.policy.severity).toBe(0);
    expect(record.invariants.allHold).toBe(true);
    expect(record.invariants.violations).toHaveLength(0);
    expect(record.simulation).toBeNull();
    expect(record.evidencePackId).toBeNull();
    expect(record.monitor.escalationLevel).toBe(0);
    expect(record.execution.executed).toBe(true);
    expect(record.execution.success).toBe(true);
    expect(record.execution.durationMs).toBe(42);
    expect(record.execution.error).toBeNull();
  });

  it('builds a record for a denied action', () => {
    const decision = makeDecision({
      allowed: false,
      decision: {
        allowed: false,
        decision: 'deny',
        matchedRule: { action: 'git.push', effect: 'deny', reason: 'Protected branch' },
        matchedPolicy: { id: 'protect-main', name: 'Protect Main', rules: [], severity: 4 },
        reason: 'Protected branch',
        severity: 4,
      },
      intervention: 'pause',
      violations: [
        {
          invariantId: 'protected-branch',
          name: 'Protected Branch Safety',
          severity: 4,
          expected: 'No direct push to protected branch',
          actual: 'Direct push to main',
        },
      ],
    });

    const record = buildDecisionRecord({
      runId: 'test-run-2',
      decision,
      execution: null,
      executionDurationMs: null,
      simulation: null,
    });

    expect(record.outcome).toBe('deny');
    expect(record.reason).toBe('Protected branch');
    expect(record.intervention).toBe('pause');
    expect(record.policy.matchedPolicyId).toBe('protect-main');
    expect(record.policy.matchedPolicyName).toBe('Protect Main');
    expect(record.policy.severity).toBe(4);
    expect(record.invariants.allHold).toBe(false);
    expect(record.invariants.violations).toHaveLength(1);
    expect(record.invariants.violations[0].invariantId).toBe('protected-branch');
    expect(record.execution.executed).toBe(false);
    expect(record.execution.success).toBeNull();
  });

  it('includes simulation data when provided', () => {
    const simulation = {
      predictedChanges: ['3 unpushed commits to main'],
      blastRadius: 3,
      riskLevel: 'medium' as const,
      simulatorId: 'git-simulator',
      durationMs: 15,
    };

    const record = buildDecisionRecord({
      runId: 'test-run-3',
      decision: makeDecision(),
      execution: null,
      executionDurationMs: null,
      simulation,
    });

    expect(record.simulation).not.toBeNull();
    expect(record.simulation!.blastRadius).toBe(3);
    expect(record.simulation!.riskLevel).toBe('medium');
    expect(record.simulation!.simulatorId).toBe('git-simulator');
  });

  it('records execution failure', () => {
    const record = buildDecisionRecord({
      runId: 'test-run-4',
      decision: makeDecision(),
      execution: { success: false, error: 'Permission denied' },
      executionDurationMs: 100,
      simulation: null,
    });

    expect(record.execution.executed).toBe(true);
    expect(record.execution.success).toBe(false);
    expect(record.execution.error).toBe('Permission denied');
    expect(record.execution.durationMs).toBe(100);
  });

  it('includes evidence pack ID when available', () => {
    const decision = makeDecision({
      evidencePack: {
        packId: 'pack_abc123',
        timestamp: Date.now(),
        intent: { action: 'git.push', target: 'main', agent: 'test', destructive: false },
        decision: { allowed: false, decision: 'deny', matchedRule: null, matchedPolicy: null, reason: 'test', severity: 3 },
        violations: [],
        events: [],
        summary: 'test',
        severity: 3,
      },
    });

    const record = buildDecisionRecord({
      runId: 'test-run-5',
      decision,
      execution: null,
      executionDurationMs: null,
      simulation: null,
    });

    expect(record.evidencePackId).toBe('pack_abc123');
  });
});

describe('Kernel Decision Record Integration', () => {
  it('includes decisionRecord in KernelResult for allowed actions', async () => {
    const kernel = createKernel({ dryRun: true });
    const result = await kernel.propose({
      tool: 'Read',
      file: 'src/index.ts',
      agent: 'test-agent',
    });

    expect(result.decisionRecord).toBeDefined();
    expect(result.decisionRecord!.outcome).toBe('allow');
    expect(result.decisionRecord!.action.type).toBe('file.read');
    expect(result.decisionRecord!.runId).toBe(result.runId);
  });

  it('includes decisionRecord in KernelResult for denied actions', async () => {
    const kernel = createKernel({ dryRun: true });
    const result = await kernel.propose({
      tool: 'Bash',
      command: 'rm -rf /',
      agent: 'test-agent',
    });

    expect(result.decisionRecord).toBeDefined();
    expect(result.decisionRecord!.outcome).toBe('deny');
    expect(result.decisionRecord!.action.destructive).toBe(true);
  });

  it('sinks decision records to configured decision sinks', async () => {
    const sunkRecords: GovernanceDecisionRecord[] = [];
    const testDecisionSink: DecisionSink = {
      write(record) {
        sunkRecords.push(record);
      },
    };

    const kernel = createKernel({
      dryRun: true,
      decisionSinks: [testDecisionSink],
    });

    await kernel.propose({ tool: 'Read', file: 'test.ts', agent: 'test' });
    await kernel.propose({ tool: 'Bash', command: 'rm -rf /', agent: 'test' });

    expect(sunkRecords).toHaveLength(2);
    expect(sunkRecords[0].outcome).toBe('allow');
    expect(sunkRecords[1].outcome).toBe('deny');
  });

  it('emits DECISION_RECORDED events', async () => {
    const sunkEvents: DomainEvent[] = [];
    const testSink: EventSink = {
      write(event) {
        sunkEvents.push(event);
      },
    };

    const kernel = createKernel({ dryRun: true, sinks: [testSink] });
    await kernel.propose({ tool: 'Read', file: 'test.ts', agent: 'test' });

    const decisionEvents = sunkEvents.filter((e) => e.kind === 'DecisionRecorded');
    expect(decisionEvents.length).toBeGreaterThan(0);
  });

  it('shutdown flushes decision sinks', () => {
    let flushed = false;
    const testSink: DecisionSink = {
      write() {},
      flush() {
        flushed = true;
      },
    };

    const kernel = createKernel({ dryRun: true, decisionSinks: [testSink] });
    kernel.shutdown();
    expect(flushed).toBe(true);
  });

  it('decision record has correct policy info on policy denial', async () => {
    const kernel = createKernel({
      dryRun: true,
      policyDefs: [
        {
          id: 'no-push',
          name: 'No Push Policy',
          rules: [{ action: 'git.push', effect: 'deny', reason: 'Pushing forbidden' }],
          severity: 4,
        },
      ],
    });

    const result = await kernel.propose({
      tool: 'Bash',
      command: 'git push origin main',
      agent: 'test',
    });

    expect(result.decisionRecord).toBeDefined();
    expect(result.decisionRecord!.policy.matchedPolicyId).toBe('no-push');
    expect(result.decisionRecord!.policy.matchedPolicyName).toBe('No Push Policy');
    expect(result.decisionRecord!.policy.severity).toBe(4);
  });
});
