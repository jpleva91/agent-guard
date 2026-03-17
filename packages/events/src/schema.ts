// Canonical domain events for AgentGuard
// All systems emit and consume these event types.
// No DOM, no Node.js APIs — pure data definitions.

import type { EventKind, EventSchema, DomainEvent, ValidationResult } from '@red-codes/core';
import { simpleHash } from '@red-codes/core';

// --- Event Kinds ---

// Session
export const STATE_CHANGED: EventKind = 'StateChanged';
export const RUN_STARTED: EventKind = 'RunStarted';
export const RUN_ENDED: EventKind = 'RunEnded';
export const CHECKPOINT_REACHED: EventKind = 'CheckpointReached';

// Governance
export const POLICY_DENIED: EventKind = 'PolicyDenied';
export const UNAUTHORIZED_ACTION: EventKind = 'UnauthorizedAction';
export const INVARIANT_VIOLATION: EventKind = 'InvariantViolation';
export const BLAST_RADIUS_EXCEEDED: EventKind = 'BlastRadiusExceeded';
export const MERGE_GUARD_FAILURE: EventKind = 'MergeGuardFailure';
export const EVIDENCE_PACK_GENERATED: EventKind = 'EvidencePackGenerated';

// Reference Monitor (Agent Action Boundary)
export const ACTION_REQUESTED: EventKind = 'ActionRequested';
export const ACTION_ALLOWED: EventKind = 'ActionAllowed';
export const ACTION_DENIED: EventKind = 'ActionDenied';
export const ACTION_ESCALATED: EventKind = 'ActionEscalated';
export const ACTION_EXECUTED: EventKind = 'ActionExecuted';
export const ACTION_FAILED: EventKind = 'ActionFailed';

// Decision Records
export const DECISION_RECORDED: EventKind = 'DecisionRecorded';

// Policy Composition
export const POLICY_COMPOSED: EventKind = 'PolicyComposed';

// Policy Traces
export const POLICY_TRACE_RECORDED: EventKind = 'PolicyTraceRecorded';

// Simulation
export const SIMULATION_COMPLETED: EventKind = 'SimulationCompleted';

// Pipeline
export const PIPELINE_STARTED: EventKind = 'PipelineStarted';
export const STAGE_COMPLETED: EventKind = 'StageCompleted';
export const STAGE_FAILED: EventKind = 'StageFailed';
export const PIPELINE_COMPLETED: EventKind = 'PipelineCompleted';
export const PIPELINE_FAILED: EventKind = 'PipelineFailed';
export const FILE_SCOPE_VIOLATION: EventKind = 'FileScopeViolation';

// Developer Signals
export const FILE_SAVED: EventKind = 'FileSaved';
export const TEST_COMPLETED: EventKind = 'TestCompleted';
export const BUILD_COMPLETED: EventKind = 'BuildCompleted';
export const COMMIT_CREATED: EventKind = 'CommitCreated';
export const CODE_REVIEWED: EventKind = 'CodeReviewed';
export const DEPLOY_COMPLETED: EventKind = 'DeployCompleted';
export const LINT_COMPLETED: EventKind = 'LintCompleted';

// Token Optimization
export const TOKEN_OPTIMIZATION_APPLIED: EventKind = 'TokenOptimizationApplied';

// Agent Liveness
export const HEARTBEAT_EMITTED: EventKind = 'HeartbeatEmitted';
export const HEARTBEAT_MISSED: EventKind = 'HeartbeatMissed';
export const AGENT_UNRESPONSIVE: EventKind = 'AgentUnresponsive';

// Integrity & Trust
export const HOOK_INTEGRITY_VERIFIED: EventKind = 'HookIntegrityVerified';
export const HOOK_INTEGRITY_FAILED: EventKind = 'HookIntegrityFailed';
export const POLICY_TRUST_VERIFIED: EventKind = 'PolicyTrustVerified';
export const POLICY_TRUST_DENIED: EventKind = 'PolicyTrustDenied';

// Adoption Analytics
export const ADOPTION_ANALYZED: EventKind = 'AdoptionAnalyzed';
export const ADOPTION_ANALYSIS_FAILED: EventKind = 'AdoptionAnalysisFailed';

// Denial Learning
export const DENIAL_PATTERN_DETECTED: EventKind = 'DenialPatternDetected';

// Intent Drift
export const INTENT_DRIFT_DETECTED: EventKind = 'IntentDriftDetected';

// Environmental Enforcement
// TODO(issue-225): Reserved for future direct emission from the shell adapter when IDE
// context variables are stripped. Currently the kernel emits InvariantViolation when the
// no-ide-socket-access invariant fires. This event kind will be emitted directly once the
// adapter-level event emission pipeline is wired up.
export const IDE_SOCKET_ACCESS_BLOCKED: EventKind = 'IdeSocketAccessBlocked';

// --- Event Schemas ---
const EVENT_SCHEMAS: Record<string, EventSchema> = {
  [STATE_CHANGED]: {
    required: ['from', 'to'],
    optional: [
      'trigger',
      'totalDenials',
      'totalViolations',
      'denialThreshold',
      'violationThreshold',
    ],
  },
  [RUN_STARTED]: {
    required: ['runId'],
    optional: ['seed', 'sessionStart', 'playerLevel'],
  },
  [RUN_ENDED]: {
    required: ['runId', 'result'],
    optional: ['score', 'encounterCount', 'duration', 'defeatedBosses'],
  },
  [CHECKPOINT_REACHED]: {
    required: ['runId', 'checkpoint'],
    optional: ['encounterCount', 'playerHp', 'score'],
  },
  [POLICY_DENIED]: {
    required: ['policy', 'action', 'reason'],
    optional: ['agentId', 'file', 'line', 'metadata'],
  },
  [UNAUTHORIZED_ACTION]: {
    required: ['action', 'reason'],
    optional: ['agentId', 'scope', 'file', 'line', 'metadata'],
  },
  [INVARIANT_VIOLATION]: {
    required: ['invariant', 'expected', 'actual'],
    optional: ['file', 'line', 'metadata'],
  },
  [BLAST_RADIUS_EXCEEDED]: {
    required: ['filesAffected', 'limit'],
    optional: ['files', 'action', 'metadata'],
  },
  [MERGE_GUARD_FAILURE]: {
    required: ['branch', 'reason'],
    optional: ['protectedBranches', 'metadata'],
  },
  [EVIDENCE_PACK_GENERATED]: {
    required: ['packId', 'eventIds'],
    optional: ['summary', 'metadata'],
  },
  [ACTION_REQUESTED]: {
    required: ['actionType', 'target', 'justification'],
    optional: ['actionId', 'agentId', 'metadata'],
  },
  [ACTION_ALLOWED]: {
    required: ['actionType', 'target', 'capability'],
    optional: ['actionId', 'reason', 'policyHash', 'metadata'],
  },
  [ACTION_DENIED]: {
    required: ['actionType', 'target', 'reason'],
    optional: ['actionId', 'policyHash', 'metadata'],
  },
  [ACTION_ESCALATED]: {
    required: ['actionType', 'target', 'reason'],
    optional: ['actionId', 'policyHash', 'metadata'],
  },
  [ACTION_EXECUTED]: {
    required: ['actionType', 'target', 'result'],
    optional: ['actionId', 'duration', 'metadata'],
  },
  [ACTION_FAILED]: {
    required: ['actionType', 'target', 'error'],
    optional: ['actionId', 'duration', 'metadata'],
  },
  [DECISION_RECORDED]: {
    required: ['recordId', 'outcome', 'actionType'],
    optional: ['target', 'reason', 'metadata'],
  },
  [POLICY_COMPOSED]: {
    required: ['policyCount', 'totalRules', 'sources'],
    optional: ['layers', 'metadata'],
  },
  [POLICY_TRACE_RECORDED]: {
    required: ['actionType', 'decision', 'totalRulesChecked'],
    optional: ['target', 'phaseThatMatched', 'rulesEvaluated', 'durationMs', 'metadata'],
  },
  [SIMULATION_COMPLETED]: {
    required: ['simulatorId', 'riskLevel', 'blastRadius'],
    optional: ['predictedChanges', 'durationMs', 'metadata'],
  },
  [PIPELINE_STARTED]: {
    required: ['runId', 'task'],
    optional: ['agentRoles', 'stageCount'],
  },
  [STAGE_COMPLETED]: {
    required: ['runId', 'stageId', 'status'],
    optional: ['duration', 'outputKeys', 'agentRole'],
  },
  [STAGE_FAILED]: {
    required: ['runId', 'stageId', 'errors'],
    optional: ['agentRole', 'duration'],
  },
  [PIPELINE_COMPLETED]: {
    required: ['runId', 'result'],
    optional: ['duration', 'stagesCompleted', 'task'],
  },
  [PIPELINE_FAILED]: {
    required: ['runId', 'failedStage', 'errors'],
    optional: ['duration', 'stagesCompleted', 'task'],
  },
  [FILE_SCOPE_VIOLATION]: {
    required: ['runId', 'files'],
    optional: ['allowedFiles', 'agentRole'],
  },
  [FILE_SAVED]: {
    required: ['file'],
    optional: ['language', 'linesChanged'],
  },
  [TEST_COMPLETED]: {
    required: ['result'],
    optional: ['suite', 'duration', 'passed', 'failed', 'total'],
  },
  [BUILD_COMPLETED]: {
    required: ['result'],
    optional: ['duration', 'tool', 'exitCode'],
  },
  [COMMIT_CREATED]: {
    required: ['hash'],
    optional: ['message', 'filesChanged', 'additions', 'deletions'],
  },
  [CODE_REVIEWED]: {
    required: ['action'],
    optional: ['prId', 'file', 'comment'],
  },
  [DEPLOY_COMPLETED]: {
    required: ['result'],
    optional: ['environment', 'duration', 'version'],
  },
  [LINT_COMPLETED]: {
    required: ['result'],
    optional: ['tool', 'errors', 'warnings', 'fixed'],
  },
  [TOKEN_OPTIMIZATION_APPLIED]: {
    required: ['tool', 'command'],
    optional: ['originalCommand', 'rewrittenCommand', 'optimizer', 'metadata'],
  },
  [HEARTBEAT_EMITTED]: {
    required: ['agentId'],
    optional: ['sequenceNumber', 'uptimeMs', 'metadata'],
  },
  [HEARTBEAT_MISSED]: {
    required: ['agentId', 'missedCount'],
    optional: ['lastHeartbeatAt', 'expectedIntervalMs', 'metadata'],
  },
  [AGENT_UNRESPONSIVE]: {
    required: ['agentId', 'missedCount', 'threshold'],
    optional: ['lastHeartbeatAt', 'metadata'],
  },
  [HOOK_INTEGRITY_VERIFIED]: {
    required: ['settingsPath', 'hash'],
    optional: [],
  },
  [HOOK_INTEGRITY_FAILED]: {
    required: ['settingsPath', 'reason'],
    optional: ['expectedHash', 'actualHash', 'command'],
  },
  [POLICY_TRUST_VERIFIED]: {
    required: ['policyPath', 'status'],
    optional: ['riskFlags'],
  },
  [POLICY_TRUST_DENIED]: {
    required: ['policyPath', 'reason'],
    optional: ['riskFlags'],
  },
  [ADOPTION_ANALYZED]: {
    required: ['sessionId', 'adoptionPct', 'totalToolCalls', 'governedActions'],
    optional: ['ungoverned', 'bypassAttempts'],
  },
  [ADOPTION_ANALYSIS_FAILED]: {
    required: ['sessionId', 'error'],
    optional: [],
  },
  [DENIAL_PATTERN_DETECTED]: {
    required: ['actionType', 'occurrences', 'confidence'],
    optional: ['invariant', 'policyRule', 'suggestion', 'resolution'],
  },
  [INTENT_DRIFT_DETECTED]: {
    required: ['actionType', 'target', 'driftType'],
    optional: ['intentSpec', 'reason', 'severity', 'metadata'],
  },
  [IDE_SOCKET_ACCESS_BLOCKED]: {
    required: ['socketPattern', 'source'],
    optional: ['envVar', 'command', 'socketPath', 'ide', 'metadata'],
  },
};

export const ALL_EVENT_KINDS = new Set<string>(Object.keys(EVENT_SCHEMAS));

// --- Event Factory ---
let eventCounter = 0;

/** Reset the event counter. Exported for test determinism. */
export function resetEventCounter(): void {
  eventCounter = 0;
}

function generateEventId(timestamp: number): string {
  return `evt_${timestamp}_${++eventCounter}`;
}

function fingerprintEvent(kind: string, data: Record<string, unknown>): string {
  const keys = Object.keys(data).sort();
  const parts = keys.map((k) => `${k}=${JSON.stringify(data[k])}`);
  return simpleHash(`${kind}:${parts.join(',')}`);
}

/**
 * Validate an event object against its schema.
 */
export function validateEvent(event: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];

  if (!event || typeof event !== 'object') {
    return { valid: false, errors: ['Event must be a non-null object'] };
  }

  if (!event.kind) {
    errors.push('Event is missing required field: kind');
    return { valid: false, errors };
  }

  const schema = EVENT_SCHEMAS[event.kind as string];
  if (!schema) {
    errors.push(`Unknown event kind: ${event.kind as string}`);
    return { valid: false, errors };
  }

  for (const field of schema.required) {
    if (event[field] === undefined) {
      errors.push(`Event "${event.kind as string}" is missing required field: ${field}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Create a canonical domain event.
 * Validates that the kind is known and required fields are present.
 * Assigns a unique ID and content fingerprint.
 */
export function createEvent(kind: EventKind, data: Record<string, unknown> = {}): DomainEvent {
  const timestamp = Date.now();
  const event: Record<string, unknown> = { kind, timestamp, ...data };
  const { valid, errors } = validateEvent(event);
  if (!valid) {
    throw new Error(`Invalid event: ${errors.join('; ')}`);
  }
  event.id = generateEventId(timestamp);
  if (event.fingerprint === undefined) {
    event.fingerprint = fingerprintEvent(kind, data);
  }
  return event as unknown as DomainEvent;
}
