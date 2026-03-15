// Tests for enforcement audit report generation
import { describe, it, expect } from 'vitest';
import { generateEnforcementAudit, formatEnforcementAudit } from '../src/enforcement-audit.js';
import type { GovernanceDecisionRecord, DomainEvent } from '@red-codes/core';

function makeDecision(overrides: Partial<GovernanceDecisionRecord> = {}): GovernanceDecisionRecord {
  return {
    recordId: 'dec_1',
    runId: 'run_test',
    timestamp: 1700000000000,
    action: { type: 'file.write', target: 'test.ts', agent: 'test-agent', destructive: false },
    outcome: 'allow',
    reason: 'Allowed by default',
    intervention: null,
    policy: { matchedPolicyId: null, matchedPolicyName: null, severity: 0 },
    invariants: { allHold: true, violations: [] },
    simulation: null,
    evidencePackId: null,
    monitor: { escalationLevel: 0, totalEvaluations: 1, totalDenials: 0 },
    execution: { executed: true, success: true, durationMs: 10, error: null },
    ...overrides,
  } as GovernanceDecisionRecord;
}

describe('generateEnforcementAudit', () => {
  it('generates report for empty decisions', () => {
    const report = generateEnforcementAudit({
      runId: 'run_empty',
      decisions: [],
    });

    expect(report.schemaVersion).toBe('1.0.0');
    expect(report.runId).toBe('run_empty');
    expect(report.summary.totalActions).toBe(0);
    expect(report.summary.allowed).toBe(0);
    expect(report.summary.denied).toBe(0);
    expect(report.summary.denialRate).toBe(0);
  });

  it('counts allowed and denied actions', () => {
    const decisions = [
      makeDecision({ outcome: 'allow', timestamp: 1700000000000 }),
      makeDecision({ outcome: 'allow', timestamp: 1700000001000 }),
      makeDecision({
        outcome: 'deny',
        timestamp: 1700000002000,
        reason: 'Policy denied',
        policy: { matchedPolicyId: 'pol_1', matchedPolicyName: 'strict', severity: 3 },
      }),
    ];

    const report = generateEnforcementAudit({ runId: 'run_mix', decisions });

    expect(report.summary.totalActions).toBe(3);
    expect(report.summary.allowed).toBe(2);
    expect(report.summary.denied).toBe(1);
    expect(report.summary.denialRate).toBeCloseTo(1 / 3);
  });

  it('tracks action breakdown by type', () => {
    const decisions = [
      makeDecision({
        action: { type: 'file.write', target: 'a.ts', agent: 'agent', destructive: false },
        outcome: 'allow',
      }),
      makeDecision({
        action: { type: 'file.write', target: 'b.ts', agent: 'agent', destructive: false },
        outcome: 'deny',
        reason: 'Denied',
      }),
      makeDecision({
        action: { type: 'git.push', target: 'main', agent: 'agent', destructive: true },
        outcome: 'deny',
        reason: 'Protected branch',
      }),
    ];

    const report = generateEnforcementAudit({ runId: 'run_bd', decisions });

    expect(report.actionBreakdown['file.write']).toEqual({
      total: 2,
      allowed: 1,
      denied: 1,
    });
    expect(report.actionBreakdown['git.push']).toEqual({
      total: 1,
      allowed: 0,
      denied: 1,
    });
  });

  it('records denial details', () => {
    const decisions = [
      makeDecision({
        outcome: 'deny',
        reason: 'Secret exposure detected',
        intervention: 'deny',
        action: { type: 'file.write', target: '.env', agent: 'agent', destructive: false },
        invariants: {
          allHold: false,
          violations: [
            {
              invariantId: 'no-secret-exposure',
              name: 'No Secret Exposure',
              severity: 5,
              expected: 'No sensitive file modifications',
              actual: 'Writing to .env',
            },
          ],
        },
      }),
    ];

    const report = generateEnforcementAudit({ runId: 'run_denial', decisions });

    expect(report.denials.length).toBe(1);
    expect(report.denials[0].reason).toBe('Secret exposure detected');
    expect(report.denials[0].violations.length).toBe(1);
    expect(report.denials[0].violations[0].invariantId).toBe('no-secret-exposure');
  });

  it('builds invariant summary', () => {
    const decisions = [
      makeDecision({
        outcome: 'deny',
        reason: 'Violation',
        invariants: {
          allHold: false,
          violations: [
            {
              invariantId: 'no-force-push',
              name: 'No Force Push',
              severity: 4,
              expected: 'No force push',
              actual: 'Force push detected',
            },
          ],
        },
      }),
      makeDecision({
        outcome: 'deny',
        reason: 'Violation',
        invariants: {
          allHold: false,
          violations: [
            {
              invariantId: 'no-force-push',
              name: 'No Force Push',
              severity: 4,
              expected: 'No force push',
              actual: 'Force push detected',
            },
            {
              invariantId: 'protected-branch',
              name: 'Protected Branch',
              severity: 5,
              expected: 'No push to protected',
              actual: 'Push to main',
            },
          ],
        },
      }),
    ];

    const report = generateEnforcementAudit({ runId: 'run_inv', decisions });

    expect(report.invariantSummary['no-force-push'].count).toBe(2);
    expect(report.invariantSummary['no-force-push'].maxSeverity).toBe(4);
    expect(report.invariantSummary['protected-branch'].count).toBe(1);
    expect(report.invariantSummary['protected-branch'].maxSeverity).toBe(5);
    expect(report.summary.uniqueViolationTypes).toBe(2);
  });

  it('counts destructive actions blocked', () => {
    const decisions = [
      makeDecision({
        outcome: 'deny',
        reason: 'Blocked',
        action: { type: 'git.push', target: 'main', agent: 'agent', destructive: true },
      }),
      makeDecision({
        outcome: 'deny',
        reason: 'Blocked',
        action: { type: 'shell.exec', target: 'rm -rf /', agent: 'agent', destructive: true },
      }),
      makeDecision({
        outcome: 'allow',
        action: { type: 'file.read', target: 'safe.ts', agent: 'agent', destructive: false },
      }),
    ];

    const report = generateEnforcementAudit({ runId: 'run_destr', decisions });
    expect(report.summary.destructiveActionsBlocked).toBe(2);
  });

  it('tracks peak escalation level', () => {
    const decisions = [
      makeDecision({ monitor: { escalationLevel: 0, totalEvaluations: 1, totalDenials: 0 } }),
      makeDecision({ monitor: { escalationLevel: 2, totalEvaluations: 10, totalDenials: 5 } }),
      makeDecision({ monitor: { escalationLevel: 1, totalEvaluations: 15, totalDenials: 6 } }),
    ];

    const report = generateEnforcementAudit({ runId: 'run_esc', decisions });
    expect(report.summary.peakEscalationLevel).toBe(2);
  });

  it('tracks chain integrity flag', () => {
    const report1 = generateEnforcementAudit({
      runId: 'run_1',
      decisions: [],
      chainVerified: true,
    });
    expect(report1.summary.chainIntegrityVerified).toBe(true);

    const report2 = generateEnforcementAudit({
      runId: 'run_2',
      decisions: [],
      chainVerified: false,
    });
    expect(report2.summary.chainIntegrityVerified).toBe(false);
  });

  it('categorizes enforcement sources', () => {
    const decisions = [
      makeDecision({
        outcome: 'deny',
        reason: 'Policy denied',
        policy: { matchedPolicyId: 'pol_1', matchedPolicyName: 'strict', severity: 3 },
        invariants: { allHold: true, violations: [] },
      }),
      makeDecision({
        outcome: 'deny',
        reason: 'Invariant violation',
        invariants: {
          allHold: false,
          violations: [
            {
              invariantId: 'test-inv',
              name: 'Test',
              severity: 3,
              expected: 'x',
              actual: 'y',
            },
          ],
        },
      }),
      makeDecision({
        outcome: 'deny',
        reason: 'Simulation risk',
        simulation: {
          predictedChanges: ['a.ts'],
          blastRadius: 50,
          riskLevel: 'high',
          simulatorId: 'fs-sim',
          durationMs: 10,
        },
      }),
    ];

    const report = generateEnforcementAudit({ runId: 'run_src', decisions });
    expect(report.enforcementSources.policyDenials).toBe(1);
    expect(report.enforcementSources.invariantDenials).toBe(1);
    expect(report.enforcementSources.simulationDenials).toBe(1);
  });

  it('computes time range from decisions', () => {
    const decisions = [
      makeDecision({ timestamp: 1700000010000 }),
      makeDecision({ timestamp: 1700000020000 }),
      makeDecision({ timestamp: 1700000015000 }),
    ];

    const report = generateEnforcementAudit({ runId: 'run_time', decisions });
    expect(report.timeRange.first).toBe(1700000010000);
    expect(report.timeRange.last).toBe(1700000020000);
    expect(report.timeRange.durationMs).toBe(10000);
  });
});

describe('formatEnforcementAudit', () => {
  it('produces readable text output', () => {
    const decisions = [
      makeDecision({ outcome: 'allow' }),
      makeDecision({
        outcome: 'deny',
        reason: 'Force push blocked',
        action: { type: 'git.push', target: 'main', agent: 'agent', destructive: true },
        invariants: {
          allHold: false,
          violations: [
            {
              invariantId: 'no-force-push',
              name: 'No Force Push',
              severity: 4,
              expected: 'No force push',
              actual: 'Force push detected',
            },
          ],
        },
      }),
    ];

    const report = generateEnforcementAudit({
      runId: 'run_fmt',
      decisions,
      chainVerified: true,
    });
    const output = formatEnforcementAudit(report);

    expect(output).toContain('Enforcement Audit Report');
    expect(output).toContain('run_fmt');
    expect(output).toContain('Total actions:');
    expect(output).toContain('VERIFIED');
    expect(output).toContain('Force push blocked');
    expect(output).toContain('No Force Push');
    expect(output).toContain('[DESTRUCTIVE]');
  });

  it('handles empty report', () => {
    const report = generateEnforcementAudit({ runId: 'run_empty', decisions: [] });
    const output = formatEnforcementAudit(report);

    expect(output).toContain('Total actions:          0');
    expect(output).toContain('NOT VERIFIED');
  });
});
