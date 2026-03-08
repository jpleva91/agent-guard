// Runtime shape definitions for module boundaries
// Defines the data shapes that flow between domain modules.
// Follows the EVENT_SCHEMAS pattern from events.js and validateBugDexEntry from bugdex-spec.js.
// No DOM, no Node.js APIs — pure data definitions.

// --- Shape Definitions ---
// Each shape maps field names to expected types.
// Types: 'string', 'number', 'boolean', 'array', 'object'

export const SHAPES = {
  ParsedError: {
    required: { type: 'string', message: 'string', rawLines: 'array' },
    optional: { fingerprint: 'string', file: 'string', line: 'number' },
  },
  BugEvent: {
    required: { severity: 'number', type: 'string', message: 'string' },
    optional: { id: 'string', file: 'string', line: 'number', frequency: 'number' },
  },
  DamageResult: {
    required: { damage: 'number', effectiveness: 'number', critical: 'boolean' },
    optional: {},
  },
  MoveResult: {
    required: { damage: 'number', effectiveness: 'number', critical: 'boolean' },
    optional: { healing: 'number' },
  },
  BattleState: {
    required: { playerMon: 'object', enemy: 'object', turn: 'number', log: 'array' },
    optional: { outcome: 'string' },
  },
  EvolutionResult: {
    required: { from: 'object', to: 'object', trigger: 'object', chain: 'object' },
    optional: { partyIndex: 'number' },
  },
  EvolutionProgress: {
    required: { chainName: 'string', eventType: 'string', eventLabel: 'string', current: 'number', required: 'number', percentage: 'number', evolvesTo: 'string' },
    optional: {},
  },
  EncounterResult: {
    required: { currentHP: 'number', hp: 'number', name: 'string', type: 'string' },
    optional: { id: 'number', attack: 'number', defense: 'number', speed: 'number' },
  },
};

// --- Type checking ---

function checkType(value, expectedType) {
  if (expectedType === 'array') return Array.isArray(value);
  if (expectedType === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  return typeof value === expectedType;
}

// --- Validation ---

/**
 * Validate a value against a named shape.
 * @param {string} shapeName - Key in SHAPES
 * @param {*} value - Value to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateShape(shapeName, value) {
  const errors = [];
  const shape = SHAPES[shapeName];

  if (!shape) {
    return { valid: false, errors: [`Unknown shape: ${shapeName}`] };
  }

  if (!value || typeof value !== 'object') {
    return { valid: false, errors: [`${shapeName} must be a non-null object`] };
  }

  for (const [field, expectedType] of Object.entries(shape.required)) {
    if (value[field] === undefined || value[field] === null) {
      errors.push(`${shapeName} missing required field: ${field}`);
    } else if (!checkType(value[field], expectedType)) {
      errors.push(`${shapeName}.${field} expected ${expectedType}, got ${typeof value[field]}`);
    }
  }

  for (const [field, expectedType] of Object.entries(shape.optional)) {
    if (value[field] !== undefined && value[field] !== null) {
      if (!checkType(value[field], expectedType)) {
        errors.push(`${shapeName}.${field} expected ${expectedType}, got ${typeof value[field]}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Assert a value conforms to a shape. Throws on failure.
 * Use at pipeline stage boundaries.
 * @param {string} shapeName - Key in SHAPES
 * @param {*} value - Value to validate
 * @throws {Error} If validation fails
 */
export function assertShape(shapeName, value) {
  const { valid, errors } = validateShape(shapeName, value);
  if (!valid) {
    throw new Error(`Shape assertion failed for ${shapeName}: ${errors.join('; ')}`);
  }
}
