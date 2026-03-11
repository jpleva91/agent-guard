// Tests for the risk scoring engine — per-session aggregate risk computation.

import { describe, it, expect } from 'vitest';
import { computeRunRiskScore, computeAllRunRiskScores } from '../../src/analytics/risk-scorer.js';
import type { DomainEvent } from '../../src/core/types.js';

// --- Helpers ---

let idCounter = 0;

function makeEvent(kind: string, extra: Record<string, unknown> = {}): DomainEvent {
  idCounter++;
  return {
    id: `evt_${idCounter}`,
    kind,
    timestamp: Date.now(),
    fingerprint: `fp_${idCounter}`,
    ...extra,
  } as unknown as DomainEvent;
}

// --- computeRunRiskScore Tests ---

describe('computeRunRiskScore', () => {
  it('returns zero score for an empty event stream', () => {
    const result = computeRunRiskScore('empty-session', []);

    expect(result.sessionId).toBe('empty-session');
    expect(result.score).toBe(0);
    expect(result.riskLevel).toBe('low');
    expect(result.totalActions).toBe(0);
    expect(result.totalDenials).toBe(0);
    expect(result.totalViolations).toBe(0);
    expect(result.peakEscalation).toBe(0);
    expect(result.factors).toHaveLength(4);
  });

  it('returns low risk for a clean session with only allowed actions', () => {
    const events = [
      makeEvent('ActionRequested', {
        actionType: 'file.read',
        target: 'src/main.ts',
        justification: 'read',
      }),
      makeEvent('ActionAllowed', {
        actionType: 'file.read',
        target: 'src/main.ts',
        capability: 'read',
      }),
      makeEvent('ActionExecuted', { actionType: 'file.read', target: 'src/main.ts', result: 'ok' }),
    ];

    const result = computeRunRiskScore('clean-session', events);

    expect(result.riskLevel).toBe('low');
    expect(result.score).toBeLessThan(26);
    expect(result.totalDenials).toBe(0);
    expect(result.totalViolations).toBe(0);
    expect(result.peakEscalation).toBe(0);
  });

  it('detects violations and increases risk score', () => {
    const events = [
      makeEvent('InvariantViolation', {
        invariant: 'protected-branches',
        expected: 'no push',
        actual: 'push',
      }),
      makeEvent('InvariantViolation', { invariant: 'blast-radius', expected: '<10', actual: '25' }),
      makeEvent('PolicyDenied', { policy: 'strict', action: 'shell.exec', reason: 'denied' }),
    ];

    const result = computeRunRiskScore('violation-session', events);

    expect(result.totalViolations).toBe(3);
    expect(result.score).toBeGreaterThan(0);
    // 2 InvariantViolation (10 each) + 1 PolicyDenied (7) = 27 points
    // Violation component: (27/50)*100 = 54
    const violationFactor = result.factors.find((f) => f.dimension === 'violations');
    expect(violationFactor).toBeDefined();
    expect(violationFactor!.normalizedScore).toBe(54);
  });

  it('escalates risk with many denials', () => {
    // 5+ denials → HIGH escalation level
    const events = [
      makeEvent('ActionDenied', { actionType: 'shell.exec', target: 'rm -rf', reason: 'denied' }),
      makeEvent('ActionDenied', { actionType: 'shell.exec', target: 'rm -rf', reason: 'denied' }),
      makeEvent('ActionDenied', { actionType: 'shell.exec', target: 'rm -rf', reason: 'denied' }),
      makeEvent('PolicyDenied', { policy: 'strict', action: 'git.push', reason: 'denied' }),
      makeEvent('PolicyDenied', { policy: 'strict', action: 'git.push', reason: 'denied' }),
    ];

    const result = computeRunRiskScore('escalated-session', events);

    expect(result.peakEscalation).toBe(2); // HIGH
    const escalationFactor = result.factors.find((f) => f.dimension === 'escalation');
    expect(escalationFactor).toBeDefined();
    expect(escalationFactor!.rawValue).toBe(2);
    expect(escalationFactor!.details).toContain('HIGH');
  });

  it('reaches LOCKDOWN with extreme denials', () => {
    const events: DomainEvent[] = [];
    // 10 denials → LOCKDOWN
    for (let i = 0; i < 10; i++) {
      events.push(
        makeEvent('ActionDenied', { actionType: 'shell.exec', target: 'rm -rf', reason: 'denied' })
      );
    }

    const result = computeRunRiskScore('lockdown-session', events);

    expect(result.peakEscalation).toBe(3); // LOCKDOWN
    expect(result.riskLevel).toBe('high'); // Score should be high or critical
    expect(result.score).toBeGreaterThan(50);
  });

  it('increases blast radius score with affected files', () => {
    const events = [
      makeEvent('BlastRadiusExceeded', { filesAffected: 50, limit: 10 }),
      makeEvent('BlastRadiusExceeded', { filesAffected: 30, limit: 10 }),
    ];

    const result = computeRunRiskScore('blast-session', events);

    const blastFactor = result.factors.find((f) => f.dimension === 'blastRadius');
    expect(blastFactor).toBeDefined();
    // 80 files + 2 exceeded events * 20 penalty = 104 → clamped to 100
    expect(blastFactor!.normalizedScore).toBe(100);
    expect(blastFactor!.details).toContain('80 files affected');
    expect(blastFactor!.details).toContain('2 blast radius exceeded');
  });

  it('scores risky operations higher than safe ones', () => {
    const safeEvents = [
      makeEvent('ActionExecuted', { actionType: 'file.read', target: 'src/main.ts', result: 'ok' }),
      makeEvent('ActionExecuted', { actionType: 'file.read', target: 'src/lib.ts', result: 'ok' }),
    ];

    const riskyEvents = [
      makeEvent('ActionExecuted', {
        actionType: 'deploy.trigger',
        target: 'production',
        result: 'ok',
      }),
      makeEvent('ActionExecuted', { actionType: 'git.force-push', target: 'main', result: 'ok' }),
    ];

    const safeResult = computeRunRiskScore('safe-ops', safeEvents);
    const riskyResult = computeRunRiskScore('risky-ops', riskyEvents);

    const safeOpFactor = safeResult.factors.find((f) => f.dimension === 'operations');
    const riskyOpFactor = riskyResult.factors.find((f) => f.dimension === 'operations');

    expect(riskyOpFactor!.normalizedScore).toBeGreaterThan(safeOpFactor!.normalizedScore);
  });

  it('correctly classifies risk levels', () => {
    // Low: empty session
    const low = computeRunRiskScore('low', []);
    expect(low.riskLevel).toBe('low');

    // Medium: moderate violations with elevated escalation and some blast radius
    const medEvents = [
      makeEvent('PolicyDenied', { policy: 'p', action: 'shell.exec', reason: 'denied' }),
      makeEvent('PolicyDenied', { policy: 'p', action: 'shell.exec', reason: 'denied' }),
      makeEvent('PolicyDenied', { policy: 'p', action: 'git.push', reason: 'denied' }),
      makeEvent('InvariantViolation', { invariant: 'iv', expected: 'a', actual: 'b' }),
      makeEvent('BlastRadiusExceeded', { filesAffected: 15, limit: 10 }),
      makeEvent('ActionExecuted', { actionType: 'git.push', target: 'main', result: 'ok' }),
      makeEvent('ActionExecuted', { actionType: 'file.write', target: 'src/app.ts', result: 'ok' }),
    ];
    const med = computeRunRiskScore('med', medEvents);
    expect(med.score).toBeGreaterThanOrEqual(26);
    expect(med.score).toBeLessThanOrEqual(50);
    expect(med.riskLevel).toBe('medium');

    // Critical: massive violations + lockdown
    const critEvents: DomainEvent[] = [];
    for (let i = 0; i < 10; i++) {
      critEvents.push(
        makeEvent('ActionDenied', { actionType: 'shell.exec', target: 'rm', reason: 'denied' })
      );
    }
    for (let i = 0; i < 6; i++) {
      critEvents.push(
        makeEvent('InvariantViolation', { invariant: 'iv', expected: 'a', actual: 'b' })
      );
    }
    critEvents.push(makeEvent('BlastRadiusExceeded', { filesAffected: 200, limit: 10 }));
    const crit = computeRunRiskScore('crit', critEvents);
    expect(crit.riskLevel).toBe('critical');
  });

  it('includes all four risk dimensions in factors', () => {
    const events = [
      makeEvent('ActionDenied', { actionType: 'git.push', target: 'main', reason: 'denied' }),
    ];

    const result = computeRunRiskScore('factors-check', events);

    const dimensions = result.factors.map((f) => f.dimension);
    expect(dimensions).toContain('violations');
    expect(dimensions).toContain('escalation');
    expect(dimensions).toContain('blastRadius');
    expect(dimensions).toContain('operations');
    expect(result.factors).toHaveLength(4);
  });

  it('weights sum to 1.0', () => {
    const result = computeRunRiskScore('weight-check', []);
    const totalWeight = result.factors.reduce((sum, f) => sum + f.weight, 0);
    expect(totalWeight).toBeCloseTo(1.0);
  });
});

// --- computeAllRunRiskScores Tests ---

describe('computeAllRunRiskScores', () => {
  it('returns empty array for no sessions', () => {
    const result = computeAllRunRiskScores(new Map());
    expect(result).toEqual([]);
  });

  it('computes scores for multiple sessions', () => {
    const sessionEvents = new Map<string, DomainEvent[]>();
    sessionEvents.set('session-a', [
      makeEvent('ActionExecuted', { actionType: 'file.read', target: 'readme.md', result: 'ok' }),
    ]);
    sessionEvents.set('session-b', [
      makeEvent('InvariantViolation', { invariant: 'blast-radius', expected: '<10', actual: '50' }),
      makeEvent('PolicyDenied', { policy: 'strict', action: 'git.push', reason: 'denied' }),
    ]);

    const result = computeAllRunRiskScores(sessionEvents);

    expect(result).toHaveLength(2);
    expect(result[0].sessionId).toBe('session-b');
    expect(result[1].sessionId).toBe('session-a');
    expect(result[0].score).toBeGreaterThan(result[1].score);
  });

  it('sorts results by risk score descending', () => {
    const sessionEvents = new Map<string, DomainEvent[]>();
    sessionEvents.set('low-risk', []);
    sessionEvents.set('high-risk', [
      makeEvent('ActionDenied', { actionType: 'shell.exec', target: 'rm -rf', reason: 'denied' }),
      makeEvent('ActionDenied', { actionType: 'shell.exec', target: 'rm -rf', reason: 'denied' }),
      makeEvent('ActionDenied', { actionType: 'shell.exec', target: 'rm -rf', reason: 'denied' }),
      makeEvent('InvariantViolation', { invariant: 'iv', expected: 'a', actual: 'b' }),
    ]);
    sessionEvents.set('med-risk', [
      makeEvent('PolicyDenied', { policy: 'p', action: 'git.push', reason: 'denied' }),
    ]);

    const result = computeAllRunRiskScores(sessionEvents);

    expect(result[0].sessionId).toBe('high-risk');
    expect(result[result.length - 1].sessionId).toBe('low-risk');
    for (let i = 1; i < result.length; i++) {
      expect(result[i].score).toBeLessThanOrEqual(result[i - 1].score);
    }
  });
});
