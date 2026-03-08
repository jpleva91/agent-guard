// Invariant enforcement engine — pure domain logic
// Evaluates agent actions against declared invariants.
// Produces InvariantViolation events when constraints are broken.
// No DOM, no Node.js APIs — pure functions.

import type { DomainEvent, InvariantType, DomainInvariantDef, ValidationResult, Severity } from '../core/types.js';
import { createEvent, INVARIANT_VIOLATION } from './events.js';
import { simpleHash } from './hash.js';

// --- Invariant Types ---
export const INVARIANT_TYPES: Record<string, InvariantType> = {
  test_result: 'test_result',
  action: 'action',
  dependency: 'dependency',
};

// --- Severity Levels ---
export const SEVERITY: Record<string, Severity> = {
  LOW: 2,
  MEDIUM: 3,
  HIGH: 4,
  CRITICAL: 5,
};

// --- Evaluators ---
interface EvalResult {
  violated: boolean;
  expected: string;
  actual: string;
}

interface TestResultContext {
  result: string;
  failed?: number;
}

interface ActionContext {
  action: string;
  scope?: string;
}

interface DependencyContext {
  source?: { layer: string; module: string };
  target?: { layer: string; module: string };
}

type EvalContext = TestResultContext | ActionContext | DependencyContext;

function evaluateTestResult(_invariant: DomainInvariantDef, context: TestResultContext): EvalResult {
  const passed = context.result === 'pass';
  return {
    violated: !passed,
    expected: 'all tests pass',
    actual:
      context.result === 'pass'
        ? 'all tests pass'
        : `tests failed (${context.failed || 0} failures)`,
  };
}

function extractForbiddenAction(condition: { field: string; operator: string; value: unknown }): string | null {
  // The condition is structured as { field: 'action', operator: '!==', value: 'shell.exec' }
  if (condition.field === 'action' && (condition.operator === '!==' || condition.operator === '!=')) {
    return condition.value as string;
  }
  // Fallback: try parsing from string representation
  const condStr = typeof condition === 'string' ? condition : `${condition.field} ${condition.operator} '${condition.value}'`;
  const match = condStr.match(/action\s*!==?\s*'([^']+)'/);
  return match ? match[1] : null;
}

function extractForbiddenDependency(condition: { field: string; operator: string; value: unknown }): {
  sourceLayer: string;
  targetLayer: string;
} | null {
  const condStr = typeof condition === 'string' ? condition : JSON.stringify(condition);
  const sourceMatch = condStr.match(/source\.layer\s*!==?\s*'([^']+)'/);
  const targetMatch = condStr.match(/target\.layer\s*!==?\s*'([^']+)'/);
  if (sourceMatch && targetMatch) {
    return { sourceLayer: sourceMatch[1], targetLayer: targetMatch[1] };
  }
  return null;
}

function evaluateAction(invariant: DomainInvariantDef, context: ActionContext): EvalResult {
  const forbidden = extractForbiddenAction(invariant.condition);
  const violated = forbidden !== null && context.action === forbidden;
  return {
    violated,
    expected: `action !== '${forbidden}'`,
    actual: `action = '${context.action}'`,
  };
}

function evaluateDependency(invariant: DomainInvariantDef, context: DependencyContext): EvalResult {
  const forbidden = extractForbiddenDependency(invariant.condition);
  if (!forbidden) return { violated: false, expected: 'no forbidden dependencies', actual: 'clean' };

  const violated =
    context.source?.layer === forbidden.sourceLayer &&
    context.target?.layer === forbidden.targetLayer;

  return {
    violated,
    expected: `${forbidden.sourceLayer} must not depend on ${forbidden.targetLayer}`,
    actual: violated
      ? `${context.source!.layer}/${context.source!.module} → ${context.target!.layer}/${context.target!.module}`
      : 'no violation',
  };
}

// --- Evaluator Registry ---
const EVALUATORS: Record<string, (invariant: DomainInvariantDef, context: EvalContext) => EvalResult> = {
  [INVARIANT_TYPES.test_result]: evaluateTestResult as (inv: DomainInvariantDef, ctx: EvalContext) => EvalResult,
  [INVARIANT_TYPES.action]: evaluateAction as (inv: DomainInvariantDef, ctx: EvalContext) => EvalResult,
  [INVARIANT_TYPES.dependency]: evaluateDependency as (inv: DomainInvariantDef, ctx: EvalContext) => EvalResult,
};

// --- Public API ---

export function validateInvariant(invariant: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];
  if (!invariant || typeof invariant !== 'object') {
    return { valid: false, errors: ['Invariant must be a non-null object'] };
  }
  if (!invariant.id) errors.push('Invariant missing required field: id');
  if (!invariant.name) errors.push('Invariant missing required field: name');
  if (!invariant.type) errors.push('Invariant missing required field: type');
  if (!invariant.condition) errors.push('Invariant missing required field: condition');
  if (invariant.type && !EVALUATORS[invariant.type as string]) {
    errors.push(`Unknown invariant type: ${invariant.type as string}`);
  }
  return { valid: errors.length === 0, errors };
}

export function loadInvariants(config: { invariants?: unknown[] }): {
  invariants: DomainInvariantDef[];
  errors: string[];
} {
  if (!config || !Array.isArray(config.invariants)) {
    return { invariants: [], errors: ['Config must have an invariants array'] };
  }

  const errors: string[] = [];
  const valid: DomainInvariantDef[] = [];

  for (const inv of config.invariants) {
    const invObj = inv as Record<string, unknown>;
    const result = validateInvariant(invObj);
    if (result.valid) {
      valid.push(inv as DomainInvariantDef);
    } else {
      errors.push(
        `Invariant "${(invObj.id as string) || (invObj.name as string) || '?'}": ${result.errors.join('; ')}`,
      );
    }
  }

  return { invariants: valid, errors };
}

export function evaluateInvariant(
  invariant: DomainInvariantDef,
  context: EvalContext,
): DomainEvent | null {
  const evaluator = EVALUATORS[invariant.type];
  if (!evaluator) return null;

  const result = evaluator(invariant, context);
  if (!result.violated) return null;

  return createEvent(INVARIANT_VIOLATION, {
    invariant: invariant.id,
    expected: result.expected,
    actual: result.actual,
    metadata: {
      name: invariant.description,
      type: invariant.type,
      severity: invariant.severity || SEVERITY.MEDIUM,
      description: invariant.description || null,
    },
  });
}

export function evaluateAll(
  invariants: readonly DomainInvariantDef[],
  context: EvalContext,
): DomainEvent[] {
  const violations: DomainEvent[] = [];
  for (const inv of invariants) {
    const violation = evaluateInvariant(inv, context);
    if (violation) violations.push(violation);
  }
  return violations;
}

export function violationFingerprint(invariantId: string, actual: string): string {
  return simpleHash(`violation:${invariantId}:${actual}`);
}

export function violationToEncounterParams(severity: number): {
  hpBonus: number;
  isBoss: boolean;
} {
  return {
    hpBonus: (severity - 1) * 3,
    isBoss: severity >= 4,
  };
}
