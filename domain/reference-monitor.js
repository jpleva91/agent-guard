// Agent Reference Monitor — the Action Authorization Boundary (AAB)
// Mediates ALL agent actions against declared policies.
// Emits immutable decision events for every allow/deny/escalate.
// No DOM, no Node.js APIs — pure domain logic.
//
// Design principles (reference-monitor pattern):
//   1. Complete mediation — all actions pass through
//   2. Tamper-resistant — policy is immutable once set
//   3. Verifiable — small, auditable core
//   4. Observable — every decision emits an event

import { createAction, validateAction, DECISION } from './actions.js';
import { evaluate, validatePolicy } from './policy.js';
import { EventBus } from './event-bus.js';
import { simpleHash } from './hash.js';

// --- Monitor Events ---
// These are the reference monitor's own event types,
// distinct from the domain events in events.js.
// They feed into BugMon's observability plane.

export const MONITOR_EVENTS = {
  ACTION_REQUESTED: 'ActionRequested',
  ACTION_ALLOWED: 'ActionAllowed',
  ACTION_DENIED: 'ActionDenied',
  ACTION_ESCALATED: 'ActionEscalated',
  POLICY_LOADED: 'PolicyLoaded',
  POLICY_VIOLATION: 'PolicyViolation',
};

/**
 * Create an Agent Reference Monitor instance.
 *
 * The monitor is the enforcement core — the security kernel.
 * It does only:
 *   - Canonicalize intent (via createAction)
 *   - Evaluate policy (via evaluate)
 *   - Enforce capability checks
 *   - Emit signed decision events
 *   - Approve, deny, or require escalation
 *
 * @param {object} policy - Policy definition (capabilities, deny rules, etc.)
 * @param {object} [options={}]
 * @param {EventBus} [options.eventBus] - External event bus to emit to
 * @param {function} [options.onEscalate] - Callback for escalation decisions
 * @returns {object} Monitor instance
 */
export function createMonitor(policy, options = {}) {
  const { valid, errors } = validatePolicy(policy);
  if (!valid) {
    throw new Error(`Invalid policy: ${errors.join('; ')}`);
  }

  // Freeze policy to prevent mutation (tamper-resistance)
  const frozenPolicy = Object.freeze(JSON.parse(JSON.stringify(policy)));

  const bus = options.eventBus || new EventBus();
  const onEscalate = options.onEscalate || null;

  // Immutable audit trail
  const trail = [];
  let decisionCounter = 0;

  /**
   * Generate a decision record with provenance.
   */
  function createDecisionRecord(action, result) {
    decisionCounter++;
    const record = {
      decisionId: `dec_${action.timestamp}_${decisionCounter}`,
      actionId: action.id,
      actionType: action.type,
      target: action.target,
      justification: action.justification,
      decision: result.decision,
      reason: result.reason,
      capability: result.capability,
      timestamp: Date.now(),
      policyHash: simpleHash(JSON.stringify(frozenPolicy)),
    };
    return Object.freeze(record);
  }

  /**
   * Emit a monitor event to the bus.
   */
  function emitDecision(eventType, record) {
    bus.emit(eventType, record);
    trail.push(record);
  }

  /**
   * Request authorization for an action.
   * This is the single entry point — the complete mediation gate.
   *
   * @param {string} type - Action type (e.g. 'file.write')
   * @param {string} target - Target path/scope
   * @param {string} justification - Why the action is needed
   * @param {object} [metadata={}] - Additional context
   * @returns {{ allowed: boolean, decision: string, reason: string, action: object, decisionRecord: object }}
   */
  function authorize(type, target, justification, metadata = {}) {
    // Step 1: Canonicalize into action object
    const action = createAction(type, target, justification, metadata);

    // Emit request event
    bus.emit(MONITOR_EVENTS.ACTION_REQUESTED, {
      actionId: action.id,
      type: action.type,
      target: action.target,
      justification: action.justification,
    });

    // Step 2: Evaluate against policy
    const result = evaluate(action, frozenPolicy);

    // Step 3: Create provenance-attached decision record
    const record = createDecisionRecord(action, result);

    // Step 4: Emit appropriate event
    if (result.decision === DECISION.ALLOW) {
      emitDecision(MONITOR_EVENTS.ACTION_ALLOWED, record);
    } else if (result.decision === DECISION.DENY) {
      emitDecision(MONITOR_EVENTS.ACTION_DENIED, record);
    } else if (result.decision === DECISION.ESCALATE) {
      emitDecision(MONITOR_EVENTS.ACTION_ESCALATED, record);
      // Invoke escalation callback if provided
      if (onEscalate) {
        onEscalate(record, action);
      }
    }

    return {
      allowed: result.decision === DECISION.ALLOW,
      decision: result.decision,
      reason: result.reason,
      action,
      decisionRecord: record,
    };
  }

  /**
   * Bulk-authorize multiple actions. All must pass for the batch to succeed.
   *
   * @param {Array<{ type: string, target: string, justification: string, metadata?: object }>} actions
   * @returns {{ allowed: boolean, results: object[] }}
   */
  function authorizeBatch(actions) {
    const results = actions.map((a) =>
      authorize(a.type, a.target, a.justification, a.metadata || {}),
    );
    const allowed = results.every((r) => r.allowed);
    return { allowed, results };
  }

  /**
   * Get the immutable audit trail.
   * @returns {object[]}
   */
  function getTrail() {
    return [...trail];
  }

  /**
   * Get the policy hash for verification.
   * @returns {string}
   */
  function getPolicyHash() {
    return simpleHash(JSON.stringify(frozenPolicy));
  }

  /**
   * Get trail statistics.
   * @returns {{ total: number, allowed: number, denied: number, escalated: number }}
   */
  function getStats() {
    let allowed = 0;
    let denied = 0;
    let escalated = 0;
    for (const record of trail) {
      if (record.decision === DECISION.ALLOW) allowed++;
      else if (record.decision === DECISION.DENY) denied++;
      else if (record.decision === DECISION.ESCALATE) escalated++;
    }
    return { total: trail.length, allowed, denied, escalated };
  }

  // Emit policy loaded event
  bus.emit(MONITOR_EVENTS.POLICY_LOADED, {
    policyHash: getPolicyHash(),
    capabilityCount: frozenPolicy.capabilities.length,
    denyRuleCount: frozenPolicy.deny ? frozenPolicy.deny.length : 0,
  });

  return Object.freeze({
    authorize,
    authorizeBatch,
    getTrail,
    getPolicyHash,
    getStats,
    bus,
  });
}
