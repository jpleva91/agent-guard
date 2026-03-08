// Pipeline module barrel export
export {
  ROLES,
  ROLE_DEFINITIONS,
  isValidRole,
  getRoleDefinition,
  isActionAllowed,
} from './roles.js';

export {
  STAGES,
  STAGE_STATUS,
  getStage,
  getStageIndex,
  validateStageInput,
  validateStageOutput,
  isRoleAuthorizedForStage,
  validateFileScope,
} from './stages.js';

export {
  createPipelineRun,
  executeStage,
  runPipeline,
  getAuditViolations,
  getPipelineSummary,
  resetRunCounter,
} from './orchestrator.js';
