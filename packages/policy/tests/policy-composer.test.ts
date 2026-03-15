// Tests for policy composer — composition, precedence, and description
import { describe, it, expect } from 'vitest';
import { composePolicies, describeComposition } from '@red-codes/policy';
import type { CompositionSource } from '@red-codes/policy';
import type { LoadedPolicy } from '@red-codes/policy';

function makePolicy(id: string, name: string, rules: LoadedPolicy['rules'] = []): LoadedPolicy {
  return { id, name, rules, severity: 3 };
}

function makeSource(
  path: string,
  layer: CompositionSource['layer'],
  policy: LoadedPolicy
): CompositionSource {
  return { path, layer, policy };
}

// ---------------------------------------------------------------------------
// composePolicies
// ---------------------------------------------------------------------------

describe('composePolicies', () => {
  it('returns empty result for no sources', () => {
    const result = composePolicies([]);
    expect(result.policies).toHaveLength(0);
    expect(result.sources).toHaveLength(0);
    expect(result.layers).toEqual({ user: 0, project: 0, explicit: 0 });
  });

  it('returns single policy for single source', () => {
    const policy = makePolicy('local', 'Local');
    const result = composePolicies([makeSource('./agentguard.yaml', 'project', policy)]);

    expect(result.policies).toHaveLength(1);
    expect(result.policies[0].id).toBe('local');
    expect(result.layers).toEqual({ user: 0, project: 1, explicit: 0 });
  });

  it('orders policies by layer precedence: user < project < explicit', () => {
    const userPolicy = makePolicy('user-base', 'User Base');
    const projectPolicy = makePolicy('project', 'Project');
    const explicitPolicy = makePolicy('override', 'Override');

    // Provide in reverse order to test sorting
    const result = composePolicies([
      makeSource('--policy override.yaml', 'explicit', explicitPolicy),
      makeSource('./agentguard.yaml', 'project', projectPolicy),
      makeSource('~/.agentguard/policy.yaml', 'user', userPolicy),
    ]);

    expect(result.policies).toHaveLength(3);
    expect(result.policies[0].id).toBe('user-base');
    expect(result.policies[1].id).toBe('project');
    expect(result.policies[2].id).toBe('override');
    expect(result.layers).toEqual({ user: 1, project: 1, explicit: 1 });
  });

  it('preserves order within the same layer', () => {
    const explicitA = makePolicy('explicit-a', 'Explicit A');
    const explicitB = makePolicy('explicit-b', 'Explicit B');

    const result = composePolicies([
      makeSource('a.yaml', 'explicit', explicitA),
      makeSource('b.yaml', 'explicit', explicitB),
    ]);

    expect(result.policies).toHaveLength(2);
    expect(result.policies[0].id).toBe('explicit-a');
    expect(result.policies[1].id).toBe('explicit-b');
    expect(result.layers).toEqual({ user: 0, project: 0, explicit: 2 });
  });

  it('handles multiple policies per layer', () => {
    const user = makePolicy('user', 'User');
    const projectA = makePolicy('project-a', 'Project A');
    const projectB = makePolicy('project-b', 'Project B');
    const override = makePolicy('override', 'Override');

    const result = composePolicies([
      makeSource('~/.agentguard/policy.yaml', 'user', user),
      makeSource('./agentguard.yaml', 'project', projectA),
      makeSource('./team-policy.yaml', 'project', projectB),
      makeSource('strict.yaml', 'explicit', override),
    ]);

    expect(result.policies).toHaveLength(4);
    expect(result.policies[0].id).toBe('user');
    expect(result.policies[1].id).toBe('project-a');
    expect(result.policies[2].id).toBe('project-b');
    expect(result.policies[3].id).toBe('override');
  });
});

// ---------------------------------------------------------------------------
// describeComposition
// ---------------------------------------------------------------------------

describe('describeComposition', () => {
  it('reports fail-open for empty composition', () => {
    const result = composePolicies([]);
    expect(describeComposition(result)).toBe('No policies loaded (fail-open)');
  });

  it('returns single path for single-policy composition', () => {
    const policy = makePolicy('local', 'Local', [{ action: '*', effect: 'allow' }]);
    const result = composePolicies([makeSource('./agentguard.yaml', 'project', policy)]);
    expect(describeComposition(result)).toBe('./agentguard.yaml');
  });

  it('describes multi-policy composition with layers', () => {
    const userPolicy = makePolicy('user', 'User', [{ action: 'git.push', effect: 'deny' }]);
    const projectPolicy = makePolicy('project', 'Project', [
      { action: 'file.write', effect: 'deny' },
      { action: 'file.read', effect: 'allow' },
    ]);

    const result = composePolicies([
      makeSource('~/.agentguard/policy.yaml', 'user', userPolicy),
      makeSource('./agentguard.yaml', 'project', projectPolicy),
    ]);

    const desc = describeComposition(result);
    expect(desc).toContain('2 policies composed');
    expect(desc).toContain('[user]');
    expect(desc).toContain('[project]');
    expect(desc).toContain('1 rules');
    expect(desc).toContain('2 rules');
  });

  it('labels explicit policies as override', () => {
    const a = makePolicy('a', 'A', [{ action: '*', effect: 'deny' }]);
    const b = makePolicy('b', 'B', [{ action: '*', effect: 'allow' }]);

    const result = composePolicies([
      makeSource('base.yaml', 'explicit', a),
      makeSource('override.yaml', 'explicit', b),
    ]);

    const desc = describeComposition(result);
    expect(desc).toContain('[override]');
    expect(desc).toContain('base.yaml');
    expect(desc).toContain('override.yaml');
  });
});

// ---------------------------------------------------------------------------
// PolicyComposed event
// ---------------------------------------------------------------------------

describe('PolicyComposed event', () => {
  it('creates a valid PolicyComposed event', async () => {
    const { createEvent, POLICY_COMPOSED, resetEventCounter } = await import('@red-codes/events');

    resetEventCounter();

    const event = createEvent(POLICY_COMPOSED, {
      policyCount: 3,
      totalRules: 8,
      sources: [
        { path: '~/.agentguard/policy.yaml', layer: 'user', policyId: 'user-base', ruleCount: 2 },
        { path: './agentguard.yaml', layer: 'project', policyId: 'project', ruleCount: 4 },
        { path: 'strict.yaml', layer: 'explicit', policyId: 'strict', ruleCount: 2 },
      ],
      layers: { user: 1, project: 1, explicit: 1 },
    });

    expect(event.kind).toBe('PolicyComposed');
    expect((event as Record<string, unknown>).policyCount).toBe(3);
    expect((event as Record<string, unknown>).totalRules).toBe(8);
    expect((event as Record<string, unknown>).sources).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Integration: composition + evaluator
// ---------------------------------------------------------------------------

describe('composition with evaluator', () => {
  it('composed policies are evaluated correctly', async () => {
    const { evaluate } = await import('@red-codes/policy');

    const baseDeny = makePolicy('base', 'Base', [
      { action: 'git.push', effect: 'deny', reason: 'Base denies push' },
    ]);
    const projectAllow = makePolicy('project', 'Project', [
      { action: 'file.read', effect: 'allow', reason: 'Project allows reads' },
    ]);

    const result = composePolicies([
      makeSource('~/.agentguard/policy.yaml', 'user', baseDeny),
      makeSource('./agentguard.yaml', 'project', projectAllow),
    ]);

    // git.push should be denied by base policy
    const pushResult = evaluate(
      { action: 'git.push', target: 'origin/main', agent: 'test', destructive: false },
      result.policies
    );
    expect(pushResult.allowed).toBe(false);
    expect(pushResult.reason).toBe('Base denies push');

    // file.read should be allowed by project policy
    const readResult = evaluate(
      { action: 'file.read', target: 'src/main.ts', agent: 'test', destructive: false },
      result.policies
    );
    expect(readResult.allowed).toBe(true);
    expect(readResult.reason).toBe('Project allows reads');
  });

  it('deny from any layer blocks the action', async () => {
    const { evaluate } = await import('@red-codes/policy');

    const baseDeny = makePolicy('base', 'Base', [
      { action: 'file.delete', effect: 'deny', reason: 'Base blocks deletes' },
    ]);
    const overrideAllow = makePolicy('override', 'Override', [
      { action: 'file.delete', effect: 'allow', reason: 'Override allows deletes' },
    ]);

    const result = composePolicies([
      makeSource('base.yaml', 'user', baseDeny),
      makeSource('override.yaml', 'explicit', overrideAllow),
    ]);

    // Deny from base takes precedence (deny phase runs first in evaluator)
    const deleteResult = evaluate(
      { action: 'file.delete', target: '/tmp/test', agent: 'test', destructive: true },
      result.policies
    );
    expect(deleteResult.allowed).toBe(false);
    expect(deleteResult.reason).toBe('Base blocks deletes');
  });
});
