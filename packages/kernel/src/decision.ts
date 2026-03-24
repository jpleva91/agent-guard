// Runtime Assurance Engine — the RTA decision switch.
// Pure domain logic. No DOM, no Node.js-specific APIs.

import type { DomainEvent, ActionContext } from '@red-codes/core';
import { authorize, authorizeContext, isActionContext } from './aab.js';
import type { RawAgentAction } from './aab.js';
import type { NormalizedIntent, EvalResult, EvaluateOptions } from '@red-codes/policy';
import {
  checkAllInvariants,
  buildSystemState,
  isNetworkCommand,
  extractUrlFromCommand,
  extractDomainFromUrl,
} from '@red-codes/invariants';
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
  MODIFY: 'modify',
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
  /** Policy evaluation options (e.g., defaultDeny). Passed through to the evaluator. */
  evaluateOptions?: EvaluateOptions;
}

export interface Engine {
  getPolicyErrors(): string[];
  getPolicyCount(): number;
  getInvariantCount(): number;
  evaluate(
    rawAction: RawAgentAction | ActionContext | null,
    systemContext?: Record<string, unknown>
  ): EngineDecision;
}

function selectIntervention(decision: EvalResult, violations: InvariantCheck[]): InterventionType {
  // If the matched policy rule explicitly specifies an intervention, use it
  if (decision.policyIntervention) {
    const mapped: Record<string, InterventionType> = {
      deny: INTERVENTION.DENY,
      pause: INTERVENTION.PAUSE,
      rollback: INTERVENTION.ROLLBACK,
      modify: INTERVENTION.MODIFY,
    };
    if (mapped[decision.policyIntervention]) {
      return mapped[decision.policyIntervention];
    }
  }

  // Fall back to severity-based selection
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
  const evaluateOptions = config.evaluateOptions;

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
      // KE-2: Accept both RawAgentAction and ActionContext.
      // If already an ActionContext, merge session flags and use authorizeContext()
      // to skip re-normalization. Otherwise, enrich the raw action and authorize.
      let intent: NormalizedIntent | ActionContext;
      let authResult: EvalResult;
      let authEvents: DomainEvent[];

      if (isActionContext(rawAction)) {
        // ActionContext path — merge session-level state flags into metadata
        const enrichedCtx: ActionContext = {
          ...rawAction,
          metadata: {
            ...rawAction.metadata,
            testsPass: systemContext.testsPass ?? rawAction.metadata?.testsPass,
            formatPass: systemContext.formatPass ?? rawAction.metadata?.formatPass,
          },
        };
        const authResult_ = authorizeContext(enrichedCtx, policies, evaluateOptions);
        intent = authResult_.intent;
        authResult = authResult_.result;
        authEvents = authResult_.events;
      } else {
        // Legacy RawAgentAction path — enrich metadata and normalize
        const enrichedAction = rawAction
          ? {
              ...rawAction,
              metadata: {
                ...rawAction.metadata,
                testsPass: systemContext.testsPass ?? rawAction.metadata?.testsPass,
                formatPass: systemContext.formatPass ?? rawAction.metadata?.formatPass,
              },
            }
          : rawAction;
        const authResult_ = authorize(enrichedAction, policies, evaluateOptions);
        intent = authResult_.intent;
        authResult = authResult_.result;
        authEvents = authResult_.events;
      }

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

      // Compute write size from action content (character length ≈ byte size for UTF-8 code)
      const rawContent = isActionContext(rawAction) ? rawAction.args.content : rawAction?.content;
      const writeSizeBytes =
        rawContent !== undefined && rawContent !== null
          ? rawContent.length
          : (systemContext.writeSizeBytes as number | undefined);

      // Detect network requests for the network egress invariant
      const isHttpAction = intent.action === 'http.request';
      const isNetworkShellCmd =
        intent.action === 'shell.exec' && isNetworkCommand(intent.command || '');
      const isNetworkRequest =
        isHttpAction ||
        isNetworkShellCmd ||
        (systemContext.isNetworkRequest as boolean | undefined) === true;

      let requestUrl = systemContext.requestUrl as string | undefined;
      let requestDomain = systemContext.requestDomain as string | undefined;

      if (isNetworkRequest && !requestUrl) {
        if (isHttpAction && intent.target) {
          requestUrl = intent.target;
        } else if (isNetworkShellCmd && intent.command) {
          requestUrl = extractUrlFromCommand(intent.command) || undefined;
        }
      }

      if (isNetworkRequest && !requestDomain && requestUrl) {
        requestDomain = extractDomainFromUrl(requestUrl) || undefined;
      }

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
        isNetworkRequest,
        requestUrl,
        requestDomain,
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
