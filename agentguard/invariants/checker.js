// Invariant checker — evaluates system state against invariant definitions.
// Pure domain logic. No DOM, no Node.js-specific APIs.

import { createEvent, INVARIANT_VIOLATION } from '../../domain/events.js';

/**
 * Check a single invariant against the current system state.
 * @param {object} invariant - Invariant definition with check function
 * @param {object} state - Current system state snapshot
 * @returns {{ holds: boolean, invariant: object, result: object }}
 */
export function checkInvariant(invariant, state) {
  const result = invariant.check(state);
  return {
    holds: result.holds,
    invariant,
    result,
  };
}

/**
 * Check all invariants against the current system state.
 * Returns violations (invariants that do not hold).
 *
 * @param {object[]} invariants - Array of invariant definitions
 * @param {object} state - Current system state snapshot
 * @returns {{ violations: object[], events: object[], allHold: boolean }}
 */
export function checkAllInvariants(invariants, state) {
  const violations = [];
  const events = [];

  for (const invariant of invariants) {
    const check = checkInvariant(invariant, state);

    if (!check.holds) {
      violations.push(check);

      events.push(
        createEvent(INVARIANT_VIOLATION, {
          invariant: invariant.id,
          expected: check.result.expected,
          actual: check.result.actual,
          metadata: {
            name: invariant.name,
            severity: invariant.severity,
            description: invariant.description,
          },
        })
      );
    }
  }

  return {
    violations,
    events,
    allHold: violations.length === 0,
  };
}

/**
 * Build a system state snapshot from available context.
 * This is a helper to normalize various inputs into the state shape
 * expected by invariant check functions.
 *
 * @param {object} context - Raw context from the execution environment
 * @returns {object} Normalized system state
 */
export function buildSystemState(context = {}) {
  return {
    modifiedFiles: context.modifiedFiles || [],
    targetBranch: context.targetBranch || '',
    directPush: context.directPush || false,
    forcePush: context.forcePush || false,
    isPush: context.isPush || false,
    testsPass: context.testsPass,
    filesAffected: context.filesAffected || (context.modifiedFiles || []).length,
    blastRadiusLimit: context.blastRadiusLimit || 20,
    protectedBranches: context.protectedBranches || ['main', 'master'],
  };
}
