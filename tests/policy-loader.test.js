import assert from 'node:assert';
import { test, suite } from './run.js';
import { validatePolicy, loadPolicies, VALID_ACTIONS } from '../agentguard/policies/loader.js';

suite('AgentGuard — Policy Loader', () => {
  test('validates a correct policy', () => {
    const policy = {
      id: 'test-policy',
      name: 'Test Policy',
      rules: [{ action: 'file.write', effect: 'deny', reason: 'No writes' }],
    };
    const result = validatePolicy(policy);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.errors.length, 0);
  });

  test('rejects policy without id', () => {
    const result = validatePolicy({ name: 'X', rules: [{ action: '*', effect: 'deny' }] });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('id')));
  });

  test('rejects policy without name', () => {
    const result = validatePolicy({ id: 'x', rules: [{ action: '*', effect: 'deny' }] });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('name')));
  });

  test('rejects policy without rules', () => {
    const result = validatePolicy({ id: 'x', name: 'X', rules: [] });
    assert.strictEqual(result.valid, false);
  });

  test('rejects rule with invalid effect', () => {
    const result = validatePolicy({
      id: 'x',
      name: 'X',
      rules: [{ action: '*', effect: 'maybe' }],
    });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('effect')));
  });

  test('rejects rule without action', () => {
    const result = validatePolicy({
      id: 'x',
      name: 'X',
      rules: [{ effect: 'deny' }],
    });
    assert.strictEqual(result.valid, false);
  });

  test('validates severity range', () => {
    const good = validatePolicy({
      id: 'x',
      name: 'X',
      severity: 3,
      rules: [{ action: '*', effect: 'deny' }],
    });
    assert.strictEqual(good.valid, true);

    const bad = validatePolicy({
      id: 'x',
      name: 'X',
      severity: 10,
      rules: [{ action: '*', effect: 'deny' }],
    });
    assert.strictEqual(bad.valid, false);
  });

  test('accepts array actions in rules', () => {
    const result = validatePolicy({
      id: 'x',
      name: 'X',
      rules: [{ action: ['file.write', 'file.delete'], effect: 'deny' }],
    });
    assert.strictEqual(result.valid, true);
  });

  test('loadPolicies loads valid policies and skips invalid', () => {
    const { policies, errors } = loadPolicies([
      { id: 'a', name: 'A', rules: [{ action: '*', effect: 'deny' }] },
      { id: 'b', name: 'B' }, // invalid - no rules
      { id: 'c', name: 'C', rules: [{ action: 'file.write', effect: 'allow' }] },
    ]);
    assert.strictEqual(policies.length, 2);
    assert.ok(errors.length > 0);
  });

  test('loadPolicies rejects duplicate IDs', () => {
    const { policies, errors } = loadPolicies([
      { id: 'dup', name: 'A', rules: [{ action: '*', effect: 'deny' }] },
      { id: 'dup', name: 'B', rules: [{ action: '*', effect: 'allow' }] },
    ]);
    assert.strictEqual(policies.length, 1);
    assert.ok(errors.some((e) => e.includes('Duplicate')));
  });

  test('loadPolicies defaults severity to 3', () => {
    const { policies } = loadPolicies([
      { id: 'x', name: 'X', rules: [{ action: '*', effect: 'deny' }] },
    ]);
    assert.strictEqual(policies[0].severity, 3);
  });

  test('loadPolicies rejects non-array input', () => {
    const { policies, errors } = loadPolicies('not an array');
    assert.strictEqual(policies.length, 0);
    assert.ok(errors.length > 0);
  });

  test('VALID_ACTIONS contains expected action types', () => {
    assert.ok(VALID_ACTIONS.has('file.write'));
    assert.ok(VALID_ACTIONS.has('shell.exec'));
    assert.ok(VALID_ACTIONS.has('git.push'));
    assert.ok(VALID_ACTIONS.has('*'));
  });
});
