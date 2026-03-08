// Capability-based policy engine for the Agent Reference Monitor
// Evaluates actions against declared capability grants and deny rules.
// No DOM, no Node.js APIs — pure domain logic.

import type { Policy, PolicyEvalResult, Decision, ValidationResult } from '../core/types.js';
import { DECISION } from './actions.js';

/** Check if a target path matches a capability scope pattern (glob-like). */
export function matchScope(pattern: string, target: string): boolean {
  if (pattern === '*') return true;
  if (pattern === target) return true;

  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\0')
    .replace(/\*/g, '[^/]*')
    .replace(/\0/g, '.*');

  const regex = new RegExp(`^${escaped}$`);
  return regex.test(target);
}

/** Check if a capability grant covers a given action type and target. */
export function matchCapability(capability: string, actionType: string, target: string): boolean {
  const colonIndex = capability.indexOf(':');
  if (colonIndex === -1) return false;

  const capType = capability.slice(0, colonIndex);
  const capScope = capability.slice(colonIndex + 1);

  if (capType !== actionType) {
    if (capType.endsWith('.*')) {
      const prefix = capType.slice(0, -2);
      if (!actionType.startsWith(prefix + '.')) return false;
    } else {
      return false;
    }
  }

  return matchScope(capScope, target);
}

/** Validate a policy definition. */
export function validatePolicy(policy: unknown): ValidationResult {
  const errors: string[] = [];

  if (!policy || typeof policy !== 'object') {
    return { valid: false, errors: ['Policy must be a non-null object'] };
  }

  const p = policy as Record<string, unknown>;

  if (!Array.isArray(p.capabilities)) {
    errors.push('Policy must have a capabilities array');
  } else {
    for (const cap of p.capabilities) {
      if (typeof cap !== 'string' || !cap.includes(':')) {
        errors.push(`Invalid capability format: ${cap} (expected "type:scope")`);
      }
    }
  }

  if (p.deny !== undefined && !Array.isArray(p.deny)) {
    errors.push('Policy deny must be an array if provided');
  }
  if (p.maxBlastRadius !== undefined && typeof p.maxBlastRadius !== 'number') {
    errors.push('Policy maxBlastRadius must be a number');
  }
  if (p.protectedPaths !== undefined && !Array.isArray(p.protectedPaths)) {
    errors.push('Policy protectedPaths must be an array');
  }
  if (p.protectedBranches !== undefined && !Array.isArray(p.protectedBranches)) {
    errors.push('Policy protectedBranches must be an array');
  }

  return { valid: errors.length === 0, errors };
}

/** Evaluate an action against a policy. */
export function evaluate(
  action: { type: string; target: string },
  policy: Policy,
): PolicyEvalResult {
  const { type, target } = action;

  // 1. Check explicit deny rules
  if (Array.isArray(policy.deny)) {
    for (const denyRule of policy.deny) {
      if (matchCapability(denyRule, type, target)) {
        return {
          decision: DECISION.DENY as Decision,
          reason: `Explicitly denied by rule: ${denyRule}`,
        };
      }
    }
  }

  // 2. Check protected paths
  if (Array.isArray(policy.protectedPaths)) {
    for (const protPath of policy.protectedPaths) {
      if (matchScope(protPath, target)) {
        return {
          decision: DECISION.ESCALATE as Decision,
          reason: `Target matches protected path: ${protPath}`,
        };
      }
    }
  }

  // 3. Check protected branches for git operations
  if (type.startsWith('git.') && Array.isArray(policy.protectedBranches)) {
    for (const branch of policy.protectedBranches) {
      if (matchScope(branch, target)) {
        return {
          decision: DECISION.ESCALATE as Decision,
          reason: `Target matches protected branch: ${branch}`,
        };
      }
    }
  }

  // 4. Check capability grants
  for (const cap of policy.capabilities) {
    if (matchCapability(cap, type, target)) {
      return {
        decision: DECISION.ALLOW as Decision,
        reason: `Granted by capability: ${cap}`,
        capability: { actions: [type], scope: target },
      };
    }
  }

  // 5. Default deny
  return {
    decision: DECISION.DENY as Decision,
    reason: `No capability grants ${type} on ${target}`,
  };
}

/** Create a minimal default policy (deny-all). */
export function createDenyAllPolicy(): Policy {
  return {
    capabilities: [],
    deny: [],
    protectedPaths: [],
    protectedBranches: [],
  };
}

/** Create a development policy with common safe defaults. */
export function createDevPolicy(overrides: Partial<Policy> = {}): Policy {
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
