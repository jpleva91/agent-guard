import { describe, it, expect } from 'vitest';
import { createMonitor, ESCALATION } from '@red-codes/kernel';
import { STATE_CHANGED, INVARIANT_VIOLATION } from '@red-codes/events';
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

    it('denies actions by default with no policies (default deny)', () => {
      const monitor = createMonitor();
      const result = monitor.process({ tool: 'Read', file: 'src/index.ts' });
      expect(result.allowed).toBe(false);
      expect(result.monitor.totalEvaluations).toBe(1);
      expect(result.monitor.totalDenials).toBe(1);
    });

    it('allows actions with explicit allow policy', () => {
      const monitor = createMonitor({
        policyDefs: [
          {
            id: 'allow-reads',
            name: 'Allow Reads',
            rules: [{ action: 'file.read', effect: 'allow', reason: 'Reads OK' }],
          },
        ],
      });
      const result = monitor.process({ tool: 'Read', file: 'src/index.ts' });
      expect(result.allowed).toBe(true);
      expect(result.monitor.totalEvaluations).toBe(1);
      expect(result.monitor.totalDenials).toBe(0);
    });

    it('allows actions in fail-open mode', () => {
      const monitor = createMonitor({ evaluateOptions: { defaultDeny: false } });
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

  describe('sliding-window escalation decay', () => {
    it('decays escalation when denials expire outside the time window', () => {
      let time = 1000;
      const monitor = createMonitor({
        policyDefs: [
          {
            id: 'deny-all',
            name: 'Deny All',
            rules: [{ action: '*', effect: 'deny', reason: 'blocked' }],
          },
        ],
        denialThreshold: 2,
        windowSize: 5000, // 5 second window
        now: () => time,
      });

      // 1 denial at t=1000 → ELEVATED
      monitor.process({ tool: 'Write', file: 'src/a.ts' });
      expect(monitor.getStatus().escalationLevel).toBe(ESCALATION.ELEVATED);

      // 2 denials at t=1000 → HIGH
      monitor.process({ tool: 'Write', file: 'src/b.ts' });
      expect(monitor.getStatus().escalationLevel).toBe(ESCALATION.HIGH);

      // Advance time past the window
      time = 7000; // 6 seconds later — both denials expired

      // Next evaluation (allowed action) triggers prune → decays to NORMAL
      const result = monitor.process({ tool: 'Write', file: 'src/c.ts' });
      // This new denial is the only one in the window
      expect(result.monitor.escalationLevel).toBe(ESCALATION.ELEVATED);
      expect(result.monitor.windowedDenials).toBe(1);
      expect(result.monitor.totalDenials).toBe(3); // cumulative total preserved
    });

    it('decays fully to NORMAL when all events expire', () => {
      let time = 1000;
      const monitor = createMonitor({
        policyDefs: [
          {
            id: 'allow-reads',
            name: 'Allow Reads',
            rules: [{ action: 'file.read', effect: 'allow' }],
          },
          {
            id: 'deny-writes',
            name: 'Deny Writes',
            rules: [{ action: 'file.write', effect: 'deny', reason: 'blocked' }],
          },
        ],
        denialThreshold: 2,
        windowSize: 5000,
        now: () => time,
      });

      // Drive to HIGH with write denials at t=1000
      monitor.process({ tool: 'Write', file: 'src/a.ts' });
      monitor.process({ tool: 'Write', file: 'src/b.ts' });
      expect(monitor.getStatus().escalationLevel).toBe(ESCALATION.HIGH);

      // Advance past window — denials at t=1000 expire (cutoff = 7000-5000 = 2000)
      time = 7000;

      // Process allowed read — recalculates with empty window
      const result = monitor.process({ tool: 'Read', file: 'src/a.ts' });
      expect(result.monitor.escalationLevel).toBe(ESCALATION.NORMAL);
      expect(result.monitor.windowedDenials).toBe(0);
    });

    it('emits StateChanged when escalation decays', () => {
      let time = 1000;
      const stateEvents: DomainEvent[] = [];
      const monitor = createMonitor({
        policyDefs: [
          {
            id: 'allow-reads',
            name: 'Allow Reads',
            rules: [{ action: 'file.read', effect: 'allow' }],
          },
          {
            id: 'deny-writes',
            name: 'Deny Writes',
            rules: [{ action: 'file.write', effect: 'deny', reason: 'blocked' }],
          },
        ],
        denialThreshold: 2,
        windowSize: 5000,
        now: () => time,
      });

      monitor.bus.on(STATE_CHANGED, (event) => {
        stateEvents.push(event as unknown as DomainEvent);
      });

      // Drive to HIGH
      monitor.process({ tool: 'Write', file: 'src/a.ts' });
      monitor.process({ tool: 'Write', file: 'src/b.ts' });
      expect(stateEvents).toHaveLength(2); // NORMAL→ELEVATED, ELEVATED→HIGH

      // Advance past window
      time = 7000;

      // Process allowed action — triggers decay
      monitor.process({ tool: 'Read', file: 'src/a.ts' });

      // Should have emitted HIGH→NORMAL
      expect(stateEvents).toHaveLength(3);
      const decayEvent = stateEvents[2] as unknown as Record<string, unknown>;
      expect(decayEvent.from).toBe('HIGH');
      expect(decayEvent.to).toBe('NORMAL');
    });

    it('partial decay: some events expire, others remain', () => {
      let time = 1000;
      const monitor = createMonitor({
        policyDefs: [
          {
            id: 'deny-all',
            name: 'Deny All',
            rules: [{ action: '*', effect: 'deny', reason: 'blocked' }],
          },
        ],
        denialThreshold: 3,
        windowSize: 5000,
        now: () => time,
      });

      // 3 denials at t=1000 → HIGH
      monitor.process({ tool: 'Write', file: 'src/a.ts' });
      monitor.process({ tool: 'Write', file: 'src/b.ts' });
      monitor.process({ tool: 'Write', file: 'src/c.ts' });
      expect(monitor.getStatus().escalationLevel).toBe(ESCALATION.HIGH);

      // Advance time so first 3 denials expire, then add 1 new denial
      time = 7000;
      monitor.process({ tool: 'Write', file: 'src/d.ts' });

      // Only 1 denial in window — not enough for ELEVATED (ceil(3/2) = 2)
      const status = monitor.getStatus();
      expect(status.escalationLevel).toBe(ESCALATION.NORMAL);
      expect(status.windowedDenials).toBe(1);
      expect(status.totalDenials).toBe(4); // cumulative
    });

    it('getStatus reflects windowed state after time passes', () => {
      let time = 1000;
      const monitor = createMonitor({
        policyDefs: [
          {
            id: 'deny-all',
            name: 'Deny All',
            rules: [{ action: '*', effect: 'deny', reason: 'blocked' }],
          },
        ],
        denialThreshold: 2,
        windowSize: 5000,
        now: () => time,
      });

      monitor.process({ tool: 'Write', file: 'src/a.ts' });
      expect(monitor.getStatus().windowedDenials).toBe(1);

      time = 7000;
      const status = monitor.getStatus();
      expect(status.windowedDenials).toBe(0);
      expect(status.totalDenials).toBe(1);
    });

    it('windowed counts are reported in MonitorDecision', () => {
      let time = 1000;
      const monitor = createMonitor({
        policyDefs: [
          {
            id: 'deny-all',
            name: 'Deny All',
            rules: [{ action: '*', effect: 'deny', reason: 'blocked' }],
          },
        ],
        denialThreshold: 5,
        windowSize: 5000,
        now: () => time,
      });

      const r1 = monitor.process({ tool: 'Write', file: 'src/a.ts' });
      expect(r1.monitor.windowedDenials).toBe(1);
      expect(r1.monitor.totalDenials).toBe(1);

      time = 7000; // first denial expires
      const r2 = monitor.process({ tool: 'Write', file: 'src/b.ts' });
      expect(r2.monitor.windowedDenials).toBe(1); // only the new one
      expect(r2.monitor.totalDenials).toBe(2); // cumulative
    });

    it('lockdown decays when denials expire outside window', () => {
      let time = 1000;
      const monitor = createMonitor({
        policyDefs: [
          {
            id: 'deny-all',
            name: 'Deny All',
            rules: [{ action: '*', effect: 'deny', reason: 'blocked' }],
          },
        ],
        denialThreshold: 2,
        windowSize: 5000,
        now: () => time,
      });

      // Drive to LOCKDOWN: 4 denials (2 * denialThreshold)
      for (let i = 0; i < 4; i++) {
        monitor.process({ tool: 'Write', file: 'src/a.ts' });
      }
      expect(monitor.getStatus().escalationLevel).toBe(ESCALATION.LOCKDOWN);

      // In LOCKDOWN, all actions are denied without evaluation
      const lockedResult = monitor.process({ tool: 'Read', file: 'src/a.ts' });
      expect(lockedResult.allowed).toBe(false);

      // Advance time past window — but LOCKDOWN blocks re-evaluation
      time = 7000;

      // Still in LOCKDOWN because process() short-circuits
      const stillLocked = monitor.process({ tool: 'Read', file: 'src/a.ts' });
      expect(stillLocked.monitor.escalationLevel).toBe(ESCALATION.LOCKDOWN);

      // Manual reset is still required to exit LOCKDOWN
      monitor.resetEscalation();
      expect(monitor.getStatus().escalationLevel).toBe(ESCALATION.NORMAL);
    });

    it('StateChanged event includes windowed counts', () => {
      let time = 1000;
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
        windowSize: 5000,
        now: () => time,
      });

      monitor.bus.on(STATE_CHANGED, (event) => {
        stateEvents.push(event as unknown as DomainEvent);
      });

      // Trigger escalation
      monitor.process({ tool: 'Write', file: 'src/a.ts' });

      const evt = stateEvents[0] as unknown as Record<string, unknown>;
      expect(evt.windowedDenials).toBe(1);
      expect(evt.windowedViolations).toBe(0);
    });
  });

  describe('denial-retry-escalation', () => {
    it('escalates to LOCKDOWN when same (actionType, target) is denied 3 times', () => {
      const monitor = createMonitor({
        policyDefs: [
          {
            id: 'deny-writes',
            name: 'Deny Writes',
            rules: [{ action: 'file.write', effect: 'deny', reason: 'Read-only' }],
          },
        ],
        // Use high denial threshold so normal escalation doesn't interfere
        denialThreshold: 100,
        denialRetryThreshold: 3,
      });

      // Deny the same (file.write, src/a.ts) 3 times
      monitor.process({ tool: 'Write', file: 'src/a.ts' });
      monitor.process({ tool: 'Write', file: 'src/a.ts' });
      const r3 = monitor.process({ tool: 'Write', file: 'src/a.ts' });

      expect(r3.monitor.escalationLevel).toBe(ESCALATION.LOCKDOWN);
      expect(r3.monitor.denialRetryEscalation).toBe(true);
    });

    it('does not escalate when different targets are denied', () => {
      const monitor = createMonitor({
        policyDefs: [
          {
            id: 'deny-writes',
            name: 'Deny Writes',
            rules: [{ action: 'file.write', effect: 'deny', reason: 'Read-only' }],
          },
        ],
        denialThreshold: 100,
        denialRetryThreshold: 3,
      });

      // Deny different targets — each (actionType, target) pair only has 1 denial
      monitor.process({ tool: 'Write', file: 'src/a.ts' });
      monitor.process({ tool: 'Write', file: 'src/b.ts' });
      const r3 = monitor.process({ tool: 'Write', file: 'src/c.ts' });

      expect(r3.monitor.escalationLevel).toBe(ESCALATION.NORMAL);
      expect(r3.monitor.denialRetryEscalation).toBe(false);
    });

    it('does not escalate when different action types hit the same target', () => {
      const monitor = createMonitor({
        policyDefs: [
          {
            id: 'deny-all',
            name: 'Deny All',
            rules: [{ action: '*', effect: 'deny', reason: 'blocked' }],
          },
        ],
        denialThreshold: 100,
        denialRetryThreshold: 3,
      });

      // Different action types for the same target
      monitor.process({ tool: 'Write', file: 'src/a.ts' });
      monitor.process({ tool: 'Read', file: 'src/a.ts' });
      const r3 = monitor.process({ tool: 'Bash', command: 'cat src/a.ts' });

      expect(r3.monitor.denialRetryEscalation).toBe(false);
    });

    it('emits InvariantViolation event when threshold is breached', () => {
      const violationEvents: DomainEvent[] = [];
      const monitor = createMonitor({
        policyDefs: [
          {
            id: 'deny-writes',
            name: 'Deny Writes',
            rules: [{ action: 'file.write', effect: 'deny', reason: 'Read-only' }],
          },
        ],
        denialThreshold: 100,
        denialRetryThreshold: 3,
      });

      monitor.bus.on(INVARIANT_VIOLATION, (event) => {
        violationEvents.push(event as unknown as DomainEvent);
      });

      monitor.process({ tool: 'Write', file: 'src/a.ts' });
      monitor.process({ tool: 'Write', file: 'src/a.ts' });
      monitor.process({ tool: 'Write', file: 'src/a.ts' });

      const violations = violationEvents.filter(
        (e) =>
          (e as unknown as Record<string, unknown>).invariant === 'denial-retry-escalation'
      );
      expect(violations).toHaveLength(1);

      const evt = violations[0] as unknown as Record<string, unknown>;
      expect(evt.invariant).toBe('denial-retry-escalation');
      expect((evt.metadata as Record<string, unknown>).retryCount).toBe(3);
      expect((evt.metadata as Record<string, unknown>).severity).toBe(4);
    });

    it('only emits InvariantViolation once even with more retries', () => {
      const violationEvents: DomainEvent[] = [];
      const monitor = createMonitor({
        policyDefs: [
          {
            id: 'deny-writes',
            name: 'Deny Writes',
            rules: [{ action: 'file.write', effect: 'deny', reason: 'Read-only' }],
          },
        ],
        denialThreshold: 100,
        denialRetryThreshold: 2,
      });

      monitor.bus.on(INVARIANT_VIOLATION, (event) => {
        violationEvents.push(event as unknown as DomainEvent);
      });

      // Exceed threshold multiple times
      for (let i = 0; i < 5; i++) {
        monitor.process({ tool: 'Write', file: 'src/a.ts' });
      }

      const violations = violationEvents.filter(
        (e) =>
          (e as unknown as Record<string, unknown>).invariant === 'denial-retry-escalation'
      );
      expect(violations).toHaveLength(1);
    });

    it('denial retry LOCKDOWN is sticky — does not decay with time', () => {
      let time = 1000;
      const monitor = createMonitor({
        policyDefs: [
          {
            id: 'deny-writes',
            name: 'Deny Writes',
            rules: [{ action: 'file.write', effect: 'deny', reason: 'Read-only' }],
          },
          {
            id: 'allow-reads',
            name: 'Allow Reads',
            rules: [{ action: 'file.read', effect: 'allow' }],
          },
        ],
        denialThreshold: 100,
        denialRetryThreshold: 3,
        windowSize: 5000,
        now: () => time,
      });

      // Trigger denial-retry LOCKDOWN
      monitor.process({ tool: 'Write', file: 'src/a.ts' });
      monitor.process({ tool: 'Write', file: 'src/a.ts' });
      monitor.process({ tool: 'Write', file: 'src/a.ts' });
      expect(monitor.getEscalationLevel()).toBe(ESCALATION.LOCKDOWN);

      // Advance time past the window — normal denials would decay
      time = 100000;
      const result = monitor.process({ tool: 'Read', file: 'src/a.ts' });

      // Still LOCKDOWN because denial-retry is sticky
      expect(result.monitor.escalationLevel).toBe(ESCALATION.LOCKDOWN);
      expect(result.monitor.denialRetryEscalation).toBe(true);
    });

    it('resetEscalation clears denial retry state', () => {
      const monitor = createMonitor({
        policyDefs: [
          {
            id: 'deny-writes',
            name: 'Deny Writes',
            rules: [{ action: 'file.write', effect: 'deny', reason: 'Read-only' }],
          },
          {
            id: 'allow-reads',
            name: 'Allow Reads',
            rules: [{ action: 'file.read', effect: 'allow' }],
          },
        ],
        denialThreshold: 100,
        denialRetryThreshold: 3,
      });

      // Trigger denial-retry LOCKDOWN
      monitor.process({ tool: 'Write', file: 'src/a.ts' });
      monitor.process({ tool: 'Write', file: 'src/a.ts' });
      monitor.process({ tool: 'Write', file: 'src/a.ts' });
      expect(monitor.getEscalationLevel()).toBe(ESCALATION.LOCKDOWN);

      monitor.resetEscalation();
      expect(monitor.getEscalationLevel()).toBe(ESCALATION.NORMAL);

      // Denial retry counts should be cleared
      const result = monitor.process({ tool: 'Read', file: 'src/a.ts' });
      expect(result.monitor.denialRetryEscalation).toBe(false);
    });

    it('getStatus includes denial retry information', () => {
      const monitor = createMonitor({
        policyDefs: [
          {
            id: 'deny-writes',
            name: 'Deny Writes',
            rules: [{ action: 'file.write', effect: 'deny', reason: 'Read-only' }],
          },
        ],
        denialThreshold: 100,
        denialRetryThreshold: 5,
      });

      monitor.process({ tool: 'Write', file: 'src/a.ts' });
      monitor.process({ tool: 'Write', file: 'src/a.ts' });

      const status = monitor.getStatus();
      expect(status.denialRetryEscalation).toBe(false);
      expect(status.denialRetryThreshold).toBe(5);
      expect(status.denialRetryCounts).toEqual({ 'file.write::src/a.ts': 2 });
    });

    it('uses default threshold of 3 when not configured', () => {
      const monitor = createMonitor({
        policyDefs: [
          {
            id: 'deny-writes',
            name: 'Deny Writes',
            rules: [{ action: 'file.write', effect: 'deny', reason: 'Read-only' }],
          },
        ],
        denialThreshold: 100,
      });

      // Default denialRetryThreshold is 3
      monitor.process({ tool: 'Write', file: 'src/a.ts' });
      monitor.process({ tool: 'Write', file: 'src/a.ts' });
      const r2 = monitor.process({ tool: 'Write', file: 'src/a.ts' });

      // Should trigger on the 3rd retry (default threshold)
      expect(r2.monitor.denialRetryEscalation).toBe(true);
      expect(r2.monitor.escalationLevel).toBe(ESCALATION.LOCKDOWN);
    });
  });
});
