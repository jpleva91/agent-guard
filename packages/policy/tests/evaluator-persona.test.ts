import { describe, it, expect } from 'vitest';
import { evaluate } from '../src/evaluator.js';
import type { NormalizedIntent, LoadedPolicy } from '../src/evaluator.js';

function makeIntent(overrides: Partial<NormalizedIntent> = {}): NormalizedIntent {
  return {
    action: 'git.push',
    target: 'main',
    agent: 'test-agent',
    destructive: false,
    ...overrides,
  };
}

function makePolicy(overrides: Partial<LoadedPolicy> = {}): LoadedPolicy {
  return {
    id: 'test-policy',
    name: 'Test Policy',
    rules: [],
    severity: 3,
    ...overrides,
  };
}

describe('policy evaluator — persona conditions', () => {
  it('denies when persona trustTier matches deny rule', () => {
    const intent = makeIntent({
      persona: { trustTier: 'untrusted', role: 'developer' },
    });
    const policy = makePolicy({
      rules: [
        {
          action: 'git.push',
          effect: 'deny',
          conditions: { persona: { trustTier: ['untrusted', 'limited'] } },
          reason: 'Low-trust agents cannot push',
        },
      ],
    });
    const result = evaluate(intent, [policy]);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Low-trust agents cannot push');
  });

  it('allows when persona trustTier does not match deny rule', () => {
    const intent = makeIntent({
      persona: { trustTier: 'standard' },
    });
    const policy = makePolicy({
      rules: [
        {
          action: 'git.push',
          effect: 'deny',
          conditions: { persona: { trustTier: ['untrusted'] } },
          reason: 'Untrusted cannot push',
        },
      ],
    });
    const result = evaluate(intent, [policy]);
    expect(result.allowed).toBe(true);
  });

  it('does not match persona condition when intent has no persona', () => {
    const intent = makeIntent(); // no persona
    const policy = makePolicy({
      rules: [
        {
          action: 'git.push',
          effect: 'deny',
          conditions: { persona: { trustTier: ['untrusted'] } },
          reason: 'Should not match without persona',
        },
      ],
    });
    const result = evaluate(intent, [policy]);
    expect(result.allowed).toBe(true);
  });

  it('matches on role condition', () => {
    const intent = makeIntent({
      persona: { role: 'ci' },
    });
    const policy = makePolicy({
      rules: [
        {
          action: 'git.push',
          effect: 'deny',
          conditions: { persona: { role: ['ci'] } },
          reason: 'CI agents cannot push directly',
        },
      ],
    });
    const result = evaluate(intent, [policy]);
    expect(result.allowed).toBe(false);
  });

  it('matches on tags condition (any match)', () => {
    const intent = makeIntent({
      persona: { tags: ['nightly', 'team-a'] },
    });
    const policy = makePolicy({
      rules: [
        {
          action: '*',
          effect: 'deny',
          conditions: { persona: { tags: ['nightly'] } },
          reason: 'Nightly agents restricted',
        },
      ],
    });
    const result = evaluate(intent, [policy]);
    expect(result.allowed).toBe(false);
  });

  it('requires all persona sub-conditions to match (AND semantics)', () => {
    const intent = makeIntent({
      persona: { trustTier: 'untrusted', role: 'developer' },
    });
    const policy = makePolicy({
      rules: [
        {
          action: 'git.push',
          effect: 'deny',
          conditions: { persona: { trustTier: ['untrusted'], role: ['ci'] } },
          reason: 'Must match both',
        },
      ],
    });
    // trustTier matches but role doesn't → should NOT match
    const result = evaluate(intent, [policy]);
    expect(result.allowed).toBe(true);
  });

  it('includes personaMatched in evaluation trace', () => {
    const intent = makeIntent({
      persona: { trustTier: 'untrusted' },
    });
    const policy = makePolicy({
      rules: [
        {
          action: 'git.push',
          effect: 'deny',
          conditions: { persona: { trustTier: ['untrusted'] } },
          reason: 'Denied',
        },
      ],
    });
    const result = evaluate(intent, [policy]);
    expect(result.trace).toBeDefined();
    const matchedRule = result.trace!.rulesEvaluated.find((r) => r.outcome === 'match');
    expect(matchedRule).toBeDefined();
    expect(matchedRule!.conditionDetails.personaMatched).toBe(true);
  });
});
