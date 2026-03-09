// Evidence pack generator — creates structured audit records.
// Pure domain logic. No DOM, no Node.js-specific APIs.

import type { DomainEvent } from '../core/types.js';
import { createEvent, EVIDENCE_PACK_GENERATED } from '../events/schema.js';
import { simpleHash } from '../core/hash.js';
import type { NormalizedIntent, EvalResult } from '../policy/evaluator.js';
import type { InvariantCheck } from '../invariants/checker.js';

export interface EvidencePack {
  packId: string;
  timestamp: number;
  intent: NormalizedIntent;
  decision: EvalResult;
  violations: Array<{
    invariantId: string;
    name: string;
    severity: number;
    expected: string;
    actual: string;
  }>;
  events: string[];
  summary: string;
  severity: number;
}

function generatePackId(timestamp: number, intent: NormalizedIntent): string {
  const content = `${timestamp}:${intent.action}:${intent.target}:${intent.agent}`;
  return `pack_${simpleHash(content)}`;
}

function computeMaxSeverity(decision: EvalResult, violations: InvariantCheck[]): number {
  let maxSeverity = decision.severity || 0;

  for (const v of violations) {
    if (v.invariant && v.invariant.severity > maxSeverity) {
      maxSeverity = v.invariant.severity;
    }
  }

  return maxSeverity;
}

function generateSummary(
  intent: NormalizedIntent,
  decision: EvalResult,
  violations: InvariantCheck[]
): string {
  const parts: string[] = [];

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

export function createEvidencePack(params: {
  intent: NormalizedIntent;
  decision: EvalResult;
  violations?: InvariantCheck[];
  events?: DomainEvent[];
}): { pack: EvidencePack; event: DomainEvent } {
  const { intent, decision, violations = [], events = [] } = params;
  const timestamp = Date.now();
  const packId = generatePackId(timestamp, intent);
  const severity = computeMaxSeverity(decision, violations);
  const summary = generateSummary(intent, decision, violations);

  const pack: EvidencePack = {
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

  const event = createEvent(EVIDENCE_PACK_GENERATED, {
    packId,
    eventIds: events.map((e) => e.id),
    summary,
    metadata: { severity, violationCount: violations.length },
  });

  return { pack, event };
}
