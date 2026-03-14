/**
 * Heartbeat — Agent liveness detection for multi-agent governance.
 *
 * Agents emit periodic heartbeat events. The HeartbeatMonitor tracks
 * them and detects unresponsive agents when heartbeats are missed
 * beyond a configurable threshold.
 *
 * Pure domain logic with injectable timer for testability.
 */

import type { DomainEvent } from '@red-codes/core';
import {
  createEvent,
  HEARTBEAT_EMITTED,
  HEARTBEAT_MISSED,
  AGENT_UNRESPONSIVE,
} from '@red-codes/events';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface HeartbeatConfig {
  /** Heartbeat interval in milliseconds. Default: 30000 (30s). */
  readonly intervalMs?: number;
  /** Number of consecutive missed heartbeats before declaring unresponsive. Default: 3. */
  readonly missedThreshold?: number;
}

const DEFAULT_INTERVAL_MS = 30_000;
const DEFAULT_MISSED_THRESHOLD = 3;

// ---------------------------------------------------------------------------
// Agent tracking state
// ---------------------------------------------------------------------------

export interface AgentHeartbeatState {
  readonly agentId: string;
  lastHeartbeatAt: number;
  sequenceNumber: number;
  missedCount: number;
  responsive: boolean;
}

// ---------------------------------------------------------------------------
// HeartbeatMonitor
// ---------------------------------------------------------------------------

export interface HeartbeatMonitor {
  /** Record an incoming heartbeat from an agent. Returns the emitted event. */
  recordHeartbeat(agentId: string): DomainEvent;
  /** Check all tracked agents for missed heartbeats. Returns events for misses/unresponsive. */
  checkLiveness(now?: number): DomainEvent[];
  /** Get the state of a tracked agent. */
  getAgentState(agentId: string): AgentHeartbeatState | undefined;
  /** Get all tracked agent states. */
  getAllAgentStates(): AgentHeartbeatState[];
  /** Remove an agent from tracking. */
  removeAgent(agentId: string): void;
  /** Get the configuration. */
  getConfig(): { intervalMs: number; missedThreshold: number };
}

export function createHeartbeatMonitor(
  config: HeartbeatConfig = {},
  onEvent?: (event: DomainEvent) => void
): HeartbeatMonitor {
  const intervalMs = config.intervalMs ?? DEFAULT_INTERVAL_MS;
  const missedThreshold = config.missedThreshold ?? DEFAULT_MISSED_THRESHOLD;
  const agents = new Map<string, AgentHeartbeatState>();

  function emit(event: DomainEvent): DomainEvent {
    if (onEvent) onEvent(event);
    return event;
  }

  return {
    recordHeartbeat(agentId: string): DomainEvent {
      const now = Date.now();
      let state = agents.get(agentId);

      if (!state) {
        state = {
          agentId,
          lastHeartbeatAt: now,
          sequenceNumber: 0,
          missedCount: 0,
          responsive: true,
        };
        agents.set(agentId, state);
      }

      state.lastHeartbeatAt = now;
      state.sequenceNumber++;
      state.missedCount = 0;
      state.responsive = true;

      const event = createEvent(HEARTBEAT_EMITTED, {
        agentId,
        sequenceNumber: state.sequenceNumber,
        uptimeMs: now - state.lastHeartbeatAt,
      });

      return emit(event);
    },

    checkLiveness(now?: number): DomainEvent[] {
      const currentTime = now ?? Date.now();
      const events: DomainEvent[] = [];

      for (const state of agents.values()) {
        const elapsed = currentTime - state.lastHeartbeatAt;
        const expectedBeats = Math.floor(elapsed / intervalMs);

        if (expectedBeats > 0 && elapsed > intervalMs) {
          state.missedCount = expectedBeats;

          if (state.missedCount >= missedThreshold) {
            // Agent is unresponsive
            if (state.responsive) {
              state.responsive = false;
              const unresponsiveEvent = createEvent(AGENT_UNRESPONSIVE, {
                agentId: state.agentId,
                missedCount: state.missedCount,
                threshold: missedThreshold,
                lastHeartbeatAt: state.lastHeartbeatAt,
              });
              events.push(emit(unresponsiveEvent));
            }
          } else {
            // Heartbeat missed but not yet unresponsive
            const missedEvent = createEvent(HEARTBEAT_MISSED, {
              agentId: state.agentId,
              missedCount: state.missedCount,
              lastHeartbeatAt: state.lastHeartbeatAt,
              expectedIntervalMs: intervalMs,
            });
            events.push(emit(missedEvent));
          }
        }
      }

      return events;
    },

    getAgentState(agentId: string): AgentHeartbeatState | undefined {
      return agents.get(agentId);
    },

    getAllAgentStates(): AgentHeartbeatState[] {
      return [...agents.values()];
    },

    removeAgent(agentId: string): void {
      agents.delete(agentId);
    },

    getConfig() {
      return { intervalMs, missedThreshold };
    },
  };
}
