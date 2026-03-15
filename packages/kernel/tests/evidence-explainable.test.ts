import { describe, it, expect } from 'vitest';
import {
  createExplainableEvidencePack,
  serializeEvidencePack,
  EVIDENCE_PACK_SCHEMA_VERSION,
} from '@red-codes/kernel';
import type { NormalizedIntent, EvalResult } from '@red-codes/policy';
import type { InvariantCheck } from '@red-codes/invariants';
import type { SimulationSummary } from '@red-codes/core';

function makeIntent(overrides: Partial<NormalizedIntent> = {}): NormalizedIntent {
  return {
    action: 'file.write',
    target: 'src/index.ts',
    agent: 'test-agent',
    destructive: false,
    ...overrides,
  };
}

function makeDecision(overrides: Partial<EvalResult> = {}): EvalResult {
  return {
    allowed: true,
    decision: 'allow',
    matchedRule: null,
    matchedPolicy: null,
    reason: 'No matching deny rule',
    severity: 0,
    ...overrides,
  };
}

function makeViolation(overrides: Partial<InvariantCheck> = {}): InvariantCheck {
  return {
    holds: false,
    invariant: {
      id: 'test-invariant',
      name: 'Test Invariant',
      description: 'Test',
      severity: 3,
      check: () => ({ holds: false, expected: 'safe', actual: 'unsafe' }),
    },
    result: { holds: false, expected: 'safe', actual: 'unsafe' },
    ...overrides,
  };
}

function makeSimulation(overrides: Partial<SimulationSummary> = {}): SimulationSummary {
  return {
    predictedChanges: ['src/index.ts'],
    blastRadius: 5,
    riskLevel: 'low',
    simulatorId: 'test-sim',
    durationMs: 10,
    ...overrides,
  };
}

describe('explainable evidence pack', () => {
  describe('createExplainableEvidencePack', () => {
    it('creates a pack with schema version and evaluation path', () => {
      const { pack } = createExplainableEvidencePack({
        intent: makeIntent(),
        decision: makeDecision(),
      });

      expect(pack.schemaVersion).toBe(EVIDENCE_PACK_SCHEMA_VERSION);
      expect(pack.verdictType).toBe('deterministic');
      expect(pack.confidence).toBe(1.0);
      expect(pack.evaluationPath.length).toBeGreaterThan(0);
      expect(pack.provenance.length).toBeGreaterThan(0);
    });

    it('includes normalization step in evaluation path', () => {
      const { pack } = createExplainableEvidencePack({
        intent: makeIntent({ action: 'git.push', target: 'origin/main' }),
        decision: makeDecision(),
      });

      const normStep = pack.evaluationPath.find((s) => s.phase === 'normalization');
      expect(normStep).toBeDefined();
      expect(normStep!.outcome).toBe('pass');
      expect(normStep!.description).toContain('git.push');
      expect(normStep!.details?.agent).toBe('test-agent');
    });

    it('includes branch in normalization when present', () => {
      const { pack } = createExplainableEvidencePack({
        intent: makeIntent({ branch: 'feature' }),
        decision: makeDecision(),
      });

      const normStep = pack.evaluationPath.find((s) => s.phase === 'normalization');
      expect(normStep!.details?.branch).toBe('feature');
    });

    it('includes policy evaluation step without trace', () => {
      const { pack } = createExplainableEvidencePack({
        intent: makeIntent(),
        decision: makeDecision(),
      });

      const policyStep = pack.evaluationPath.find((s) => s.phase === 'policy-evaluation');
      expect(policyStep).toBeDefined();
      expect(policyStep!.description).toContain('No policy trace available');
    });

    it('includes policy evaluation with matched policy (no trace)', () => {
      const { pack } = createExplainableEvidencePack({
        intent: makeIntent(),
        decision: makeDecision({
          decision: 'deny',
          matchedPolicy: { id: 'p1', name: 'strict', rules: [], metadata: {} } as never,
        }),
      });

      const policyStep = pack.evaluationPath.find((s) => s.phase === 'policy-evaluation');
      expect(policyStep!.description).toContain('strict');
      expect(policyStep!.outcome).toBe('fail');
    });

    it('includes policy trace steps when trace is available', () => {
      const { pack } = createExplainableEvidencePack({
        intent: makeIntent(),
        decision: makeDecision({
          trace: {
            rulesEvaluated: [
              {
                policyId: 'p1',
                policyName: 'default',
                ruleIndex: 0,
                rule: { action: '*', effect: 'deny' as const },
                actionMatched: true,
                conditionsMatched: true,
                outcome: 'match' as const,
              },
              {
                policyId: 'p1',
                policyName: 'default',
                ruleIndex: 1,
                rule: { action: 'file.read', effect: 'allow' as const },
                actionMatched: false,
                conditionsMatched: false,
                outcome: 'skipped' as const,
              },
            ],
            finalDecision: 'deny',
            matchedRuleIndex: 0,
          },
        }),
      });

      const policySteps = pack.evaluationPath.filter((s) => s.phase === 'policy-evaluation');
      // Skipped rules should be excluded
      expect(policySteps).toHaveLength(1);
      expect(policySteps[0].outcome).toBe('match');
      expect(policySteps[0].details?.policyId).toBe('p1');
    });

    it('includes invariant violation steps', () => {
      const violation = makeViolation();
      const { pack } = createExplainableEvidencePack({
        intent: makeIntent(),
        decision: makeDecision(),
        violations: [violation],
      });

      const invStep = pack.evaluationPath.find((s) => s.phase === 'invariant-check');
      expect(invStep).toBeDefined();
      expect(invStep!.outcome).toBe('fail');
      expect(invStep!.details?.invariantId).toBe('test-invariant');
    });

    it('includes pass step when no violations', () => {
      const { pack } = createExplainableEvidencePack({
        intent: makeIntent(),
        decision: makeDecision(),
        violations: [],
      });

      const invStep = pack.evaluationPath.find((s) => s.phase === 'invariant-check');
      expect(invStep).toBeDefined();
      expect(invStep!.outcome).toBe('pass');
      expect(invStep!.description).toBe('All invariants hold');
    });

    it('includes simulation step when simulation is provided', () => {
      const sim = makeSimulation({ riskLevel: 'high', blastRadius: 100 });
      const { pack } = createExplainableEvidencePack({
        intent: makeIntent(),
        decision: makeDecision(),
        simulation: sim,
      });

      const simStep = pack.evaluationPath.find((s) => s.phase === 'simulation');
      expect(simStep).toBeDefined();
      expect(simStep!.outcome).toBe('fail'); // high risk => fail
      expect(simStep!.durationMs).toBe(10);
    });

    it('simulation step passes for low risk', () => {
      const sim = makeSimulation({ riskLevel: 'low' });
      const { pack } = createExplainableEvidencePack({
        intent: makeIntent(),
        decision: makeDecision(),
        simulation: sim,
      });

      const simStep = pack.evaluationPath.find((s) => s.phase === 'simulation');
      expect(simStep!.outcome).toBe('pass');
    });

    it('does not include simulation step when simulation is null', () => {
      const { pack } = createExplainableEvidencePack({
        intent: makeIntent(),
        decision: makeDecision(),
        simulation: null,
      });

      const simStep = pack.evaluationPath.find((s) => s.phase === 'simulation');
      expect(simStep).toBeUndefined();
    });

    it('includes verdict step', () => {
      const { pack } = createExplainableEvidencePack({
        intent: makeIntent(),
        decision: makeDecision({ decision: 'deny', reason: 'blocked by policy' }),
      });

      const verdict = pack.evaluationPath.find((s) => s.phase === 'verdict');
      expect(verdict).toBeDefined();
      expect(verdict!.outcome).toBe('fail');
      expect(verdict!.description).toContain('DENY');
    });

    it('emits event with pack ID', () => {
      const { pack, event } = createExplainableEvidencePack({
        intent: makeIntent(),
        decision: makeDecision(),
      });

      expect(event).toBeDefined();
      expect(event.id).toBeDefined();
      expect(pack.packId).toMatch(/^pack_/);
    });
  });

  describe('provenance', () => {
    it('includes policy-rule provenance when matched', () => {
      const { pack } = createExplainableEvidencePack({
        intent: makeIntent(),
        decision: makeDecision({
          matchedPolicy: { id: 'p1', name: 'strict', rules: [], metadata: {} } as never,
          matchedRule: { action: '*', effect: 'deny' as const },
        }),
      });

      const policyProv = pack.provenance.find((p) => p.sourceType === 'policy-rule');
      expect(policyProv).toBeDefined();
      expect(policyProv!.sourceId).toBe('p1');
    });

    it('includes default provenance when no rule matched', () => {
      const { pack } = createExplainableEvidencePack({
        intent: makeIntent(),
        decision: makeDecision(),
      });

      const defaultProv = pack.provenance.find((p) => p.sourceType === 'default');
      expect(defaultProv).toBeDefined();
      expect(defaultProv!.contribution).toBe('allow');
    });

    it('includes invariant provenance', () => {
      const { pack } = createExplainableEvidencePack({
        intent: makeIntent(),
        decision: makeDecision(),
        violations: [makeViolation()],
      });

      const invProv = pack.provenance.find((p) => p.sourceType === 'invariant');
      expect(invProv).toBeDefined();
      expect(invProv!.contribution).toBe('deny');
    });

    it('includes simulation provenance for high risk', () => {
      const { pack } = createExplainableEvidencePack({
        intent: makeIntent(),
        decision: makeDecision(),
        simulation: makeSimulation({ riskLevel: 'high' }),
      });

      const simProv = pack.provenance.find((p) => p.sourceType === 'simulation');
      expect(simProv).toBeDefined();
      expect(simProv!.contribution).toBe('deny');
    });

    it('includes simulation provenance as neutral for low risk', () => {
      const { pack } = createExplainableEvidencePack({
        intent: makeIntent(),
        decision: makeDecision(),
        simulation: makeSimulation({ riskLevel: 'low' }),
      });

      const simProv = pack.provenance.find((p) => p.sourceType === 'simulation');
      expect(simProv!.contribution).toBe('neutral');
    });
  });

  describe('serializeEvidencePack', () => {
    it('serializes to a portable format', () => {
      const { pack } = createExplainableEvidencePack({
        intent: makeIntent({ branch: 'feature', command: 'echo test' }),
        decision: makeDecision({ decision: 'deny', reason: 'blocked' }),
        violations: [makeViolation()],
      });

      const serialized = serializeEvidencePack(pack);

      expect(serialized.schemaVersion).toBe(EVIDENCE_PACK_SCHEMA_VERSION);
      expect(serialized.packId).toBe(pack.packId);
      expect(serialized.timestamp).toMatch(/^\d{4}-/); // ISO date
      expect(serialized.intent.action).toBe('file.write');
      expect(serialized.intent.branch).toBe('feature');
      expect(serialized.intent.command).toBe('echo test');
      expect(serialized.verdict.decision).toBe('deny');
      expect(serialized.verdict.type).toBe('deterministic');
      expect(serialized.verdict.confidence).toBe(1.0);
      expect(serialized.evaluationPath.length).toBeGreaterThan(0);
      expect(serialized.provenance.length).toBeGreaterThan(0);
      expect(serialized.violations).toHaveLength(1);
    });

    it('omits branch and command when not present', () => {
      const { pack } = createExplainableEvidencePack({
        intent: makeIntent(),
        decision: makeDecision(),
      });

      const serialized = serializeEvidencePack(pack);

      expect(serialized.intent.branch).toBeUndefined();
      expect(serialized.intent.command).toBeUndefined();
    });
  });
});
