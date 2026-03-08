// Runtime shape definitions for module boundaries
// Defines the data shapes that flow between domain modules.
// No DOM, no Node.js APIs — pure data definitions.

import type { ShapeDefinition, ShapeFieldType, ValidationResult } from '../core/types.js';

// --- Shape Definitions ---
export const SHAPES: Record<string, ShapeDefinition> = {
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
    required: {
      chainName: 'string',
      eventType: 'string',
      eventLabel: 'string',
      current: 'number',
      required: 'number',
      percentage: 'number',
      evolvesTo: 'string',
    },
    optional: {},
  },
  EncounterResult: {
    required: { currentHP: 'number', hp: 'number', name: 'string', type: 'string' },
    optional: { id: 'number', attack: 'number', defense: 'number', speed: 'number' },
  },
};

// --- Type checking ---
function checkType(value: unknown, expectedType: ShapeFieldType): boolean {
  if (expectedType === 'array') return Array.isArray(value);
  if (expectedType === 'object')
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  return typeof value === expectedType;
}

// --- Validation ---

/**
 * Validate a value against a named shape.
 */
export function validateShape(shapeName: string, value: unknown): ValidationResult {
  const errors: string[] = [];
  const shape = SHAPES[shapeName];

  if (!shape) {
    return { valid: false, errors: [`Unknown shape: ${shapeName}`] };
  }

  if (!value || typeof value !== 'object') {
    return { valid: false, errors: [`${shapeName} must be a non-null object`] };
  }

  const obj = value as Record<string, unknown>;

  for (const [field, expectedType] of Object.entries(shape.required)) {
    if (obj[field] === undefined || obj[field] === null) {
      errors.push(`${shapeName} missing required field: ${field}`);
    } else if (!checkType(obj[field], expectedType)) {
      errors.push(`${shapeName}.${field} expected ${expectedType}, got ${typeof obj[field]}`);
    }
  }

  for (const [field, expectedType] of Object.entries(shape.optional)) {
    if (obj[field] !== undefined && obj[field] !== null) {
      if (!checkType(obj[field], expectedType)) {
        errors.push(`${shapeName}.${field} expected ${expectedType}, got ${typeof obj[field]}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Assert a value conforms to a shape. Throws on failure.
 * Use at pipeline stage boundaries.
 */
export function assertShape(shapeName: string, value: unknown): void {
  const { valid, errors } = validateShape(shapeName, value);
  if (!valid) {
    throw new Error(`Shape assertion failed for ${shapeName}: ${errors.join('; ')}`);
  }
}
