// Pipeline stage definitions and validation
// No DOM, no Node.js APIs — pure domain logic.

import type { StageId, AgentRole, StageStatus, ValidationResult } from '../../core/types.js';
import { ROLES, isValidRole } from './roles.js';

interface StageDef {
  id: StageId;
  name: string;
  role: AgentRole;
  requiredInputs: readonly string[];
  requiredOutputs: readonly string[];
  optionalOutputs: readonly string[];
}

export const STAGES: readonly StageDef[] = [
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

export const STAGE_STATUS: Record<string, StageStatus> = {
  PENDING: 'pending',
  RUNNING: 'running',
  PASSED: 'passed',
  FAILED: 'failed',
  SKIPPED: 'skipped',
};

export function getStage(stageId: string): StageDef | null {
  return STAGES.find((s) => s.id === stageId) || null;
}

export function getStageIndex(stageId: string): number {
  return STAGES.findIndex((s) => s.id === stageId);
}

export function validateStageOutput(
  stageId: string,
  output: Record<string, unknown>,
): ValidationResult {
  const errors: string[] = [];
  const stage = getStage(stageId);

  if (!stage) return { valid: false, errors: [`Unknown stage: ${stageId}`] };
  if (!output || typeof output !== 'object')
    return { valid: false, errors: ['Stage output must be a non-null object'] };

  for (const field of stage.requiredOutputs) {
    if (output[field] === undefined) {
      errors.push(`Stage "${stage.name}" is missing required output: ${field}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export function validateStageInput(
  stageId: string,
  context: Record<string, unknown>,
): ValidationResult {
  const errors: string[] = [];
  const stage = getStage(stageId);

  if (!stage) return { valid: false, errors: [`Unknown stage: ${stageId}`] };
  if (!context || typeof context !== 'object')
    return { valid: false, errors: ['Pipeline context must be a non-null object'] };

  for (const field of stage.requiredInputs) {
    if (context[field] === undefined) {
      errors.push(`Stage "${stage.name}" is missing required input: ${field}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export function isRoleAuthorizedForStage(role: string, stageId: string): boolean {
  if (!isValidRole(role)) return false;
  const stage = getStage(stageId);
  if (!stage) return false;
  return stage.role === role;
}

export function validateFileScope(
  allowedFiles: readonly string[],
  modifiedFiles: readonly string[],
): { valid: boolean; violations: string[] } {
  const allowed = new Set(allowedFiles);
  const violations = modifiedFiles.filter((f) => !allowed.has(f));
  return { valid: violations.length === 0, violations };
}
