import assert from 'node:assert';
import { test, suite } from '../run.js';
import {
  STAGES,
  STAGE_STATUS,
  getStage,
  getStageIndex,
  validateStageOutput,
  validateStageInput,
  isRoleAuthorizedForStage,
  validateFileScope,
} from '../../domain/pipeline/stages.js';
import { ROLES } from '../../domain/pipeline/roles.js';

suite('Pipeline Stages', () => {
  test('defines five stages in order', () => {
    assert.strictEqual(STAGES.length, 5);
    assert.strictEqual(STAGES[0].id, 'plan');
    assert.strictEqual(STAGES[1].id, 'build');
    assert.strictEqual(STAGES[2].id, 'test');
    assert.strictEqual(STAGES[3].id, 'optimize');
    assert.strictEqual(STAGES[4].id, 'audit');
  });

  test('getStage returns correct stage', () => {
    const plan = getStage('plan');
    assert.ok(plan !== null);
    assert.strictEqual(plan.role, ROLES.ARCHITECT);
  });

  test('getStage returns null for unknown stage', () => {
    assert.strictEqual(getStage('unknown'), null);
  });

  test('getStageIndex returns correct indices', () => {
    assert.strictEqual(getStageIndex('plan'), 0);
    assert.strictEqual(getStageIndex('audit'), 4);
    assert.strictEqual(getStageIndex('unknown'), -1);
  });

  test('validates stage output with required fields', () => {
    const result = validateStageOutput('plan', {
      files: ['a.js'],
      constraints: [],
    });
    assert.ok(result.valid);

    const missing = validateStageOutput('plan', { files: ['a.js'] });
    assert.ok(!missing.valid);
    assert.ok(missing.errors.length > 0);
  });

  test('validates stage output rejects non-objects', () => {
    assert.ok(!validateStageOutput('plan', null).valid);
    assert.ok(!validateStageOutput('plan', 'string').valid);
  });

  test('validates unknown stage output', () => {
    assert.ok(!validateStageOutput('unknown', {}).valid);
  });

  test('validates stage input requirements', () => {
    const result = validateStageInput('plan', { task: 'implement feature' });
    assert.ok(result.valid);

    const missing = validateStageInput('plan', {});
    assert.ok(!missing.valid);
  });

  test('validates stage input rejects non-objects', () => {
    assert.ok(!validateStageInput('plan', null).valid);
  });

  test('enforces role authorization for stages', () => {
    assert.ok(isRoleAuthorizedForStage(ROLES.ARCHITECT, 'plan'));
    assert.ok(!isRoleAuthorizedForStage(ROLES.BUILDER, 'plan'));
    assert.ok(isRoleAuthorizedForStage(ROLES.BUILDER, 'build'));
    assert.ok(isRoleAuthorizedForStage(ROLES.AUDITOR, 'audit'));
  });

  test('rejects unknown roles and stages', () => {
    assert.ok(!isRoleAuthorizedForStage('hacker', 'plan'));
    assert.ok(!isRoleAuthorizedForStage(ROLES.ARCHITECT, 'unknown'));
  });

  test('validates file scope correctly', () => {
    const allowed = ['src/a.js', 'src/b.js'];
    const valid = validateFileScope(allowed, ['src/a.js']);
    assert.ok(valid.valid);
    assert.strictEqual(valid.violations.length, 0);

    const violation = validateFileScope(allowed, ['src/a.js', 'src/c.js']);
    assert.ok(!violation.valid);
    assert.ok(violation.violations.includes('src/c.js'));
  });

  test('stage status constants are defined', () => {
    assert.strictEqual(STAGE_STATUS.PENDING, 'pending');
    assert.strictEqual(STAGE_STATUS.RUNNING, 'running');
    assert.strictEqual(STAGE_STATUS.PASSED, 'passed');
    assert.strictEqual(STAGE_STATUS.FAILED, 'failed');
    assert.strictEqual(STAGE_STATUS.SKIPPED, 'skipped');
  });
});
