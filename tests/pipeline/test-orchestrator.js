import assert from 'node:assert';
import { test, suite } from '../run.js';
import {
  createPipelineRun,
  executeStage,
  runPipeline,
  getAuditViolations,
  getPipelineSummary,
  resetRunCounter,
} from '../../domain/pipeline/orchestrator.js';
import { STAGE_STATUS } from '../../domain/pipeline/stages.js';
import { ROLES } from '../../domain/pipeline/roles.js';

const fixedNow = () => 1000;

suite('Pipeline Orchestrator', () => {
  test('creates a pipeline run', () => {
    resetRunCounter();
    const run = createPipelineRun('implement feature', { now: fixedNow });
    assert.strictEqual(run.id, 'run_1');
    assert.strictEqual(run.task, 'implement feature');
    assert.strictEqual(run.status, 'pending');
    assert.strictEqual(run.context.task, 'implement feature');
    assert.strictEqual(run.results.length, 0);
    assert.strictEqual(run.createdAt, 1000);
  });

  test('executes a stage with valid input and output', () => {
    resetRunCounter();
    const run = createPipelineRun('test task', { now: fixedNow });

    const handler = () => ({
      files: ['src/a.js'],
      constraints: ['no side effects'],
    });

    const result = executeStage(run, 'plan', handler, {
      agentRole: ROLES.ARCHITECT,
      now: fixedNow,
    });

    assert.strictEqual(result.status, STAGE_STATUS.PASSED);
    assert.strictEqual(result.output.files[0], 'src/a.js');
    assert.strictEqual(run.context.files[0], 'src/a.js');
    assert.strictEqual(run.results.length, 1);
  });

  test('rejects unauthorized role for stage', () => {
    resetRunCounter();
    const run = createPipelineRun('test task', { now: fixedNow });

    const result = executeStage(
      run,
      'plan',
      () => ({}),
      {
        agentRole: ROLES.BUILDER,
        now: fixedNow,
      },
    );

    assert.strictEqual(result.status, STAGE_STATUS.FAILED);
    assert.ok(result.errors[0].includes('not authorized'));
  });

  test('rejects stage with missing inputs', () => {
    resetRunCounter();
    const run = createPipelineRun('test task', { now: fixedNow });

    const result = executeStage(run, 'build', () => ({ changes: {} }), {
      now: fixedNow,
    });

    assert.strictEqual(result.status, STAGE_STATUS.FAILED);
    assert.ok(result.errors[0].includes('missing required input'));
  });

  test('rejects stage with missing outputs', () => {
    resetRunCounter();
    const run = createPipelineRun('test task', { now: fixedNow });

    const result = executeStage(
      run,
      'plan',
      () => ({ files: ['a.js'] }),
      {
        agentRole: ROLES.ARCHITECT,
        now: fixedNow,
      },
    );

    assert.strictEqual(result.status, STAGE_STATUS.FAILED);
    assert.ok(result.errors[0].includes('missing required output'));
  });

  test('catches handler errors', () => {
    resetRunCounter();
    const run = createPipelineRun('test task', { now: fixedNow });

    const result = executeStage(
      run,
      'plan',
      () => {
        throw new Error('boom');
      },
      {
        agentRole: ROLES.ARCHITECT,
        now: fixedNow,
      },
    );

    assert.strictEqual(result.status, STAGE_STATUS.FAILED);
    assert.ok(result.errors[0].includes('boom'));
  });

  test('enforces file scope on build stage', () => {
    resetRunCounter();
    const run = createPipelineRun('test task', { now: fixedNow });
    run.context.files = ['src/a.js'];
    run.context.constraints = ['no side effects'];

    const result = executeStage(
      run,
      'build',
      () => ({
        changes: { 'src/a.js': 'ok', 'src/b.js': 'unauthorized' },
      }),
      {
        agentRole: ROLES.BUILDER,
        now: fixedNow,
      },
    );

    assert.strictEqual(result.status, STAGE_STATUS.FAILED);
    assert.ok(result.errors[0].includes('File scope violation'));
    assert.ok(result.errors[0].includes('src/b.js'));
  });

  test('runs full pipeline successfully', () => {
    resetRunCounter();
    const handlers = {
      plan: () => ({
        files: ['src/a.js'],
        constraints: ['pure functions only'],
      }),
      build: () => ({
        changes: { 'src/a.js': 'const x = 1;' },
      }),
      test: () => ({
        testResults: { passed: 5, failed: 0 },
      }),
      optimize: () => ({
        changes: { 'src/a.js': 'const x = 1;' },
      }),
      audit: () => ({
        auditResult: 'pass',
        violations: [],
      }),
    };

    const stageLog = [];
    const run = runPipeline('full test', handlers, {
      now: fixedNow,
      onStageComplete: (id, result) =>
        stageLog.push({ id, status: result.status }),
    });

    assert.strictEqual(run.status, 'completed');
    assert.strictEqual(run.results.length, 5);
    assert.strictEqual(stageLog.length, 5);
    assert.ok(stageLog.every((s) => s.status === STAGE_STATUS.PASSED));
  });

  test('pipeline fails on first failing stage', () => {
    resetRunCounter();
    const handlers = {
      plan: () => ({
        files: ['src/a.js'],
        constraints: ['pure functions only'],
      }),
      build: () => {
        throw new Error('compilation failed');
      },
    };

    const run = runPipeline('failing test', handlers, { now: fixedNow });

    assert.strictEqual(run.status, 'failed');
    assert.strictEqual(run.results.length, 2);
    assert.strictEqual(run.results[0].status, STAGE_STATUS.PASSED);
    assert.strictEqual(run.results[1].status, STAGE_STATUS.FAILED);
  });

  test('skips stages without handlers', () => {
    resetRunCounter();
    const handlers = {
      plan: () => ({
        files: ['src/a.js'],
        constraints: [],
      }),
    };

    const run = runPipeline('partial test', handlers, { now: fixedNow });

    assert.strictEqual(run.status, 'completed');
    const skipped = run.results.filter(
      (r) => r.status === STAGE_STATUS.SKIPPED,
    );
    assert.strictEqual(skipped.length, 4);
  });

  test('extracts audit violations', () => {
    resetRunCounter();
    const run = createPipelineRun('test', { now: fixedNow });
    run.results.push({
      stageId: 'audit',
      status: STAGE_STATUS.PASSED,
      output: {
        auditResult: 'fail',
        violations: ['circular dependency detected'],
      },
      errors: [],
      startedAt: 1000,
      completedAt: 1000,
    });

    const violations = getAuditViolations(run);
    assert.strictEqual(violations.length, 1);
    assert.strictEqual(violations[0], 'circular dependency detected');
  });

  test('returns empty violations when no audit', () => {
    resetRunCounter();
    const run = createPipelineRun('test', { now: fixedNow });
    assert.strictEqual(getAuditViolations(run).length, 0);
  });

  test('generates pipeline summary', () => {
    resetRunCounter();
    const run = createPipelineRun('summary test', { now: fixedNow });
    run.status = 'completed';
    run.completedAt = 2000;
    run.results.push({
      stageId: 'plan',
      status: STAGE_STATUS.PASSED,
      output: {},
      errors: [],
      startedAt: 1000,
      completedAt: 1500,
    });

    const summary = getPipelineSummary(run);
    assert.strictEqual(summary.task, 'summary test');
    assert.strictEqual(summary.status, 'completed');
    assert.strictEqual(summary.duration, 1000);
    assert.strictEqual(summary.stages.length, 1);
    assert.strictEqual(summary.stages[0].duration, 500);
  });
});
