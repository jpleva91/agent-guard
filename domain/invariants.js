// Invariant enforcement engine — pure domain logic
// Evaluates agent actions against declared invariants.
// Produces InvariantViolation events when constraints are broken.
// No DOM, no Node.js APIs — pure functions.

import { createEvent, INVARIANT_VIOLATION } from './events.js';
import { simpleHash } from './hash.js';

// --- Invariant Types ---
// Each type has a dedicated evaluator function.

const INVARIANT_TYPES = {
  test_result: 'test_result',
  action: 'action',
  dependency: 'dependency',
};

// --- Severity Levels ---
const SEVERITY = {
  LOW: 2,
  MEDIUM: 3,
  HIGH: 4,
  CRITICAL: 5,
};

// --- Evaluators ---
// Each evaluator takes an invariant definition and a context object,
// returns { violated: boolean, expected: string, actual: string }

/**
 * Evaluate a test_result invariant.
 * Context: { result: 'pass' | 'fail', suite?: string, failed?: number }
 */
function evaluateTestResult(invariant, context) {
  const passed = context.result === 'pass';
  return {
    violated: !passed,
    expected: 'all tests pass',
    actual: context.result === 'pass' ? 'all tests pass' : `tests failed (${context.failed || 0} failures)`,
  };
}

/**
 * Evaluate an action invariant.
 * Context: { action: string, scope?: string }
 */
function evaluateAction(invariant, context) {
  // The invariant specifies a forbidden action pattern
  const forbidden = extractForbiddenAction(invariant.condition);
  const violated = forbidden !== null && context.action === forbidden;
  return {
    violated,
    expected: `action !== '${forbidden}'`,
    actual: `action = '${context.action}'`,
  };
}

/**
 * Evaluate a dependency invariant.
 * Context: { source: { layer: string, module: string }, target: { layer: string, module: string } }
 */
function evaluateDependency(invariant, context) {
  const forbidden = extractForbiddenDependency(invariant.condition);
  if (!forbidden) return { violated: false, expected: 'no forbidden dependencies', actual: 'clean' };

  const violated =
    context.source?.layer === forbidden.sourceLayer &&
    context.target?.layer === forbidden.targetLayer;

  return {
    violated,
    expected: `${forbidden.sourceLayer} must not depend on ${forbidden.targetLayer}`,
    actual: violated
      ? `${context.source.layer}/${context.source.module} → ${context.target.layer}/${context.target.module}`
      : 'no violation',
  };
}

// --- Condition Parsers ---

/**
 * Extract the forbidden action from a condition string like "action !== 'shell.exec'"
 * @param {string} condition
 * @returns {string|null}
 */
function extractForbiddenAction(condition) {
  const match = condition.match(/action\s*!==?\s*'([^']+)'/);
  return match ? match[1] : null;
}

/**
 * Extract forbidden dependency from a condition like "source.layer !== 'core' || target.layer !== 'game'"
 * @param {string} condition
 * @returns {{ sourceLayer: string, targetLayer: string }|null}
 */
function extractForbiddenDependency(condition) {
  const sourceMatch = condition.match(/source\.layer\s*!==?\s*'([^']+)'/);
  const targetMatch = condition.match(/target\.layer\s*!==?\s*'([^']+)'/);
  if (sourceMatch && targetMatch) {
    return { sourceLayer: sourceMatch[1], targetLayer: targetMatch[1] };
  }
  return null;
}

// --- Evaluator Registry ---
const EVALUATORS = {
  [INVARIANT_TYPES.test_result]: evaluateTestResult,
  [INVARIANT_TYPES.action]: evaluateAction,
  [INVARIANT_TYPES.dependency]: evaluateDependency,
};

// --- Public API ---

/**
 * Validate an invariant definition.
 * @param {object} invariant
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateInvariant(invariant) {
  const errors = [];
  if (!invariant || typeof invariant !== 'object') {
    return { valid: false, errors: ['Invariant must be a non-null object'] };
  }
  if (!invariant.id) errors.push('Invariant missing required field: id');
  if (!invariant.name) errors.push('Invariant missing required field: name');
  if (!invariant.type) errors.push('Invariant missing required field: type');
  if (!invariant.condition) errors.push('Invariant missing required field: condition');
  if (invariant.type && !EVALUATORS[invariant.type]) {
    errors.push(`Unknown invariant type: ${invariant.type}`);
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Load and validate a set of invariant definitions.
 * @param {{ invariants: object[] }} config
 * @returns {{ invariants: object[], errors: string[] }}
 */
export function loadInvariants(config) {
  if (!config || !Array.isArray(config.invariants)) {
    return { invariants: [], errors: ['Config must have an invariants array'] };
  }

  const errors = [];
  const valid = [];

  for (const inv of config.invariants) {
    const result = validateInvariant(inv);
    if (result.valid) {
      valid.push(inv);
    } else {
      errors.push(`Invariant "${inv.id || inv.name || '?'}": ${result.errors.join('; ')}`);
    }
  }

  return { invariants: valid, errors };
}

/**
 * Evaluate a single invariant against a context.
 * Returns null if the invariant is not violated.
 * Returns an InvariantViolation event if violated.
 *
 * @param {object} invariant - The invariant definition
 * @param {object} context - The evaluation context (action, test result, etc.)
 * @returns {object|null} - InvariantViolation event or null
 */
export function evaluateInvariant(invariant, context) {
  const evaluator = EVALUATORS[invariant.type];
  if (!evaluator) return null;

  const result = evaluator(invariant, context);
  if (!result.violated) return null;

  return createEvent(INVARIANT_VIOLATION, {
    invariant: invariant.id,
    expected: result.expected,
    actual: result.actual,
    metadata: {
      name: invariant.name,
      type: invariant.type,
      severity: invariant.severity || SEVERITY.MEDIUM,
      description: invariant.description || null,
    },
  });
}

/**
 * Evaluate all invariants against a context.
 * Returns an array of InvariantViolation events (empty if no violations).
 *
 * @param {object[]} invariants - Array of invariant definitions
 * @param {object} context - The evaluation context
 * @returns {object[]} - Array of InvariantViolation events
 */
export function evaluateAll(invariants, context) {
  const violations = [];
  for (const inv of invariants) {
    const violation = evaluateInvariant(inv, context);
    if (violation) violations.push(violation);
  }
  return violations;
}

/**
 * Generate a fingerprint for a violation (for deduplication).
 * @param {string} invariantId
 * @param {string} actual
 * @returns {string}
 */
export function violationFingerprint(invariantId, actual) {
  return simpleHash(`violation:${invariantId}:${actual}`);
}

/**
 * Map a violation severity to a BugMon encounter severity.
 * Higher severity = tougher monster with HP bonus.
 * @param {number} severity - Invariant severity (1-5)
 * @returns {{ hpBonus: number, isBoss: boolean }}
 */
export function violationToEncounterParams(severity) {
  return {
    hpBonus: (severity - 1) * 3,
    isBoss: severity >= 4,
  };
}

// Re-export for external use
export { INVARIANT_TYPES, SEVERITY };
