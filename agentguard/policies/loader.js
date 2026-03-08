// Policy loader — parses and validates policy definitions.
// Pure domain logic. No DOM, no Node.js-specific APIs.

/**
 * Policy shape:
 * {
 *   id: string,
 *   name: string,
 *   description: string,
 *   rules: [
 *     {
 *       action: string | string[],    // action patterns to match (glob-like)
 *       effect: 'allow' | 'deny',
 *       conditions?: {
 *         scope?: string[],           // file path patterns
 *         limit?: number,             // max files affected
 *         branches?: string[],        // protected branches
 *         requireTests?: boolean,     // must pass tests first
 *       },
 *       reason?: string,
 *     }
 *   ],
 *   severity?: number,                // 1-5, default 3
 * }
 */

const VALID_EFFECTS = new Set(['allow', 'deny']);
const VALID_ACTIONS = new Set([
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

/**
 * Validate a single policy rule.
 * @param {object} rule
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateRule(rule) {
  const errors = [];

  if (!rule || typeof rule !== 'object') {
    return { valid: false, errors: ['Rule must be a non-null object'] };
  }

  if (!rule.action) {
    errors.push('Rule is missing required field: action');
  } else {
    const actions = Array.isArray(rule.action) ? rule.action : [rule.action];
    for (const a of actions) {
      if (typeof a !== 'string') {
        errors.push(`Invalid action type: ${typeof a}`);
      }
    }
  }

  if (!rule.effect) {
    errors.push('Rule is missing required field: effect');
  } else if (!VALID_EFFECTS.has(rule.effect)) {
    errors.push(`Invalid effect: ${rule.effect}. Must be "allow" or "deny"`);
  }

  if (rule.conditions) {
    if (typeof rule.conditions !== 'object') {
      errors.push('Conditions must be an object');
    }
    if (rule.conditions.limit !== undefined && typeof rule.conditions.limit !== 'number') {
      errors.push('Condition "limit" must be a number');
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate a complete policy definition.
 * @param {object} policy
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validatePolicy(policy) {
  const errors = [];

  if (!policy || typeof policy !== 'object') {
    return { valid: false, errors: ['Policy must be a non-null object'] };
  }

  if (!policy.id || typeof policy.id !== 'string') {
    errors.push('Policy is missing required field: id (string)');
  }

  if (!policy.name || typeof policy.name !== 'string') {
    errors.push('Policy is missing required field: name (string)');
  }

  if (!Array.isArray(policy.rules) || policy.rules.length === 0) {
    errors.push('Policy must have at least one rule');
  } else {
    for (let i = 0; i < policy.rules.length; i++) {
      const result = validateRule(policy.rules[i]);
      if (!result.valid) {
        for (const err of result.errors) {
          errors.push(`Rule[${i}]: ${err}`);
        }
      }
    }
  }

  if (policy.severity !== undefined) {
    if (typeof policy.severity !== 'number' || policy.severity < 1 || policy.severity > 5) {
      errors.push('Severity must be a number between 1 and 5');
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Load and validate a set of policy definitions.
 * @param {object[]} policyDefs - Array of raw policy objects
 * @returns {{ policies: object[], errors: string[] }}
 */
export function loadPolicies(policyDefs) {
  const policies = [];
  const errors = [];

  if (!Array.isArray(policyDefs)) {
    return { policies: [], errors: ['Policy definitions must be an array'] };
  }

  const seenIds = new Set();

  for (let i = 0; i < policyDefs.length; i++) {
    const def = policyDefs[i];
    const result = validatePolicy(def);

    if (!result.valid) {
      for (const err of result.errors) {
        errors.push(`Policy[${i}]: ${err}`);
      }
      continue;
    }

    if (seenIds.has(def.id)) {
      errors.push(`Policy[${i}]: Duplicate policy ID "${def.id}"`);
      continue;
    }

    seenIds.add(def.id);
    policies.push({
      ...def,
      severity: def.severity ?? 3,
    });
  }

  return { policies, errors };
}

export { VALID_ACTIONS };
