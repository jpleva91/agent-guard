// Runtime Monitor — closed-loop feedback system.
// Pure domain logic. No DOM, no Node.js-specific APIs.

import type { DomainEvent, EventStore } from '@red-codes/core';
import { ESCALATION_LEVELS, ESCALATION_DEFAULTS } from '@red-codes/core';
import { createEngine, INTERVENTION } from './decision.js';
import type { EngineConfig, EngineDecision } from './decision.js';
import type { RawAgentAction } from './aab.js';
import { EventBus, createInMemoryStore } from '@red-codes/events';
import { createEvent, STATE_CHANGED } from '@red-codes/events';

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

interface MonitorState {
  escalationLevel: EscalationLevel;
  totalEvaluations: number;
  totalDenials: number;
  totalViolations: number;
  windowedDenials: number;
  windowedViolations: number;
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
}

interface RecentDenial {
  timestamp: number;
  action: string;
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
    rawAction: RawAgentAction | null,
    systemContext?: Record<string, unknown>
  ): MonitorDecision;
  getStatus(): Record<string, unknown>;
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
  const clock = config.now ?? Date.now;

  let totalEvaluations = 0;
  let totalDenials = 0;
  let totalViolations = 0;
  const denialsByAgent = new Map<string, number>();
  const violationsByInvariant = new Map<string, number>();
  const recentDenials: RecentDenial[] = [];
  const recentViolations: RecentViolation[] = [];
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
        const lockedResult: MonitorDecision = {
          allowed: false,
          intent: {
            action: rawAction?.tool || 'unknown',
            target: '',
            agent: rawAction?.agent || 'unknown',
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

        recentDenials.push({
          timestamp: clock(),
          action: result.intent.action,
          reason: result.decision.reason,
        });
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
        },
      };
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
