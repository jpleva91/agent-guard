// Policy evaluator — matches actions against loaded policies.
// Pure domain logic. No DOM, no Node.js-specific APIs.

export interface PolicyRule {
  action: string | string[];
  effect: 'allow' | 'deny';
  conditions?: {
    scope?: string[];
    limit?: number;
    branches?: string[];
    requireTests?: boolean;
  };
  reason?: string;
}

export interface LoadedPolicy {
  id: string;
  name: string;
  description?: string;
  rules: PolicyRule[];
  severity: number;
}

export interface NormalizedIntent {
  action: string;
  target: string;
  agent: string;
  branch?: string;
  command?: string;
  filesAffected?: number;
  metadata?: Record<string, unknown>;
  destructive: boolean;
}

export interface EvalResult {
  allowed: boolean;
  decision: 'allow' | 'deny';
  matchedRule: PolicyRule | null;
  matchedPolicy: LoadedPolicy | null;
  reason: string;
  severity: number;
}

function matchAction(pattern: string, action: string): boolean {
  if (pattern === '*') return true;
  if (pattern === action) return true;

  if (pattern.endsWith('.*')) {
    const prefix = pattern.slice(0, -2);
    return action.startsWith(prefix + '.');
  }

  return false;
}

function matchScope(scopePatterns: string[], target: string): boolean {
  if (!scopePatterns || scopePatterns.length === 0) return true;
  if (!target) return true;

  for (const pattern of scopePatterns) {
    if (pattern === '*') return true;
    if (pattern === target) return true;
    if (pattern.endsWith('/') && target.startsWith(pattern)) return true;
    if (pattern.startsWith('*')) {
      const suffix = pattern.slice(1);
      if (target.endsWith(suffix)) return true;
    }
  }

  return false;
}

function matchConditions(conditions: PolicyRule['conditions'], intent: NormalizedIntent): boolean {
  if (!conditions) return true;

  if (conditions.scope && !matchScope(conditions.scope, intent.target)) {
    return false;
  }

  if (conditions.limit !== undefined && intent.filesAffected !== undefined) {
    if (intent.filesAffected > conditions.limit) {
      return true;
    }
  }

  if (conditions.branches && intent.branch) {
    if (conditions.branches.includes(intent.branch)) {
      return true;
    }
  }

  return true;
}

export function evaluate(intent: NormalizedIntent, policies: LoadedPolicy[]): EvalResult {
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

  for (const policy of policies) {
    for (const rule of policy.rules) {
      if (rule.effect !== 'deny') continue;

      const actions = Array.isArray(rule.action) ? rule.action : [rule.action];
      const actionMatches = actions.some((pattern) => matchAction(pattern, intent.action));

      if (!actionMatches) continue;

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
