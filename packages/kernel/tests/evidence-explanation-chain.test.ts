// Tests for explanation chain — formal probabilistic/deterministic separation
import { describe, it, expect } from 'vitest';
import {
  createExplainableEvidencePack,
  serializeEvidencePack,
  EVIDENCE_PACK_SCHEMA_VERSION,
} from '@red-codes/kernel';
import type { ExplanationChain, ReasoningMode } from '@red-codes/kernel';
import type { NormalizedIntent, EvalResult, LoadedPolicy } from '@red-codes/policy';
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

function makeAllowResult(overrides: Partial<EvalResult> = {}): EvalResult {
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

function makeDenyResult(overrides: Partial<EvalResult> = {}): EvalResult {
  return {
    allowed: false,
    decision: 'deny',
    matchedRule: null,
    matchedPolicy: null,
    reason: 'Policy denied',
    severity: 3,
    ...overrides,
  };
}

function makePolicy(): LoadedPolicy {
  return {
    id: 'policy-1',
    name: 'Test Policy',
    rules: [{ action: 'git.push', effect: 'deny', reason: 'Protected branch' }],
    severity: 3,
  };
}

function makeViolation(overrides: Partial<InvariantCheck> = {}): InvariantCheck {
  return {
    holds: false,
    invariant: {
      id: 'no-secret-exposure',
      name: 'No Secret Exposure',
      description: 'No secrets',
      severity: 5,
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

describe('explanation chain', () => {
  describe('schema version', () => {
    it('uses schema version 1.1.0', () => {
      expect(EVIDENCE_PACK_SCHEMA_VERSION).toBe('1.1.0');
    });
  });

  describe('reasoning mode classification', () => {
    it('classifies policy-rule provenance as deterministic', () => {
      const policy = makePolicy();
      const { pack } = createExplainableEvidencePack({
        intent: makeIntent(),
        decision: makeDenyResult({
          matchedPolicy: policy,
          matchedRule: policy.rules[0],
        }),
      });

      const policyProv = pack.provenance.find((p) => p.sourceType === 'policy-rule');
      expect(policyProv?.reasoningMode).toBe('deterministic');
      expect(policyProv?.confidenceScore).toBe(1.0);
    });

    it('classifies default provenance as deterministic', () => {
      const { pack } = createExplainableEvidencePack({
        intent: makeIntent(),
        decision: makeAllowResult(),
      });

      const defaultProv = pack.provenance.find((p) => p.sourceType === 'default');
      expect(defaultProv?.reasoningMode).toBe('deterministic');
      expect(defaultProv?.confidenceScore).toBe(1.0);
    });

    it('classifies invariant provenance as deterministic', () => {
      const { pack } = createExplainableEvidencePack({
        intent: makeIntent(),
        decision: makeDenyResult(),
        violations: [makeViolation()],
      });

      const invProv = pack.provenance.find((p) => p.sourceType === 'invariant');
      expect(invProv?.reasoningMode).toBe('deterministic');
      expect(invProv?.confidenceScore).toBe(1.0);
    });

    it('classifies simulation provenance as probabilistic', () => {
      const { pack } = createExplainableEvidencePack({
        intent: makeIntent(),
        decision: makeAllowResult(),
        simulation: makeSimulation(),
      });

      const simProv = pack.provenance.find((p) => p.sourceType === 'simulation');
      expect(simProv?.reasoningMode).toBe('probabilistic');
      expect(simProv?.confidenceScore).toBeLessThan(1.0);
    });

    it('assigns higher confidence to high-risk simulations', () => {
      const { pack: lowPack } = createExplainableEvidencePack({
        intent: makeIntent(),
        decision: makeAllowResult(),
        simulation: makeSimulation({ riskLevel: 'low' }),
      });

      const { pack: highPack } = createExplainableEvidencePack({
        intent: makeIntent(),
        decision: makeDenyResult(),
        simulation: makeSimulation({ riskLevel: 'high' }),
      });

      const lowSim = lowPack.provenance.find((p) => p.sourceType === 'simulation');
      const highSim = highPack.provenance.find((p) => p.sourceType === 'simulation');

      expect(highSim!.confidenceScore).toBeGreaterThan(lowSim!.confidenceScore);
    });

    it('assigns medium confidence for medium-risk simulations', () => {
      const { pack } = createExplainableEvidencePack({
        intent: makeIntent(),
        decision: makeAllowResult(),
        simulation: makeSimulation({ riskLevel: 'medium' }),
      });

      const simProv = pack.provenance.find((p) => p.sourceType === 'simulation');
      expect(simProv?.confidenceScore).toBe(0.7);
    });
  });

  describe('explanation chain structure', () => {
    it('includes explanation chain in evidence pack', () => {
      const { pack } = createExplainableEvidencePack({
        intent: makeIntent(),
        decision: makeAllowResult(),
      });

      expect(pack.explanationChain).toBeDefined();
      expect(pack.explanationChain.verdictBasis).toBe('deterministic');
    });

    it('separates deterministic and probabilistic inputs', () => {
      const policy = makePolicy();
      const { pack } = createExplainableEvidencePack({
        intent: makeIntent(),
        decision: makeDenyResult({
          matchedPolicy: policy,
          matchedRule: policy.rules[0],
        }),
        violations: [makeViolation()],
        simulation: makeSimulation({ riskLevel: 'high' }),
      });

      const chain = pack.explanationChain;

      // Policy rule + invariant = 2 deterministic
      expect(chain.deterministicInputs).toHaveLength(2);
      expect(chain.deterministicInputs.every((p) => p.reasoningMode === 'deterministic')).toBe(
        true
      );

      // Simulation = 1 probabilistic
      expect(chain.probabilisticInputs).toHaveLength(1);
      expect(chain.probabilisticInputs.every((p) => p.reasoningMode === 'probabilistic')).toBe(
        true
      );
    });

    it('verdict matches decision outcome for deny', () => {
      const { pack } = createExplainableEvidencePack({
        intent: makeIntent(),
        decision: makeDenyResult(),
      });

      expect(pack.explanationChain.verdict).toBe('deny');
    });

    it('verdict matches decision outcome for allow', () => {
      const { pack } = createExplainableEvidencePack({
        intent: makeIntent(),
        decision: makeAllowResult(),
      });

      expect(pack.explanationChain.verdict).toBe('allow');
    });

    it('verdictBasis is always deterministic', () => {
      const { pack } = createExplainableEvidencePack({
        intent: makeIntent(),
        decision: makeAllowResult(),
        simulation: makeSimulation({ riskLevel: 'high' }),
      });

      expect(pack.explanationChain.verdictBasis).toBe('deterministic');
    });

    it('has no probabilistic inputs when no simulation provided', () => {
      const { pack } = createExplainableEvidencePack({
        intent: makeIntent(),
        decision: makeAllowResult(),
      });

      expect(pack.explanationChain.probabilisticInputs).toHaveLength(0);
      expect(pack.explanationChain.deterministicInputs.length).toBeGreaterThan(0);
    });

    it('derivation includes deterministic source names for deny', () => {
      const policy = makePolicy();
      const { pack } = createExplainableEvidencePack({
        intent: makeIntent(),
        decision: makeDenyResult({
          matchedPolicy: policy,
          matchedRule: policy.rules[0],
        }),
      });

      expect(pack.explanationChain.derivation).toContain('Deterministic deny');
      expect(pack.explanationChain.derivation).toContain('Test Policy');
      expect(pack.explanationChain.derivation).toContain('DENY');
    });

    it('derivation includes deterministic source names for allow', () => {
      const { pack } = createExplainableEvidencePack({
        intent: makeIntent(),
        decision: makeAllowResult(),
      });

      expect(pack.explanationChain.derivation).toContain('Deterministic allow');
      expect(pack.explanationChain.derivation).toContain('ALLOW');
    });

    it('derivation includes probabilistic advisory when simulation present', () => {
      const { pack } = createExplainableEvidencePack({
        intent: makeIntent(),
        decision: makeAllowResult(),
        simulation: makeSimulation({ riskLevel: 'medium' }),
      });

      expect(pack.explanationChain.derivation).toContain('Probabilistic advisory');
      expect(pack.explanationChain.derivation).toContain('confidence: 0.7');
    });

    it('deterministic + probabilistic inputs sum to total provenance', () => {
      const policy = makePolicy();
      const { pack } = createExplainableEvidencePack({
        intent: makeIntent(),
        decision: makeDenyResult({
          matchedPolicy: policy,
          matchedRule: policy.rules[0],
        }),
        violations: [makeViolation()],
        simulation: makeSimulation(),
      });

      const chain = pack.explanationChain;
      expect(chain.deterministicInputs.length + chain.probabilisticInputs.length).toBe(
        pack.provenance.length
      );
    });
  });

  describe('serialization', () => {
    it('includes explanation chain in serialized output', () => {
      const { pack } = createExplainableEvidencePack({
        intent: makeIntent(),
        decision: makeDenyResult(),
        simulation: makeSimulation(),
      });

      const serialized = serializeEvidencePack(pack);

      expect(serialized.explanationChain).toBeDefined();
      expect(serialized.explanationChain.verdict).toBe('deny');
      expect(serialized.explanationChain.verdictBasis).toBe('deterministic');
      expect(serialized.explanationChain.deterministicInputs.length).toBeGreaterThan(0);
    });

    it('round-trips explanation chain through JSON', () => {
      const policy = makePolicy();
      const { pack } = createExplainableEvidencePack({
        intent: makeIntent(),
        decision: makeDenyResult({
          matchedPolicy: policy,
          matchedRule: policy.rules[0],
        }),
        violations: [makeViolation()],
        simulation: makeSimulation({ riskLevel: 'high' }),
      });

      const serialized = serializeEvidencePack(pack);
      const json = JSON.stringify(serialized);
      const restored = JSON.parse(json);

      expect(restored.explanationChain.deterministicInputs).toHaveLength(2);
      expect(restored.explanationChain.probabilisticInputs).toHaveLength(1);
      expect(restored.explanationChain.verdict).toBe('deny');
      expect(restored.explanationChain.verdictBasis).toBe('deterministic');
      expect(restored.explanationChain.derivation).toBeTruthy();
    });

    it('preserves reasoning mode and confidence in serialized provenance', () => {
      const { pack } = createExplainableEvidencePack({
        intent: makeIntent(),
        decision: makeAllowResult(),
        simulation: makeSimulation({ riskLevel: 'high' }),
      });

      const serialized = serializeEvidencePack(pack);
      const json = JSON.stringify(serialized);
      const restored = JSON.parse(json);

      const simProv = restored.provenance.find(
        (p: { sourceType: string }) => p.sourceType === 'simulation'
      );
      expect(simProv.reasoningMode).toBe('probabilistic');
      expect(simProv.confidenceScore).toBe(0.9);

      const defaultProv = restored.provenance.find(
        (p: { sourceType: string }) => p.sourceType === 'default'
      );
      expect(defaultProv.reasoningMode).toBe('deterministic');
      expect(defaultProv.confidenceScore).toBe(1.0);
    });
  });
});
