import { describe, it, expect } from 'vitest';
import { aggregateEvents, formatEvidenceMarkdown } from '../src/evidence-summary.js';
import { createEvent } from '@red-codes/events';

function makeEvent(kind: string, data: Record<string, unknown> = {}) {
  return createEvent(kind, data);
}

describe('evidence-summary', () => {
  describe('aggregateEvents', () => {
    it('returns zero counts for empty events', () => {
      const summary = aggregateEvents([]);
      expect(summary.totalEvents).toBe(0);
      expect(summary.actionsAllowed).toBe(0);
      expect(summary.actionsDenied).toBe(0);
      expect(summary.policyDenials).toBe(0);
      expect(summary.invariantViolations).toBe(0);
      expect(summary.escalations).toBe(0);
      expect(summary.blastRadiusExceeded).toBe(0);
      expect(summary.maxEscalationLevel).toBe('NORMAL');
      expect(summary.denialReasons).toEqual([]);
      expect(summary.violationDetails).toEqual([]);
      expect(summary.runIds).toEqual([]);
    });

    it('counts ActionAllowed events', () => {
      const events = [
        makeEvent('ActionAllowed', {
          actionType: 'file.read',
          target: 'src/index.ts',
          capability: 'read',
        }),
        makeEvent('ActionAllowed', {
          actionType: 'file.write',
          target: 'src/app.ts',
          capability: 'write',
        }),
      ];
      const summary = aggregateEvents(events);
      expect(summary.actionsAllowed).toBe(2);
      expect(summary.actionsDenied).toBe(0);
      expect(summary.totalEvents).toBe(2);
    });

    it('counts ActionDenied events and captures reasons', () => {
      const events = [
        makeEvent('ActionDenied', {
          actionType: 'git.push',
          target: 'main',
          reason: 'Protected branch',
        }),
      ];
      const summary = aggregateEvents(events);
      expect(summary.actionsDenied).toBe(1);
      expect(summary.denialReasons).toEqual(['git.push: Protected branch']);
    });

    it('counts PolicyDenied events', () => {
      const events = [
        makeEvent('PolicyDenied', {
          policy: 'default',
          action: 'shell.exec',
          reason: 'Destructive command',
        }),
      ];
      const summary = aggregateEvents(events);
      expect(summary.policyDenials).toBe(1);
      expect(summary.denialReasons).toContain('Policy denied shell.exec: Destructive command');
    });

    it('counts InvariantViolation events and captures details', () => {
      const events = [
        makeEvent('InvariantViolation', {
          invariant: 'no-secret-exposure',
          expected: 'no secrets in files',
          actual: 'found API key in .env',
        }),
      ];
      const summary = aggregateEvents(events);
      expect(summary.invariantViolations).toBe(1);
      expect(summary.violationDetails).toEqual([
        'no-secret-exposure: expected no secrets in files, got found API key in .env',
      ]);
    });

    it('counts ActionEscalated events', () => {
      const events = [
        makeEvent('ActionEscalated', {
          actionType: 'git.push',
          target: 'main',
          reason: 'blast radius high',
        }),
      ];
      const summary = aggregateEvents(events);
      expect(summary.escalations).toBe(1);
    });

    it('counts BlastRadiusExceeded events', () => {
      const events = [
        makeEvent('BlastRadiusExceeded', {
          filesAffected: 25,
          limit: 10,
        }),
      ];
      const summary = aggregateEvents(events);
      expect(summary.blastRadiusExceeded).toBe(1);
    });

    it('counts EvidencePackGenerated events', () => {
      const events = [
        makeEvent('EvidencePackGenerated', {
          packId: 'pack_abc',
          eventIds: ['evt_1'],
        }),
      ];
      const summary = aggregateEvents(events);
      expect(summary.evidencePacksGenerated).toBe(1);
    });

    it('builds action type breakdown', () => {
      const events = [
        makeEvent('ActionAllowed', {
          actionType: 'file.read',
          target: 'a.ts',
          capability: 'read',
        }),
        makeEvent('ActionAllowed', {
          actionType: 'file.read',
          target: 'b.ts',
          capability: 'read',
        }),
        makeEvent('ActionDenied', {
          actionType: 'file.read',
          target: 'c.ts',
          reason: 'restricted',
        }),
        makeEvent('ActionAllowed', {
          actionType: 'git.push',
          target: 'main',
          capability: 'push',
        }),
      ];
      const summary = aggregateEvents(events);
      expect(summary.actionTypeBreakdown['file.read']).toEqual({ allowed: 2, denied: 1 });
      expect(summary.actionTypeBreakdown['git.push']).toEqual({ allowed: 1, denied: 0 });
    });

    it('extracts runIds from RunStarted events', () => {
      const events = [
        makeEvent('RunStarted', { runId: 'run_123' }),
        makeEvent('ActionAllowed', {
          actionType: 'file.read',
          target: 'a.ts',
          capability: 'read',
        }),
      ];
      const summary = aggregateEvents(events);
      expect(summary.runIds).toEqual(['run_123']);
    });

    it('only counts governance events in totalEvents', () => {
      const events = [
        makeEvent('ActionAllowed', {
          actionType: 'file.read',
          target: 'a.ts',
          capability: 'read',
        }),
        makeEvent('RunStarted', { runId: 'run_1' }),
        makeEvent('FileSaved', { file: 'test.ts' }),
      ];
      const summary = aggregateEvents(events);
      // Only ActionAllowed is a governance event; RunStarted and FileSaved are not
      expect(summary.totalEvents).toBe(1);
    });

    it('tracks max escalation level from StateChanged events', () => {
      const events = [
        makeEvent('StateChanged', { from: 'NORMAL', to: 'ELEVATED', trigger: 'denial' }),
        makeEvent('StateChanged', { from: 'ELEVATED', to: 'HIGH', trigger: 'violation' }),
      ];
      const summary = aggregateEvents(events);
      expect(summary.maxEscalationLevel).toBe('HIGH');
    });

    it('defaults to NORMAL when no StateChanged events exist', () => {
      const events = [
        makeEvent('ActionAllowed', {
          actionType: 'file.read',
          target: 'a.ts',
          capability: 'read',
        }),
      ];
      const summary = aggregateEvents(events);
      expect(summary.maxEscalationLevel).toBe('NORMAL');
    });

    it('tracks highest escalation even if later de-escalated', () => {
      const events = [
        makeEvent('StateChanged', { from: 'NORMAL', to: 'LOCKDOWN', trigger: 'violation' }),
        makeEvent('StateChanged', { from: 'LOCKDOWN', to: 'NORMAL', trigger: 'manual-reset' }),
      ];
      const summary = aggregateEvents(events);
      expect(summary.maxEscalationLevel).toBe('LOCKDOWN');
    });
  });

  describe('formatEvidenceMarkdown', () => {
    it('generates markdown with zero issues verdict', () => {
      const summary = aggregateEvents([
        makeEvent('ActionAllowed', {
          actionType: 'file.read',
          target: 'a.ts',
          capability: 'read',
        }),
      ]);
      const md = formatEvidenceMarkdown(summary);
      expect(md).toContain('## Governance Evidence Report');
      expect(md).toContain('All actions passed governance checks');
      expect(md).toContain('| Actions allowed | 1 |');
      expect(md).toContain('| Actions denied | 0 |');
    });

    it('generates markdown with issues detected verdict', () => {
      const summary = aggregateEvents([
        makeEvent('ActionDenied', {
          actionType: 'git.push',
          target: 'main',
          reason: 'Protected',
        }),
      ]);
      const md = formatEvidenceMarkdown(summary);
      expect(md).toContain('1 governance issue(s) detected');
    });

    it('includes action type breakdown in details', () => {
      const summary = aggregateEvents([
        makeEvent('ActionAllowed', {
          actionType: 'file.read',
          target: 'a.ts',
          capability: 'read',
        }),
        makeEvent('ActionDenied', {
          actionType: 'git.push',
          target: 'main',
          reason: 'Protected',
        }),
      ]);
      const md = formatEvidenceMarkdown(summary);
      expect(md).toContain('Action type breakdown');
      expect(md).toContain('`file.read`');
      expect(md).toContain('`git.push`');
    });

    it('includes denial details', () => {
      const summary = aggregateEvents([
        makeEvent('ActionDenied', {
          actionType: 'shell.exec',
          target: 'rm -rf',
          reason: 'Destructive',
        }),
      ]);
      const md = formatEvidenceMarkdown(summary);
      expect(md).toContain('Denial details');
      expect(md).toContain('shell.exec: Destructive');
    });

    it('includes invariant violation details', () => {
      const summary = aggregateEvents([
        makeEvent('InvariantViolation', {
          invariant: 'no-force-push',
          expected: 'no force push',
          actual: 'force push detected',
        }),
      ]);
      const md = formatEvidenceMarkdown(summary);
      expect(md).toContain('Invariant violation details');
      expect(md).toContain('no-force-push');
    });

    it('includes session references', () => {
      const summary = aggregateEvents([makeEvent('RunStarted', { runId: 'run_abc' })]);
      const md = formatEvidenceMarkdown(summary);
      expect(md).toContain('`run_abc`');
    });

    it('includes AgentGuard attribution', () => {
      const summary = aggregateEvents([]);
      const md = formatEvidenceMarkdown(summary);
      expect(md).toContain('AgentGuard');
    });

    it('includes escalation level in the report', () => {
      const events = [
        makeEvent('StateChanged', { from: 'NORMAL', to: 'ELEVATED', trigger: 'denial' }),
        makeEvent('ActionAllowed', {
          actionType: 'file.read',
          target: 'a.ts',
          capability: 'read',
        }),
      ];
      const summary = aggregateEvents(events);
      const md = formatEvidenceMarkdown(summary);
      expect(md).toContain('| Escalation level | ELEVATED |');
    });

    it('includes artifact URL when provided', () => {
      const summary = aggregateEvents([]);
      const md = formatEvidenceMarkdown(summary, {
        artifactUrl: 'https://github.com/org/repo/actions/runs/123/artifacts/456',
      });
      expect(md).toContain('Full session data');
      expect(md).toContain('https://github.com/org/repo/actions/runs/123/artifacts/456');
    });

    it('omits artifact link when no URL provided', () => {
      const summary = aggregateEvents([]);
      const md = formatEvidenceMarkdown(summary);
      expect(md).not.toContain('Full session data');
    });

    it('omits artifact link when options is undefined', () => {
      const summary = aggregateEvents([]);
      const md = formatEvidenceMarkdown(summary, undefined);
      expect(md).not.toContain('Full session data');
    });
  });
});
