// Policy loader — parses and validates policy definitions.
// Pure domain logic. No DOM, no Node.js-specific APIs.
//
// Policy pack loading: see pack-loader.ts for extends/merge support.

import type { LoadedPolicy } from './evaluator.js';

const VALID_EFFECTS = new Set(['allow', 'deny']);

export const VALID_ACTIONS = new Set([
  'file.write',
  'file.delete',
  'file.rename',
  'shell.exec',
  'git.push',
  'git.force-push',
  'git.branch.delete',
  'git.commit',
  'git.merge',
  'config.modify',
  'dependency.add',
  'dependency.remove',
  'deploy.trigger',
  '*',
]);

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function validateRule(rule: unknown): ValidationResult {
  const errors: string[] = [];

  if (!rule || typeof rule !== 'object') {
    return { valid: false, errors: ['Rule must be a non-null object'] };
  }

  const r = rule as Record<string, unknown>;

  if (!r.action) {
    errors.push('Rule is missing required field: action');
  } else {
    const actions = Array.isArray(r.action) ? r.action : [r.action];
    for (const a of actions) {
      if (typeof a !== 'string') {
        errors.push(`Invalid action type: ${typeof a}`);
      }
    }
  }

  if (!r.effect) {
    errors.push('Rule is missing required field: effect');
  } else if (!VALID_EFFECTS.has(r.effect as string)) {
    errors.push(`Invalid effect: ${r.effect as string}. Must be "allow" or "deny"`);
  }

  if (r.conditions) {
    if (typeof r.conditions !== 'object') {
      errors.push('Conditions must be an object');
    }
    const conds = r.conditions as Record<string, unknown>;
    if (conds.limit !== undefined && typeof conds.limit !== 'number') {
      errors.push('Condition "limit" must be a number');
    }
  }

  return { valid: errors.length === 0, errors };
}

export function validatePolicy(policy: unknown): ValidationResult {
  const errors: string[] = [];

  if (!policy || typeof policy !== 'object') {
    return { valid: false, errors: ['Policy must be a non-null object'] };
  }

  const p = policy as Record<string, unknown>;

  if (!p.id || typeof p.id !== 'string') {
    errors.push('Policy is missing required field: id (string)');
  }

  if (!p.name || typeof p.name !== 'string') {
    errors.push('Policy is missing required field: name (string)');
  }

  if (!Array.isArray(p.rules) || p.rules.length === 0) {
    errors.push('Policy must have at least one rule');
  } else {
    for (let i = 0; i < p.rules.length; i++) {
      const result = validateRule(p.rules[i]);
      if (!result.valid) {
        for (const err of result.errors) {
          errors.push(`Rule[${i}]: ${err}`);
        }
      }
    }
  }

  if (p.severity !== undefined) {
    if (
      typeof p.severity !== 'number' ||
      (p.severity as number) < 1 ||
      (p.severity as number) > 5
    ) {
      errors.push('Severity must be a number between 1 and 5');
    }
  }

  return { valid: errors.length === 0, errors };
}

export function loadPolicies(policyDefs: unknown[]): {
  policies: LoadedPolicy[];
  errors: string[];
} {
  const policies: LoadedPolicy[] = [];
  const errors: string[] = [];

  if (!Array.isArray(policyDefs)) {
    return { policies: [], errors: ['Policy definitions must be an array'] };
  }

  const seenIds = new Set<string>();

  for (let i = 0; i < policyDefs.length; i++) {
    const def = policyDefs[i] as Record<string, unknown>;
    const result = validatePolicy(def);

    if (!result.valid) {
      for (const err of result.errors) {
        errors.push(`Policy[${i}]: ${err}`);
      }
      continue;
    }

    if (seenIds.has(def.id as string)) {
      errors.push(`Policy[${i}]: Duplicate policy ID "${def.id as string}"`);
      continue;
    }

    seenIds.add(def.id as string);
    policies.push({
      ...def,
      severity: (def.severity as number) ?? 3,
    } as LoadedPolicy);
  }

  return { policies, errors };
}
