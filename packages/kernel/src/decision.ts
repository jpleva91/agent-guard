// Runtime Assurance Engine — the RTA decision switch.
// Pure domain logic. No DOM, no Node.js-specific APIs.

import type { DomainEvent } from '@red-codes/core';
import { authorize } from './aab.js';
import type { RawAgentAction } from './aab.js';
import type { NormalizedIntent, EvalResult } from '@red-codes/policy';
import { checkAllInvariants, buildSystemState } from '@red-codes/invariants';
import type { InvariantCheck } from '@red-codes/invariants';
import { createEvidencePack } from './evidence.js';
import type { EvidencePack } from './evidence.js';
import { loadPolicies } from '@red-codes/policy';
import { DEFAULT_INVARIANTS } from '@red-codes/invariants';
import type { AgentGuardInvariant } from '@red-codes/invariants';
import { createEvent, POLICY_TRACE_RECORDED } from '@red-codes/events';

export const INTERVENTION = {
  DENY: 'deny',
  ROLLBACK: 'rollback',
  PAUSE: 'pause',
  TEST_ONLY: 'test-only',
} as const;

export type InterventionType = (typeof INTERVENTION)[keyof typeof INTERVENTION];

export interface EngineDecision {
  allowed: boolean;
  intent: NormalizedIntent;
  decision: EvalResult;
  violations: Array<{
    invariantId: string;
    name: string;
    severity: number;
    expected: string;
    actual: string;
  }>;
  events: DomainEvent[];
  evidencePack: EvidencePack | null;
  intervention: InterventionType | null;
}

export interface EngineConfig {
  policyDefs?: unknown[];
  invariants?: AgentGuardInvariant[];
  onEvent?: (event: DomainEvent) => void;
}

export interface Engine {
  getPolicyErrors(): string[];
  getPolicyCount(): number;
  getInvariantCount(): number;
  evaluate(
    rawAction: RawAgentAction | null,
    systemContext?: Record<string, unknown>
  ): EngineDecision;
}

function selectIntervention(decision: EvalResult, violations: InvariantCheck[]): InterventionType {
  const maxSeverity = Math.max(
    decision.severity || 0,
    ...violations.map((v) => v.invariant?.severity || 0)
  );

  if (maxSeverity >= 5) return INTERVENTION.DENY;
  if (maxSeverity >= 4) return INTERVENTION.PAUSE;
  if (maxSeverity >= 3) return INTERVENTION.ROLLBACK;
  return INTERVENTION.TEST_ONLY;
}

export function createEngine(config: EngineConfig = {}): Engine {
  const { policies, errors: policyErrors } = loadPolicies(config.policyDefs || []);
  const invariants = config.invariants || DEFAULT_INVARIANTS;
  const onEvent = config.onEvent || null;

  function emitEvents(events: DomainEvent[]): void {
    if (onEvent) {
      for (const event of events) {
        onEvent(event);
      }
    }
  }

  return {
    getPolicyErrors() {
      return [...policyErrors];
    },

    getPolicyCount() {
      return policies.length;
    },

    getInvariantCount() {
      return invariants.length;
    },

    evaluate(rawAction, systemContext = {}) {
      const { intent, result: authResult, events: authEvents } = authorize(rawAction, policies);

      // Emit policy evaluation trace if available
      if (authResult.trace) {
        const traceEvent = createEvent(POLICY_TRACE_RECORDED, {
          actionType: intent.action,
          target: intent.target,
          decision: authResult.decision,
          totalRulesChecked: authResult.trace.totalRulesChecked,
          phaseThatMatched: authResult.trace.phaseThatMatched,
          rulesEvaluated: authResult.trace.rulesEvaluated.map((r) => ({
            policyId: r.policyId,
            policyName: r.policyName,
            ruleIndex: r.ruleIndex,
            effect: r.rule.effect,
            actionPattern: r.rule.action,
            actionMatched: r.actionMatched,
            conditionsMatched: r.conditionsMatched,
            conditionDetails: r.conditionDetails,
            outcome: r.outcome,
          })),
          durationMs: authResult.trace.durationMs,
        });
        authEvents.push(traceEvent);
      }

      // Compute write size from raw action content (character length ≈ byte size for UTF-8 code)
      const writeSizeBytes =
        rawAction?.content !== undefined && rawAction?.content !== null
          ? rawAction.content.length
          : (systemContext.writeSizeBytes as number | undefined);

      const state = buildSystemState({
        ...systemContext,
        currentTarget: intent.target,
        currentCommand: intent.command,
        currentActionType: intent.action,
        filesAffected: intent.filesAffected || systemContext.filesAffected,
        targetBranch: intent.branch || systemContext.targetBranch,
        forcePush: intent.action === 'git.force-push',
        directPush: intent.action === 'git.push',
        isPush: intent.action === 'git.push' || intent.action === 'git.force-push',
        writeSizeBytes,
      });

      const {
        violations,
        events: invariantEvents,
        allHold,
      } = checkAllInvariants(invariants, state);

      const allEvents: DomainEvent[] = [...authEvents, ...invariantEvents];

      const allowed = authResult.allowed && allHold;
      const needsEvidence = !allowed || allEvents.length > 0;

      let evidencePack: EvidencePack | null = null;
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

      const intervention = allowed ? null : selectIntervention(authResult, violations);

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
