// Runtime Monitor — closed-loop feedback system.
// Pure domain logic. No DOM, no Node.js-specific APIs.
//
// The monitor sits between the engine and the execution environment.
// It tracks cumulative state across multiple evaluations and detects
// patterns that individual evaluations cannot see:
//
//   - Repeated violations (agent not learning)
//   - Escalation patterns (increasing severity)
//   - Session-level safety bounds
//
// This completes the RTA closed loop:
//
//   Agent → AAB → Engine → Execution → Monitor → Feedback → Agent
//                                          ↑
//                                     (you are here)

import { createEngine, INTERVENTION } from './core/engine.js';
import { EventBus } from '../domain/event-bus.js';
import { createInMemoryStore } from '../domain/event-store.js';

/**
 * Monitor state shape:
 * {
 *   totalEvaluations: number,
 *   totalDenials: number,
 *   totalViolations: number,
 *   denialsByAgent: Map<string, number>,
 *   violationsByInvariant: Map<string, number>,
 *   recentDenials: object[],           // sliding window
 *   escalationLevel: number,           // 0-3
 *   sessionStartTime: number,
 * }
 */

/**
 * Escalation levels.
 * Higher levels impose stricter monitoring.
 */
export const ESCALATION = {
  NORMAL: 0, // Standard monitoring
  ELEVATED: 1, // Agent has some denials — tighter checks
  HIGH: 2, // Repeated violations — human notification
  LOCKDOWN: 3, // Agent is blocked until human intervenes
};

/**
 * Create a Runtime Monitor with closed-loop feedback.
 *
 * @param {object} [config={}]
 * @param {object[]} [config.policyDefs=[]] - Policy definitions for the engine
 * @param {object[]} [config.invariants] - Invariant definitions
 * @param {number} [config.denialThreshold=5] - Denials before escalation
 * @param {number} [config.violationThreshold=3] - Violations before escalation
 * @param {number} [config.windowSize=10] - Sliding window for recent denials
 * @returns {object} Monitor instance
 */
export function createMonitor(config = {}) {
  const bus = new EventBus();
  const store = createInMemoryStore();

  const engine = createEngine({
    policyDefs: config.policyDefs || [],
    invariants: config.invariants,
    onEvent(event) {
      store.append(event);
      bus.emit(event.kind, event);
      bus.emit('*', event);
    },
  });

  const denialThreshold = config.denialThreshold ?? 5;
  const violationThreshold = config.violationThreshold ?? 3;
  const windowSize = config.windowSize ?? 10;

  // Cumulative state
  let totalEvaluations = 0;
  let totalDenials = 0;
  let totalViolations = 0;
  const denialsByAgent = new Map();
  const violationsByInvariant = new Map();
  const recentDenials = [];
  let escalationLevel = ESCALATION.NORMAL;
  const sessionStartTime = Date.now();

  /**
   * Update escalation level based on cumulative state.
   */
  function updateEscalation() {
    if (totalDenials >= denialThreshold * 2 || totalViolations >= violationThreshold * 2) {
      escalationLevel = ESCALATION.LOCKDOWN;
    } else if (totalDenials >= denialThreshold || totalViolations >= violationThreshold) {
      escalationLevel = ESCALATION.HIGH;
    } else if (totalDenials >= Math.ceil(denialThreshold / 2)) {
      escalationLevel = ESCALATION.ELEVATED;
    } else {
      escalationLevel = ESCALATION.NORMAL;
    }

    bus.emit('escalation', { level: escalationLevel });
  }

  return {
    /** The internal event bus for subscribing to governance events. */
    bus,

    /** The event store for querying governance history. */
    store,

    /**
     * Process an agent action through the full RTA pipeline.
     *
     * @param {object} rawAction - Raw action from the agent
     * @param {object} [systemContext={}] - Current system state
     * @returns {object} Engine decision augmented with monitor state
     */
    process(rawAction, systemContext = {}) {
      // Lockdown check — block everything if escalated to max
      if (escalationLevel === ESCALATION.LOCKDOWN) {
        totalEvaluations++;
        const lockedResult = {
          allowed: false,
          intent: {
            action: rawAction?.tool || 'unknown',
            target: '',
            agent: rawAction?.agent || 'unknown',
          },
          decision: {
            allowed: false,
            decision: 'deny',
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
          },
        };
        bus.emit('lockdown-denial', lockedResult);
        return lockedResult;
      }

      // Run engine evaluation
      const result = engine.evaluate(rawAction, systemContext);
      totalEvaluations++;

      // Track denials
      if (!result.allowed) {
        totalDenials++;
        const agent = result.intent.agent || 'unknown';
        denialsByAgent.set(agent, (denialsByAgent.get(agent) || 0) + 1);

        recentDenials.push({
          timestamp: Date.now(),
          action: result.intent.action,
          reason: result.decision.reason,
        });

        // Sliding window
        while (recentDenials.length > windowSize) {
          recentDenials.shift();
        }
      }

      // Track violations
      for (const v of result.violations) {
        totalViolations++;
        const id = v.invariantId;
        violationsByInvariant.set(id, (violationsByInvariant.get(id) || 0) + 1);
      }

      // Update escalation
      updateEscalation();

      // Augment result with monitor state
      return {
        ...result,
        monitor: {
          escalationLevel,
          totalEvaluations,
          totalDenials,
          totalViolations,
        },
      };
    },

    /**
     * Get the current monitor status.
     * @returns {object}
     */
    getStatus() {
      return {
        escalationLevel,
        totalEvaluations,
        totalDenials,
        totalViolations,
        denialsByAgent: Object.fromEntries(denialsByAgent),
        violationsByInvariant: Object.fromEntries(violationsByInvariant),
        recentDenials: [...recentDenials],
        eventCount: store.count(),
        uptime: Date.now() - sessionStartTime,
        policyCount: engine.getPolicyCount(),
        invariantCount: engine.getInvariantCount(),
        policyErrors: engine.getPolicyErrors(),
      };
    },

    /**
     * Reset escalation level (human override).
     */
    resetEscalation() {
      escalationLevel = ESCALATION.NORMAL;
      totalDenials = 0;
      totalViolations = 0;
      denialsByAgent.clear();
      violationsByInvariant.clear();
      recentDenials.length = 0;
      bus.emit('escalation-reset', { level: ESCALATION.NORMAL });
    },
  };
}
