// Execution Event Log — barrel export
// Re-exports all public API from the execution-log module.

export {
  // Event kinds
  AGENT_EDIT_FILE,
  AGENT_RUN_COMMAND,
  AGENT_CREATE_FILE,
  AGENT_DELETE_FILE,
  TEST_SUITE_STARTED,
  TEST_SUITE_PASSED,
  TEST_SUITE_FAILED,
  TESTS_SKIPPED,
  LINT_VIOLATION,
  BUILD_STARTED,
  BUILD_SUCCEEDED,
  BUILD_FAILED,
  FILE_DELETED,
  DEPENDENCY_INSTALLED,
  DEPENDENCY_REMOVED,
  MIGRATION_EXECUTED,
  PR_CREATED,
  PR_MERGED,
  BRANCH_CREATED,
  RUNTIME_EXCEPTION,
  DEPLOYMENT_STARTED,
  DEPLOYMENT_SUCCEEDED,
  DEPLOYMENT_FAILED,
  POLICY_VIOLATION_DETECTED,
  INVARIANT_CHECK_FAILED,
  APPROVAL_REQUIRED,
  APPROVAL_GRANTED,
  // Sets
  ALL_EXECUTION_EVENT_KINDS,
  FAILURE_KINDS,
  VIOLATION_KINDS,
  AGENT_ACTION_KINDS,
  // Functions
  createExecutionEvent,
  validateExecutionEvent,
  resetExecutionEventCounter,
} from './event-schema.js';

export type { CreateExecutionEventOptions } from './event-schema.js';

export { createExecutionEventLog } from './event-log.js';

export {
  buildCausalChain,
  scoreAgentRun,
  clusterFailures,
  mapToEncounter,
} from './event-projections.js';

export type { ClusterOptions } from './event-projections.js';

export { domainEventToExecutionEvent, createEventBridge } from './bridge.js';
