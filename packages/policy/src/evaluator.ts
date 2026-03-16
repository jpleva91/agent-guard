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

/**
 * Forecast-based policy condition — evaluates against impact forecast data
 * attached to the intent. Allows predictive governance rules such as
 * "deny if predicted test risk > 50" or "escalate if blast radius > 30".
 *
 * Each numeric field is a threshold: the condition matches when the intent's
 * forecast value meets or exceeds the threshold. For riskLevel, the condition
 * matches when the forecast risk level is included in the specified array.
 */
export interface ForecastCondition {
  /** Match when predicted test risk score >= this value (0–100) */
  testRiskScore?: number;
  /** Match when predicted blast radius score >= this value */
  blastRadiusScore?: number;
  /** Match when predicted risk level is one of these */
  riskLevel?: Array<'low' | 'medium' | 'high'>;
  /** Match when predicted file count >= this value */
  predictedFileCount?: number;
  /** Match when predicted dependency count >= this value */
  dependencyCount?: number;
}

/**
 * Captures the actual vs. threshold comparison for each evaluated forecast field.
 * Populated in conditionDetails when a forecast condition is present, giving
 * operators a concrete audit trail (e.g. testRiskScore: { actual: 60, threshold: 50 }).
 */
export interface ForecastMatchValues {
  testRiskScore?: { actual: number; threshold: number };
  blastRadiusScore?: { actual: number; threshold: number };
  riskLevel?: { actual: 'low' | 'medium' | 'high'; required: Array<'low' | 'medium' | 'high'> };
  predictedFileCount?: { actual: number; threshold: number };
  dependencyCount?: { actual: number; threshold: number };
}

/**
 * Forecast data that can be attached to a NormalizedIntent for
 * predictive policy evaluation. Mirrors the shape of ImpactForecast
 * from the kernel simulation package without creating a dependency.
 */
export interface IntentForecast {
  predictedFiles: string[];
  dependenciesAffected: string[];
  testRiskScore: number;
  blastRadiusScore: number;
  riskLevel: 'low' | 'medium' | 'high';
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
    forecast?: ForecastCondition;
  };
  reason?: string;
  /** Optional intervention type override for deny rules. When set, the kernel uses this
   *  instead of the severity-based default (e.g., `intervention: 'pause'` or `'rollback'`). */
  intervention?: 'pause' | 'rollback' | 'deny' | 'modify';
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
  /** Impact forecast data from simulation, used for predictive policy rules */
  forecast?: IntentForecast;
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
    forecastMatched?: boolean;
    /** Actual vs. threshold values for each evaluated forecast field */
    forecastValues?: ForecastMatchValues;
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
  policyIntervention?: 'pause' | 'rollback' | 'deny' | 'modify';
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
  forecastMatched?: boolean;
  forecastValues?: ForecastMatchValues;
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

function matchForecastCondition(
  forecastCond: ForecastCondition,
  forecast: IntentForecast | undefined
): { matched: boolean; values: ForecastMatchValues } {
  if (!forecast) return { matched: false, values: {} };

  const values: ForecastMatchValues = {};

  if (forecastCond.testRiskScore !== undefined) {
    values.testRiskScore = {
      actual: forecast.testRiskScore,
      threshold: forecastCond.testRiskScore,
    };
    if (forecast.testRiskScore < forecastCond.testRiskScore) {
      return { matched: false, values };
    }
  }

  if (forecastCond.blastRadiusScore !== undefined) {
    values.blastRadiusScore = {
      actual: forecast.blastRadiusScore,
      threshold: forecastCond.blastRadiusScore,
    };
    if (forecast.blastRadiusScore < forecastCond.blastRadiusScore) {
      return { matched: false, values };
    }
  }

  if (forecastCond.riskLevel && forecastCond.riskLevel.length > 0) {
    values.riskLevel = { actual: forecast.riskLevel, required: forecastCond.riskLevel };
    if (!forecastCond.riskLevel.includes(forecast.riskLevel)) {
      return { matched: false, values };
    }
  }

  if (forecastCond.predictedFileCount !== undefined) {
    values.predictedFileCount = {
      actual: forecast.predictedFiles.length,
      threshold: forecastCond.predictedFileCount,
    };
    if (forecast.predictedFiles.length < forecastCond.predictedFileCount) {
      return { matched: false, values };
    }
  }

  if (forecastCond.dependencyCount !== undefined) {
    values.dependencyCount = {
      actual: forecast.dependenciesAffected.length,
      threshold: forecastCond.dependencyCount,
    };
    if (forecast.dependenciesAffected.length < forecastCond.dependencyCount) {
      return { matched: false, values };
    }
  }

  return { matched: true, values };
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
  let forecastMatched: boolean | undefined;
  let forecastValues: ForecastMatchValues | undefined;

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

  if (conditions.forecast) {
    const forecastResult = matchForecastCondition(conditions.forecast, intent.forecast);
    forecastMatched = forecastResult.matched;
    forecastValues = forecastResult.values;
    if (!forecastMatched) {
      return {
        matched: false,
        scopeMatched,
        limitExceeded,
        branchMatched,
        personaMatched,
        forecastMatched,
        forecastValues,
      };
    }
  }

  return {
    matched: true,
    scopeMatched,
    limitExceeded,
    branchMatched,
    personaMatched,
    forecastMatched,
    forecastValues,
  };
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
          forecastMatched: conditionResult.forecastMatched,
          forecastValues: conditionResult.forecastValues,
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

export { matchAction, matchScope, matchPersonaCondition, matchForecastCondition };
