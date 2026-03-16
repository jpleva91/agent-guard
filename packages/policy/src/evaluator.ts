// Policy evaluator — matches actions against loaded policies.
// Pure domain logic. No DOM, no Node.js-specific APIs.

import type { AgentPersona } from '@red-codes/core';

export interface PersonaCondition {
  trustTier?: string[];
  role?: string[];
  autonomy?: string[];
  riskTolerance?: string[];
  tags?: string[];
}

export interface PolicyRule {
  action: string | string[];
  effect: 'allow' | 'deny';
  conditions?: {
    scope?: string[];
    limit?: number;
    branches?: string[];
    requireTests?: boolean;
    requireFormat?: boolean;
    persona?: PersonaCondition;
  };
  reason?: string;
  /** Optional intervention type override for deny rules. When set, the kernel uses this
   *  instead of the severity-based default (e.g., `intervention: 'pause'` or `'rollback'`). */
  intervention?: 'pause' | 'rollback' | 'deny';
}

export interface LoadedPolicy {
  id: string;
  name: string;
  description?: string;
  rules: PolicyRule[];
  severity: number;
  persona?: AgentPersona;
}

export interface NormalizedIntent {
  action: string;
  target: string;
  agent: string;
  branch?: string;
  command?: string;
  filesAffected?: number;
  metadata?: Record<string, unknown>;
  persona?: AgentPersona;
  destructive: boolean;
}

/** Evaluation result for a single rule against an intent */
export interface RuleEvaluation {
  policyId: string;
  policyName: string;
  ruleIndex: number;
  rule: PolicyRule;
  actionMatched: boolean;
  conditionsMatched: boolean;
  conditionDetails: {
    scopeMatched?: boolean;
    limitExceeded?: boolean;
    branchMatched?: boolean;
    personaMatched?: boolean;
  };
  outcome: 'match' | 'no-match' | 'skipped';
}

/** Full evaluation trace capturing every rule checked during policy evaluation */
export interface PolicyEvaluationTrace {
  rulesEvaluated: RuleEvaluation[];
  totalRulesChecked: number;
  phaseThatMatched: 'deny' | 'allow' | 'default' | null;
  durationMs: number;
}

export interface EvalResult {
  allowed: boolean;
  decision: 'allow' | 'deny';
  matchedRule: PolicyRule | null;
  matchedPolicy: LoadedPolicy | null;
  reason: string;
  severity: number;
  /** Detailed evaluation trace — which rules were checked, which matched, and why */
  trace?: PolicyEvaluationTrace;
  /** Policy-specified intervention override (from the matched deny rule, if any) */
  policyIntervention?: 'pause' | 'rollback' | 'deny';
}

/** Options for the policy evaluator */
export interface EvaluateOptions {
  /**
   * When true (default), actions with no matching policy rule are denied.
   * Set to false to opt into fail-open mode (legacy behavior) during migration.
   */
  defaultDeny?: boolean;
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
  if (!target) return false;

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

interface ConditionMatchResult {
  matched: boolean;
  scopeMatched?: boolean;
  limitExceeded?: boolean;
  branchMatched?: boolean;
  personaMatched?: boolean;
}

function matchPersonaCondition(
  personaCond: PersonaCondition,
  persona: AgentPersona | undefined
): boolean {
  if (!persona) return false;

  if (personaCond.trustTier && personaCond.trustTier.length > 0) {
    if (!persona.trustTier || !personaCond.trustTier.includes(persona.trustTier)) return false;
  }
  if (personaCond.role && personaCond.role.length > 0) {
    if (!persona.role || !personaCond.role.includes(persona.role)) return false;
  }
  if (personaCond.autonomy && personaCond.autonomy.length > 0) {
    if (!persona.autonomy || !personaCond.autonomy.includes(persona.autonomy)) return false;
  }
  if (personaCond.riskTolerance && personaCond.riskTolerance.length > 0) {
    if (!persona.riskTolerance || !personaCond.riskTolerance.includes(persona.riskTolerance)) {
      return false;
    }
  }
  if (personaCond.tags && personaCond.tags.length > 0) {
    if (!persona.tags || !personaCond.tags.some((t) => persona.tags!.includes(t))) return false;
  }

  return true;
}

function matchConditions(
  conditions: PolicyRule['conditions'],
  intent: NormalizedIntent
): ConditionMatchResult {
  if (!conditions) return { matched: true };

  // Gate conditions: skip this rule when the required flag is satisfied.
  // For deny rules, this means the deny is bypassed when the condition passes.
  if (conditions.requireTests && intent.metadata?.testsPass === true) {
    return { matched: false };
  }

  if (conditions.requireFormat && intent.metadata?.formatPass === true) {
    return { matched: false };
  }

  if (conditions.scope && !matchScope(conditions.scope, intent.target)) {
    return { matched: false, scopeMatched: false };
  }

  const scopeMatched = conditions.scope ? true : undefined;
  let limitExceeded: boolean | undefined;
  let branchMatched: boolean | undefined;
  let personaMatched: boolean | undefined;

  if (conditions.limit !== undefined && intent.filesAffected !== undefined) {
    limitExceeded = intent.filesAffected > conditions.limit;
    if (limitExceeded) {
      return { matched: true, scopeMatched, limitExceeded };
    }
  }

  if (conditions.branches && intent.branch) {
    branchMatched = conditions.branches.includes(intent.branch);
    if (branchMatched) {
      return { matched: true, scopeMatched, limitExceeded, branchMatched };
    }
  }

  if (conditions.persona) {
    personaMatched = matchPersonaCondition(conditions.persona, intent.persona);
    if (!personaMatched) {
      return { matched: false, scopeMatched, limitExceeded, branchMatched, personaMatched };
    }
  }

  return { matched: true, scopeMatched, limitExceeded, branchMatched, personaMatched };
}

function ruleKey(policyId: string, ruleIndex: number): string {
  return `${policyId}:${ruleIndex}`;
}

function createRuleEval(
  policy: LoadedPolicy,
  ruleIndex: number,
  rule: PolicyRule,
  actionMatched: boolean,
  conditionResult: ConditionMatchResult | null,
  outcome: RuleEvaluation['outcome']
): RuleEvaluation {
  return {
    policyId: policy.id,
    policyName: policy.name,
    ruleIndex,
    rule,
    actionMatched,
    conditionsMatched: conditionResult?.matched ?? false,
    conditionDetails: conditionResult
      ? {
          scopeMatched: conditionResult.scopeMatched,
          limitExceeded: conditionResult.limitExceeded,
          branchMatched: conditionResult.branchMatched,
          personaMatched: conditionResult.personaMatched,
        }
      : {},
    outcome,
  };
}

export function evaluate(
  intent: NormalizedIntent,
  policies: LoadedPolicy[],
  options?: EvaluateOptions
): EvalResult {
  const startTime = performance.now();
  const rulesEvaluated: RuleEvaluation[] = [];
  const ruleIndexMap = new Map<string, number>();

  if (!intent || !intent.action) {
    return {
      allowed: false,
      decision: 'deny',
      matchedRule: null,
      matchedPolicy: null,
      reason: 'Intent is missing required field: action',
      severity: 5,
      trace: {
        rulesEvaluated: [],
        totalRulesChecked: 0,
        phaseThatMatched: null,
        durationMs: performance.now() - startTime,
      },
    };
  }

  // Phase 1: Evaluate deny rules
  for (const policy of policies) {
    for (let ruleIndex = 0; ruleIndex < policy.rules.length; ruleIndex++) {
      const rule = policy.rules[ruleIndex];
      const key = ruleKey(policy.id, ruleIndex);

      if (rule.effect !== 'deny') {
        ruleIndexMap.set(key, rulesEvaluated.length);
        rulesEvaluated.push(createRuleEval(policy, ruleIndex, rule, false, null, 'skipped'));
        continue;
      }

      const actions = Array.isArray(rule.action) ? rule.action : [rule.action];
      const actionMatched = actions.some((pattern) => matchAction(pattern, intent.action));

      if (!actionMatched) {
        ruleIndexMap.set(key, rulesEvaluated.length);
        rulesEvaluated.push(createRuleEval(policy, ruleIndex, rule, false, null, 'no-match'));
        continue;
      }

      const conditionResult = matchConditions(rule.conditions, intent);

      if (conditionResult.matched) {
        ruleIndexMap.set(key, rulesEvaluated.length);
        rulesEvaluated.push(
          createRuleEval(policy, ruleIndex, rule, true, conditionResult, 'match')
        );

        return {
          allowed: false,
          decision: 'deny',
          matchedRule: rule,
          matchedPolicy: policy,
          reason: rule.reason || `Denied by policy "${policy.name}"`,
          severity: policy.severity,
          policyIntervention: rule.intervention,
          trace: {
            rulesEvaluated,
            totalRulesChecked: rulesEvaluated.length,
            phaseThatMatched: 'deny',
            durationMs: performance.now() - startTime,
          },
        };
      }

      ruleIndexMap.set(key, rulesEvaluated.length);
      rulesEvaluated.push(
        createRuleEval(policy, ruleIndex, rule, true, conditionResult, 'no-match')
      );
    }
  }

  // Phase 2: Evaluate allow rules
  for (const policy of policies) {
    for (let ruleIndex = 0; ruleIndex < policy.rules.length; ruleIndex++) {
      const rule = policy.rules[ruleIndex];
      if (rule.effect !== 'allow') continue;

      const key = ruleKey(policy.id, ruleIndex);
      const existingIdx = ruleIndexMap.get(key);
      const alreadyRecorded = existingIdx !== undefined;

      const actions = Array.isArray(rule.action) ? rule.action : [rule.action];
      const actionMatched = actions.some((pattern) => matchAction(pattern, intent.action));

      if (!actionMatched) {
        if (!alreadyRecorded) {
          ruleIndexMap.set(key, rulesEvaluated.length);
          rulesEvaluated.push(createRuleEval(policy, ruleIndex, rule, false, null, 'no-match'));
        }
        continue;
      }

      const conditionResult = matchConditions(rule.conditions, intent);

      if (conditionResult.matched) {
        const evalRecord = createRuleEval(policy, ruleIndex, rule, true, conditionResult, 'match');
        if (alreadyRecorded) {
          rulesEvaluated[existingIdx] = evalRecord;
        } else {
          ruleIndexMap.set(key, rulesEvaluated.length);
          rulesEvaluated.push(evalRecord);
        }

        return {
          allowed: true,
          decision: 'allow',
          matchedRule: rule,
          matchedPolicy: policy,
          reason: rule.reason || `Allowed by policy "${policy.name}"`,
          severity: 0,
          trace: {
            rulesEvaluated,
            totalRulesChecked: rulesEvaluated.filter((r) => r.outcome !== 'skipped').length,
            phaseThatMatched: 'allow',
            durationMs: performance.now() - startTime,
          },
        };
      }

      if (!alreadyRecorded) {
        ruleIndexMap.set(key, rulesEvaluated.length);
        rulesEvaluated.push(
          createRuleEval(policy, ruleIndex, rule, true, conditionResult, 'no-match')
        );
      }
    }
  }

  const defaultDeny = options?.defaultDeny ?? true;

  if (defaultDeny) {
    return {
      allowed: false,
      decision: 'deny',
      matchedRule: null,
      matchedPolicy: null,
      reason: 'No matching policy rule — default deny (fail-closed)',
      severity: 3,
      trace: {
        rulesEvaluated,
        totalRulesChecked: rulesEvaluated.filter((r) => r.outcome !== 'skipped').length,
        phaseThatMatched: 'default',
        durationMs: performance.now() - startTime,
      },
    };
  }

  return {
    allowed: true,
    decision: 'allow',
    matchedRule: null,
    matchedPolicy: null,
    reason: 'No matching policy rule — default allow (fail-open)',
    severity: 0,
    trace: {
      rulesEvaluated,
      totalRulesChecked: rulesEvaluated.filter((r) => r.outcome !== 'skipped').length,
      phaseThatMatched: 'default',
      durationMs: performance.now() - startTime,
    },
  };
}

export { matchAction, matchScope, matchPersonaCondition };
