// Runtime Assurance Engine — the RTA decision switch.
// Pure domain logic. No DOM, no Node.js-specific APIs.
//
// This is the classical Runtime Assurance Architecture pattern:
//
//   Advanced Controller (AI agent) proposes action
//        ↓
//   Runtime Monitor evaluates safety
//        ↓ allow          ↓ intervene
//   Execute action    Safe fallback
//
// The engine orchestrates: AAB → invariant check → evidence → decision.

import { authorize } from './aab.js';
import { checkAllInvariants, buildSystemState } from '../invariants/checker.js';
import { createEvidencePack } from '../evidence/pack.js';
import { loadPolicies } from '../policies/loader.js';
import { DEFAULT_INVARIANTS } from '../invariants/definitions.js';

/**
 * Intervention modes (safe fallback behaviors).
 */
export const INTERVENTION = {
  DENY: 'deny', // Block the action entirely
  ROLLBACK: 'rollback', // Revert the change
  PAUSE: 'pause', // Pause agent, require human review
  TEST_ONLY: 'test-only', // Allow in test/sandbox only
};

/**
 * Engine decision shape:
 * {
 *   allowed: boolean,
 *   intent: object,
 *   decision: object,
 *   violations: object[],
 *   events: object[],
 *   evidencePack: object | null,
 *   intervention: string | null,  // INTERVENTION type if denied
 * }
 */

/**
 * Determine the appropriate intervention for a denial.
 * @param {object} decision - Authorization result
 * @param {object[]} violations - Invariant violations
 * @returns {string} Intervention mode
 */
function selectIntervention(decision, violations) {
  const maxSeverity = Math.max(
    decision.severity || 0,
    ...violations.map((v) => v.invariant?.severity || 0)
  );

  if (maxSeverity >= 5) return INTERVENTION.DENY;
  if (maxSeverity >= 4) return INTERVENTION.PAUSE;
  if (maxSeverity >= 3) return INTERVENTION.ROLLBACK;
  return INTERVENTION.TEST_ONLY;
}

/**
 * Create a Runtime Assurance Engine.
 *
 * The engine maintains loaded policies and invariant definitions,
 * and provides the main evaluation entry point.
 *
 * @param {object} [config={}]
 * @param {object[]} [config.policyDefs=[]] - Raw policy definitions
 * @param {object[]} [config.invariants] - Invariant definitions (default: DEFAULT_INVARIANTS)
 * @param {function} [config.onEvent] - Callback for governance events
 * @returns {object} Engine instance
 */
export function createEngine(config = {}) {
  const { policies, errors: policyErrors } = loadPolicies(config.policyDefs || []);
  const invariants = config.invariants || DEFAULT_INVARIANTS;
  const onEvent = config.onEvent || null;

  /** Emit events through the callback if configured. */
  function emitEvents(events) {
    if (onEvent) {
      for (const event of events) {
        onEvent(event);
      }
    }
  }

  return {
    /**
     * Get policy loading errors (useful for diagnostics).
     * @returns {string[]}
     */
    getPolicyErrors() {
      return [...policyErrors];
    },

    /**
     * Get loaded policy count.
     * @returns {number}
     */
    getPolicyCount() {
      return policies.length;
    },

    /**
     * Get active invariant count.
     * @returns {number}
     */
    getInvariantCount() {
      return invariants.length;
    },

    /**
     * Evaluate an agent action through the full RTA pipeline.
     *
     * Pipeline:
     * 1. Normalize intent (AAB)
     * 2. Evaluate against policies (AAB)
     * 3. Check system invariants
     * 4. Generate evidence pack (if denied or violations found)
     * 5. Select intervention mode
     * 6. Emit governance events
     *
     * @param {object} rawAction - Raw action from the agent
     * @param {object} [systemContext={}] - Current system state context
     * @returns {object} Engine decision
     */
    evaluate(rawAction, systemContext = {}) {
      // Step 1-2: AAB authorization
      const { intent, result: authResult, events: authEvents } = authorize(rawAction, policies);

      // Step 3: Invariant checking
      const state = buildSystemState({
        ...systemContext,
        filesAffected: intent.filesAffected || systemContext.filesAffected,
        targetBranch: intent.branch || systemContext.targetBranch,
        forcePush: intent.action === 'git.force-push',
        directPush: intent.action === 'git.push',
        isPush: intent.action === 'git.push' || intent.action === 'git.force-push',
      });

      const {
        violations,
        events: invariantEvents,
        allHold,
      } = checkAllInvariants(invariants, state);

      // Combine all events
      const allEvents = [...authEvents, ...invariantEvents];

      // Determine final decision
      const allowed = authResult.allowed && allHold;
      const needsEvidence = !allowed || allEvents.length > 0;

      // Step 4: Evidence pack (only if there are events worth recording)
      let evidencePack = null;
      if (needsEvidence && allEvents.length > 0) {
        const { pack, event: packEvent } = createEvidencePack({
          intent,
          decision: authResult,
          violations,
          events: allEvents,
        });
        evidencePack = pack;
        allEvents.push(packEvent);
      }

      // Step 5: Intervention selection
      const intervention = allowed ? null : selectIntervention(authResult, violations);

      // Step 6: Emit events
      emitEvents(allEvents);

      return {
        allowed,
        intent,
        decision: authResult,
        violations: violations.map((v) => ({
          invariantId: v.invariant.id,
          name: v.invariant.name,
          severity: v.invariant.severity,
          expected: v.result.expected,
          actual: v.result.actual,
        })),
        events: allEvents,
        evidencePack,
        intervention,
      };
    },
  };
}
