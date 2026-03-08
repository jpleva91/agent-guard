import { describe, it, expect, beforeEach } from 'vitest';
import {
  createPipelineRun,
  executeStage,
  runPipeline,
  getAuditViolations,
  getPipelineSummary,
  resetRunCounter,
  STAGE_STATUS,
  STAGES,
  ROLES,
  isValidRole,
  getRoleDefinition,
  isActionAllowed,
  validateStageInput,
  validateStageOutput,
  isRoleAuthorizedForStage,
} from '../../src/domain/pipeline/index.js';

describe('domain/pipeline', () => {
  beforeEach(() => {
    resetRunCounter();
  });

  describe('roles', () => {
    it('validates known roles', () => {
      expect(isValidRole(ROLES.ARCHITECT)).toBe(true);
      expect(isValidRole(ROLES.BUILDER)).toBe(true);
      expect(isValidRole('unknown_role')).toBe(false);
    });

    it('returns role definitions', () => {
      const role = getRoleDefinition(ROLES.ARCHITECT);
      expect(role).toBeTruthy();
      expect(role!.name).toBe('Architect');
    });

    it('checks action permissions', () => {
      expect(isActionAllowed(ROLES.BUILDER, 'modifyFiles')).toBe(true);
      expect(isActionAllowed(ROLES.ARCHITECT, 'modifyFiles')).toBe(false);
      expect(isActionAllowed(ROLES.TESTER, 'runTests')).toBe(true);
    });
  });

  describe('stages', () => {
    it('defines pipeline stages', () => {
      expect(STAGES.length).toBeGreaterThan(0);
      expect(STAGES[0]).toHaveProperty('id');
      expect(STAGES[0]).toHaveProperty('role');
    });

    it('validates stage input', () => {
      const result = validateStageInput('plan', { task: 'fix bug' });
      expect(result.valid).toBe(true);
    });

    it('rejects invalid stage input', () => {
      const result = validateStageInput('build', {});
      expect(result.valid).toBe(false);
    });

    it('validates stage output', () => {
      const result = validateStageOutput('plan', { files: ['a.ts'], constraints: [] });
      expect(result.valid).toBe(true);
    });

    it('checks role authorization for stage', () => {
      expect(isRoleAuthorizedForStage(ROLES.ARCHITECT, 'plan')).toBe(true);
      expect(isRoleAuthorizedForStage(ROLES.BUILDER, 'plan')).toBe(false);
    });
  });

  describe('createPipelineRun', () => {
    it('creates a pending run', () => {
      const run = createPipelineRun('Fix null pointer bug');
      expect(run.id).toBe('run_1');
      expect(run.task).toBe('Fix null pointer bug');
      expect(run.status).toBe('pending');
      expect(run.results).toHaveLength(0);
    });

    it('uses custom ID generator', () => {
      const run = createPipelineRun('task', { idGen: () => 'custom_id' });
      expect(run.id).toBe('custom_id');
    });

    it('uses custom clock', () => {
      const run = createPipelineRun('task', { now: () => 1000 });
      expect(run.createdAt).toBe(1000);
    });
  });

  describe('executeStage', () => {
    it('executes a stage successfully', () => {
      const run = createPipelineRun('task', { now: () => 1000 });
      run.status = 'running';
      const result = executeStage(
        run,
        'plan',
        () => ({ files: ['a.ts'], constraints: ['no mutation'] }),
        { now: () => 1000 },
      );
      expect(result.status).toBe(STAGE_STATUS.PASSED);
      expect(result.output).toEqual({ files: ['a.ts'], constraints: ['no mutation'] });
    });

    it('catches handler errors', () => {
      const run = createPipelineRun('task', { now: () => 1000 });
      run.status = 'running';
      const result = executeStage(
        run,
        'plan',
        () => { throw new Error('boom'); },
        { now: () => 1000 },
      );
      expect(result.status).toBe(STAGE_STATUS.FAILED);
      expect(result.errors[0]).toContain('boom');
    });

    it('merges output into run context', () => {
      const run = createPipelineRun('task', { now: () => 1000 });
      run.status = 'running';
      executeStage(
        run,
        'plan',
        () => ({ files: ['a.ts'], constraints: [] }),
        { now: () => 1000 },
      );
      expect(run.context.files).toEqual(['a.ts']);
    });

    it('rejects unauthorized roles', () => {
      const run = createPipelineRun('task', { now: () => 1000 });
      run.status = 'running';
      const result = executeStage(
        run,
        'plan',
        () => ({ files: [], constraints: [] }),
        { agentRole: ROLES.BUILDER, now: () => 1000 },
      );
      expect(result.status).toBe(STAGE_STATUS.FAILED);
      expect(result.errors[0]).toContain('not authorized');
    });
  });

  describe('runPipeline', () => {
    it('skips stages without handlers', () => {
      const run = runPipeline('empty pipeline', {}, { now: () => 1000 });
      expect(run.status).toBe('completed');
      for (const r of run.results) {
        expect(r.status).toBe(STAGE_STATUS.SKIPPED);
      }
    });

    it('runs stages with handlers', () => {
      const handlers: Record<string, (ctx: Record<string, unknown>) => Record<string, unknown>> = {
        plan: () => ({ files: ['a.ts'], constraints: [] }),
        build: () => ({ changes: { 'a.ts': 'new content' } }),
      };
      const run = runPipeline('partial pipeline', handlers, { now: () => 1000 });
      const planResult = run.results.find(r => r.stageId === 'plan');
      expect(planResult?.status).toBe(STAGE_STATUS.PASSED);
    });

    it('stops on failure', () => {
      const handlers: Record<string, () => Record<string, unknown>> = {
        [STAGES[0].id]: () => { throw new Error('fail'); },
      };
      const run = runPipeline('failing pipeline', handlers, { now: () => 1000 });
      expect(run.status).toBe('failed');
    });
  });

  describe('getAuditViolations', () => {
    it('returns empty for no audit stage', () => {
      const run = createPipelineRun('task');
      expect(getAuditViolations(run)).toEqual([]);
    });
  });

  describe('getPipelineSummary', () => {
    it('summarizes a run', () => {
      const run = runPipeline('summary test', {}, { now: () => 1000 });
      const summary = getPipelineSummary(run);
      expect(summary.id).toBe(run.id);
      expect(summary.task).toBe('summary test');
      expect(summary.status).toBe('completed');
      expect(summary.stages.length).toBeGreaterThan(0);
    });
  });
});
