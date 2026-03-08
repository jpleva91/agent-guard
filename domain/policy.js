// Capability-based policy engine for the Agent Reference Monitor
// Evaluates actions against declared capability grants and deny rules.
// No DOM, no Node.js APIs — pure domain logic.

import { ACTION_TYPES, ACTION_CLASS, DECISION } from './actions.js';

// --- Capability Matching ---

/**
 * Check if a target path matches a capability scope pattern.
 * Supports glob-like patterns:
 *   'src/auth/**' matches 'src/auth/session.js' and 'src/auth/deep/nested.js'
 *   'src/auth/*' matches 'src/auth/session.js' but not 'src/auth/deep/nested.js'
 *   '*' matches everything
 *
 * @param {string} pattern - Capability scope pattern
 * @param {string} target - Actual target path
 * @returns {boolean}
 */
export function matchScope(pattern, target) {
  if (pattern === '*') return true;
  if (pattern === target) return true;

  // Convert glob pattern to regex
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\0')
    .replace(/\*/g, '[^/]*')
    .replace(/\0/g, '.*');

  const regex = new RegExp(`^${escaped}$`);
  return regex.test(target);
}

/**
 * Check if a capability grant covers a given action type and target.
 *
 * A capability is a string like:
 *   'file.write:src/auth/**'  — type:scope
 *   'test.run:*'              — type with wildcard scope
 *   'git.diff:read'           — type with qualifier
 *   'file.*:src/**'           — wildcard type within class
 *
 * @param {string} capability - Capability string (type:scope)
 * @param {string} actionType - Action type to check
 * @param {string} target - Target to check
 * @returns {boolean}
 */
export function matchCapability(capability, actionType, target) {
  const colonIndex = capability.indexOf(':');
  if (colonIndex === -1) return false;

  const capType = capability.slice(0, colonIndex);
  const capScope = capability.slice(colonIndex + 1);

  // Check type match
  if (capType !== actionType) {
    // Check wildcard type: 'file.*' matches 'file.write'
    if (capType.endsWith('.*')) {
      const prefix = capType.slice(0, -2);
      if (!actionType.startsWith(prefix + '.')) return false;
    } else {
      return false;
    }
  }

  // Check scope match
  return matchScope(capScope, target);
}

// --- Policy Definition ---

/**
 * @typedef {object} Policy
 * @property {string[]} capabilities - List of granted capability strings
 * @property {string[]} [deny] - List of explicitly denied capability strings (checked first)
 * @property {number} [maxBlastRadius] - Maximum files affected per action
 * @property {string[]} [protectedPaths] - Paths that require escalation
 * @property {string[]} [protectedBranches] - Git branches that require escalation
 */

/**
 * Validate a policy definition.
 * @param {Policy} policy
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validatePolicy(policy) {
  const errors = [];

  if (!policy || typeof policy !== 'object') {
    return { valid: false, errors: ['Policy must be a non-null object'] };
  }

  if (!Array.isArray(policy.capabilities)) {
    errors.push('Policy must have a capabilities array');
  } else {
    for (const cap of policy.capabilities) {
      if (typeof cap !== 'string' || !cap.includes(':')) {
        errors.push(`Invalid capability format: ${cap} (expected "type:scope")`);
      }
    }
  }

  if (policy.deny !== undefined && !Array.isArray(policy.deny)) {
    errors.push('Policy deny must be an array if provided');
  }

  if (policy.maxBlastRadius !== undefined && typeof policy.maxBlastRadius !== 'number') {
    errors.push('Policy maxBlastRadius must be a number');
  }

  if (policy.protectedPaths !== undefined && !Array.isArray(policy.protectedPaths)) {
    errors.push('Policy protectedPaths must be an array');
  }

  if (policy.protectedBranches !== undefined && !Array.isArray(policy.protectedBranches)) {
    errors.push('Policy protectedBranches must be an array');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Evaluate an action against a policy.
 * Returns a decision with reasoning.
 *
 * Evaluation order:
 *   1. Deny rules (explicit blocks — checked first)
 *   2. Protected paths/branches (requires escalation)
 *   3. Capability grants (explicit allows)
 *   4. Default deny (no matching capability)
 *
 * @param {object} action - Canonical action object
 * @param {Policy} policy - Policy definition
 * @returns {{ decision: string, reason: string, capability: string|null }}
 */
export function evaluate(action, policy) {
  const { type, target } = action;

  // 1. Check explicit deny rules
  if (Array.isArray(policy.deny)) {
    for (const denyRule of policy.deny) {
      if (matchCapability(denyRule, type, target)) {
        return {
          decision: DECISION.DENY,
          reason: `Explicitly denied by rule: ${denyRule}`,
          capability: null,
        };
      }
    }
  }

  // 2. Check protected paths (escalation required)
  if (Array.isArray(policy.protectedPaths)) {
    for (const protPath of policy.protectedPaths) {
      if (matchScope(protPath, target)) {
        return {
          decision: DECISION.ESCALATE,
          reason: `Target matches protected path: ${protPath}`,
          capability: null,
        };
      }
    }
  }

  // 3. Check protected branches for git operations
  if (
    type.startsWith('git.') &&
    Array.isArray(policy.protectedBranches)
  ) {
    for (const branch of policy.protectedBranches) {
      if (matchScope(branch, target)) {
        return {
          decision: DECISION.ESCALATE,
          reason: `Target matches protected branch: ${branch}`,
          capability: null,
        };
      }
    }
  }

  // 4. Check capability grants
  for (const cap of policy.capabilities) {
    if (matchCapability(cap, type, target)) {
      return {
        decision: DECISION.ALLOW,
        reason: `Granted by capability: ${cap}`,
        capability: cap,
      };
    }
  }

  // 5. Default deny
  return {
    decision: DECISION.DENY,
    reason: `No capability grants ${type} on ${target}`,
    capability: null,
  };
}

/**
 * Create a minimal default policy (deny-all).
 * @returns {Policy}
 */
export function createDenyAllPolicy() {
  return {
    capabilities: [],
    deny: [],
    protectedPaths: [],
    protectedBranches: [],
  };
}

/**
 * Create a development policy with common safe defaults.
 * Allows reads, tests, linting. Denies deploy, infra, publish.
 * @param {object} [overrides={}] - Override specific policy fields
 * @returns {Policy}
 */
export function createDevPolicy(overrides = {}) {
  return {
    capabilities: [
      'file.read:*',
      'file.write:src/**',
      'file.write:tests/**',
      'test.run:*',
      'test.run.unit:*',
      'test.run.integration:*',
      'git.diff:*',
      'git.commit:*',
      'git.branch.create:*',
      'git.checkout:*',
      'npm.script.run:test',
      'npm.script.run:test:*',
      'npm.script.run:lint',
      'npm.script.run:lint:*',
      'npm.script.run:format',
      'npm.script.run:format:*',
    ],
    deny: [
      'deploy.trigger:*',
      'infra.apply:*',
      'infra.destroy:*',
      'npm.publish:*',
      'git.reset:*',
    ],
    protectedPaths: [],
    protectedBranches: ['main', 'master', 'production'],
    ...overrides,
  };
}
