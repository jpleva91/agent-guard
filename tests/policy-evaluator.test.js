import assert from 'node:assert';
import { test, suite } from './run.js';
import { evaluate, matchAction, matchScope } from '../agentguard/policies/evaluator.js';

suite('AgentGuard — Policy Evaluator', () => {
  test('matchAction exact match', () => {
    assert.ok(matchAction('file.write', 'file.write'));
    assert.ok(!matchAction('file.write', 'file.delete'));
  });

  test('matchAction wildcard matches everything', () => {
    assert.ok(matchAction('*', 'file.write'));
    assert.ok(matchAction('*', 'shell.exec'));
  });

  test('matchAction prefix wildcard', () => {
    assert.ok(matchAction('file.*', 'file.write'));
    assert.ok(matchAction('file.*', 'file.delete'));
    assert.ok(!matchAction('file.*', 'shell.exec'));
  });

  test('matchScope exact match', () => {
    assert.ok(matchScope(['src/index.js'], 'src/index.js'));
    assert.ok(!matchScope(['src/index.js'], 'src/other.js'));
  });

  test('matchScope directory prefix', () => {
    assert.ok(matchScope(['src/'], 'src/foo/bar.js'));
    assert.ok(!matchScope(['src/'], 'lib/foo.js'));
  });

  test('matchScope glob suffix', () => {
    assert.ok(matchScope(['*.json'], 'package.json'));
    assert.ok(!matchScope(['*.json'], 'index.js'));
  });

  test('matchScope empty patterns matches all', () => {
    assert.ok(matchScope([], 'anything'));
    assert.ok(matchScope(null, 'anything'));
  });

  test('evaluate denies matching deny rule', () => {
    const policies = [
      {
        id: 'p1',
        name: 'P1',
        severity: 3,
        rules: [{ action: 'file.delete', effect: 'deny', reason: 'No deletes' }],
      },
    ];
    const result = evaluate({ action: 'file.delete', target: 'src/x.js' }, policies);
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.decision, 'deny');
    assert.strictEqual(result.reason, 'No deletes');
  });

  test('evaluate allows when no deny matches', () => {
    const policies = [
      {
        id: 'p1',
        name: 'P1',
        severity: 3,
        rules: [{ action: 'file.delete', effect: 'deny' }],
      },
    ];
    const result = evaluate({ action: 'file.write', target: 'src/x.js' }, policies);
    assert.strictEqual(result.allowed, true);
  });

  test('evaluate returns explicit allow when rule matches', () => {
    const policies = [
      {
        id: 'p1',
        name: 'P1',
        severity: 3,
        rules: [{ action: 'file.write', effect: 'allow', reason: 'Writes OK' }],
      },
    ];
    const result = evaluate({ action: 'file.write' }, policies);
    assert.strictEqual(result.allowed, true);
    assert.strictEqual(result.reason, 'Writes OK');
  });

  test('evaluate deny takes priority over allow', () => {
    const policies = [
      {
        id: 'p1',
        name: 'Deny',
        severity: 4,
        rules: [{ action: 'file.write', effect: 'deny', reason: 'Blocked' }],
      },
      {
        id: 'p2',
        name: 'Allow',
        severity: 1,
        rules: [{ action: 'file.write', effect: 'allow' }],
      },
    ];
    const result = evaluate({ action: 'file.write' }, policies);
    assert.strictEqual(result.allowed, false);
  });

  test('evaluate rejects missing action', () => {
    const result = evaluate({}, []);
    assert.strictEqual(result.allowed, false);
    assert.ok(result.reason.includes('action'));
  });

  test('evaluate handles array actions in rules', () => {
    const policies = [
      {
        id: 'p1',
        name: 'P1',
        severity: 3,
        rules: [{ action: ['file.write', 'file.delete'], effect: 'deny' }],
      },
    ];
    assert.strictEqual(evaluate({ action: 'file.write' }, policies).allowed, false);
    assert.strictEqual(evaluate({ action: 'file.delete' }, policies).allowed, false);
    assert.strictEqual(evaluate({ action: 'shell.exec' }, policies).allowed, true);
  });

  test('evaluate default allow when no policies', () => {
    const result = evaluate({ action: 'file.write' }, []);
    assert.strictEqual(result.allowed, true);
    assert.ok(result.reason.includes('default'));
  });

  test('evaluate with scope conditions', () => {
    const policies = [
      {
        id: 'p1',
        name: 'P1',
        severity: 3,
        rules: [
          {
            action: 'file.write',
            effect: 'deny',
            conditions: { scope: ['config/'] },
          },
        ],
      },
    ];
    // Target in scope — denied
    const r1 = evaluate({ action: 'file.write', target: 'config/prod.yml' }, policies);
    assert.strictEqual(r1.allowed, false);
    // Target out of scope — allowed (condition doesn't match target path in scope check)
    // Note: scope check returns true if target IS in scope, triggering the deny
  });
});
