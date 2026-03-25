// Runtime Monitor — closed-loop feedback system.
// Pure domain logic. No DOM, no Node.js-specific APIs.

import type { DomainEvent, EventStore, ActionContext } from '@red-codes/core';
import { ESCALATION_LEVELS, ESCALATION_DEFAULTS } from '@red-codes/core';
import { createEngine, INTERVENTION } from './decision.js';
import type { EngineConfig, EngineDecision } from './decision.js';
import type { RawAgentAction } from './aab.js';
import { isActionContext } from './aab.js';
import { EventBus, createInMemoryStore } from '@red-codes/events';
import { createEvent, STATE_CHANGED, INVARIANT_VIOLATION } from '@red-codes/events';

export const ESCALATION = {
  NORMAL: ESCALATION_LEVELS.NORMAL,
  ELEVATED: ESCALATION_LEVELS.ELEVATED,
  HIGH: ESCALATION_LEVELS.HIGH,
  LOCKDOWN: ESCALATION_LEVELS.LOCKDOWN,
} as const;

export type EscalationLevel = (typeof ESCALATION)[keyof typeof ESCALATION];

const ESCALATION_NAMES: Record<EscalationLevel, string> = {
  [ESCALATION.NORMAL]: 'NORMAL',
  [ESCALATION.ELEVATED]: 'ELEVATED',
  [ESCALATION.HIGH]: 'HIGH',
  [ESCALATION.LOCKDOWN]: 'LOCKDOWN',
};

export interface MonitorState {
  escalationLevel: EscalationLevel;
  totalEvaluations: number;
  totalDenials: number;
  totalViolations: number;
  windowedDenials: number;
  windowedViolations: number;
  /** True when a single (actionType, target) pair exceeded the denial retry threshold */
  denialRetryEscalation: boolean;
}

export interface MonitorDecision extends EngineDecision {
  monitor: MonitorState;
}

export interface MonitorConfig extends EngineConfig {
  denialThreshold?: number;
  violationThreshold?: number;
  /** Time window in milliseconds for sliding-window escalation counting (default: 300000 = 5 min) */
  windowSize?: number;
  /** Injectable clock for testing (default: Date.now) */
  now?: () => number;
  /** Max retries per (actionType, target) pair before escalating to LOCKDOWN (default: 3) */
  denialRetryThreshold?: number;
}

interface RecentDenial {
  timestamp: number;
  action: string;
  target: string;
  reason: string;
}

interface RecentViolation {
  timestamp: number;
  invariantId: string;
}

export interface Monitor {
  bus: EventBus<Record<string, unknown>>;
  store: EventStore;
  process(
    rawAction: RawAgentAction | ActionContext | null,
    systemContext?: Record<string, unknown>
  ): MonitorDecision;
  getStatus(): Record<string, unknown>;
  getEscalationLevel(): EscalationLevel;
  resetEscalation(): void;
}

export function createMonitor(config: MonitorConfig = {}): Monitor {
  const bus = new EventBus<Record<string, unknown>>();
  const store = createInMemoryStore();

  const engine = createEngine({
    policyDefs: config.policyDefs || [],
    invariants: config.invariants,
    evaluateOptions: config.evaluateOptions,
    onEvent(event: DomainEvent) {
      store.append(event);
      bus.emit(event.kind, event as unknown as Record<string, unknown>);
      bus.emit('*', event as unknown as Record<string, unknown>);
    },
  });

  const denialThreshold = config.denialThreshold ?? ESCALATION_DEFAULTS.denialThreshold;
  const violationThreshold = config.violationThreshold ?? ESCALATION_DEFAULTS.violationThreshold;
  const windowSize = config.windowSize ?? ESCALATION_DEFAULTS.windowSize;
  const denialRetryThreshold =
    config.denialRetryThreshold ?? ESCALATION_DEFAULTS.denialRetryThreshold;
  const clock = config.now ?? Date.now;

  let totalEvaluations = 0;
  let totalDenials = 0;
  let totalViolations = 0;
  const denialsByAgent = new Map<string, number>();
  const violationsByInvariant = new Map<string, number>();
  const recentDenials: RecentDenial[] = [];
  const recentViolations: RecentViolation[] = [];
  /** Per-(actionType, target) denial counts for retry detection */
  const denialRetryMap = new Map<string, number>();
  let denialRetryEscalation = false;
  let escalationLevel: EscalationLevel = ESCALATION.NORMAL;
  const sessionStartTime = clock();

  function pruneExpired(): void {
    const cutoff = clock() - windowSize;
    while (recentDenials.length > 0 && recentDenials[0].timestamp <= cutoff) {
      recentDenials.shift();
    }
    while (recentViolations.length > 0 && recentViolations[0].timestamp <= cutoff) {
      recentViolations.shift();
    }
  }

  function updateEscalation(triggerAction?: string): DomainEvent | null {
    pruneExpired();
    const windowedDenialCount = recentDenials.length;
    const windowedViolationCount = recentViolations.length;
    const previousLevel = escalationLevel;

    if (
      denialRetryEscalation ||
      windowedDenialCount >= denialThreshold * 2 ||
      windowedViolationCount >= violationThreshold * 2
    ) {
      escalationLevel = ESCALATION.LOCKDOWN;
    } else if (
      windowedDenialCount >= denialThreshold ||
      windowedViolationCount >= violationThreshold
    ) {
      escalationLevel = ESCALATION.HIGH;
    } else if (windowedDenialCount >= Math.ceil(denialThreshold / 2)) {
      escalationLevel = ESCALATION.ELEVATED;
    } else {
      escalationLevel = ESCALATION.NORMAL;
    }

    bus.emit('escalation', { level: escalationLevel });

    if (escalationLevel !== previousLevel) {
      const stateEvent = createEvent(STATE_CHANGED, {
        from: ESCALATION_NAMES[previousLevel],
        to: ESCALATION_NAMES[escalationLevel],
        trigger: triggerAction || 'unknown',
        totalDenials,
        totalViolations,
        windowedDenials: windowedDenialCount,
        windowedViolations: windowedViolationCount,
        denialThreshold,
        violationThreshold,
      });
      store.append(stateEvent);
      bus.emit(STATE_CHANGED, stateEvent as unknown as Record<string, unknown>);
      bus.emit('*', stateEvent as unknown as Record<string, unknown>);
      return stateEvent;
    }

    return null;
  }

  return {
    bus,
    store,

    process(rawAction, systemContext = {}) {
      if (escalationLevel === ESCALATION.LOCKDOWN) {
        totalEvaluations++;
        // KE-2: Extract identity from either ActionContext or RawAgentAction
        const lockdownAction = isActionContext(rawAction)
          ? rawAction.action
          : rawAction?.tool || 'unknown';
        const lockdownAgent = isActionContext(rawAction)
          ? rawAction.agent
          : rawAction?.agent || 'unknown';
        const lockedResult: MonitorDecision = {
          allowed: false,
          intent: {
            action: lockdownAction,
            target: '',
            agent: lockdownAgent,
            destructive: false,
          },
          decision: {
            allowed: false,
            decision: 'deny',
            matchedRule: null,
            matchedPolicy: null,
            reason: 'Session in LOCKDOWN — human intervention required',
            severity: 5,
          },
          violations: [],
          events: [],
          evidencePack: null,
          intervention: INTERVENTION.DENY,
          monitor: {
            escalationLevel,
            totalEvaluations,
            totalDenials,
            totalViolations,
            windowedDenials: recentDenials.length,
            windowedViolations: recentViolations.length,
            denialRetryEscalation,
          },
        };
        bus.emit('lockdown-denial', lockedResult as unknown as Record<string, unknown>);
        return lockedResult;
      }

      const result = engine.evaluate(rawAction, systemContext);
      totalEvaluations++;

      if (!result.allowed) {
        totalDenials++;
        const agent = result.intent.agent || 'unknown';
        denialsByAgent.set(agent, (denialsByAgent.get(agent) || 0) + 1);

        const target = result.intent.target || '';
        recentDenials.push({
          timestamp: clock(),
          action: result.intent.action,
          target,
          reason: result.decision.reason,
        });

        // Track per-(actionType, target) denial retries
        const retryKey = `${result.intent.action}::${target}`;
        const retryCount = (denialRetryMap.get(retryKey) || 0) + 1;
        denialRetryMap.set(retryKey, retryCount);

        if (retryCount >= denialRetryThreshold && !denialRetryEscalation) {
          denialRetryEscalation = true;

          const retryEvent = createEvent(INVARIANT_VIOLATION, {
            invariant: 'denial-retry-escalation',
            expected: `No more than ${denialRetryThreshold - 1} denied retries for same (actionType, target)`,
            actual: `${retryCount} denials for (${result.intent.action}, ${target})`,
            metadata: {
              name: 'Denial Retry Escalation',
              severity: 4,
              description:
                'Agent retried the same denied action too many times — escalated to LOCKDOWN',
              actionType: result.intent.action,
              target,
              retryCount,
              threshold: denialRetryThreshold,
            },
          });
          store.append(retryEvent);
          bus.emit(INVARIANT_VIOLATION, retryEvent as unknown as Record<string, unknown>);
          bus.emit('*', retryEvent as unknown as Record<string, unknown>);
        }
      }

      for (const v of result.violations) {
        totalViolations++;
        const id = v.invariantId;
        violationsByInvariant.set(id, (violationsByInvariant.get(id) || 0) + 1);
        recentViolations.push({
          timestamp: clock(),
          invariantId: id,
        });
      }

      const stateChangedEvent = updateEscalation(result.intent.action);

      const events = stateChangedEvent ? [...result.events, stateChangedEvent] : result.events;

      return {
        ...result,
        events,
        monitor: {
          escalationLevel,
          totalEvaluations,
          totalDenials,
          totalViolations,
          windowedDenials: recentDenials.length,
          windowedViolations: recentViolations.length,
          denialRetryEscalation,
        },
      };
    },

    getEscalationLevel() {
      return escalationLevel;
    },

    getStatus() {
      pruneExpired();
      return {
        escalationLevel,
        totalEvaluations,
        totalDenials,
        totalViolations,
        windowedDenials: recentDenials.length,
        windowedViolations: recentViolations.length,
        denialRetryEscalation,
        denialRetryThreshold,
        denialRetryCounts: Object.fromEntries(denialRetryMap),
        denialsByAgent: Object.fromEntries(denialsByAgent),
        violationsByInvariant: Object.fromEntries(violationsByInvariant),
        recentDenials: [...recentDenials],
        eventCount: store.count(),
        uptime: clock() - sessionStartTime,
        policyCount: engine.getPolicyCount(),
        invariantCount: engine.getInvariantCount(),
        policyErrors: engine.getPolicyErrors(),
      };
    },

    resetEscalation() {
      const previousLevel = escalationLevel;
      escalationLevel = ESCALATION.NORMAL;
      totalDenials = 0;
      totalViolations = 0;
      denialRetryEscalation = false;
      denialRetryMap.clear();
      denialsByAgent.clear();
      violationsByInvariant.clear();
      recentDenials.length = 0;
      recentViolations.length = 0;
      bus.emit('escalation-reset', { level: ESCALATION.NORMAL });

      if (previousLevel !== ESCALATION.NORMAL) {
        const stateEvent = createEvent(STATE_CHANGED, {
          from: ESCALATION_NAMES[previousLevel],
          to: ESCALATION_NAMES[ESCALATION.NORMAL],
          trigger: 'manual-reset',
          totalDenials: 0,
          totalViolations: 0,
          denialThreshold,
          violationThreshold,
        });
        store.append(stateEvent);
        bus.emit(STATE_CHANGED, stateEvent as unknown as Record<string, unknown>);
        bus.emit('*', stateEvent as unknown as Record<string, unknown>);
      }
    },
  };
}
