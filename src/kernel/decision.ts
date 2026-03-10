// Runtime Assurance Engine — the RTA decision switch.
// Pure domain logic. No DOM, no Node.js-specific APIs.

import type { DomainEvent } from '../core/types.js';
import { authorize } from './aab.js';
import type { RawAgentAction } from './aab.js';
import type { NormalizedIntent, EvalResult } from '../policy/evaluator.js';
import { checkAllInvariants, buildSystemState } from '../invariants/checker.js';
import type { InvariantCheck } from '../invariants/checker.js';
import { createEvidencePack } from './evidence.js';
import type { EvidencePack } from './evidence.js';
import { loadPolicies } from '../policy/loader.js';
import { DEFAULT_INVARIANTS } from '../invariants/definitions.js';
import type { AgentGuardInvariant } from '../invariants/definitions.js';

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

      const state = buildSystemState({
        ...systemContext,
        currentTarget: intent.target,
        currentCommand: intent.command,
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
