// Tests for evidence pack generation
import { describe, it, expect } from 'vitest';
import {
  createEvidencePack,
  createExplainableEvidencePack,
  serializeEvidencePack,
  EVIDENCE_PACK_SCHEMA_VERSION,
} from '../../src/kernel/evidence.js';
import type {
  NormalizedIntent,
  EvalResult,
  LoadedPolicy,
} from '../../src/policy/evaluator.js';
import type { InvariantCheck } from '../../src/invariants/checker.js';
import type { DomainEvent } from '../../src/core/types.js';
import type { SimulationSummary } from '../../src/kernel/decisions/types.js';

function makeIntent(overrides: Partial<NormalizedIntent> = {}): NormalizedIntent {
  return {
    action: 'file.write',
    target: 'src/index.ts',
    agent: 'test-agent',
    destructive: false,
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

function makeAllowResult(overrides: Partial<EvalResult> = {}): EvalResult {
  return {
    allowed: true,
    decision: 'allow',
    matchedRule: null,
    matchedPolicy: null,
    reason: 'Allowed',
    severity: 0,
    ...overrides,
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
      check: () => ({ holds: false, expected: 'No secrets', actual: 'Secrets found' }),
    },
    result: {
      holds: false,
      expected: 'No sensitive files modified',
      actual: 'Sensitive files detected: .env',
    },
    ...overrides,
  };
}

function makeFakeEvent(id: string): DomainEvent {
  return {
    id,
    kind: 'ACTION_REQUESTED',
    timestamp: Date.now(),
    fingerprint: 'fp_1',
    payload: {},
  } as DomainEvent;
}

describe('createEvidencePack', () => {
  it('creates a pack with deny decision and no violations', () => {
    const { pack, event } = createEvidencePack({
      intent: makeIntent(),
      decision: makeDenyResult(),
    });

    expect(pack.packId).toMatch(/^pack_/);
    expect(pack.intent.action).toBe('file.write');
    expect(pack.decision.decision).toBe('deny');
    expect(pack.violations).toHaveLength(0);
    expect(pack.severity).toBe(3);
    expect(pack.summary).toContain('DENY');
    expect(pack.summary).toContain('file.write');
    expect(event.kind).toBe('EvidencePackGenerated');
  });

  it('creates a pack with violations', () => {
    const violation = makeViolation();
    const { pack } = createEvidencePack({
      intent: makeIntent(),
      decision: makeDenyResult(),
      violations: [violation],
    });

    expect(pack.violations).toHaveLength(1);
    expect(pack.violations[0].invariantId).toBe('no-secret-exposure');
    expect(pack.violations[0].name).toBe('No Secret Exposure');
    expect(pack.violations[0].severity).toBe(5);
    expect(pack.summary).toContain('Violations');
    expect(pack.summary).toContain('No Secret Exposure');
  });

  it('computes max severity from violations', () => {
    const { pack } = createEvidencePack({
      intent: makeIntent(),
      decision: makeDenyResult({ severity: 2 }),
      violations: [makeViolation()], // severity 5
    });

    expect(pack.severity).toBe(5);
  });

  it('uses decision severity when higher than violations', () => {
    const lowSeverityViolation = makeViolation({
      invariant: {
        id: 'lockfile',
        name: 'Lockfile',
        description: 'test',
        severity: 1,
        check: () => ({ holds: false, expected: '', actual: '' }),
      },
    });

    const { pack } = createEvidencePack({
      intent: makeIntent(),
      decision: makeDenyResult({ severity: 4 }),
      violations: [lowSeverityViolation],
    });

    expect(pack.severity).toBe(4);
  });

  it('includes event IDs in pack', () => {
    const events = [makeFakeEvent('evt_1'), makeFakeEvent('evt_2')];
    const { pack } = createEvidencePack({
      intent: makeIntent(),
      decision: makeDenyResult(),
      events,
    });

    expect(pack.events).toEqual(['evt_1', 'evt_2']);
  });

  it('generates EVIDENCE_PACK_GENERATED event with metadata', () => {
    const { event } = createEvidencePack({
      intent: makeIntent(),
      decision: makeDenyResult({ severity: 3 }),
      violations: [makeViolation()],
      events: [makeFakeEvent('evt_1')],
    });

    expect(event.kind).toBe('EvidencePackGenerated');
    const evt = event as Record<string, unknown>;
    expect(evt.eventIds).toEqual(['evt_1']);
    const metadata = evt.metadata as Record<string, unknown>;
    expect(metadata.severity).toBe(5);
    expect(metadata.violationCount).toBe(1);
  });

  it('includes reason in summary', () => {
    const { pack } = createEvidencePack({
      intent: makeIntent(),
      decision: makeDenyResult({ reason: 'Protected branch' }),
    });

    expect(pack.summary).toContain('Reason: Protected branch');
  });

  it('creates pack for allowed decision', () => {
    const { pack } = createEvidencePack({
      intent: makeIntent(),
      decision: makeAllowResult(),
    });

    expect(pack.summary).toContain('ALLOW');
    expect(pack.severity).toBe(0);
    expect(pack.violations).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Helpers for explainable evidence pack tests
// ---------------------------------------------------------------------------

function makePolicy(): LoadedPolicy {
  return {
    id: 'policy-1',
    name: 'Test Policy',
    rules: [
      { action: 'git.push', effect: 'deny', reason: 'Protected branch' },
      { action: 'file.*', effect: 'allow' },
    ],
    severity: 3,
  };
}

function makeDenyWithTrace(): EvalResult {
  const policy = makePolicy();
  return {
    allowed: false,
    decision: 'deny',
    matchedRule: policy.rules[0],
    matchedPolicy: policy,
    reason: 'Protected branch',
    severity: 3,
    trace: {
      rulesEvaluated: [
        {
          policyId: 'policy-1',
          policyName: 'Test Policy',
          ruleIndex: 0,
          rule: policy.rules[0],
          actionMatched: true,
          conditionsMatched: true,
          conditionDetails: {},
          outcome: 'match',
        },
        {
          policyId: 'policy-1',
          policyName: 'Test Policy',
          ruleIndex: 1,
          rule: policy.rules[1],
          actionMatched: false,
          conditionsMatched: false,
          conditionDetails: {},
          outcome: 'skipped',
        },
      ],
      totalRulesChecked: 1,
      phaseThatMatched: 'deny',
      durationMs: 0.5,
    },
  };
}

function makeAllowWithTrace(): EvalResult {
  const policy = makePolicy();
  return {
    allowed: true,
    decision: 'allow',
    matchedRule: policy.rules[1],
    matchedPolicy: policy,
    reason: 'Allowed by policy "Test Policy"',
    severity: 0,
    trace: {
      rulesEvaluated: [
        {
          policyId: 'policy-1',
          policyName: 'Test Policy',
          ruleIndex: 0,
          rule: policy.rules[0],
          actionMatched: false,
          conditionsMatched: false,
          conditionDetails: {},
          outcome: 'no-match',
        },
        {
          policyId: 'policy-1',
          policyName: 'Test Policy',
          ruleIndex: 1,
          rule: policy.rules[1],
          actionMatched: true,
          conditionsMatched: true,
          conditionDetails: { scopeMatched: true },
          outcome: 'match',
        },
      ],
      totalRulesChecked: 2,
      phaseThatMatched: 'allow',
      durationMs: 1.2,
    },
  };
}

function makeSimulation(): SimulationSummary {
  return {
    predictedChanges: ['src/index.ts', 'src/utils.ts'],
    blastRadius: 5,
    riskLevel: 'low',
    simulatorId: 'filesystem-sim',
    durationMs: 12,
  };
}

// ---------------------------------------------------------------------------
// createExplainableEvidencePack tests
// ---------------------------------------------------------------------------

describe('createExplainableEvidencePack', () => {
  it('includes schema version and deterministic verdict type', () => {
    const { pack } = createExplainableEvidencePack({
      intent: makeIntent(),
      decision: makeDenyWithTrace(),
    });

    expect(pack.schemaVersion).toBe(EVIDENCE_PACK_SCHEMA_VERSION);
    expect(pack.verdictType).toBe('deterministic');
    expect(pack.confidence).toBe(1.0);
  });

  it('preserves base evidence pack fields', () => {
    const { pack } = createExplainableEvidencePack({
      intent: makeIntent(),
      decision: makeDenyWithTrace(),
    });

    expect(pack.packId).toMatch(/^pack_/);
    expect(pack.intent.action).toBe('file.write');
    expect(pack.decision.decision).toBe('deny');
    expect(pack.summary).toContain('DENY');
  });

  it('builds evaluation path from policy trace', () => {
    const { pack } = createExplainableEvidencePack({
      intent: makeIntent(),
      decision: makeDenyWithTrace(),
    });

    // Normalization step + 1 non-skipped policy rule + invariant-check (pass) + verdict
    const phases = pack.evaluationPath.map((s) => s.phase);
    expect(phases).toContain('normalization');
    expect(phases).toContain('policy-evaluation');
    expect(phases).toContain('invariant-check');
    expect(phases).toContain('verdict');

    // Normalization step
    const normStep = pack.evaluationPath.find((s) => s.phase === 'normalization');
    expect(normStep?.outcome).toBe('pass');
    expect(normStep?.description).toContain('file.write');

    // Policy step — only the match, not the skipped rule
    const policySteps = pack.evaluationPath.filter((s) => s.phase === 'policy-evaluation');
    expect(policySteps).toHaveLength(1);
    expect(policySteps[0].outcome).toBe('match');
    expect(policySteps[0].details?.policyId).toBe('policy-1');
  });

  it('builds evaluation path without trace', () => {
    const decision = makeDenyResult({ reason: 'No matching rule' });
    const { pack } = createExplainableEvidencePack({
      intent: makeIntent(),
      decision,
    });

    const policySteps = pack.evaluationPath.filter((s) => s.phase === 'policy-evaluation');
    expect(policySteps).toHaveLength(1);
    expect(policySteps[0].description).toContain('No policy trace');
  });

  it('includes invariant violation steps', () => {
    const violation = makeViolation();
    const { pack } = createExplainableEvidencePack({
      intent: makeIntent(),
      decision: makeDenyWithTrace(),
      violations: [violation],
    });

    const invariantSteps = pack.evaluationPath.filter((s) => s.phase === 'invariant-check');
    expect(invariantSteps).toHaveLength(1);
    expect(invariantSteps[0].outcome).toBe('fail');
    expect(invariantSteps[0].description).toContain('No Secret Exposure');
    expect(invariantSteps[0].details?.invariantId).toBe('no-secret-exposure');
  });

  it('shows "all invariants hold" when no violations', () => {
    const { pack } = createExplainableEvidencePack({
      intent: makeIntent(),
      decision: makeAllowWithTrace(),
    });

    const invariantSteps = pack.evaluationPath.filter((s) => s.phase === 'invariant-check');
    expect(invariantSteps).toHaveLength(1);
    expect(invariantSteps[0].outcome).toBe('pass');
    expect(invariantSteps[0].description).toBe('All invariants hold');
  });

  it('includes simulation step when provided', () => {
    const sim = makeSimulation();
    const { pack } = createExplainableEvidencePack({
      intent: makeIntent(),
      decision: makeAllowWithTrace(),
      simulation: sim,
    });

    const simSteps = pack.evaluationPath.filter((s) => s.phase === 'simulation');
    expect(simSteps).toHaveLength(1);
    expect(simSteps[0].outcome).toBe('pass');
    expect(simSteps[0].details?.riskLevel).toBe('low');
    expect(simSteps[0].details?.blastRadius).toBe(5);
    expect(simSteps[0].durationMs).toBe(12);
  });

  it('marks high-risk simulation as fail', () => {
    const sim: SimulationSummary = {
      ...makeSimulation(),
      riskLevel: 'high',
      blastRadius: 50,
    };
    const { pack } = createExplainableEvidencePack({
      intent: makeIntent(),
      decision: makeDenyWithTrace(),
      simulation: sim,
    });

    const simSteps = pack.evaluationPath.filter((s) => s.phase === 'simulation');
    expect(simSteps[0].outcome).toBe('fail');
  });

  it('omits simulation step when not provided', () => {
    const { pack } = createExplainableEvidencePack({
      intent: makeIntent(),
      decision: makeAllowWithTrace(),
    });

    const simSteps = pack.evaluationPath.filter((s) => s.phase === 'simulation');
    expect(simSteps).toHaveLength(0);
  });

  it('builds provenance from matched policy rule', () => {
    const { pack } = createExplainableEvidencePack({
      intent: makeIntent(),
      decision: makeDenyWithTrace(),
    });

    const policyProv = pack.provenance.find((p) => p.sourceType === 'policy-rule');
    expect(policyProv).toBeDefined();
    expect(policyProv?.sourceId).toBe('policy-1');
    expect(policyProv?.sourceName).toBe('Test Policy');
    expect(policyProv?.contribution).toBe('deny');
    expect(policyProv?.evidence).toBe('Protected branch');
  });

  it('builds provenance from default allow', () => {
    const { pack } = createExplainableEvidencePack({
      intent: makeIntent(),
      decision: makeAllowResult({ reason: 'No matching policy — default allow' }),
    });

    const defaultProv = pack.provenance.find((p) => p.sourceType === 'default');
    expect(defaultProv).toBeDefined();
    expect(defaultProv?.sourceId).toBe('default-allow');
    expect(defaultProv?.contribution).toBe('allow');
  });

  it('builds provenance from invariant violations', () => {
    const { pack } = createExplainableEvidencePack({
      intent: makeIntent(),
      decision: makeDenyWithTrace(),
      violations: [makeViolation()],
    });

    const invProv = pack.provenance.find((p) => p.sourceType === 'invariant');
    expect(invProv).toBeDefined();
    expect(invProv?.sourceId).toBe('no-secret-exposure');
    expect(invProv?.contribution).toBe('deny');
    expect(invProv?.evidence).toContain('Expected:');
  });

  it('builds provenance from simulation', () => {
    const { pack } = createExplainableEvidencePack({
      intent: makeIntent(),
      decision: makeAllowWithTrace(),
      simulation: makeSimulation(),
    });

    const simProv = pack.provenance.find((p) => p.sourceType === 'simulation');
    expect(simProv).toBeDefined();
    expect(simProv?.sourceId).toBe('filesystem-sim');
    expect(simProv?.contribution).toBe('neutral');
    expect(simProv?.evidence).toContain('Risk: low');
  });

  it('marks high-risk simulation provenance as deny', () => {
    const sim: SimulationSummary = { ...makeSimulation(), riskLevel: 'high' };
    const { pack } = createExplainableEvidencePack({
      intent: makeIntent(),
      decision: makeDenyWithTrace(),
      simulation: sim,
    });

    const simProv = pack.provenance.find((p) => p.sourceType === 'simulation');
    expect(simProv?.contribution).toBe('deny');
  });

  it('emits standard EVIDENCE_PACK_GENERATED event', () => {
    const { event } = createExplainableEvidencePack({
      intent: makeIntent(),
      decision: makeDenyWithTrace(),
    });

    expect(event.kind).toBe('EvidencePackGenerated');
  });
});

// ---------------------------------------------------------------------------
// serializeEvidencePack tests
// ---------------------------------------------------------------------------

describe('serializeEvidencePack', () => {
  it('produces a self-contained JSON-serializable object', () => {
    const { pack } = createExplainableEvidencePack({
      intent: makeIntent(),
      decision: makeDenyWithTrace(),
      violations: [makeViolation()],
      simulation: makeSimulation(),
    });

    const serialized = serializeEvidencePack(pack);
    const json = JSON.stringify(serialized);
    const parsed = JSON.parse(json);

    expect(parsed.schemaVersion).toBe(EVIDENCE_PACK_SCHEMA_VERSION);
    expect(parsed.packId).toMatch(/^pack_/);
    expect(parsed.verdict.decision).toBe('deny');
    expect(parsed.verdict.type).toBe('deterministic');
    expect(parsed.verdict.confidence).toBe(1.0);
  });

  it('converts timestamp to ISO string', () => {
    const { pack } = createExplainableEvidencePack({
      intent: makeIntent(),
      decision: makeAllowWithTrace(),
    });

    const serialized = serializeEvidencePack(pack);
    expect(serialized.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('flattens intent fields', () => {
    const { pack } = createExplainableEvidencePack({
      intent: makeIntent({ branch: 'main', command: 'git push' }),
      decision: makeDenyWithTrace(),
    });

    const serialized = serializeEvidencePack(pack);
    expect(serialized.intent.action).toBe('file.write');
    expect(serialized.intent.target).toBe('src/index.ts');
    expect(serialized.intent.agent).toBe('test-agent');
    expect(serialized.intent.destructive).toBe(false);
    expect(serialized.intent.branch).toBe('main');
    expect(serialized.intent.command).toBe('git push');
  });

  it('omits optional intent fields when not present', () => {
    const { pack } = createExplainableEvidencePack({
      intent: makeIntent(),
      decision: makeAllowWithTrace(),
    });

    const serialized = serializeEvidencePack(pack);
    expect(serialized.intent.branch).toBeUndefined();
    expect(serialized.intent.command).toBeUndefined();
  });

  it('includes evaluation path and provenance', () => {
    const { pack } = createExplainableEvidencePack({
      intent: makeIntent(),
      decision: makeDenyWithTrace(),
      violations: [makeViolation()],
      simulation: makeSimulation(),
    });

    const serialized = serializeEvidencePack(pack);
    expect(serialized.evaluationPath.length).toBeGreaterThan(0);
    expect(serialized.provenance.length).toBeGreaterThan(0);
  });

  it('includes violations in serialized form', () => {
    const { pack } = createExplainableEvidencePack({
      intent: makeIntent(),
      decision: makeDenyWithTrace(),
      violations: [makeViolation()],
    });

    const serialized = serializeEvidencePack(pack);
    expect(serialized.violations).toHaveLength(1);
    expect(serialized.violations[0].invariantId).toBe('no-secret-exposure');
  });

  it('round-trips through JSON without data loss', () => {
    const { pack } = createExplainableEvidencePack({
      intent: makeIntent({ branch: 'feature' }),
      decision: makeDenyWithTrace(),
      violations: [makeViolation()],
      events: [makeFakeEvent('evt_1')],
      simulation: makeSimulation(),
    });

    const serialized = serializeEvidencePack(pack);
    const json = JSON.stringify(serialized);
    const restored = JSON.parse(json);

    expect(restored.packId).toBe(serialized.packId);
    expect(restored.verdict.decision).toBe('deny');
    expect(restored.evaluationPath).toEqual(serialized.evaluationPath);
    expect(restored.provenance).toEqual(serialized.provenance);
    expect(restored.relatedEventIds).toEqual(['evt_1']);
  });
});
