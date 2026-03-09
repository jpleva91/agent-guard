// Tests for evidence pack generation
import { describe, it, expect } from 'vitest';
import { createEvidencePack } from '../../src/kernel/evidence.js';
import type { NormalizedIntent, EvalResult } from '../../src/policy/evaluator.js';
import type { InvariantCheck } from '../../src/invariants/checker.js';
import type { DomainEvent } from '../../src/core/types.js';

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
