// Tests for policy evaluation traces (Issue #124)
import { describe, it, expect } from 'vitest';
import { evaluate } from '@red-codes/policy';
import type { NormalizedIntent, LoadedPolicy } from '@red-codes/policy';

function makeIntent(overrides: Partial<NormalizedIntent> = {}): NormalizedIntent {
  return {
    action: 'file.write',
    target: 'src/index.ts',
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

describe('PolicyEvaluationTrace', () => {
  describe('trace presence', () => {
    it('includes trace on default allow (no policies)', () => {
      const result = evaluate(makeIntent(), []);
      expect(result.trace).toBeDefined();
      expect(result.trace!.phaseThatMatched).toBe('default');
      expect(result.trace!.totalRulesChecked).toBe(0);
      expect(result.trace!.rulesEvaluated).toEqual([]);
    });

    it('includes trace on invalid intent', () => {
      const result = evaluate(null as never, []);
      expect(result.trace).toBeDefined();
      expect(result.trace!.phaseThatMatched).toBeNull();
      expect(result.trace!.totalRulesChecked).toBe(0);
    });

    it('includes trace on deny match', () => {
      const policy = makePolicy({
        rules: [{ action: 'file.write', effect: 'deny', reason: 'No writes' }],
      });
      const result = evaluate(makeIntent(), [policy]);
      expect(result.trace).toBeDefined();
      expect(result.trace!.phaseThatMatched).toBe('deny');
    });

    it('includes trace on allow match', () => {
      const policy = makePolicy({
        rules: [{ action: 'file.write', effect: 'allow', reason: 'Writes OK' }],
      });
      const result = evaluate(makeIntent(), [policy]);
      expect(result.trace).toBeDefined();
      expect(result.trace!.phaseThatMatched).toBe('allow');
    });
  });

  describe('rule evaluation tracking', () => {
    it('records each deny rule evaluated', () => {
      const policy = makePolicy({
        rules: [
          { action: 'git.push', effect: 'deny', reason: 'No pushes' },
          { action: 'file.write', effect: 'deny', reason: 'No writes' },
        ],
      });
      const result = evaluate(makeIntent(), [policy]);
      const trace = result.trace!;

      // The first deny rule doesn't match action, second does
      const denyRules = trace.rulesEvaluated.filter((r) => r.rule.effect === 'deny');
      expect(denyRules.length).toBe(2);

      // First rule: action not matched
      expect(denyRules[0].actionMatched).toBe(false);
      expect(denyRules[0].outcome).toBe('no-match');

      // Second rule: action matched, conditions matched (no conditions)
      expect(denyRules[1].actionMatched).toBe(true);
      expect(denyRules[1].conditionsMatched).toBe(true);
      expect(denyRules[1].outcome).toBe('match');
    });

    it('records allow rules as skipped during deny phase', () => {
      const policy = makePolicy({
        rules: [
          { action: 'file.write', effect: 'allow', reason: 'Allowed' },
          { action: 'file.write', effect: 'deny', reason: 'Denied' },
        ],
      });
      const result = evaluate(makeIntent(), [policy]);
      const trace = result.trace!;

      // The allow rule should be recorded as 'skipped' during deny phase
      const allowEntry = trace.rulesEvaluated.find((r) => r.rule.effect === 'allow');
      expect(allowEntry).toBeDefined();
      expect(allowEntry!.outcome).toBe('skipped');
    });

    it('tracks rules across multiple policies', () => {
      const policy1 = makePolicy({
        id: 'policy-1',
        name: 'Policy 1',
        rules: [{ action: 'git.push', effect: 'deny', reason: 'No git' }],
      });
      const policy2 = makePolicy({
        id: 'policy-2',
        name: 'Policy 2',
        rules: [{ action: 'file.write', effect: 'deny', reason: 'No writes' }],
      });

      const result = evaluate(makeIntent(), [policy1, policy2]);
      const trace = result.trace!;

      // Both policies should have entries
      expect(trace.rulesEvaluated.some((r) => r.policyId === 'policy-1')).toBe(true);
      expect(trace.rulesEvaluated.some((r) => r.policyId === 'policy-2')).toBe(true);
    });

    it('includes policy name in trace entries', () => {
      const policy = makePolicy({
        id: 'my-policy',
        name: 'My Security Policy',
        rules: [{ action: 'file.write', effect: 'deny' }],
      });
      const result = evaluate(makeIntent(), [policy]);
      const entry = result.trace!.rulesEvaluated.find((r) => r.policyId === 'my-policy');
      expect(entry).toBeDefined();
      expect(entry!.policyName).toBe('My Security Policy');
    });

    it('tracks rule index within the policy', () => {
      const policy = makePolicy({
        rules: [
          { action: 'git.push', effect: 'deny' },
          { action: 'git.commit', effect: 'deny' },
          { action: 'file.write', effect: 'deny' },
        ],
      });
      const result = evaluate(makeIntent(), [policy]);
      const trace = result.trace!;

      // Check that ruleIndex values are correct
      const indices = trace.rulesEvaluated.map((r) => r.ruleIndex);
      expect(indices).toEqual([0, 1, 2]);
    });
  });

  describe('condition detail tracking', () => {
    it('records scope match details', () => {
      const policy = makePolicy({
        rules: [
          {
            action: 'file.write',
            effect: 'deny',
            conditions: { scope: ['src/'] },
            reason: 'No writes to src',
          },
        ],
      });
      const result = evaluate(makeIntent({ target: 'src/index.ts' }), [policy]);
      const entry = result.trace!.rulesEvaluated.find((r) => r.outcome === 'match');
      expect(entry).toBeDefined();
      expect(entry!.conditionDetails.scopeMatched).toBe(true);
    });

    it('records scope mismatch details', () => {
      const policy = makePolicy({
        rules: [
          {
            action: 'file.write',
            effect: 'deny',
            conditions: { scope: ['src/'] },
            reason: 'No writes to src',
          },
        ],
      });
      const result = evaluate(makeIntent({ target: 'test/helper.ts' }), [policy]);
      const entry = result.trace!.rulesEvaluated.find(
        (r) => r.rule.effect === 'deny' && r.actionMatched
      );
      expect(entry).toBeDefined();
      expect(entry!.conditionDetails.scopeMatched).toBe(false);
      expect(entry!.outcome).toBe('no-match');
    });

    it('records limit exceeded details', () => {
      const policy = makePolicy({
        rules: [
          {
            action: 'file.write',
            effect: 'deny',
            conditions: { limit: 10 },
            reason: 'Too many files',
          },
        ],
      });
      const result = evaluate(makeIntent({ filesAffected: 15 }), [policy]);
      const entry = result.trace!.rulesEvaluated.find((r) => r.outcome === 'match');
      expect(entry).toBeDefined();
      expect(entry!.conditionDetails.limitExceeded).toBe(true);
    });

    it('records branch match details', () => {
      const policy = makePolicy({
        rules: [
          {
            action: 'git.push',
            effect: 'deny',
            conditions: { branches: ['main', 'master'] },
            reason: 'Protected branch',
          },
        ],
      });
      const result = evaluate(makeIntent({ action: 'git.push', branch: 'main' }), [policy]);
      const entry = result.trace!.rulesEvaluated.find((r) => r.outcome === 'match');
      expect(entry).toBeDefined();
      expect(entry!.conditionDetails.branchMatched).toBe(true);
    });
  });

  describe('totalRulesChecked', () => {
    it('counts only non-skipped rules', () => {
      const policy = makePolicy({
        rules: [
          { action: 'file.write', effect: 'allow', reason: 'Allowed' },
          { action: 'file.write', effect: 'deny', reason: 'Denied' },
        ],
      });
      const result = evaluate(makeIntent(), [policy]);
      // The allow rule is skipped in deny phase, but the deny rule matches
      // So only 1 non-skipped rule was checked before the match
      expect(result.trace!.totalRulesChecked).toBeGreaterThanOrEqual(1);
    });

    it('is 0 when no policies exist', () => {
      const result = evaluate(makeIntent(), []);
      expect(result.trace!.totalRulesChecked).toBe(0);
    });
  });

  describe('durationMs', () => {
    it('captures evaluation duration', () => {
      const result = evaluate(makeIntent(), []);
      expect(result.trace!.durationMs).toBeGreaterThanOrEqual(0);
      expect(typeof result.trace!.durationMs).toBe('number');
    });
  });

  describe('phaseThatMatched', () => {
    it('is "deny" when a deny rule matches', () => {
      const policy = makePolicy({
        rules: [{ action: 'file.write', effect: 'deny' }],
      });
      const result = evaluate(makeIntent(), [policy]);
      expect(result.trace!.phaseThatMatched).toBe('deny');
    });

    it('is "allow" when an allow rule matches', () => {
      const policy = makePolicy({
        rules: [{ action: 'file.write', effect: 'allow' }],
      });
      const result = evaluate(makeIntent(), [policy]);
      expect(result.trace!.phaseThatMatched).toBe('allow');
    });

    it('is "default" when no rules match', () => {
      const policy = makePolicy({
        rules: [{ action: 'git.push', effect: 'deny' }],
      });
      const result = evaluate(makeIntent(), [policy]);
      expect(result.trace!.phaseThatMatched).toBe('default');
    });

    it('is null on invalid intent', () => {
      const result = evaluate(null as never, []);
      expect(result.trace!.phaseThatMatched).toBeNull();
    });
  });

  describe('integration with EvalResult', () => {
    it('trace does not change the evaluation outcome', () => {
      const policy = makePolicy({
        rules: [{ action: 'file.write', effect: 'deny', reason: 'Denied' }],
      });
      const result = evaluate(makeIntent(), [policy]);

      // Core result unchanged
      expect(result.allowed).toBe(false);
      expect(result.decision).toBe('deny');
      expect(result.matchedRule).toEqual({
        action: 'file.write',
        effect: 'deny',
        reason: 'Denied',
      });
      expect(result.matchedPolicy).toBe(policy);
      expect(result.reason).toBe('Denied');

      // Trace is additive
      expect(result.trace).toBeDefined();
    });

    it('preserves backward compatibility — trace is optional', () => {
      // The trace field is defined as optional in EvalResult,
      // so existing code that doesn't use it won't break
      const result = evaluate(makeIntent(), []);
      const { trace: _trace, ...resultWithoutTrace } = result;
      expect(resultWithoutTrace.allowed).toBe(true);
      expect(resultWithoutTrace.decision).toBe('allow');
    });
  });
});
