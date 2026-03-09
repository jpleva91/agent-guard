import { describe, it, expect } from 'vitest';
import { createMonitor, ESCALATION } from '../../src/kernel/monitor.js';

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
        policyDefs: [{
          id: 'deny-writes',
          name: 'No Writes',
          rules: [{ action: 'file.write', effect: 'deny', reason: 'Read-only' }],
        }],
      });

      monitor.process({ tool: 'Write', file: 'src/a.ts' });
      const status = monitor.getStatus();
      expect(status.totalDenials).toBe(1);
    });

    it('escalates on repeated denials', () => {
      const monitor = createMonitor({
        policyDefs: [{
          id: 'deny-all',
          name: 'Deny All',
          rules: [{ action: '*', effect: 'deny', reason: 'blocked' }],
        }],
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
        policyDefs: [{
          id: 'deny-all',
          name: 'Deny All',
          rules: [{ action: '*', effect: 'deny', reason: 'blocked' }],
        }],
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
        policyDefs: [{
          id: 'deny-all',
          name: 'Deny All',
          rules: [{ action: '*', effect: 'deny', reason: 'blocked' }],
        }],
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
        policyDefs: [{
          id: 'deny-all',
          name: 'Deny All',
          rules: [{ action: '*', effect: 'deny', reason: 'blocked' }],
        }],
      });

      monitor.process({ tool: 'Write', file: 'src/a.ts' });
      expect(monitor.store.count()).toBeGreaterThan(0);
    });
  });
});
