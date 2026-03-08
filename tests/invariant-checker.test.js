import assert from 'node:assert';
import { test, suite } from './run.js';
import { resetEventCounter } from '../domain/events.js';
import {
  checkInvariant,
  checkAllInvariants,
  buildSystemState,
} from '../agentguard/invariants/checker.js';
import { DEFAULT_INVARIANTS } from '../agentguard/invariants/definitions.js';

suite('AgentGuard — Invariant Checker', () => {
  test('checkInvariant returns holds=true when invariant passes', () => {
    const inv = {
      id: 'test',
      name: 'Test',
      severity: 1,
      check: () => ({ holds: true, expected: 'ok', actual: 'ok' }),
    };
    const result = checkInvariant(inv, {});
    assert.strictEqual(result.holds, true);
  });

  test('checkInvariant returns holds=false when invariant fails', () => {
    const inv = {
      id: 'test',
      name: 'Test',
      severity: 3,
      check: () => ({ holds: false, expected: 'safe', actual: 'danger' }),
    };
    const result = checkInvariant(inv, {});
    assert.strictEqual(result.holds, false);
    assert.strictEqual(result.result.actual, 'danger');
  });

  test('checkAllInvariants with no violations returns allHold=true', () => {
    resetEventCounter();
    const invariants = [
      { id: 'a', name: 'A', severity: 1, check: () => ({ holds: true, expected: '', actual: '' }) },
      { id: 'b', name: 'B', severity: 1, check: () => ({ holds: true, expected: '', actual: '' }) },
    ];
    const { violations, events, allHold } = checkAllInvariants(invariants, {});
    assert.strictEqual(allHold, true);
    assert.strictEqual(violations.length, 0);
    assert.strictEqual(events.length, 0);
  });

  test('checkAllInvariants generates events for violations', () => {
    resetEventCounter();
    const invariants = [
      {
        id: 'ok',
        name: 'OK',
        severity: 1,
        check: () => ({ holds: true, expected: '', actual: '' }),
      },
      {
        id: 'bad',
        name: 'Bad',
        severity: 4,
        check: () => ({ holds: false, expected: 'x', actual: 'y' }),
      },
    ];
    const { violations, events, allHold } = checkAllInvariants(invariants, {});
    assert.strictEqual(allHold, false);
    assert.strictEqual(violations.length, 1);
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].kind, 'InvariantViolation');
    assert.strictEqual(events[0].invariant, 'bad');
  });

  test('buildSystemState normalizes context', () => {
    const state = buildSystemState({ modifiedFiles: ['a.js'], targetBranch: 'main' });
    assert.deepStrictEqual(state.modifiedFiles, ['a.js']);
    assert.strictEqual(state.targetBranch, 'main');
    assert.strictEqual(state.filesAffected, 1);
    assert.strictEqual(state.blastRadiusLimit, 20);
  });

  test('buildSystemState handles empty context', () => {
    const state = buildSystemState();
    assert.deepStrictEqual(state.modifiedFiles, []);
    assert.strictEqual(state.filesAffected, 0);
  });
});

suite('AgentGuard — Default Invariants', () => {
  test('no-secret-exposure detects .env files', () => {
    const inv = DEFAULT_INVARIANTS.find((i) => i.id === 'no-secret-exposure');
    const result = inv.check({ modifiedFiles: ['.env', 'src/index.js'] });
    assert.strictEqual(result.holds, false);
    assert.ok(result.actual.includes('.env'));
  });

  test('no-secret-exposure passes for safe files', () => {
    const inv = DEFAULT_INVARIANTS.find((i) => i.id === 'no-secret-exposure');
    const result = inv.check({ modifiedFiles: ['src/index.js', 'README.md'] });
    assert.strictEqual(result.holds, true);
  });

  test('protected-branch blocks direct push to main', () => {
    const inv = DEFAULT_INVARIANTS.find((i) => i.id === 'protected-branch');
    const result = inv.check({ targetBranch: 'main', directPush: true });
    assert.strictEqual(result.holds, false);
  });

  test('protected-branch allows push to feature branch', () => {
    const inv = DEFAULT_INVARIANTS.find((i) => i.id === 'protected-branch');
    const result = inv.check({ targetBranch: 'feature/x', directPush: true });
    assert.strictEqual(result.holds, true);
  });

  test('blast-radius-limit triggers above threshold', () => {
    const inv = DEFAULT_INVARIANTS.find((i) => i.id === 'blast-radius-limit');
    assert.strictEqual(inv.check({ filesAffected: 5 }).holds, true);
    assert.strictEqual(inv.check({ filesAffected: 25 }).holds, false);
  });

  test('test-before-push requires tests for push ops', () => {
    const inv = DEFAULT_INVARIANTS.find((i) => i.id === 'test-before-push');
    assert.strictEqual(inv.check({ isPush: true, testsPass: true }).holds, true);
    assert.strictEqual(inv.check({ isPush: true, testsPass: false }).holds, false);
    assert.strictEqual(inv.check({ isPush: false }).holds, true);
  });

  test('no-force-push blocks force push', () => {
    const inv = DEFAULT_INVARIANTS.find((i) => i.id === 'no-force-push');
    assert.strictEqual(inv.check({ forcePush: true }).holds, false);
    assert.strictEqual(inv.check({ forcePush: false }).holds, true);
  });

  test('lockfile-integrity detects missing lockfile update', () => {
    const inv = DEFAULT_INVARIANTS.find((i) => i.id === 'lockfile-integrity');
    assert.strictEqual(inv.check({ modifiedFiles: ['package.json'] }).holds, false);
    assert.strictEqual(
      inv.check({ modifiedFiles: ['package.json', 'package-lock.json'] }).holds,
      true
    );
    assert.strictEqual(inv.check({ modifiedFiles: ['src/index.js'] }).holds, true);
  });
});
