// Canonical domain events for BugMon
// All systems emit and consume these event types.
// No DOM, no Node.js APIs — pure data definitions.

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
};

export const ALL_EVENT_KINDS = new Set(Object.keys(EVENT_SCHEMAS));

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
 * @param {string} kind - One of the event kind constants
 * @param {object} data - Event-specific payload
 * @returns {{ kind: string, timestamp: number }}
 * @throws {Error} If kind is unknown or required fields are missing
 */
export function createEvent(kind, data = {}) {
  const event = { kind, timestamp: Date.now(), ...data };
  const { valid, errors } = validateEvent(event);
  if (!valid) {
    throw new Error(`Invalid event: ${errors.join('; ')}`);
  }
  return event;
}
