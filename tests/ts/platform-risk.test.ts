import { describe, it, expect } from 'vitest';
import {
  assessRisk,
  assessBugRisk,
  isSensitiveFile,
  riskToGameSeverity,
} from '../../src/domain/risk.js';
import { createDevEvent, resetDevEventCounter } from '../../src/domain/dev-event.js';
import type { DevEvent } from '../../src/domain/dev-event.js';
import { createBugEntity } from '../../src/domain/entities.js';

function makeEvent(overrides: Partial<Parameters<typeof createDevEvent>[0]> = {}): DevEvent {
  resetDevEventCounter();
  return createDevEvent({
    source: 'cli',
    actor: 'system',
    kind: 'error.detected',
    severity: 'medium',
    payload: {},
    ...overrides,
  });
}

describe('domain/risk', () => {
  describe('assessRisk', () => {
    it('returns risk assessment with all fields', () => {
      const event = makeEvent();
      const risk = assessRisk(event);

      expect(risk.level).toBeTypeOf('string');
      expect(risk.score).toBeGreaterThanOrEqual(0);
      expect(risk.score).toBeLessThanOrEqual(100);
      expect(risk.reason).toBeTypeOf('string');
      expect(risk.action).toBeTypeOf('string');
      expect(risk.isBoss).toBeTypeOf('boolean');
      expect(risk.hpBonus).toBeGreaterThanOrEqual(0);
    });

    it('treats governance violations as high risk', () => {
      const event = makeEvent({ kind: 'governance.invariant.breached', severity: 'critical' });
      const risk = assessRisk(event);

      expect(risk.level).toBe('critical_breach');
      expect(risk.score).toBeGreaterThanOrEqual(80);
      expect(risk.isBoss).toBe(true);
      expect(risk.action).toBe('block');
    });

    it('elevates agent-originated actions', () => {
      const event = makeEvent({ kind: 'agent.file.modified', actor: 'agent', severity: 'medium' });
      const risk = assessRisk(event, { isAgentOriginated: true, isSensitiveFile: true });

      expect(risk.score).toBeGreaterThan(30);
      expect(risk.reason).toContain('Agent');
    });

    it('detects regressions', () => {
      const event = makeEvent({ severity: 'high' });
      const risk = assessRisk(event, { wasResolved: true });

      expect(risk.level).toBe('regression');
      expect(risk.reason).toContain('resolved');
    });

    it('escalates repeated issues', () => {
      const event = makeEvent({ severity: 'medium' });
      const risk = assessRisk(event, { occurrenceCount: 10 });

      expect(risk.level).toBe('issue');
      expect(risk.reason).toContain('10');
    });

    it('classifies low severity single occurrence as noise', () => {
      const event = makeEvent({ severity: 'low' });
      const risk = assessRisk(event, { occurrenceCount: 1 });

      expect(risk.level).toBe('noise');
      expect(risk.action).toBe('auto_resolve');
      expect(risk.isBoss).toBe(false);
    });

    it('agent risk increases with tests skipped', () => {
      const event = makeEvent({ kind: 'agent.file.modified', actor: 'agent' });
      const withTests = assessRisk(event, { isAgentOriginated: true, testsSkipped: true });
      const withoutTests = assessRisk(event, { isAgentOriginated: true, testsSkipped: false });

      expect(withTests.score).toBeGreaterThan(withoutTests.score);
    });

    it('agent risk increases with large blast radius', () => {
      const event = makeEvent({ kind: 'agent.file.modified', actor: 'agent' });
      const large = assessRisk(event, { isAgentOriginated: true, filesAffected: 20 });
      const small = assessRisk(event, { isAgentOriginated: true, filesAffected: 1 });

      expect(large.score).toBeGreaterThan(small.score);
    });
  });

  describe('assessBugRisk', () => {
    it('assesses risk for a bug entity', () => {
      const bug = createBugEntity({
        fingerprint: 'fp_1',
        errorType: 'null-reference',
        message: 'null ref',
        severity: 'high',
      });
      // Simulate multiple occurrences
      const repeatedBug = { ...bug, occurrenceCount: 8 };

      const risk = assessBugRisk(repeatedBug);
      expect(risk.score).toBeGreaterThan(0);
    });
  });

  describe('isSensitiveFile', () => {
    it('detects auth files', () => {
      expect(isSensitiveFile('src/auth/login.ts')).toBe(true);
    });

    it('detects env files', () => {
      expect(isSensitiveFile('.env')).toBe(true);
      expect(isSensitiveFile('.env.local')).toBe(true);
    });

    it('detects key files', () => {
      expect(isSensitiveFile('certs/server.key')).toBe(true);
      expect(isSensitiveFile('certs/server.pem')).toBe(true);
    });

    it('detects config files', () => {
      expect(isSensitiveFile('config.json')).toBe(true);
      expect(isSensitiveFile('config.yaml')).toBe(true);
    });

    it('does not flag normal files', () => {
      expect(isSensitiveFile('src/utils/helper.ts')).toBe(false);
      expect(isSensitiveFile('tests/unit.test.ts')).toBe(false);
    });
  });

  describe('riskToGameSeverity', () => {
    it('maps all risk levels to game severity 1-5', () => {
      expect(riskToGameSeverity('noise')).toBe(1);
      expect(riskToGameSeverity('nuisance')).toBe(2);
      expect(riskToGameSeverity('issue')).toBe(3);
      expect(riskToGameSeverity('regression')).toBe(4);
      expect(riskToGameSeverity('risky_automation')).toBe(4);
      expect(riskToGameSeverity('critical_breach')).toBe(5);
    });
  });
});
