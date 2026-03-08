import assert from 'node:assert';
import { test, suite } from './run.js';
import {
  matchScope,
  matchCapability,
  evaluate,
  validatePolicy,
  createDenyAllPolicy,
  createDevPolicy,
} from '../domain/policy.js';
import { DECISION } from '../domain/actions.js';

suite('Domain Policy — Capability-Based Policy Engine', () => {
  // --- matchScope ---

  test('matchScope exact match', () => {
    assert.strictEqual(matchScope('src/main.js', 'src/main.js'), true);
  });

  test('matchScope wildcard * matches everything', () => {
    assert.strictEqual(matchScope('*', 'anything'), true);
  });

  test('matchScope single * does not cross directories', () => {
    assert.strictEqual(matchScope('src/*', 'src/main.js'), true);
    assert.strictEqual(matchScope('src/*', 'src/deep/nested.js'), false);
  });

  test('matchScope ** crosses directories', () => {
    assert.strictEqual(matchScope('src/**', 'src/main.js'), true);
    assert.strictEqual(matchScope('src/**', 'src/deep/nested.js'), true);
    assert.strictEqual(matchScope('src/auth/**', 'src/auth/session.js'), true);
    assert.strictEqual(matchScope('src/auth/**', 'src/auth/deep/nested.js'), true);
  });

  test('matchScope rejects non-matching paths', () => {
    assert.strictEqual(matchScope('src/auth/**', 'lib/auth/session.js'), false);
    assert.strictEqual(matchScope('src/auth/**', 'src/other/file.js'), false);
  });

  // --- matchCapability ---

  test('matchCapability matches type and scope', () => {
    assert.strictEqual(
      matchCapability('file.write:src/auth/**', 'file.write', 'src/auth/session.js'),
      true,
    );
  });

  test('matchCapability rejects wrong type', () => {
    assert.strictEqual(
      matchCapability('file.read:src/**', 'file.write', 'src/main.js'),
      false,
    );
  });

  test('matchCapability rejects wrong scope', () => {
    assert.strictEqual(
      matchCapability('file.write:src/auth/**', 'file.write', 'lib/main.js'),
      false,
    );
  });

  test('matchCapability supports wildcard type (file.*)', () => {
    assert.strictEqual(
      matchCapability('file.*:src/**', 'file.write', 'src/main.js'),
      true,
    );
    assert.strictEqual(
      matchCapability('file.*:src/**', 'file.read', 'src/main.js'),
      true,
    );
    assert.strictEqual(
      matchCapability('file.*:src/**', 'git.push', 'src/main.js'),
      false,
    );
  });

  test('matchCapability supports wildcard scope', () => {
    assert.strictEqual(
      matchCapability('test.run:*', 'test.run', 'anything'),
      true,
    );
  });

  test('matchCapability rejects missing colon', () => {
    assert.strictEqual(matchCapability('file.write', 'file.write', 'x'), false);
  });

  // --- validatePolicy ---

  test('validatePolicy accepts valid policy', () => {
    const result = validatePolicy({
      capabilities: ['file.read:*', 'test.run:*'],
    });
    assert.strictEqual(result.valid, true);
  });

  test('validatePolicy rejects null', () => {
    const result = validatePolicy(null);
    assert.strictEqual(result.valid, false);
  });

  test('validatePolicy rejects missing capabilities', () => {
    const result = validatePolicy({});
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('capabilities')));
  });

  test('validatePolicy rejects invalid capability format', () => {
    const result = validatePolicy({ capabilities: ['bad'] });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('Invalid capability format')));
  });

  test('validatePolicy rejects non-array deny', () => {
    const result = validatePolicy({ capabilities: ['file.read:*'], deny: 'nope' });
    assert.strictEqual(result.valid, false);
  });

  // --- evaluate ---

  test('evaluate allows action with matching capability', () => {
    const policy = { capabilities: ['file.write:src/**'] };
    const action = { type: 'file.write', target: 'src/main.js' };
    const result = evaluate(action, policy);
    assert.strictEqual(result.decision, DECISION.ALLOW);
    assert.strictEqual(result.capability, 'file.write:src/**');
  });

  test('evaluate denies action with no matching capability', () => {
    const policy = { capabilities: ['file.read:*'] };
    const action = { type: 'file.write', target: 'src/main.js' };
    const result = evaluate(action, policy);
    assert.strictEqual(result.decision, DECISION.DENY);
  });

  test('evaluate deny rules take precedence over capabilities', () => {
    const policy = {
      capabilities: ['file.*:*'],
      deny: ['file.delete:*'],
    };
    const action = { type: 'file.delete', target: 'important.js' };
    const result = evaluate(action, policy);
    assert.strictEqual(result.decision, DECISION.DENY);
    assert.ok(result.reason.includes('Explicitly denied'));
  });

  test('evaluate escalates on protected paths', () => {
    const policy = {
      capabilities: ['file.write:*'],
      protectedPaths: ['config/**'],
    };
    const action = { type: 'file.write', target: 'config/prod.json' };
    const result = evaluate(action, policy);
    assert.strictEqual(result.decision, DECISION.ESCALATE);
    assert.ok(result.reason.includes('protected path'));
  });

  test('evaluate escalates on protected branches for git actions', () => {
    const policy = {
      capabilities: ['git.push:*'],
      protectedBranches: ['main', 'production'],
    };
    const action = { type: 'git.push', target: 'main' };
    const result = evaluate(action, policy);
    assert.strictEqual(result.decision, DECISION.ESCALATE);
    assert.ok(result.reason.includes('protected branch'));
  });

  test('evaluate allows git push to non-protected branch', () => {
    const policy = {
      capabilities: ['git.push:*'],
      protectedBranches: ['main'],
    };
    const action = { type: 'git.push', target: 'feature/my-branch' };
    const result = evaluate(action, policy);
    assert.strictEqual(result.decision, DECISION.ALLOW);
  });

  // --- Policy factories ---

  test('createDenyAllPolicy denies everything', () => {
    const policy = createDenyAllPolicy();
    const action = { type: 'file.read', target: 'anything' };
    const result = evaluate(action, policy);
    assert.strictEqual(result.decision, DECISION.DENY);
  });

  test('createDevPolicy allows file reads', () => {
    const policy = createDevPolicy();
    const result = evaluate({ type: 'file.read', target: 'src/main.js' }, policy);
    assert.strictEqual(result.decision, DECISION.ALLOW);
  });

  test('createDevPolicy allows tests', () => {
    const policy = createDevPolicy();
    const result = evaluate({ type: 'test.run', target: 'unit' }, policy);
    assert.strictEqual(result.decision, DECISION.ALLOW);
  });

  test('createDevPolicy denies deploy', () => {
    const policy = createDevPolicy();
    const result = evaluate({ type: 'deploy.trigger', target: 'production' }, policy);
    assert.strictEqual(result.decision, DECISION.DENY);
    assert.ok(result.reason.includes('Explicitly denied'));
  });

  test('createDevPolicy escalates git push to main', () => {
    const policy = createDevPolicy();
    const result = evaluate({ type: 'git.push', target: 'main' }, policy);
    assert.strictEqual(result.decision, DECISION.ESCALATE);
  });

  test('createDevPolicy accepts overrides', () => {
    const policy = createDevPolicy({ protectedBranches: [] });
    assert.deepStrictEqual(policy.protectedBranches, []);
  });
});
