// Canonical action schema for the Agent Reference Monitor
// All agent execution requests are normalized into these action objects.
// No DOM, no Node.js APIs — pure data definitions.

import type { ActionClass, ActionDefinition, Decision, CanonicalAction, ValidationResult } from '../core/types.js';
import { simpleHash } from './hash.js';

// --- Action Classes ---
export const ACTION_CLASS: Record<string, ActionClass> = {
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
export const ACTION_TYPES: Record<string, ActionDefinition> = {
  'file.read': { class: 'file', description: 'Read file contents' },
  'file.write': { class: 'file', description: 'Write or create a file' },
  'file.delete': { class: 'file', description: 'Delete a file' },
  'file.move': { class: 'file', description: 'Move or rename a file' },
  'test.run': { class: 'test', description: 'Run test suite' },
  'test.run.unit': { class: 'test', description: 'Run unit tests' },
  'test.run.integration': { class: 'test', description: 'Run integration tests' },
  'git.diff': { class: 'git', description: 'View git diff' },
  'git.commit': { class: 'git', description: 'Create a git commit' },
  'git.push': { class: 'git', description: 'Push to remote' },
  'git.branch.create': { class: 'git', description: 'Create a branch' },
  'git.branch.delete': { class: 'git', description: 'Delete a branch' },
  'git.checkout': { class: 'git', description: 'Switch branches' },
  'git.reset': { class: 'git', description: 'Reset git state' },
  'git.merge': { class: 'git', description: 'Merge branches' },
  'shell.exec': { class: 'shell', description: 'Execute a shell command' },
  'npm.install': { class: 'npm', description: 'Install npm packages' },
  'npm.script.run': { class: 'npm', description: 'Run an npm script' },
  'npm.publish': { class: 'npm', description: 'Publish to npm registry' },
  'http.request': { class: 'http', description: 'Make an HTTP request' },
  'deploy.trigger': { class: 'deploy', description: 'Trigger deployment' },
  'infra.apply': { class: 'infra', description: 'Apply infrastructure changes' },
  'infra.destroy': { class: 'infra', description: 'Destroy infrastructure' },
};

// --- Decisions ---
export const DECISION: Record<string, Decision> = {
  ALLOW: 'allow',
  DENY: 'deny',
  ESCALATE: 'escalate',
};

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
  metadata: Record<string, unknown> = {},
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
