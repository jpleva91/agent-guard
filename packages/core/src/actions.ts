// Canonical action schema for the Agent Reference Monitor
// All agent execution requests are normalized into these action objects.
// No DOM, no Node.js APIs — pure data definitions.

import type {
  ActionClass,
  ActionDefinition,
  Decision,
  CanonicalAction,
  ValidationResult,
} from './types.js';
import { simpleHash } from './hash.js';

// --- Action Classes (sourced from data/actions.json) ---
import { ACTION_CLASS_DATA, ACTION_TYPES_DATA, DECISION_DATA } from './governance-data.js';

export const ACTION_CLASS: Record<string, ActionClass> = ACTION_CLASS_DATA as Record<
  string,
  ActionClass
>;

// --- Action Types (sourced from data/actions.json) ---
export const ACTION_TYPES: Record<string, ActionDefinition> = ACTION_TYPES_DATA as Record<
  string,
  ActionDefinition
>;

// --- Decisions (sourced from data/actions.json) ---
export const DECISION: Record<string, Decision> = DECISION_DATA as Record<string, Decision>;

// --- Action Factory ---
let actionCounter = 0;

export function resetActionCounter(): void {
  actionCounter = 0;
}

function generateActionId(timestamp: number): string {
  return `act_${timestamp}_${++actionCounter}`;
}

function fingerprintAction(type: string, target: string, justification: string): string {
  return simpleHash(`${type}:${target}:${justification}`);
}

export function validateActionType(type: string): ValidationResult {
  const errors: string[] = [];
  if (typeof type !== 'string' || !type) {
    errors.push('Action type must be a non-empty string');
    return { valid: false, errors };
  }
  if (!ACTION_TYPES[type]) {
    errors.push(`Unknown action type: ${type}`);
    return { valid: false, errors };
  }
  return { valid: true, errors };
}

export function validateAction(action: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];

  if (!action || typeof action !== 'object') {
    return { valid: false, errors: ['Action must be a non-null object'] };
  }

  if (!action.type) {
    errors.push('Action is missing required field: type');
  } else {
    const typeCheck = validateActionType(action.type as string);
    if (!typeCheck.valid) errors.push(...typeCheck.errors);
  }

  if (!action.target && action.target !== '') {
    errors.push('Action is missing required field: target');
  }

  if (!action.justification) {
    errors.push('Action is missing required field: justification');
  }

  return { valid: errors.length === 0, errors };
}

export function createAction(
  type: string,
  target: string,
  justification: string,
  metadata: Record<string, unknown> = {}
): CanonicalAction {
  const action: Record<string, unknown> = { type, target, justification, ...metadata };

  const { valid, errors } = validateAction(action);
  if (!valid) {
    throw new Error(`Invalid action: ${errors.join('; ')}`);
  }

  const timestamp = Date.now();
  action.id = generateActionId(timestamp);
  action.class = ACTION_TYPES[type].class;
  action.timestamp = timestamp;
  action.fingerprint = fingerprintAction(type, target, justification);

  return action as unknown as CanonicalAction;
}

export function getActionClass(type: string): ActionClass | null {
  const def = ACTION_TYPES[type];
  return def ? def.class : null;
}

export function listActionTypes(): string[] {
  return Object.keys(ACTION_TYPES);
}
