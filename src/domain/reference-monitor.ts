// Agent Reference Monitor — the Action Authorization Boundary (AAB)
// Mediates ALL agent actions against declared policies.
// No DOM, no Node.js APIs — pure domain logic.

import type { Policy, Decision, CanonicalAction, DecisionRecord } from '../core/types.js';
import { EventBus } from '../core/event-bus.js';
import { createAction, DECISION } from './actions.js';
import { evaluate, validatePolicy } from './policy.js';
import { simpleHash } from './hash.js';

// --- Monitor Events ---
export const MONITOR_EVENTS = {
  ACTION_REQUESTED: 'ActionRequested',
  ACTION_ALLOWED: 'ActionAllowed',
  ACTION_DENIED: 'ActionDenied',
  ACTION_ESCALATED: 'ActionEscalated',
  POLICY_LOADED: 'PolicyLoaded',
  POLICY_VIOLATION: 'PolicyViolation',
} as const;

interface MonitorEventMap {
  ActionRequested: { actionId: string; type: string; target: string; justification: string };
  ActionAllowed: DecisionRecord;
  ActionDenied: DecisionRecord;
  ActionEscalated: DecisionRecord;
  PolicyLoaded: { policyHash: string; capabilityCount: number; denyRuleCount: number };
  PolicyViolation: DecisionRecord;
}

interface AuthorizeResult {
  allowed: boolean;
  decision: Decision;
  reason: string;
  action: CanonicalAction;
  decisionRecord: DecisionRecord;
}

interface MonitorOptions {
  eventBus?: EventBus<MonitorEventMap>;
  onEscalate?: (record: DecisionRecord, action: CanonicalAction) => void;
}

interface MonitorInstance {
  authorize(type: string, target: string, justification: string, metadata?: Record<string, unknown>): AuthorizeResult;
  authorizeBatch(actions: readonly { type: string; target: string; justification: string; metadata?: Record<string, unknown> }[]): { allowed: boolean; results: AuthorizeResult[] };
  getTrail(): DecisionRecord[];
  getPolicyHash(): string;
  getStats(): { total: number; allowed: number; denied: number; escalated: number };
  bus: EventBus<MonitorEventMap>;
}

export function createMonitor(policy: Policy, options: MonitorOptions = {}): MonitorInstance {
  const { valid, errors } = validatePolicy(policy);
  if (!valid) {
    throw new Error(`Invalid policy: ${errors.join('; ')}`);
  }

  const frozenPolicy = Object.freeze(JSON.parse(JSON.stringify(policy))) as Policy;
  const bus = options.eventBus || new EventBus<MonitorEventMap>();
  const onEscalate = options.onEscalate || null;

  const trail: DecisionRecord[] = [];
  let decisionCounter = 0;

  function createDecisionRecordFn(action: CanonicalAction, result: { decision: Decision; reason: string; capability?: unknown }): DecisionRecord {
    decisionCounter++;
    const record: DecisionRecord = {
      actionId: action.id,
      decision: result.decision,
      reason: result.reason,
      timestamp: Date.now(),
      policyHash: simpleHash(JSON.stringify(frozenPolicy)),
    };
    return Object.freeze(record);
  }

  function emitDecision(eventType: keyof MonitorEventMap, record: DecisionRecord): void {
    bus.emit(eventType, record as MonitorEventMap[typeof eventType]);
    trail.push(record);
  }

  function authorize(
    type: string,
    target: string,
    justification: string,
    metadata: Record<string, unknown> = {},
  ): AuthorizeResult {
    const action = createAction(type, target, justification, metadata);

    bus.emit(MONITOR_EVENTS.ACTION_REQUESTED, {
      actionId: action.id,
      type: action.type,
      target: action.target,
      justification: action.justification,
    });

    const result = evaluate(action, frozenPolicy);
    const record = createDecisionRecordFn(action, result);

    if (result.decision === DECISION.ALLOW) {
      emitDecision(MONITOR_EVENTS.ACTION_ALLOWED, record);
    } else if (result.decision === DECISION.DENY) {
      emitDecision(MONITOR_EVENTS.ACTION_DENIED, record);
    } else if (result.decision === DECISION.ESCALATE) {
      emitDecision(MONITOR_EVENTS.ACTION_ESCALATED, record);
      if (onEscalate) {
        onEscalate(record, action);
      }
    }

    return {
      allowed: result.decision === DECISION.ALLOW,
      decision: result.decision as Decision,
      reason: result.reason,
      action,
      decisionRecord: record,
    };
  }

  function authorizeBatch(
    actions: readonly { type: string; target: string; justification: string; metadata?: Record<string, unknown> }[],
  ): { allowed: boolean; results: AuthorizeResult[] } {
    const results = actions.map((a) =>
      authorize(a.type, a.target, a.justification, a.metadata || {}),
    );
    const allowed = results.every((r) => r.allowed);
    return { allowed, results };
  }

  function getTrail(): DecisionRecord[] {
    return [...trail];
  }

  function getPolicyHash(): string {
    return simpleHash(JSON.stringify(frozenPolicy));
  }

  function getStats(): { total: number; allowed: number; denied: number; escalated: number } {
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
