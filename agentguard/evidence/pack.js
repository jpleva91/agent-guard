// Evidence pack generator — creates structured audit records.
// Pure domain logic. No DOM, no Node.js-specific APIs.
//
// An evidence pack bundles all governance events from a single
// authorization decision into a reviewable artifact.
// Analogous to a flight data recorder snapshot.

import { createEvent, EVIDENCE_PACK_GENERATED } from '../../domain/events.js';
import { simpleHash } from '../../domain/hash.js';

/**
 * Evidence pack shape:
 * {
 *   packId: string,
 *   timestamp: number,
 *   intent: object,            // normalized action intent
 *   decision: object,          // authorization result
 *   violations: object[],      // invariant violations (if any)
 *   events: object[],          // all governance events produced
 *   summary: string,           // human-readable summary
 *   severity: number,          // max severity across all events
 * }
 */

/**
 * Generate a unique pack ID from timestamp and content hash.
 * @param {number} timestamp
 * @param {object} intent
 * @returns {string}
 */
function generatePackId(timestamp, intent) {
  const content = `${timestamp}:${intent.action}:${intent.target}:${intent.agent}`;
  return `pack_${simpleHash(content)}`;
}

/**
 * Compute the maximum severity across governance events and violations.
 * @param {object} decision - Authorization result
 * @param {object[]} violations - Invariant violations
 * @returns {number}
 */
function computeMaxSeverity(decision, violations) {
  let maxSeverity = decision.severity || 0;

  for (const v of violations) {
    if (v.invariant && v.invariant.severity > maxSeverity) {
      maxSeverity = v.invariant.severity;
    }
  }

  return maxSeverity;
}

/**
 * Generate a human-readable summary of the evidence pack.
 * @param {object} intent
 * @param {object} decision
 * @param {object[]} violations
 * @returns {string}
 */
function generateSummary(intent, decision, violations) {
  const parts = [];

  parts.push(`Action: ${intent.action} on ${intent.target || 'unknown'}`);
  parts.push(`Decision: ${decision.decision.toUpperCase()}`);

  if (decision.reason) {
    parts.push(`Reason: ${decision.reason}`);
  }

  if (violations.length > 0) {
    const names = violations.map((v) => v.invariant.name);
    parts.push(`Violations: ${names.join(', ')}`);
  }

  return parts.join(' | ');
}

/**
 * Create an evidence pack from an authorization decision.
 *
 * @param {object} params
 * @param {object} params.intent - Normalized action intent
 * @param {object} params.decision - Authorization result
 * @param {object[]} [params.violations=[]] - Invariant violations
 * @param {object[]} [params.events=[]] - Governance events produced
 * @returns {{ pack: object, event: object }} Evidence pack and its creation event
 */
export function createEvidencePack({ intent, decision, violations = [], events = [] }) {
  const timestamp = Date.now();
  const packId = generatePackId(timestamp, intent);
  const severity = computeMaxSeverity(decision, violations);
  const summary = generateSummary(intent, decision, violations);

  const pack = {
    packId,
    timestamp,
    intent,
    decision,
    violations: violations.map((v) => ({
      invariantId: v.invariant.id,
      name: v.invariant.name,
      severity: v.invariant.severity,
      expected: v.result.expected,
      actual: v.result.actual,
    })),
    events: events.map((e) => e.id),
    summary,
    severity,
  };

  // Create the meta-event announcing this evidence pack
  const event = createEvent(EVIDENCE_PACK_GENERATED, {
    packId,
    eventIds: events.map((e) => e.id),
    summary,
    metadata: { severity, violationCount: violations.length },
  });

  return { pack, event };
}
