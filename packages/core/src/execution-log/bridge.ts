// Execution Event Log Bridge — connects execution events to the domain event system.
// Maps domain events to execution events and vice versa.
// No DOM, no Node.js APIs — pure domain logic.

import type {
  DomainEvent,
  ExecutionEvent,
  ExecutionEventLog,
  Actor,
  EventSource,
  ExecutionContext,
} from '../types.js';
import { createExecutionEvent } from './event-schema.js';
import {
  AGENT_EDIT_FILE,
  RUNTIME_EXCEPTION,
  TEST_SUITE_FAILED,
  TEST_SUITE_PASSED,
  BUILD_FAILED,
  BUILD_SUCCEEDED,
  DEPLOYMENT_FAILED,
  DEPLOYMENT_SUCCEEDED,
  POLICY_VIOLATION_DETECTED,
  INVARIANT_CHECK_FAILED,
} from './event-schema.js';

// --- Domain Event → Execution Event Kind Mapping ---

const DOMAIN_TO_EXECUTION_KIND: Record<string, string> = {
  ActionExecuted: AGENT_EDIT_FILE,
  ActionFailed: RUNTIME_EXCEPTION,
  ErrorObserved: RUNTIME_EXCEPTION,
  TestCompleted: TEST_SUITE_PASSED,
  BuildCompleted: BUILD_SUCCEEDED,
  DeployCompleted: DEPLOYMENT_SUCCEEDED,
  PolicyDenied: POLICY_VIOLATION_DETECTED,
  InvariantViolation: INVARIANT_CHECK_FAILED,
};

// Override with failure kinds when the domain event indicates failure
const FAILURE_OVERRIDES: Record<string, (event: DomainEvent) => string | null> = {
  TestCompleted: (event) => (event.result === 'fail' ? TEST_SUITE_FAILED : null),
  BuildCompleted: (event) => (event.result === 'fail' ? BUILD_FAILED : null),
  DeployCompleted: (event) => (event.result === 'fail' ? DEPLOYMENT_FAILED : null),
};

/**
 * Infer actor from a domain event.
 */
function inferActor(event: DomainEvent): Actor {
  if (event.agentId || event.kind === 'ActionExecuted' || event.kind === 'ActionFailed') {
    return 'agent';
  }
  if (
    event.kind === 'PolicyDenied' ||
    event.kind === 'InvariantViolation' ||
    event.kind === 'BlastRadiusExceeded'
  ) {
    return 'system';
  }
  return 'human';
}

/**
 * Infer event source from a domain event kind.
 */
function inferSource(event: DomainEvent): EventSource {
  const kind = event.kind;
  if (kind === 'TestCompleted' || kind === 'BuildCompleted') return 'ci';
  if (kind === 'CommitCreated' || kind === 'FileSaved') return 'git';
  if (kind === 'DeployCompleted') return 'runtime';
  if (kind === 'PolicyDenied' || kind === 'InvariantViolation' || kind === 'BlastRadiusExceeded') {
    return 'governance';
  }
  if (kind === 'ErrorObserved') return 'runtime';
  return 'cli';
}

/**
 * Build execution context from a domain event.
 */
function buildContext(event: DomainEvent): ExecutionContext {
  const context: Record<string, string> = {};
  if (typeof event.file === 'string') context.file = event.file;
  if (typeof event.branch === 'string') context.branch = event.branch;
  if (typeof event.hash === 'string') context.commit = event.hash;
  if (typeof event.agentId === 'string') context.agentRunId = event.agentId;
  return context;
}

/**
 * Convert a domain event into an execution event.
 * Returns null if the domain event kind has no execution event mapping.
 */
export function domainEventToExecutionEvent(event: DomainEvent): ExecutionEvent | null {
  let executionKind = DOMAIN_TO_EXECUTION_KIND[event.kind];
  if (!executionKind) return null;

  // Check for failure overrides
  const override = FAILURE_OVERRIDES[event.kind];
  if (override) {
    const overrideKind = override(event);
    if (overrideKind) executionKind = overrideKind;
  }

  // Build payload from domain event data (exclude standard fields)
  const payload: Record<string, unknown> = {};
  const standardFields = new Set(['id', 'kind', 'timestamp', 'fingerprint']);
  for (const [key, value] of Object.entries(event)) {
    if (!standardFields.has(key)) {
      payload[key] = value;
    }
  }

  return createExecutionEvent(executionKind, {
    actor: inferActor(event),
    source: inferSource(event),
    context: buildContext(event),
    payload,
  });
}

/**
 * Create a bridge that automatically records domain events as execution events.
 * Returns a subscriber function compatible with the domain event system.
 */
export function createEventBridge(log: ExecutionEventLog): (event: DomainEvent) => void {
  return (event: DomainEvent) => {
    const executionEvent = domainEventToExecutionEvent(event);
    if (executionEvent) {
      log.append(executionEvent);
    }
  };
}
