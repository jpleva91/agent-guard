// Execution Event schema — defines the universal execution event format.
// All development environment actions become execution events.
// No DOM, no Node.js APIs — pure data definitions.

import type {
  Actor,
  EventSource,
  ExecutionContext,
  ExecutionEvent,
  ValidationResult,
} from '../types.js';
import { simpleHash } from '../hash.js';

// --- Execution Event Kinds ---

// Agent actions
export const AGENT_EDIT_FILE = 'AgentEditFile';
export const AGENT_RUN_COMMAND = 'AgentRunCommand';
export const AGENT_CREATE_FILE = 'AgentCreateFile';
export const AGENT_DELETE_FILE = 'AgentDeleteFile';

// CI/CD
export const TEST_SUITE_STARTED = 'TestSuiteStarted';
export const TEST_SUITE_PASSED = 'TestSuitePassed';
export const TEST_SUITE_FAILED = 'TestSuiteFailed';
export const TESTS_SKIPPED = 'TestsSkipped';
export const LINT_VIOLATION = 'LintViolation';
export const BUILD_STARTED = 'BuildStarted';
export const BUILD_SUCCEEDED = 'BuildSucceeded';
export const BUILD_FAILED = 'BuildFailed';

// Git
export const FILE_DELETED = 'FileDeleted';
export const DEPENDENCY_INSTALLED = 'DependencyInstalled';
export const DEPENDENCY_REMOVED = 'DependencyRemoved';
export const MIGRATION_EXECUTED = 'MigrationExecuted';
export const PR_CREATED = 'PRCreated';
export const PR_MERGED = 'PRMerged';
export const BRANCH_CREATED = 'BranchCreated';

// Runtime
export const RUNTIME_EXCEPTION = 'RuntimeException';
export const DEPLOYMENT_STARTED = 'DeploymentStarted';
export const DEPLOYMENT_SUCCEEDED = 'DeploymentSucceeded';
export const DEPLOYMENT_FAILED = 'DeploymentFailed';

// Governance
export const POLICY_VIOLATION_DETECTED = 'PolicyViolationDetected';
export const INVARIANT_CHECK_FAILED = 'InvariantCheckFailed';
export const APPROVAL_REQUIRED = 'ApprovalRequired';
export const APPROVAL_GRANTED = 'ApprovalGranted';

/** All known execution event kinds */
export const ALL_EXECUTION_EVENT_KINDS = new Set<string>([
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
]);

/** Kinds that represent failures */
export const FAILURE_KINDS = new Set<string>([
  TEST_SUITE_FAILED,
  BUILD_FAILED,
  RUNTIME_EXCEPTION,
  DEPLOYMENT_FAILED,
  POLICY_VIOLATION_DETECTED,
  INVARIANT_CHECK_FAILED,
]);

/** Kinds that represent governance violations */
export const VIOLATION_KINDS = new Set<string>([POLICY_VIOLATION_DETECTED, INVARIANT_CHECK_FAILED]);

/** Kinds that represent agent actions */
export const AGENT_ACTION_KINDS = new Set<string>([
  AGENT_EDIT_FILE,
  AGENT_RUN_COMMAND,
  AGENT_CREATE_FILE,
  AGENT_DELETE_FILE,
]);

// --- Event ID Generation ---
let eventCounter = 0;

/** Reset the counter. Exported for test determinism. */
export function resetExecutionEventCounter(): void {
  eventCounter = 0;
}

function generateId(timestamp: number): string {
  return `xev_${timestamp}_${++eventCounter}`;
}

function fingerprintExecutionEvent(
  kind: string,
  actor: string,
  source: string,
  payload: Record<string, unknown>
): string {
  const payloadKeys = Object.keys(payload).sort();
  const parts = payloadKeys.map((k) => `${k}=${JSON.stringify(payload[k])}`);
  return simpleHash(`${kind}:${actor}:${source}:${parts.join(',')}`);
}

// --- Validation ---

/**
 * Validate an execution event object.
 */
export function validateExecutionEvent(event: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];

  if (!event || typeof event !== 'object') {
    return { valid: false, errors: ['ExecutionEvent must be a non-null object'] };
  }

  const requiredFields = ['id', 'timestamp', 'actor', 'source', 'kind', 'context', 'payload'];
  for (const field of requiredFields) {
    if (event[field] === undefined || event[field] === null) {
      errors.push(`ExecutionEvent missing required field: ${field}`);
    }
  }

  const validActors: Actor[] = ['human', 'agent', 'system'];
  if (event.actor && !validActors.includes(event.actor as Actor)) {
    errors.push(
      `Invalid actor: ${event.actor as string}. Must be one of: ${validActors.join(', ')}`
    );
  }

  const validSources: EventSource[] = ['cli', 'ci', 'git', 'runtime', 'editor', 'governance'];
  if (event.source && !validSources.includes(event.source as EventSource)) {
    errors.push(
      `Invalid source: ${event.source as string}. Must be one of: ${validSources.join(', ')}`
    );
  }

  if (
    event.context !== undefined &&
    (typeof event.context !== 'object' || event.context === null)
  ) {
    errors.push('ExecutionEvent context must be an object');
  }

  if (
    event.payload !== undefined &&
    (typeof event.payload !== 'object' || event.payload === null)
  ) {
    errors.push('ExecutionEvent payload must be an object');
  }

  return { valid: errors.length === 0, errors };
}

// --- Factory ---

export interface CreateExecutionEventOptions {
  readonly actor: Actor;
  readonly source: EventSource;
  readonly context?: ExecutionContext;
  readonly payload?: Record<string, unknown>;
  readonly causedBy?: string;
  readonly timestamp?: number;
}

/**
 * Create a validated execution event.
 * Assigns a unique ID and content fingerprint.
 */
export function createExecutionEvent(
  kind: string,
  options: CreateExecutionEventOptions
): ExecutionEvent {
  const timestamp = options.timestamp ?? Date.now();
  const context = options.context ?? {};
  const payload = options.payload ?? {};
  const id = generateId(timestamp);
  const fingerprint = fingerprintExecutionEvent(kind, options.actor, options.source, payload);

  const event: ExecutionEvent = {
    id,
    timestamp,
    actor: options.actor,
    source: options.source,
    kind,
    context,
    payload,
    fingerprint,
    ...(options.causedBy ? { causedBy: options.causedBy } : {}),
  };

  const { valid, errors } = validateExecutionEvent(event as unknown as Record<string, unknown>);
  if (!valid) {
    throw new Error(`Invalid execution event: ${errors.join('; ')}`);
  }

  return event;
}
