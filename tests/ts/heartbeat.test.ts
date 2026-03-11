import { describe, it, expect } from 'vitest';
import { createHeartbeatMonitor } from '../../src/kernel/heartbeat.js';
import type { DomainEvent } from '../../src/core/types.js';
import { resetEventCounter } from '../../src/events/schema.js';

describe('kernel/heartbeat', () => {
  describe('createHeartbeatMonitor', () => {
    it('creates a monitor with default config', () => {
      const monitor = createHeartbeatMonitor();
      const config = monitor.getConfig();
      expect(config.intervalMs).toBe(30_000);
      expect(config.missedThreshold).toBe(3);
    });

    it('creates a monitor with custom config', () => {
      const monitor = createHeartbeatMonitor({ intervalMs: 5000, missedThreshold: 5 });
      const config = monitor.getConfig();
      expect(config.intervalMs).toBe(5000);
      expect(config.missedThreshold).toBe(5);
    });
  });

  describe('recordHeartbeat', () => {
    it('records a heartbeat from a new agent', () => {
      resetEventCounter();
      const monitor = createHeartbeatMonitor();
      const event = monitor.recordHeartbeat('agent-1');

      expect(event.kind).toBe('HeartbeatEmitted');
      expect((event as Record<string, unknown>).agentId).toBe('agent-1');
      expect((event as Record<string, unknown>).sequenceNumber).toBe(1);
    });

    it('increments sequence number on repeated heartbeats', () => {
      resetEventCounter();
      const monitor = createHeartbeatMonitor();
      monitor.recordHeartbeat('agent-1');
      monitor.recordHeartbeat('agent-1');
      const event = monitor.recordHeartbeat('agent-1');

      expect((event as Record<string, unknown>).sequenceNumber).toBe(3);
    });

    it('tracks multiple agents independently', () => {
      const monitor = createHeartbeatMonitor();
      monitor.recordHeartbeat('agent-1');
      monitor.recordHeartbeat('agent-2');

      const states = monitor.getAllAgentStates();
      expect(states).toHaveLength(2);
      expect(states.map((s) => s.agentId).sort()).toEqual(['agent-1', 'agent-2']);
    });

    it('calls onEvent callback when provided', () => {
      const events: DomainEvent[] = [];
      const monitor = createHeartbeatMonitor({}, (event) => events.push(event));
      monitor.recordHeartbeat('agent-1');

      expect(events).toHaveLength(1);
      expect(events[0].kind).toBe('HeartbeatEmitted');
    });

    it('resets missed count on heartbeat receipt', () => {
      const monitor = createHeartbeatMonitor({ intervalMs: 100, missedThreshold: 3 });
      monitor.recordHeartbeat('agent-1');

      // Simulate time passing (agent missed heartbeats)
      const state = monitor.getAgentState('agent-1');
      expect(state).toBeDefined();
      expect(state!.missedCount).toBe(0);

      // Record another heartbeat — missedCount should still be 0
      monitor.recordHeartbeat('agent-1');
      expect(monitor.getAgentState('agent-1')!.missedCount).toBe(0);
      expect(monitor.getAgentState('agent-1')!.responsive).toBe(true);
    });
  });

  describe('checkLiveness', () => {
    it('returns no events when all agents are alive', () => {
      const monitor = createHeartbeatMonitor({ intervalMs: 1000 });
      monitor.recordHeartbeat('agent-1');

      // Check immediately — no time has passed
      const events = monitor.checkLiveness(Date.now());
      expect(events).toHaveLength(0);
    });

    it('emits HeartbeatMissed when an agent misses a heartbeat', () => {
      resetEventCounter();
      const now = Date.now();
      const monitor = createHeartbeatMonitor({ intervalMs: 1000, missedThreshold: 3 });

      // Simulate agent heartbeating then going silent
      monitor.recordHeartbeat('agent-1');
      const state = monitor.getAgentState('agent-1')!;
      // Manually set lastHeartbeatAt to simulate time passage
      state.lastHeartbeatAt = now - 2000;

      const events = monitor.checkLiveness(now);
      expect(events).toHaveLength(1);
      expect(events[0].kind).toBe('HeartbeatMissed');
      expect((events[0] as Record<string, unknown>).agentId).toBe('agent-1');
      expect((events[0] as Record<string, unknown>).missedCount).toBe(2);
    });

    it('emits AgentUnresponsive when missed threshold is exceeded', () => {
      resetEventCounter();
      const now = Date.now();
      const monitor = createHeartbeatMonitor({ intervalMs: 1000, missedThreshold: 3 });

      monitor.recordHeartbeat('agent-1');
      const state = monitor.getAgentState('agent-1')!;
      state.lastHeartbeatAt = now - 4000; // 4 missed beats (threshold is 3)

      const events = monitor.checkLiveness(now);
      expect(events).toHaveLength(1);
      expect(events[0].kind).toBe('AgentUnresponsive');
      expect((events[0] as Record<string, unknown>).agentId).toBe('agent-1');
      expect((events[0] as Record<string, unknown>).missedCount).toBe(4);
      expect((events[0] as Record<string, unknown>).threshold).toBe(3);
    });

    it('does not emit duplicate AgentUnresponsive events', () => {
      resetEventCounter();
      const now = Date.now();
      const monitor = createHeartbeatMonitor({ intervalMs: 1000, missedThreshold: 2 });

      monitor.recordHeartbeat('agent-1');
      const state = monitor.getAgentState('agent-1')!;
      state.lastHeartbeatAt = now - 3000;

      // First check — should emit AgentUnresponsive
      const events1 = monitor.checkLiveness(now);
      expect(events1).toHaveLength(1);
      expect(events1[0].kind).toBe('AgentUnresponsive');

      // Second check — agent is still unresponsive but already flagged
      const events2 = monitor.checkLiveness(now + 1000);
      expect(events2).toHaveLength(0);
    });

    it('re-emits AgentUnresponsive after recovery and subsequent failure', () => {
      resetEventCounter();
      const now = Date.now();
      const monitor = createHeartbeatMonitor({ intervalMs: 1000, missedThreshold: 2 });

      monitor.recordHeartbeat('agent-1');
      const state = monitor.getAgentState('agent-1')!;
      state.lastHeartbeatAt = now - 3000;

      // First failure
      monitor.checkLiveness(now);

      // Agent recovers
      monitor.recordHeartbeat('agent-1');
      expect(monitor.getAgentState('agent-1')!.responsive).toBe(true);

      // Agent goes unresponsive again
      monitor.getAgentState('agent-1')!.lastHeartbeatAt = now - 5000;
      const events = monitor.checkLiveness(now);
      expect(events).toHaveLength(1);
      expect(events[0].kind).toBe('AgentUnresponsive');
    });

    it('tracks multiple agents for liveness independently', () => {
      resetEventCounter();
      const now = Date.now();
      const monitor = createHeartbeatMonitor({ intervalMs: 1000, missedThreshold: 3 });

      monitor.recordHeartbeat('agent-1');
      monitor.recordHeartbeat('agent-2');

      // agent-1 goes silent, agent-2 is fine
      monitor.getAgentState('agent-1')!.lastHeartbeatAt = now - 5000;
      monitor.getAgentState('agent-2')!.lastHeartbeatAt = now; // just heartbeated

      const events = monitor.checkLiveness(now);
      expect(events).toHaveLength(1);
      expect((events[0] as Record<string, unknown>).agentId).toBe('agent-1');
    });

    it('fires onEvent for missed and unresponsive events', () => {
      const collected: DomainEvent[] = [];
      const now = Date.now();
      const monitor = createHeartbeatMonitor(
        { intervalMs: 1000, missedThreshold: 2 },
        (event) => collected.push(event)
      );

      monitor.recordHeartbeat('agent-1');
      collected.length = 0; // reset after heartbeat event

      monitor.getAgentState('agent-1')!.lastHeartbeatAt = now - 3000;
      monitor.checkLiveness(now);

      expect(collected).toHaveLength(1);
      expect(collected[0].kind).toBe('AgentUnresponsive');
    });
  });

  describe('removeAgent', () => {
    it('removes an agent from tracking', () => {
      const monitor = createHeartbeatMonitor();
      monitor.recordHeartbeat('agent-1');
      expect(monitor.getAgentState('agent-1')).toBeDefined();

      monitor.removeAgent('agent-1');
      expect(monitor.getAgentState('agent-1')).toBeUndefined();
      expect(monitor.getAllAgentStates()).toHaveLength(0);
    });

    it('is a no-op for unknown agents', () => {
      const monitor = createHeartbeatMonitor();
      monitor.removeAgent('nonexistent');
      expect(monitor.getAllAgentStates()).toHaveLength(0);
    });
  });

  describe('getAgentState', () => {
    it('returns undefined for unknown agents', () => {
      const monitor = createHeartbeatMonitor();
      expect(monitor.getAgentState('unknown')).toBeUndefined();
    });

    it('returns current state for known agents', () => {
      const monitor = createHeartbeatMonitor();
      monitor.recordHeartbeat('agent-1');
      const state = monitor.getAgentState('agent-1');

      expect(state).toBeDefined();
      expect(state!.agentId).toBe('agent-1');
      expect(state!.sequenceNumber).toBe(1);
      expect(state!.missedCount).toBe(0);
      expect(state!.responsive).toBe(true);
    });
  });
});
