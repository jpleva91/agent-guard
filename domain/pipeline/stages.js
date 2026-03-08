// Pipeline stage definitions and validation
// No DOM, no Node.js APIs — pure domain logic.

import { ROLES, ROLE_DEFINITIONS, isValidRole } from './roles.js';

/**
 * Pipeline stages in execution order.
 * Each stage has a required role, input requirements, and output contract.
 */
export const STAGES = [
  {
    id: 'plan',
    name: 'Architecture Planning',
    role: ROLES.ARCHITECT,
    requiredInputs: ['task'],
    requiredOutputs: ['files', 'constraints'],
    optionalOutputs: ['invariants', 'notes'],
  },
  {
    id: 'build',
    name: 'Implementation',
    role: ROLES.BUILDER,
    requiredInputs: ['files', 'constraints'],
    requiredOutputs: ['changes'],
    optionalOutputs: ['notes'],
  },
  {
    id: 'test',
    name: 'Verification',
    role: ROLES.TESTER,
    requiredInputs: ['changes'],
    requiredOutputs: ['testResults'],
    optionalOutputs: ['coverageReport', 'gaps'],
  },
  {
    id: 'optimize',
    name: 'Optimization',
    role: ROLES.OPTIMIZER,
    requiredInputs: ['changes', 'testResults'],
    requiredOutputs: ['changes'],
    optionalOutputs: ['refactorNotes'],
  },
  {
    id: 'audit',
    name: 'Audit',
    role: ROLES.AUDITOR,
    requiredInputs: ['changes', 'testResults'],
    requiredOutputs: ['auditResult'],
    optionalOutputs: ['violations', 'recommendations'],
  },
];

/**
 * Stage execution status values.
 */
export const STAGE_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  PASSED: 'passed',
  FAILED: 'failed',
  SKIPPED: 'skipped',
};

/**
 * Get a stage definition by id.
 * @param {string} stageId
 * @returns {object|null}
 */
export function getStage(stageId) {
  return STAGES.find((s) => s.id === stageId) || null;
}

/**
 * Get the index of a stage in the pipeline.
 * @param {string} stageId
 * @returns {number} -1 if not found
 */
export function getStageIndex(stageId) {
  return STAGES.findIndex((s) => s.id === stageId);
}

/**
 * Validate that a stage output satisfies its contract.
 * @param {string} stageId
 * @param {object} output - The output produced by the stage
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateStageOutput(stageId, output) {
  const errors = [];
  const stage = getStage(stageId);

  if (!stage) {
    return { valid: false, errors: [`Unknown stage: ${stageId}`] };
  }

  if (!output || typeof output !== 'object') {
    return { valid: false, errors: ['Stage output must be a non-null object'] };
  }

  for (const field of stage.requiredOutputs) {
    if (output[field] === undefined) {
      errors.push(
        `Stage "${stage.name}" is missing required output: ${field}`,
      );
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate that a stage's input requirements are met.
 * @param {string} stageId
 * @param {object} context - The accumulated pipeline context
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateStageInput(stageId, context) {
  const errors = [];
  const stage = getStage(stageId);

  if (!stage) {
    return { valid: false, errors: [`Unknown stage: ${stageId}`] };
  }

  if (!context || typeof context !== 'object') {
    return {
      valid: false,
      errors: ['Pipeline context must be a non-null object'],
    };
  }

  for (const field of stage.requiredInputs) {
    if (context[field] === undefined) {
      errors.push(`Stage "${stage.name}" is missing required input: ${field}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Check if a role is authorized to execute a given stage.
 * @param {string} role
 * @param {string} stageId
 * @returns {boolean}
 */
export function isRoleAuthorizedForStage(role, stageId) {
  if (!isValidRole(role)) return false;
  const stage = getStage(stageId);
  if (!stage) return false;
  return stage.role === role;
}

/**
 * Validate that the builder agent only modifies allowed files.
 * @param {string[]} allowedFiles - Files the architect approved
 * @param {string[]} modifiedFiles - Files actually modified
 * @returns {{ valid: boolean, violations: string[] }}
 */
export function validateFileScope(allowedFiles, modifiedFiles) {
  const allowed = new Set(allowedFiles);
  const violations = modifiedFiles.filter((f) => !allowed.has(f));
  return { valid: violations.length === 0, violations };
}
