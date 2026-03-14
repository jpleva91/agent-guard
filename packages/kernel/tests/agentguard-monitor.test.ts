import { describe, it, expect } from 'vitest';
import { createMonitor, ESCALATION } from '@red-codes/kernel';
import { STATE_CHANGED } from '@red-codes/events';
import type { DomainEvent } from '@red-codes/core';

describe('agentguard/monitor', () => {
  describe('ESCALATION', () => {
    it('defines escalation levels', () => {
      expect(ESCALATION.NORMAL).toBe(0);
      expect(ESCALATION.ELEVATED).toBe(1);
      expect(ESCALATION.HIGH).toBe(2);
      expect(ESCALATION.LOCKDOWN).toBe(3);
    });
  });

  describe('createMonitor', () => {
    it('creates a monitor with default config', () => {
      const monitor = createMonitor();
      const status = monitor.getStatus();
      expect(status.escalationLevel).toBe(ESCALATION.NORMAL);
      expect(status.totalEvaluations).toBe(0);
      expect(status.totalDenials).toBe(0);
    });

    it('processes allowed actions', () => {
      const monitor = createMonitor();
      const result = monitor.process({ tool: 'Read', file: 'src/index.ts' });
      expect(result.allowed).toBe(true);
      expect(result.monitor.totalEvaluations).toBe(1);
      expect(result.monitor.totalDenials).toBe(0);
    });

    it('tracks denials', () => {
      const monitor = createMonitor({
        policyDefs: [
          {
            id: 'deny-writes',
            name: 'No Writes',
            rules: [{ action: 'file.write', effect: 'deny', reason: 'Read-only' }],
          },
        ],
      });

      monitor.process({ tool: 'Write', file: 'src/a.ts' });
      const status = monitor.getStatus();
      expect(status.totalDenials).toBe(1);
    });

    it('escalates on repeated denials', () => {
      const monitor = createMonitor({
        policyDefs: [
          {
            id: 'deny-all',
            name: 'Deny All',
            rules: [{ action: '*', effect: 'deny', reason: 'blocked' }],
          },
        ],
        denialThreshold: 3,
      });

      // Generate enough denials to escalate
      for (let i = 0; i < 3; i++) {
        monitor.process({ tool: 'Write', file: 'src/a.ts' });
      }

      const status = monitor.getStatus();
      expect(status.escalationLevel).toBeGreaterThanOrEqual(ESCALATION.HIGH);
    });

    it('blocks all actions in lockdown', () => {
      const monitor = createMonitor({
        policyDefs: [
          {
            id: 'deny-all',
            name: 'Deny All',
            rules: [{ action: '*', effect: 'deny', reason: 'blocked' }],
          },
        ],
        denialThreshold: 2,
      });

      // Drive to lockdown
      for (let i = 0; i < 4; i++) {
        monitor.process({ tool: 'Write', file: 'src/a.ts' });
      }

      const lockdownResult = monitor.process({ tool: 'Read', file: 'src/a.ts' });
      expect(lockdownResult.allowed).toBe(false);
      expect(lockdownResult.monitor.escalationLevel).toBe(ESCALATION.LOCKDOWN);
    });

    it('resets escalation', () => {
      const monitor = createMonitor({
        policyDefs: [
          {
            id: 'deny-all',
            name: 'Deny All',
            rules: [{ action: '*', effect: 'deny', reason: 'blocked' }],
          },
        ],
        denialThreshold: 2,
      });

      for (let i = 0; i < 4; i++) {
        monitor.process({ tool: 'Write', file: 'src/a.ts' });
      }

      monitor.resetEscalation();
      const status = monitor.getStatus();
      expect(status.escalationLevel).toBe(ESCALATION.NORMAL);
      expect(status.totalDenials).toBe(0);
    });

    it('provides event store access', () => {
      const monitor = createMonitor({
        policyDefs: [
          {
            id: 'deny-all',
            name: 'Deny All',
            rules: [{ action: '*', effect: 'deny', reason: 'blocked' }],
          },
        ],
      });

      monitor.process({ tool: 'Write', file: 'src/a.ts' });
      expect(monitor.store.count()).toBeGreaterThan(0);
    });
  });

  describe('StateChanged events', () => {
    it('emits StateChanged on escalation from NORMAL to ELEVATED', () => {
      const stateEvents: DomainEvent[] = [];
      const monitor = createMonitor({
        policyDefs: [
          {
            id: 'deny-all',
            name: 'Deny All',
            rules: [{ action: '*', effect: 'deny', reason: 'blocked' }],
          },
        ],
        denialThreshold: 4,
      });

      monitor.bus.on(STATE_CHANGED, (event) => {
        stateEvents.push(event as unknown as DomainEvent);
      });

      // 2 denials should trigger ELEVATED (ceil(4/2) = 2)
      monitor.process({ tool: 'Write', file: 'src/a.ts' });
      monitor.process({ tool: 'Write', file: 'src/b.ts' });

      expect(stateEvents).toHaveLength(1);
      const evt = stateEvents[0] as unknown as Record<string, unknown>;
      expect(evt.kind).toBe(STATE_CHANGED);
      expect(evt.from).toBe('NORMAL');
      expect(evt.to).toBe('ELEVATED');
      expect(evt.trigger).toBe('file.write');
    });

    it('emits StateChanged with escalation context fields', () => {
      const stateEvents: DomainEvent[] = [];
      const monitor = createMonitor({
        policyDefs: [
          {
            id: 'deny-all',
            name: 'Deny All',
            rules: [{ action: '*', effect: 'deny', reason: 'blocked' }],
          },
        ],
        denialThreshold: 2,
      });

      monitor.bus.on(STATE_CHANGED, (event) => {
        stateEvents.push(event as unknown as DomainEvent);
      });

      // 1 denial triggers ELEVATED (ceil(2/2) = 1)
      monitor.process({ tool: 'Write', file: 'src/a.ts' });

      expect(stateEvents).toHaveLength(1);
      const evt = stateEvents[0] as unknown as Record<string, unknown>;
      expect(evt.totalDenials).toBe(1);
      expect(evt.totalViolations).toBe(0);
      expect(evt.denialThreshold).toBe(2);
      expect(evt.violationThreshold).toBe(3);
    });

    it('emits multiple StateChanged events through escalation levels', () => {
      const stateEvents: DomainEvent[] = [];
      const monitor = createMonitor({
        policyDefs: [
          {
            id: 'deny-all',
            name: 'Deny All',
            rules: [{ action: '*', effect: 'deny', reason: 'blocked' }],
          },
        ],
        denialThreshold: 2,
      });

      monitor.bus.on(STATE_CHANGED, (event) => {
        stateEvents.push(event as unknown as DomainEvent);
      });

      // 1 denial → ELEVATED
      monitor.process({ tool: 'Write', file: 'src/a.ts' });
      // 2 denials → HIGH
      monitor.process({ tool: 'Write', file: 'src/b.ts' });
      // 3 denials → still HIGH (no event)
      monitor.process({ tool: 'Write', file: 'src/c.ts' });
      // 4 denials → LOCKDOWN
      monitor.process({ tool: 'Write', file: 'src/d.ts' });

      expect(stateEvents).toHaveLength(3);
      const transitions = stateEvents.map((e) => {
        const evt = e as unknown as Record<string, unknown>;
        return { from: evt.from, to: evt.to };
      });
      expect(transitions).toEqual([
        { from: 'NORMAL', to: 'ELEVATED' },
        { from: 'ELEVATED', to: 'HIGH' },
        { from: 'HIGH', to: 'LOCKDOWN' },
      ]);
    });

    it('persists StateChanged events in the event store', () => {
      const monitor = createMonitor({
        policyDefs: [
          {
            id: 'deny-all',
            name: 'Deny All',
            rules: [{ action: '*', effect: 'deny', reason: 'blocked' }],
          },
        ],
        denialThreshold: 2,
      });

      // Drive to ELEVATED
      monitor.process({ tool: 'Write', file: 'src/a.ts' });

      const stateChangedEvents = monitor.store.query({ kind: STATE_CHANGED });
      expect(stateChangedEvents).toHaveLength(1);
      expect((stateChangedEvents[0] as unknown as Record<string, unknown>).from).toBe('NORMAL');
      expect((stateChangedEvents[0] as unknown as Record<string, unknown>).to).toBe('ELEVATED');
    });

    it('emits StateChanged on resetEscalation from non-NORMAL level', () => {
      const stateEvents: DomainEvent[] = [];
      const monitor = createMonitor({
        policyDefs: [
          {
            id: 'deny-all',
            name: 'Deny All',
            rules: [{ action: '*', effect: 'deny', reason: 'blocked' }],
          },
        ],
        denialThreshold: 2,
      });

      // Drive to LOCKDOWN
      for (let i = 0; i < 4; i++) {
        monitor.process({ tool: 'Write', file: 'src/a.ts' });
      }

      monitor.bus.on(STATE_CHANGED, (event) => {
        stateEvents.push(event as unknown as DomainEvent);
      });

      monitor.resetEscalation();

      expect(stateEvents).toHaveLength(1);
      const evt = stateEvents[0] as unknown as Record<string, unknown>;
      expect(evt.from).toBe('LOCKDOWN');
      expect(evt.to).toBe('NORMAL');
      expect(evt.trigger).toBe('manual-reset');
    });

    it('does not emit StateChanged on resetEscalation when already NORMAL', () => {
      const stateEvents: DomainEvent[] = [];
      const monitor = createMonitor();

      monitor.bus.on(STATE_CHANGED, (event) => {
        stateEvents.push(event as unknown as DomainEvent);
      });

      monitor.resetEscalation();

      expect(stateEvents).toHaveLength(0);
    });

    it('does not emit StateChanged when escalation level stays the same', () => {
      const stateEvents: DomainEvent[] = [];
      const monitor = createMonitor({
        policyDefs: [
          {
            id: 'allow-reads',
            name: 'Allow Reads',
            rules: [{ action: 'file.read', effect: 'allow' }],
          },
        ],
      });

      monitor.bus.on(STATE_CHANGED, (event) => {
        stateEvents.push(event as unknown as DomainEvent);
      });

      // Allowed actions don't change escalation
      monitor.process({ tool: 'Read', file: 'src/a.ts' });
      monitor.process({ tool: 'Read', file: 'src/b.ts' });

      expect(stateEvents).toHaveLength(0);
    });
  });

  describe('StateChanged events in MonitorDecision.events (persistence path)', () => {
    it('includes StateChanged in decision events when escalation transitions', () => {
      const monitor = createMonitor({
        policyDefs: [
          {
            id: 'deny-all',
            name: 'Deny All',
            rules: [{ action: '*', effect: 'deny', reason: 'blocked' }],
          },
        ],
        denialThreshold: 2,
      });

      // First denial triggers NORMAL → ELEVATED
      const result = monitor.process({ tool: 'Write', file: 'src/a.ts' });

      const stateEvents = result.events.filter(
        (e) => (e as unknown as Record<string, unknown>).kind === STATE_CHANGED
      );
      expect(stateEvents).toHaveLength(1);
      const evt = stateEvents[0] as unknown as Record<string, unknown>;
      expect(evt.from).toBe('NORMAL');
      expect(evt.to).toBe('ELEVATED');
    });

    it('does not include StateChanged in events when level stays the same', () => {
      const monitor = createMonitor({
        policyDefs: [
          {
            id: 'allow-reads',
            name: 'Allow Reads',
            rules: [{ action: 'file.read', effect: 'allow' }],
          },
        ],
      });

      const result = monitor.process({ tool: 'Read', file: 'src/a.ts' });

      const stateEvents = result.events.filter(
        (e) => (e as unknown as Record<string, unknown>).kind === STATE_CHANGED
      );
      expect(stateEvents).toHaveLength(0);
    });

    it('includes StateChanged for each escalation transition in decision events', () => {
      const monitor = createMonitor({
        policyDefs: [
          {
            id: 'deny-all',
            name: 'Deny All',
            rules: [{ action: '*', effect: 'deny', reason: 'blocked' }],
          },
        ],
        denialThreshold: 2,
      });

      // 1 denial → ELEVATED
      const r1 = monitor.process({ tool: 'Write', file: 'src/a.ts' });
      // 2 denials → HIGH
      const r2 = monitor.process({ tool: 'Write', file: 'src/b.ts' });
      // 3 denials → still HIGH (no transition)
      const r3 = monitor.process({ tool: 'Write', file: 'src/c.ts' });
      // 4 denials → LOCKDOWN
      const r4 = monitor.process({ tool: 'Write', file: 'src/d.ts' });

      const getStateEvents = (result: { events: DomainEvent[] }) =>
        result.events.filter(
          (e) => (e as unknown as Record<string, unknown>).kind === STATE_CHANGED
        );

      expect(getStateEvents(r1)).toHaveLength(1);
      expect(getStateEvents(r2)).toHaveLength(1);
      expect(getStateEvents(r3)).toHaveLength(0);
      expect(getStateEvents(r4)).toHaveLength(1);

      const r1evt = getStateEvents(r1)[0] as unknown as Record<string, unknown>;
      expect(r1evt.from).toBe('NORMAL');
      expect(r1evt.to).toBe('ELEVATED');

      const r2evt = getStateEvents(r2)[0] as unknown as Record<string, unknown>;
      expect(r2evt.from).toBe('ELEVATED');
      expect(r2evt.to).toBe('HIGH');

      const r4evt = getStateEvents(r4)[0] as unknown as Record<string, unknown>;
      expect(r4evt.from).toBe('HIGH');
      expect(r4evt.to).toBe('LOCKDOWN');
    });

    it('includes trigger action in StateChanged events within decision events', () => {
      const monitor = createMonitor({
        policyDefs: [
          {
            id: 'deny-all',
            name: 'Deny All',
            rules: [{ action: '*', effect: 'deny', reason: 'blocked' }],
          },
        ],
        denialThreshold: 4,
      });

      // 2 denials triggers ELEVATED (ceil(4/2) = 2)
      monitor.process({ tool: 'Write', file: 'src/a.ts' });
      const result = monitor.process({ tool: 'Write', file: 'src/b.ts' });

      const stateEvents = result.events.filter(
        (e) => (e as unknown as Record<string, unknown>).kind === STATE_CHANGED
      );
      expect(stateEvents).toHaveLength(1);
      const evt = stateEvents[0] as unknown as Record<string, unknown>;
      expect(evt.trigger).toBe('file.write');
      expect(evt.totalDenials).toBe(2);
      expect(evt.denialThreshold).toBe(4);
    });
  });
});
