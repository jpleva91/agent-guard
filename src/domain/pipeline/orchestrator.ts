// Pipeline orchestrator — runs stages sequentially with validation gates
// No DOM, no Node.js APIs — pure domain logic.

import type { StageStatus } from '../../core/types.js';
import {
  STAGES,
  STAGE_STATUS,
  validateStageInput,
  validateStageOutput,
  validateFileScope,
  isRoleAuthorizedForStage,
} from './stages.js';

interface StageResult {
  stageId: string;
  status: StageStatus;
  output: Record<string, unknown> | null;
  errors: string[];
  startedAt: number;
  completedAt: number | null;
}

interface PipelineRun {
  id: string;
  task: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'blocked';
  context: Record<string, unknown>;
  results: StageResult[];
  createdAt: number;
  completedAt: number | null;
}

let runCounter = 0;

export function resetRunCounter(): void {
  runCounter = 0;
}

interface CreateRunOptions {
  now?: () => number;
  idGen?: () => string;
}

export function createPipelineRun(task: string, options: CreateRunOptions = {}): PipelineRun {
  const now = (options.now || Date.now)();
  const id = options.idGen ? options.idGen() : `run_${++runCounter}`;

  return {
    id,
    task,
    status: 'pending',
    context: { task },
    results: [],
    createdAt: now,
    completedAt: null,
  };
}

interface ExecuteStageOptions {
  agentRole?: string;
  now?: () => number;
}

type StageHandler = (context: Record<string, unknown>) => Record<string, unknown>;

export function executeStage(
  run: PipelineRun,
  stageId: string,
  handler: StageHandler,
  options: ExecuteStageOptions = {},
): StageResult {
  const now = options.now || Date.now;
  const result: StageResult = {
    stageId,
    status: STAGE_STATUS.PENDING,
    output: null,
    errors: [],
    startedAt: now(),
    completedAt: null,
  };

  // Gate 1: Role authorization
  if (options.agentRole) {
    if (!isRoleAuthorizedForStage(options.agentRole, stageId)) {
      result.status = STAGE_STATUS.FAILED;
      result.errors.push(
        `Role "${options.agentRole}" is not authorized for stage "${stageId}"`,
      );
      result.completedAt = now();
      run.results.push(result);
      return result;
    }
  }

  // Gate 2: Input validation
  const inputCheck = validateStageInput(stageId, run.context);
  if (!inputCheck.valid) {
    result.status = STAGE_STATUS.FAILED;
    result.errors = inputCheck.errors;
    result.completedAt = now();
    run.results.push(result);
    return result;
  }

  // Execute handler
  result.status = STAGE_STATUS.RUNNING;
  let output: Record<string, unknown>;
  try {
    output = handler(run.context);
  } catch (err) {
    result.status = STAGE_STATUS.FAILED;
    result.errors.push(`Stage handler error: ${(err as Error).message}`);
    result.completedAt = now();
    run.results.push(result);
    return result;
  }

  // Gate 3: Output validation
  const outputCheck = validateStageOutput(stageId, output);
  if (!outputCheck.valid) {
    result.status = STAGE_STATUS.FAILED;
    result.errors = outputCheck.errors;
    result.completedAt = now();
    run.results.push(result);
    return result;
  }

  // Gate 4: File scope enforcement (for build stage)
  if (stageId === 'build' && run.context.files && output.changes) {
    const modifiedFiles = Object.keys(output.changes as Record<string, unknown>);
    const scopeCheck = validateFileScope(
      run.context.files as readonly string[],
      modifiedFiles,
    );
    if (!scopeCheck.valid) {
      result.status = STAGE_STATUS.FAILED;
      result.errors.push(
        `File scope violation: unauthorized modifications to: ${scopeCheck.violations.join(', ')}`,
      );
      result.completedAt = now();
      run.results.push(result);
      return result;
    }
  }

  // Stage passed — merge output into context
  result.status = STAGE_STATUS.PASSED;
  result.output = output;
  result.completedAt = now();
  Object.assign(run.context, output);
  run.results.push(result);

  return result;
}

interface RunPipelineOptions extends CreateRunOptions {
  onStageComplete?: (stageId: string, result: StageResult) => void;
}

export function runPipeline(
  task: string,
  handlers: Record<string, StageHandler>,
  options: RunPipelineOptions = {},
): PipelineRun {
  const run = createPipelineRun(task, options);
  run.status = 'running';

  for (const stage of STAGES) {
    const handler = handlers[stage.id];
    if (!handler) {
      run.results.push({
        stageId: stage.id,
        status: STAGE_STATUS.SKIPPED,
        output: null,
        errors: [],
        startedAt: (options.now || Date.now)(),
        completedAt: (options.now || Date.now)(),
      });
      continue;
    }

    const result = executeStage(run, stage.id, handler, {
      agentRole: stage.role,
      now: options.now,
    });

    if (options.onStageComplete) {
      options.onStageComplete(stage.id, result);
    }

    if (result.status === STAGE_STATUS.FAILED) {
      run.status = 'failed';
      run.completedAt = (options.now || Date.now)();
      return run;
    }
  }

  run.status = 'completed';
  run.completedAt = (options.now || Date.now)();
  return run;
}

export function getAuditViolations(run: PipelineRun): string[] {
  const auditResult = run.results.find((r) => r.stageId === 'audit');
  if (!auditResult || !auditResult.output) return [];
  return (auditResult.output.violations as string[]) || [];
}

interface StageSummary {
  stage: string;
  status: StageStatus;
  errors: string[];
  duration: number | null;
}

export function getPipelineSummary(run: PipelineRun): {
  id: string;
  task: string;
  status: string;
  stages: StageSummary[];
  duration: number | null;
} {
  const stagesSummary: StageSummary[] = run.results.map((r) => ({
    stage: r.stageId,
    status: r.status,
    errors: r.errors,
    duration: r.completedAt ? r.completedAt - r.startedAt : null,
  }));

  return {
    id: run.id,
    task: run.task,
    status: run.status,
    stages: stagesSummary,
    duration: run.completedAt ? run.completedAt - run.createdAt : null,
  };
}
