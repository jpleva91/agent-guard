// Multi-agent engineering pipeline — public API
// Structured orchestration for AI coding agents.
//
// Pipeline: spec → implementation → verification → optimization → review
// Each stage acts as a control gate (Action Authorization Boundary).

export { ROLES, ROLE_DEFINITIONS, isValidRole, getRoleDefinition, isActionAllowed } from './roles.js';
export { STAGES, STAGE_STATUS, getStage, getStageIndex, validateStageOutput, validateStageInput, isRoleAuthorizedForStage, validateFileScope } from './stages.js';
export { createPipelineRun, executeStage, runPipeline, getAuditViolations, getPipelineSummary, resetRunCounter } from './orchestrator.js';
