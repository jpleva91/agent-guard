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

interface ConditionMatchResult {
  matched: boolean;
  scopeMatched?: boolean;
  limitExceeded?: boolean;
  branchMatched?: boolean;
}

function matchConditions(
  conditions: PolicyRule['conditions'],
  intent: NormalizedIntent
): ConditionMatchResult {
  if (!conditions) return { matched: true };

  if (conditions.scope && !matchScope(conditions.scope, intent.target)) {
    return { matched: false, scopeMatched: false };
  }

  const scopeMatched = conditions.scope ? true : undefined;
  let limitExceeded: boolean | undefined;
  let branchMatched: boolean | undefined;

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

  return { matched: true, scopeMatched, limitExceeded, branchMatched };
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
        }
      : {},
    outcome,
  };
}

export function evaluate(intent: NormalizedIntent, policies: LoadedPolicy[]): EvalResult {
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

  return {
    allowed: true,
    decision: 'allow',
    matchedRule: null,
    matchedPolicy: null,
    reason: 'No matching policy — default allow',
    severity: 0,
    trace: {
      rulesEvaluated,
      totalRulesChecked: rulesEvaluated.filter((r) => r.outcome !== 'skipped').length,
      phaseThatMatched: 'default',
      durationMs: performance.now() - startTime,
    },
  };
}

export { matchAction, matchScope };
