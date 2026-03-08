// Canonical domain events for BugMon
// All systems emit and consume these event types.
// No DOM, no Node.js APIs — pure data definitions.
//
// TODO(roadmap/ts-migration): Migrate to TypeScript with discriminated union types (src/core/types.ts)

import { simpleHash } from './hash.js';

// --- Event Kinds ---
// Ingestion pipeline
export const ERROR_OBSERVED = 'ErrorObserved';
export const BUG_CLASSIFIED = 'BugClassified';

// Battle lifecycle — values match existing battle-core.js event strings
export const ENCOUNTER_STARTED = 'ENCOUNTER_STARTED';
export const MOVE_USED = 'MOVE_USED';
export const DAMAGE_DEALT = 'DAMAGE_DEALT';
export const HEALING_APPLIED = 'HEALING_APPLIED';
export const PASSIVE_ACTIVATED = 'PASSIVE_ACTIVATED';
export const BUGMON_FAINTED = 'BUGMON_FAINTED';
export const CACHE_ATTEMPTED = 'CACHE_ATTEMPTED';
export const CACHE_SUCCESS = 'CACHE_SUCCESS';
export const BATTLE_ENDED = 'BATTLE_ENDED';

// Progression
export const ACTIVITY_RECORDED = 'ActivityRecorded';
export const EVOLUTION_TRIGGERED = 'EvolutionTriggered';

// Session
export const STATE_CHANGED = 'StateChanged';
export const RUN_STARTED = 'RunStarted';
export const RUN_ENDED = 'RunEnded';
export const CHECKPOINT_REACHED = 'CheckpointReached';

// Governance
export const POLICY_DENIED = 'PolicyDenied';
export const UNAUTHORIZED_ACTION = 'UnauthorizedAction';
export const INVARIANT_VIOLATION = 'InvariantViolation';
export const BLAST_RADIUS_EXCEEDED = 'BlastRadiusExceeded';
export const MERGE_GUARD_FAILURE = 'MergeGuardFailure';
export const EVIDENCE_PACK_GENERATED = 'EvidencePackGenerated';

// Reference Monitor (Agent Action Boundary)
export const ACTION_REQUESTED = 'ActionRequested';
export const ACTION_ALLOWED = 'ActionAllowed';
export const ACTION_DENIED = 'ActionDenied';
export const ACTION_ESCALATED = 'ActionEscalated';
export const ACTION_EXECUTED = 'ActionExecuted';
export const ACTION_FAILED = 'ActionFailed';

// Pipeline
export const PIPELINE_STARTED = 'PipelineStarted';
export const STAGE_COMPLETED = 'StageCompleted';
export const STAGE_FAILED = 'StageFailed';
export const PIPELINE_COMPLETED = 'PipelineCompleted';
export const PIPELINE_FAILED = 'PipelineFailed';
export const FILE_SCOPE_VIOLATION = 'FileScopeViolation';

// Developer Signals
export const FILE_SAVED = 'FileSaved';
export const TEST_COMPLETED = 'TestCompleted';
export const BUILD_COMPLETED = 'BuildCompleted';
export const COMMIT_CREATED = 'CommitCreated';
export const CODE_REVIEWED = 'CodeReviewed';
export const DEPLOY_COMPLETED = 'DeployCompleted';
export const LINT_COMPLETED = 'LintCompleted';

// --- Event Schemas ---
// Maps each event kind to its required and optional data fields.
const EVENT_SCHEMAS = {
  [ERROR_OBSERVED]: {
    required: ['message'],
    optional: [
      'source',
      'errorType',
      'file',
      'line',
      'severity',
      'fingerprint',
      'bugEvent',
    ],
  },
  [BUG_CLASSIFIED]: {
    required: ['severity', 'speciesId'],
    optional: ['fingerprint', 'name'],
  },
  [ENCOUNTER_STARTED]: {
    required: ['enemy'],
    optional: ['playerLevel'],
  },
  [MOVE_USED]: {
    required: ['move', 'attacker'],
    optional: ['defender'],
  },
  [DAMAGE_DEALT]: {
    required: ['amount', 'target'],
    optional: ['effectiveness'],
  },
  [HEALING_APPLIED]: {
    required: ['amount', 'target'],
    optional: [],
  },
  [PASSIVE_ACTIVATED]: {
    required: ['passive', 'owner'],
    optional: [],
  },
  [BUGMON_FAINTED]: {
    required: ['bugmon'],
    optional: [],
  },
  [CACHE_ATTEMPTED]: {
    required: ['target'],
    optional: [],
  },
  [CACHE_SUCCESS]: {
    required: ['target'],
    optional: [],
  },
  [BATTLE_ENDED]: {
    required: ['result'],
    optional: [],
  },
  [ACTIVITY_RECORDED]: {
    required: ['activity'],
    optional: [],
  },
  [EVOLUTION_TRIGGERED]: {
    required: ['from', 'to'],
    optional: [],
  },
  [STATE_CHANGED]: {
    required: ['from', 'to'],
    optional: [],
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
};

export const ALL_EVENT_KINDS = new Set(Object.keys(EVENT_SCHEMAS));

// --- Event Factory ---
// Monotonic counter for unique event IDs within a session.
let eventCounter = 0;

/**
 * Reset the event counter. Exported for test determinism.
 */
export function resetEventCounter() {
  eventCounter = 0;
}

/**
 * Generate a unique event ID.
 * @param {number} timestamp
 * @returns {string}
 */
function generateEventId(timestamp) {
  return `evt_${timestamp}_${++eventCounter}`;
}

/**
 * Generate a content fingerprint for an event.
 * Hashes kind + sorted data keys/values for stable deduplication.
 * @param {string} kind
 * @param {object} data
 * @returns {string}
 */
function fingerprintEvent(kind, data) {
  const keys = Object.keys(data).sort();
  const parts = keys.map((k) => `${k}=${JSON.stringify(data[k])}`);
  return simpleHash(`${kind}:${parts.join(',')}`);
}

/**
 * Validate an event object against its schema.
 * @param {{ kind: string }} event - The event to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateEvent(event) {
  const errors = [];

  if (!event || typeof event !== 'object') {
    return { valid: false, errors: ['Event must be a non-null object'] };
  }

  if (!event.kind) {
    errors.push('Event is missing required field: kind');
    return { valid: false, errors };
  }

  const schema = EVENT_SCHEMAS[event.kind];
  if (!schema) {
    errors.push(`Unknown event kind: ${event.kind}`);
    return { valid: false, errors };
  }

  for (const field of schema.required) {
    if (event[field] === undefined) {
      errors.push(`Event "${event.kind}" is missing required field: ${field}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Create a canonical domain event.
 * Validates that the kind is known and required fields are present.
 * Assigns a unique ID and content fingerprint.
 * @param {string} kind - One of the event kind constants
 * @param {object} data - Event-specific payload
 * @returns {{ id: string, kind: string, timestamp: number, fingerprint: string }}
 * @throws {Error} If kind is unknown or required fields are missing
 */
export function createEvent(kind, data = {}) {
  const timestamp = Date.now();
  const event = { kind, timestamp, ...data };
  const { valid, errors } = validateEvent(event);
  if (!valid) {
    throw new Error(`Invalid event: ${errors.join('; ')}`);
  }
  // Assign ID and fingerprint as envelope metadata (after validation)
  event.id = generateEventId(timestamp);
  if (event.fingerprint === undefined) {
    event.fingerprint = fingerprintEvent(kind, data);
  }
  return event;
}
