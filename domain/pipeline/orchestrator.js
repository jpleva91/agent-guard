// Pipeline orchestrator — runs stages sequentially with validation gates
// No DOM, no Node.js APIs — pure domain logic.

import { ROLES } from './roles.js';
import {
  STAGES,
  STAGE_STATUS,
  validateStageInput,
  validateStageOutput,
  validateFileScope,
  isRoleAuthorizedForStage,
} from './stages.js';

/**
 * @typedef {Object} StageResult
 * @property {string} stageId
 * @property {string} status - One of STAGE_STATUS values
 * @property {object|null} output
 * @property {string[]} errors
 * @property {number} startedAt
 * @property {number|null} completedAt
 */

/**
 * @typedef {Object} PipelineRun
 * @property {string} id
 * @property {string} task
 * @property {string} status - 'pending' | 'running' | 'completed' | 'failed' | 'blocked'
 * @property {object} context - Accumulated data flowing through stages
 * @property {StageResult[]} results - Results from each stage
 * @property {number} createdAt
 * @property {number|null} completedAt
 */

/**
 * Create a new pipeline run.
 * @param {string} task - Description of the engineering task
 * @param {object} [options]
 * @param {function} [options.now] - Time provider (default: Date.now)
 * @param {function} [options.idGen] - ID generator (default: counter-based)
 * @returns {PipelineRun}
 */
let runCounter = 0;

export function resetRunCounter() {
  runCounter = 0;
}

export function createPipelineRun(task, options = {}) {
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

/**
 * Execute a single pipeline stage.
 * Validates inputs, runs the stage handler, validates outputs.
 *
 * @param {PipelineRun} run - The pipeline run
 * @param {string} stageId - Which stage to execute
 * @param {function} handler - Async or sync function (context) => output
 * @param {object} [options]
 * @param {string} [options.agentRole] - Role of the agent executing this stage
 * @param {function} [options.now] - Time provider
 * @returns {StageResult}
 */
export function executeStage(run, stageId, handler, options = {}) {
  const now = options.now || Date.now;
  const result = {
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
  let output;
  try {
    output = handler(run.context);
  } catch (err) {
    result.status = STAGE_STATUS.FAILED;
    result.errors.push(`Stage handler error: ${err.message}`);
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
    const modifiedFiles = Object.keys(output.changes);
    const scopeCheck = validateFileScope(run.context.files, modifiedFiles);
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

/**
 * Run the full pipeline sequentially.
 * Each stage must pass before the next can execute.
 *
 * @param {string} task - Task description
 * @param {Object<string, function>} handlers - Map of stageId → handler function
 * @param {object} [options]
 * @param {function} [options.now] - Time provider
 * @param {function} [options.idGen] - ID generator
 * @param {function} [options.onStageComplete] - Callback after each stage
 * @returns {PipelineRun}
 */
export function runPipeline(task, handlers, options = {}) {
  const run = createPipelineRun(task, options);
  run.status = 'running';

  for (const stage of STAGES) {
    const handler = handlers[stage.id];
    if (!handler) {
      // Skip stages without handlers
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

/**
 * Check if a pipeline run has any audit violations.
 * @param {PipelineRun} run
 * @returns {string[]} List of violation descriptions
 */
export function getAuditViolations(run) {
  const auditResult = run.results.find((r) => r.stageId === 'audit');
  if (!auditResult || !auditResult.output) return [];
  return auditResult.output.violations || [];
}

/**
 * Get a summary of a pipeline run.
 * @param {PipelineRun} run
 * @returns {object}
 */
export function getPipelineSummary(run) {
  const stagesSummary = run.results.map((r) => ({
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
