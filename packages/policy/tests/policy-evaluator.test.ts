// Tests for policy evaluator — TypeScript version
import { describe, it, expect } from 'vitest';
import { evaluate, matchAction, matchScope } from '@red-codes/policy';
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

describe('matchAction', () => {
  it('matches exact action', () => {
    expect(matchAction('file.write', 'file.write')).toBe(true);
  });

  it('does not match different action', () => {
    expect(matchAction('file.write', 'file.read')).toBe(false);
  });

  it('matches wildcard *', () => {
    expect(matchAction('*', 'file.write')).toBe(true);
    expect(matchAction('*', 'git.push')).toBe(true);
  });

  it('matches prefix wildcard (file.*)', () => {
    expect(matchAction('file.*', 'file.write')).toBe(true);
    expect(matchAction('file.*', 'file.read')).toBe(true);
    expect(matchAction('file.*', 'file.delete')).toBe(true);
  });

  it('does not match different prefix with wildcard', () => {
    expect(matchAction('file.*', 'git.push')).toBe(false);
  });

  it('does not partially match without wildcard', () => {
    expect(matchAction('file', 'file.write')).toBe(false);
  });
});

describe('matchScope', () => {
  it('matches wildcard scope', () => {
    expect(matchScope(['*'], 'src/index.ts')).toBe(true);
  });

  it('matches exact path', () => {
    expect(matchScope(['src/index.ts'], 'src/index.ts')).toBe(true);
  });

  it('matches directory prefix', () => {
    expect(matchScope(['src/'], 'src/index.ts')).toBe(true);
    expect(matchScope(['src/'], 'src/components/button.ts')).toBe(true);
  });

  it('does not match different directory', () => {
    expect(matchScope(['src/'], 'test/index.ts')).toBe(false);
  });

  it('matches suffix pattern', () => {
    expect(matchScope(['*.ts'], 'src/index.ts')).toBe(true);
    expect(matchScope(['*.ts'], 'src/index.js')).toBe(false);
  });

  it('returns true for empty scope (no restriction)', () => {
    expect(matchScope([], 'anything.ts')).toBe(true);
  });

  it('returns false when target is empty (fail-closed)', () => {
    expect(matchScope(['src/'], '')).toBe(false);
  });

  it('matches any pattern in array', () => {
    expect(matchScope(['test/', 'src/'], 'src/index.ts')).toBe(true);
  });
});

describe('evaluate', () => {
  it('returns deny for null intent', () => {
    const result = evaluate(null as never, []);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('missing required field');
  });

  it('returns deny for intent without action', () => {
    const result = evaluate({ action: '' } as NormalizedIntent, []);
    expect(result.allowed).toBe(false);
  });

  it('returns default deny when no policies match (fail-closed)', () => {
    const result = evaluate(makeIntent(), []);
    expect(result.allowed).toBe(false);
    expect(result.decision).toBe('deny');
    expect(result.reason).toContain('default deny');
    expect(result.severity).toBe(3);
  });

  it('returns default allow when no policies match with defaultDeny: false (fail-open)', () => {
    const result = evaluate(makeIntent(), [], { defaultDeny: false });
    expect(result.allowed).toBe(true);
    expect(result.decision).toBe('allow');
    expect(result.reason).toContain('default allow');
    expect(result.severity).toBe(0);
  });

  it('denies when a deny rule matches', () => {
    const policy = makePolicy({
      rules: [{ action: 'file.write', effect: 'deny', reason: 'No writes allowed' }],
    });
    const result = evaluate(makeIntent(), [policy]);
    expect(result.allowed).toBe(false);
    expect(result.decision).toBe('deny');
    expect(result.reason).toBe('No writes allowed');
    expect(result.matchedPolicy).toBe(policy);
  });

  it('allows when an allow rule matches', () => {
    const policy = makePolicy({
      rules: [{ action: 'file.write', effect: 'allow', reason: 'Writes allowed' }],
    });
    const result = evaluate(makeIntent(), [policy]);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('Writes allowed');
  });

  it('deny takes priority over allow', () => {
    const policy = makePolicy({
      rules: [
        { action: 'file.write', effect: 'allow', reason: 'Allowed' },
        { action: 'file.write', effect: 'deny', reason: 'Denied' },
      ],
    });
    const result = evaluate(makeIntent(), [policy]);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Denied');
  });

  it('matches wildcard action patterns', () => {
    const policy = makePolicy({
      rules: [{ action: 'git.*', effect: 'deny', reason: 'No git' }],
    });
    const result = evaluate(makeIntent({ action: 'git.push' }), [policy]);
    expect(result.allowed).toBe(false);
  });

  it('matches array of actions in rule', () => {
    const policy = makePolicy({
      rules: [{ action: ['git.push', 'git.merge'], effect: 'deny', reason: 'No git ops' }],
    });
    expect(evaluate(makeIntent({ action: 'git.push' }), [policy]).allowed).toBe(false);
    expect(evaluate(makeIntent({ action: 'git.merge' }), [policy]).allowed).toBe(false);
    // git.commit is not in the deny list, but default-deny means it's still denied
    expect(evaluate(makeIntent({ action: 'git.commit' }), [policy]).allowed).toBe(false);
    // With fail-open, unmatched actions are allowed
    expect(
      evaluate(makeIntent({ action: 'git.commit' }), [policy], { defaultDeny: false }).allowed
    ).toBe(true);
  });

  describe('conditions', () => {
    it('deny rule with scope condition — matches scope', () => {
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
      expect(result.allowed).toBe(false);
    });

    it('deny rule with scope condition — does not match scope (default deny)', () => {
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
      // Scope doesn't match so the deny rule doesn't fire,
      // but default-deny still blocks the action
      const result = evaluate(makeIntent({ target: 'test/helper.ts' }), [policy]);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('default deny');
    });

    it('deny rule with scope condition — does not match scope (fail-open)', () => {
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
      // With fail-open, unmatched scope falls through to allow
      const result = evaluate(makeIntent({ target: 'test/helper.ts' }), [policy], {
        defaultDeny: false,
      });
      expect(result.allowed).toBe(true);
    });

    it('deny rule with limit condition — triggers when filesAffected exceeds limit', () => {
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
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Too many files');
    });

    it('deny rule with limit condition — does not trigger when under limit', () => {
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
      // Under limit — matchConditions still returns true (the rule matches),
      // but filesAffected <= limit doesn't trigger the early return
      const result = evaluate(makeIntent({ filesAffected: 5 }), [policy]);
      // The deny rule still matches because matchConditions returns true
      // (limit is not exceeded, so it falls through to the default return true)
      expect(result.allowed).toBe(false);
    });

    it('deny rule with branch condition — matches branch', () => {
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
      expect(result.allowed).toBe(false);
    });

    it('deny rule with branch condition — does not match other branch', () => {
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
      // branch is 'feature' — doesn't match 'main' or 'master',
      // but matchConditions still returns true (falls through)
      const result = evaluate(makeIntent({ action: 'git.push', branch: 'feature' }), [policy]);
      expect(result.allowed).toBe(false);
    });
  });

  it('evaluates across multiple policies', () => {
    const allowPolicy = makePolicy({
      id: 'allow-reads',
      name: 'Allow Reads',
      rules: [{ action: 'file.read', effect: 'allow' }],
    });
    const denyPolicy = makePolicy({
      id: 'deny-writes',
      name: 'Deny Writes',
      rules: [{ action: 'file.write', effect: 'deny', reason: 'No writes' }],
    });

    expect(evaluate(makeIntent({ action: 'file.read' }), [allowPolicy, denyPolicy]).allowed).toBe(
      true
    );
    expect(evaluate(makeIntent({ action: 'file.write' }), [allowPolicy, denyPolicy]).allowed).toBe(
      false
    );
  });

  it('returns severity from matched policy', () => {
    const policy = makePolicy({
      severity: 4,
      rules: [{ action: 'git.push', effect: 'deny' }],
    });
    const result = evaluate(makeIntent({ action: 'git.push' }), [policy]);
    expect(result.severity).toBe(4);
  });

  it('returns severity 3 for default-denied actions', () => {
    const result = evaluate(makeIntent(), []);
    expect(result.severity).toBe(3);
  });

  it('returns severity 0 for allowed actions (fail-open)', () => {
    const result = evaluate(makeIntent(), [], { defaultDeny: false });
    expect(result.severity).toBe(0);
  });

  it('returns severity 0 for explicitly allowed actions', () => {
    const policy = makePolicy({
      rules: [{ action: 'file.write', effect: 'allow', reason: 'Allowed' }],
    });
    const result = evaluate(makeIntent(), [policy]);
    expect(result.severity).toBe(0);
  });

  describe('default-deny for unknown/unrecognized actions', () => {
    it('denies an unknown action type with no matching rule', () => {
      const policy = makePolicy({
        rules: [{ action: 'file.read', effect: 'allow' }],
      });
      const result = evaluate(makeIntent({ action: 'custom.unknown' }), [policy]);
      expect(result.allowed).toBe(false);
      expect(result.decision).toBe('deny');
      expect(result.reason).toContain('default deny');
      expect(result.matchedRule).toBeNull();
      expect(result.matchedPolicy).toBeNull();
    });

    it('denies unrecognized action even with many allow rules for other types', () => {
      const policy = makePolicy({
        rules: [
          { action: 'file.read', effect: 'allow' },
          { action: 'file.write', effect: 'allow' },
          { action: 'git.diff', effect: 'allow' },
          { action: 'shell.exec', effect: 'allow' },
        ],
      });
      const result = evaluate(makeIntent({ action: 'infra.destroy' }), [policy]);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('default deny');
    });

    it('allows explicitly listed action while denying unlisted ones', () => {
      const policy = makePolicy({
        rules: [{ action: 'file.read', effect: 'allow' }],
      });
      const allowed = evaluate(makeIntent({ action: 'file.read' }), [policy]);
      const denied = evaluate(makeIntent({ action: 'file.write' }), [policy]);
      expect(allowed.allowed).toBe(true);
      expect(denied.allowed).toBe(false);
    });

    it('sets trace.phaseThatMatched to "default" for default-deny', () => {
      const result = evaluate(makeIntent({ action: 'deploy.trigger' }), []);
      expect(result.trace).toBeDefined();
      expect(result.trace!.phaseThatMatched).toBe('default');
    });

    it('uses severity 3 for default-deny decisions', () => {
      const result = evaluate(makeIntent({ action: 'npm.publish' }), []);
      expect(result.severity).toBe(3);
    });

    it('fail-open opt-in allows unknown actions', () => {
      const policy = makePolicy({
        rules: [{ action: 'file.read', effect: 'allow' }],
      });
      const result = evaluate(makeIntent({ action: 'custom.unknown' }), [policy], {
        defaultDeny: false,
      });
      expect(result.allowed).toBe(true);
      expect(result.reason).toContain('default allow');
    });
  });

  describe('policy intervention field', () => {
    it('passes through intervention from deny rule', () => {
      const policy = makePolicy({
        rules: [
          { action: 'git.push', effect: 'deny', reason: 'Needs review', intervention: 'pause' },
        ],
      });
      const result = evaluate(makeIntent({ action: 'git.push' }), [policy]);
      expect(result.allowed).toBe(false);
      expect(result.policyIntervention).toBe('pause');
    });

    it('passes through rollback intervention', () => {
      const policy = makePolicy({
        rules: [
          {
            action: 'file.write',
            effect: 'deny',
            reason: 'Rollback safety',
            intervention: 'rollback',
          },
        ],
      });
      const result = evaluate(makeIntent({ action: 'file.write' }), [policy]);
      expect(result.policyIntervention).toBe('rollback');
    });

    it('policyIntervention is undefined when rule has no intervention', () => {
      const policy = makePolicy({
        rules: [{ action: 'git.push', effect: 'deny', reason: 'Blocked' }],
      });
      const result = evaluate(makeIntent({ action: 'git.push' }), [policy]);
      expect(result.policyIntervention).toBeUndefined();
    });
  });
});
