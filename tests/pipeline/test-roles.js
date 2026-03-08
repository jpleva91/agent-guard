import assert from 'node:assert';
import { test, suite } from '../run.js';
import {
  ROLES,
  ROLE_DEFINITIONS,
  isValidRole,
  getRoleDefinition,
  isActionAllowed,
} from '../../domain/pipeline/roles.js';

suite('Pipeline Roles', () => {
  test('defines all five agent roles', () => {
    const roles = Object.values(ROLES);
    assert.strictEqual(roles.length, 5);
    assert.ok(roles.includes('architect'));
    assert.ok(roles.includes('builder'));
    assert.ok(roles.includes('tester'));
    assert.ok(roles.includes('optimizer'));
    assert.ok(roles.includes('auditor'));
  });

  test('validates known roles', () => {
    assert.ok(isValidRole(ROLES.ARCHITECT));
    assert.ok(isValidRole(ROLES.BUILDER));
    assert.ok(!isValidRole('hacker'));
    assert.ok(!isValidRole(''));
  });

  test('returns role definitions', () => {
    const arch = getRoleDefinition(ROLES.ARCHITECT);
    assert.ok(arch !== null);
    assert.strictEqual(arch.name, 'Architect');
    assert.strictEqual(arch.phase, 0);
    assert.strictEqual(arch.canModifyFiles, false);
  });

  test('returns null for unknown roles', () => {
    assert.strictEqual(getRoleDefinition('hacker'), null);
  });

  test('architect cannot modify files or run tests', () => {
    assert.ok(!isActionAllowed(ROLES.ARCHITECT, 'modifyFiles'));
    assert.ok(!isActionAllowed(ROLES.ARCHITECT, 'runTests'));
  });

  test('builder can modify files but not run tests or refactor', () => {
    assert.ok(isActionAllowed(ROLES.BUILDER, 'modifyFiles'));
    assert.ok(!isActionAllowed(ROLES.BUILDER, 'runTests'));
    assert.ok(!isActionAllowed(ROLES.BUILDER, 'refactor'));
  });

  test('tester can modify files and run tests', () => {
    assert.ok(isActionAllowed(ROLES.TESTER, 'modifyFiles'));
    assert.ok(isActionAllowed(ROLES.TESTER, 'runTests'));
  });

  test('optimizer can modify, test, and refactor', () => {
    assert.ok(isActionAllowed(ROLES.OPTIMIZER, 'modifyFiles'));
    assert.ok(isActionAllowed(ROLES.OPTIMIZER, 'runTests'));
    assert.ok(isActionAllowed(ROLES.OPTIMIZER, 'refactor'));
  });

  test('auditor can only run tests', () => {
    assert.ok(!isActionAllowed(ROLES.AUDITOR, 'modifyFiles'));
    assert.ok(isActionAllowed(ROLES.AUDITOR, 'runTests'));
    assert.ok(!isActionAllowed(ROLES.AUDITOR, 'refactor'));
  });

  test('unknown role returns false for all actions', () => {
    assert.ok(!isActionAllowed('hacker', 'modifyFiles'));
  });

  test('roles have ordered phases', () => {
    const phases = Object.values(ROLE_DEFINITIONS).map((d) => d.phase);
    for (let i = 1; i < phases.length; i++) {
      assert.ok(phases[i] >= phases[i - 1]);
    }
  });
});
