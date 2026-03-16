// Tests for requireTests and requireFormat gate conditions in policy evaluator
import { describe, it, expect } from 'vitest';
import { evaluate } from '@red-codes/policy';
import type { NormalizedIntent, LoadedPolicy } from '@red-codes/policy';

function makeIntent(overrides: Partial<NormalizedIntent> = {}): NormalizedIntent {
  return {
    action: 'git.commit',
    target: '',
    agent: 'test-agent',
    destructive: false,
    ...overrides,
  };
}

function makePolicyWithGate(gate: Record<string, boolean>): LoadedPolicy {
  return {
    id: 'gate-policy',
    name: 'Gate Policy',
    rules: [
      {
        action: 'git.commit',
        effect: 'deny' as const,
        conditions: gate,
        reason: 'Gate condition not met',
      },
      {
        action: 'git.commit',
        effect: 'allow' as const,
        reason: 'Default allow commits',
      },
    ],
    severity: 3,
  };
}

describe('requireFormat gate condition', () => {
  const policy = makePolicyWithGate({ requireFormat: true });

  it('denies git.commit when formatPass is missing', () => {
    const intent = makeIntent();
    const result = evaluate(intent, [policy]);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Gate condition not met');
  });

  it('denies git.commit when formatPass is false', () => {
    const intent = makeIntent({ metadata: { formatPass: false } });
    const result = evaluate(intent, [policy]);
    expect(result.allowed).toBe(false);
  });

  it('allows git.commit when formatPass is true', () => {
    const intent = makeIntent({ metadata: { formatPass: true } });
    const result = evaluate(intent, [policy]);
    expect(result.allowed).toBe(true);
  });
});

describe('requireTests gate condition', () => {
  const policy = makePolicyWithGate({ requireTests: true });

  it('denies git.commit when testsPass is missing', () => {
    const intent = makeIntent();
    const result = evaluate(intent, [policy]);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Gate condition not met');
  });

  it('denies git.commit when testsPass is false', () => {
    const intent = makeIntent({ metadata: { testsPass: false } });
    const result = evaluate(intent, [policy]);
    expect(result.allowed).toBe(false);
  });

  it('allows git.commit when testsPass is true', () => {
    const intent = makeIntent({ metadata: { testsPass: true } });
    const result = evaluate(intent, [policy]);
    expect(result.allowed).toBe(true);
  });
});

describe('gate conditions compose with other conditions', () => {
  it('skips deny when formatPass is true even with branch condition', () => {
    const policy: LoadedPolicy = {
      id: 'composed-policy',
      name: 'Composed Policy',
      rules: [
        {
          action: 'git.commit',
          effect: 'deny' as const,
          conditions: { requireFormat: true, branches: ['main'] },
          reason: 'Format required on main',
        },
        {
          action: 'git.commit',
          effect: 'allow' as const,
          reason: 'Default allow',
        },
      ],
      severity: 3,
    };

    const intent = makeIntent({
      branch: 'main',
      metadata: { formatPass: true },
    });
    const result = evaluate(intent, [policy]);
    expect(result.allowed).toBe(true);
  });

  it('denies when formatPass is false and branch matches', () => {
    const policy: LoadedPolicy = {
      id: 'composed-policy',
      name: 'Composed Policy',
      rules: [
        {
          action: 'git.commit',
          effect: 'deny' as const,
          conditions: { requireFormat: true, branches: ['main'] },
          reason: 'Format required on main',
        },
        {
          action: 'git.commit',
          effect: 'allow' as const,
          reason: 'Default allow',
        },
      ],
      severity: 3,
    };

    const intent = makeIntent({ branch: 'main' });
    const result = evaluate(intent, [policy]);
    expect(result.allowed).toBe(false);
  });
});
