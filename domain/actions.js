// Canonical action schema for the Agent Reference Monitor
// All agent execution requests are normalized into these action objects.
// No DOM, no Node.js APIs — pure data definitions.

import { simpleHash } from './hash.js';

// --- Action Classes ---
// Coarse categories for policy grouping
export const ACTION_CLASS = {
  FILE: 'file',
  TEST: 'test',
  GIT: 'git',
  SHELL: 'shell',
  NPM: 'npm',
  HTTP: 'http',
  DEPLOY: 'deploy',
  INFRA: 'infra',
};

// --- Action Types ---
// Fine-grained action identifiers within each class
export const ACTION_TYPES = {
  // File operations
  'file.read': { class: ACTION_CLASS.FILE, description: 'Read file contents' },
  'file.write': { class: ACTION_CLASS.FILE, description: 'Write or create a file' },
  'file.delete': { class: ACTION_CLASS.FILE, description: 'Delete a file' },
  'file.move': { class: ACTION_CLASS.FILE, description: 'Move or rename a file' },

  // Test operations
  'test.run': { class: ACTION_CLASS.TEST, description: 'Run test suite' },
  'test.run.unit': { class: ACTION_CLASS.TEST, description: 'Run unit tests' },
  'test.run.integration': { class: ACTION_CLASS.TEST, description: 'Run integration tests' },

  // Git operations
  'git.diff': { class: ACTION_CLASS.GIT, description: 'View git diff' },
  'git.commit': { class: ACTION_CLASS.GIT, description: 'Create a git commit' },
  'git.push': { class: ACTION_CLASS.GIT, description: 'Push to remote' },
  'git.branch.create': { class: ACTION_CLASS.GIT, description: 'Create a branch' },
  'git.branch.delete': { class: ACTION_CLASS.GIT, description: 'Delete a branch' },
  'git.checkout': { class: ACTION_CLASS.GIT, description: 'Switch branches' },
  'git.reset': { class: ACTION_CLASS.GIT, description: 'Reset git state' },
  'git.merge': { class: ACTION_CLASS.GIT, description: 'Merge branches' },

  // Shell operations
  'shell.exec': { class: ACTION_CLASS.SHELL, description: 'Execute a shell command' },

  // NPM operations
  'npm.install': { class: ACTION_CLASS.NPM, description: 'Install npm packages' },
  'npm.script.run': { class: ACTION_CLASS.NPM, description: 'Run an npm script' },
  'npm.publish': { class: ACTION_CLASS.NPM, description: 'Publish to npm registry' },

  // HTTP operations
  'http.request': { class: ACTION_CLASS.HTTP, description: 'Make an HTTP request' },

  // Deploy operations
  'deploy.trigger': { class: ACTION_CLASS.DEPLOY, description: 'Trigger deployment' },

  // Infrastructure operations
  'infra.apply': { class: ACTION_CLASS.INFRA, description: 'Apply infrastructure changes' },
  'infra.destroy': { class: ACTION_CLASS.INFRA, description: 'Destroy infrastructure' },
};

// --- Decisions ---
export const DECISION = {
  ALLOW: 'allow',
  DENY: 'deny',
  ESCALATE: 'escalate',
};

// --- Action Factory ---
let actionCounter = 0;

/**
 * Reset the action counter. Exported for test determinism.
 */
export function resetActionCounter() {
  actionCounter = 0;
}

/**
 * Generate a unique action ID.
 * @param {number} timestamp
 * @returns {string}
 */
function generateActionId(timestamp) {
  return `act_${timestamp}_${++actionCounter}`;
}

/**
 * Compute a stable fingerprint for an action.
 * @param {string} type - Action type
 * @param {string} target - Target path/scope
 * @param {string} justification - Why the action is needed
 * @returns {string}
 */
function fingerprintAction(type, target, justification) {
  return simpleHash(`${type}:${target}:${justification}`);
}

/**
 * Validate an action type string.
 * @param {string} type
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateActionType(type) {
  const errors = [];
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

/**
 * Validate a canonical action object.
 * @param {object} action
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateAction(action) {
  const errors = [];

  if (!action || typeof action !== 'object') {
    return { valid: false, errors: ['Action must be a non-null object'] };
  }

  if (!action.type) {
    errors.push('Action is missing required field: type');
  } else {
    const typeCheck = validateActionType(action.type);
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

/**
 * Create a canonical action object.
 * All agent execution requests pass through this factory.
 *
 * @param {string} type - One of the ACTION_TYPES keys (e.g. 'file.write')
 * @param {string} target - Target path, scope, or resource identifier
 * @param {string} justification - Human-readable reason for the action
 * @param {object} [metadata={}] - Additional action-specific data
 * @returns {{ id: string, type: string, target: string, justification: string, class: string, timestamp: number, fingerprint: string }}
 * @throws {Error} If validation fails
 */
export function createAction(type, target, justification, metadata = {}) {
  const action = {
    type,
    target,
    justification,
    ...metadata,
  };

  const { valid, errors } = validateAction(action);
  if (!valid) {
    throw new Error(`Invalid action: ${errors.join('; ')}`);
  }

  const timestamp = Date.now();
  action.id = generateActionId(timestamp);
  action.class = ACTION_TYPES[type].class;
  action.timestamp = timestamp;
  action.fingerprint = fingerprintAction(type, target, justification);

  return action;
}

/**
 * Get the action class for a given action type.
 * @param {string} type
 * @returns {string|null}
 */
export function getActionClass(type) {
  const def = ACTION_TYPES[type];
  return def ? def.class : null;
}

/**
 * List all known action types.
 * @returns {string[]}
 */
export function listActionTypes() {
  return Object.keys(ACTION_TYPES);
}
