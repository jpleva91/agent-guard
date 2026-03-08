// Policy evaluator — matches actions against loaded policies.
// Pure domain logic. No DOM, no Node.js-specific APIs.

/**
 * Action intent shape (normalized by AAB):
 * {
 *   action: string,          // e.g. 'file.write'
 *   target: string,          // e.g. 'src/core/event-bus.js'
 *   agent?: string,          // agent identifier
 *   metadata?: object,       // additional context
 *   filesAffected?: number,  // blast radius
 *   branch?: string,         // target branch for git ops
 * }
 */

/**
 * Check if an action string matches a pattern.
 * Supports exact match, wildcard '*', and prefix match 'file.*'.
 * @param {string} pattern
 * @param {string} action
 * @returns {boolean}
 */
function matchAction(pattern, action) {
  if (pattern === '*') return true;
  if (pattern === action) return true;

  // Prefix wildcard: 'file.*' matches 'file.write', 'file.delete', etc.
  if (pattern.endsWith('.*')) {
    const prefix = pattern.slice(0, -2);
    return action.startsWith(prefix + '.');
  }

  return false;
}

/**
 * Check if a target path matches any of the scope patterns.
 * Supports exact match, directory prefix, and glob-like '*' patterns.
 * @param {string[]} scopePatterns
 * @param {string} target
 * @returns {boolean}
 */
function matchScope(scopePatterns, target) {
  if (!scopePatterns || scopePatterns.length === 0) return true;
  if (!target) return true;

  for (const pattern of scopePatterns) {
    if (pattern === '*') return true;
    if (pattern === target) return true;

    // Directory prefix: 'src/' matches 'src/foo/bar.js'
    if (pattern.endsWith('/') && target.startsWith(pattern)) return true;

    // Glob-like: '*.json' matches 'package.json'
    if (pattern.startsWith('*')) {
      const suffix = pattern.slice(1);
      if (target.endsWith(suffix)) return true;
    }
  }

  return false;
}

/**
 * Evaluate whether a rule's conditions match the given intent.
 * @param {object} conditions
 * @param {object} intent
 * @returns {boolean}
 */
function matchConditions(conditions, intent) {
  if (!conditions) return true;

  // Scope check
  if (conditions.scope && !matchScope(conditions.scope, intent.target)) {
    return false;
  }

  // Blast radius limit
  if (conditions.limit !== undefined && intent.filesAffected !== undefined) {
    if (intent.filesAffected > conditions.limit) {
      return true; // Condition triggers — this is a deny condition
    }
  }

  // Protected branches
  if (conditions.branches && intent.branch) {
    if (conditions.branches.includes(intent.branch)) {
      return true;
    }
  }

  return true;
}

/**
 * Evaluation result shape:
 * {
 *   allowed: boolean,
 *   decision: 'allow' | 'deny',
 *   matchedRule: object | null,
 *   matchedPolicy: object | null,
 *   reason: string,
 *   severity: number,
 * }
 */

/**
 * Evaluate an action intent against a set of policies.
 * First matching deny rule wins. If no deny rule matches,
 * the action is allowed by default (open policy model).
 *
 * @param {object} intent - Normalized action intent
 * @param {object[]} policies - Loaded & validated policies
 * @returns {object} Evaluation result
 */
export function evaluate(intent, policies) {
  if (!intent || !intent.action) {
    return {
      allowed: false,
      decision: 'deny',
      matchedRule: null,
      matchedPolicy: null,
      reason: 'Intent is missing required field: action',
      severity: 5,
    };
  }

  // Check all policies for deny rules first
  for (const policy of policies) {
    for (const rule of policy.rules) {
      if (rule.effect !== 'deny') continue;

      const actions = Array.isArray(rule.action) ? rule.action : [rule.action];
      const actionMatches = actions.some((pattern) => matchAction(pattern, intent.action));

      if (!actionMatches) continue;

      // Check if conditions apply
      if (matchConditions(rule.conditions, intent)) {
        return {
          allowed: false,
          decision: 'deny',
          matchedRule: rule,
          matchedPolicy: policy,
          reason: rule.reason || `Denied by policy "${policy.name}"`,
          severity: policy.severity,
        };
      }
    }
  }

  // Check for explicit allow rules
  for (const policy of policies) {
    for (const rule of policy.rules) {
      if (rule.effect !== 'allow') continue;

      const actions = Array.isArray(rule.action) ? rule.action : [rule.action];
      const actionMatches = actions.some((pattern) => matchAction(pattern, intent.action));

      if (actionMatches && matchConditions(rule.conditions, intent)) {
        return {
          allowed: true,
          decision: 'allow',
          matchedRule: rule,
          matchedPolicy: policy,
          reason: rule.reason || `Allowed by policy "${policy.name}"`,
          severity: 0,
        };
      }
    }
  }

  // Default: allow (open policy model)
  return {
    allowed: true,
    decision: 'allow',
    matchedRule: null,
    matchedPolicy: null,
    reason: 'No matching policy — default allow',
    severity: 0,
  };
}

export { matchAction, matchScope };
