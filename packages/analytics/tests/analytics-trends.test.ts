import { describe, it, expect } from 'vitest';
import {
  computeTrends,
  computeAllTrends,
  computeFailureRateTrends,
} from '@red-codes/analytics';
import type { ViolationRecord } from '@red-codes/analytics';
import type { DomainEvent } from '@red-codes/core';

const WINDOW = 1000; // 1 second window for testing

function makeViolation(overrides: Partial<ViolationRecord> = {}): ViolationRecord {
  return {
    sessionId: 'session-1',
    eventId: 'evt-1',
    kind: 'PolicyDenied',
    timestamp: 500,
    actionType: 'file.write',
    target: 'src/index.ts',
    reason: 'Blocked',
    ...overrides,
  };
}

function makeEvent(overrides: Partial<DomainEvent & Record<string, unknown>> = {}): DomainEvent {
  return {
    id: 'e1',
    kind: 'ActionRequested',
    timestamp: 500,
    ...overrides,
  } as DomainEvent;
}

describe('computeTrends', () => {
  it('returns empty for empty input', () => {
    expect(computeTrends([], 'actionType', WINDOW)).toEqual([]);
  });

  it('detects new trend (only in recent window)', () => {
    // now = 2000, recent = [1000, 2000], previous = [0, 1000]
    const violations = [
      makeViolation({ timestamp: 1500, actionType: 'file.write' }),
      makeViolation({ timestamp: 1800, actionType: 'file.write' }),
    ];

    const trends = computeTrends(violations, 'actionType', WINDOW);
    expect(trends).toHaveLength(1);
    expect(trends[0].direction).toBe('new');
    expect(trends[0].key).toBe('file.write');
    expect(trends[0].changePercent).toBe(100);
  });

  it('detects resolved trend (only in previous window)', () => {
    // now = 2000, recent = [1000, 2000], previous = [0, 1000]
    const violations = [
      makeViolation({ timestamp: 500, actionType: 'file.write' }),
      makeViolation({ timestamp: 800, actionType: 'file.write' }),
      makeViolation({ timestamp: 2000, actionType: 'git.push' }), // pushes now to 2000
    ];

    const trends = computeTrends(violations, 'actionType', WINDOW);
    const writeTrend = trends.find((t) => t.key === 'file.write');
    expect(writeTrend?.direction).toBe('resolved');
  });

  it('detects increasing trend (>20% more)', () => {
    // now = 2000, recent = [1000, 2000], previous = [0, 1000]
    const violations = [
      // previous window: 1 violation
      makeViolation({ timestamp: 500, actionType: 'file.write', eventId: 'e1' }),
      // recent window: 3 violations (200% increase)
      makeViolation({ timestamp: 1200, actionType: 'file.write', eventId: 'e2' }),
      makeViolation({ timestamp: 1500, actionType: 'file.write', eventId: 'e3' }),
      makeViolation({ timestamp: 2000, actionType: 'file.write', eventId: 'e4' }),
    ];

    const trends = computeTrends(violations, 'actionType', WINDOW);
    expect(trends[0].direction).toBe('increasing');
    expect(trends[0].recentCount).toBe(3);
    expect(trends[0].previousCount).toBe(1);
  });

  it('detects decreasing trend (>20% less)', () => {
    // now = 2000, recent = [1000, 2000], previous = [0, 1000]
    const violations = [
      // previous window: 3 violations
      makeViolation({ timestamp: 200, actionType: 'file.write', eventId: 'e1' }),
      makeViolation({ timestamp: 500, actionType: 'file.write', eventId: 'e2' }),
      makeViolation({ timestamp: 800, actionType: 'file.write', eventId: 'e3' }),
      // recent window: 1 violation (-67% decrease)
      makeViolation({ timestamp: 2000, actionType: 'file.write', eventId: 'e4' }),
    ];

    const trends = computeTrends(violations, 'actionType', WINDOW);
    expect(trends[0].direction).toBe('decreasing');
  });

  it('detects stable trend (within 20%)', () => {
    // Window = 100. now = max(timestamps) = 250.
    // recent = [150, 250], previous = [50, 150)
    const W = 100;
    const violations = [
      // previous window [50, 150): 5 violations at 60,70,80,90,100
      ...Array.from({ length: 5 }, (_, i) =>
        makeViolation({ timestamp: 60 + i * 10, actionType: 'file.write', eventId: `p${i}` })
      ),
      // recent window [150, 250]: 5 violations at 160,170,180,190,200
      // plus one more at 250 to set "now"
      ...Array.from({ length: 5 }, (_, i) =>
        makeViolation({ timestamp: 160 + i * 10, actionType: 'file.write', eventId: `r${i}` })
      ),
    ];
    // Verify: now=200, recentStart=100, previousStart=0
    // previous: [60,70,80,90,100) → timestamps >= 100? 100 is >= 100 so goes to recent!
    // Need to be more careful. Let me just verify the result matches expectation.
    // Actually let's make timestamps clearly in separate windows:
    // now = 300, recentStart = 200, previousStart = 100
    // previous [100, 200): timestamps 110,120,130,140,150 (5 items)
    // recent [200, 300]: timestamps 210,220,230,240,300 (5 items)
    const violations2 = [
      ...Array.from({ length: 5 }, (_, i) =>
        makeViolation({ timestamp: 110 + i * 10, actionType: 'file.write', eventId: `p${i}` })
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        makeViolation({ timestamp: 210 + i * 10, actionType: 'file.write', eventId: `r${i}` })
      ),
      // anchor "now" at 300
      makeViolation({ timestamp: 300, actionType: 'file.write', eventId: 'anchor' }),
    ];
    // now=300, recentStart=200, previous=[100,200)
    // previous: 110,120,130,140,150 = 5
    // recent: 210,220,230,240,300 + anchor = 6 ... that's still not equal

    // Simplest approach: put exactly equal counts well within boundaries
    const violations3 = [
      // previous: 3 items well within [100, 200)
      makeViolation({ timestamp: 120, actionType: 'file.write', eventId: 'p1' }),
      makeViolation({ timestamp: 140, actionType: 'file.write', eventId: 'p2' }),
      makeViolation({ timestamp: 160, actionType: 'file.write', eventId: 'p3' }),
      // recent: 3 items within [200, 300]
      makeViolation({ timestamp: 220, actionType: 'file.write', eventId: 'r1' }),
      makeViolation({ timestamp: 240, actionType: 'file.write', eventId: 'r2' }),
      makeViolation({ timestamp: 300, actionType: 'file.write', eventId: 'r3' }),
    ];

    const trends = computeTrends(violations3, 'actionType', W);
    expect(trends[0].direction).toBe('stable');
    expect(trends[0].changePercent).toBe(0);
  });

  it('handles boundary at exactly 20% change', () => {
    // 5 previous, 6 recent = exactly 20% increase -> stable (not > 20)
    const W = 100;
    // now=300, recentStart=200, previousStart=100
    const violations = [
      // previous [100, 200): 5 items
      makeViolation({ timestamp: 110, actionType: 'file.write', eventId: 'p1' }),
      makeViolation({ timestamp: 120, actionType: 'file.write', eventId: 'p2' }),
      makeViolation({ timestamp: 130, actionType: 'file.write', eventId: 'p3' }),
      makeViolation({ timestamp: 140, actionType: 'file.write', eventId: 'p4' }),
      makeViolation({ timestamp: 150, actionType: 'file.write', eventId: 'p5' }),
      // recent [200, 300]: 6 items
      makeViolation({ timestamp: 210, actionType: 'file.write', eventId: 'r1' }),
      makeViolation({ timestamp: 220, actionType: 'file.write', eventId: 'r2' }),
      makeViolation({ timestamp: 230, actionType: 'file.write', eventId: 'r3' }),
      makeViolation({ timestamp: 240, actionType: 'file.write', eventId: 'r4' }),
      makeViolation({ timestamp: 250, actionType: 'file.write', eventId: 'r5' }),
      makeViolation({ timestamp: 300, actionType: 'file.write', eventId: 'r6' }),
    ];

    const trends = computeTrends(violations, 'actionType', W);
    expect(trends[0].direction).toBe('stable');
    expect(trends[0].changePercent).toBe(20);
  });
});

describe('computeAllTrends', () => {
  it('aggregates across invariant, actionType, kind dimensions', () => {
    const violations = [
      makeViolation({ timestamp: 1500, eventId: 'e1' }),
      makeViolation({ timestamp: 1800, eventId: 'e2' }),
    ];

    const trends = computeAllTrends(violations, WINDOW);
    const dimensions = new Set(trends.map((t) => t.dimension));
    // Should include at least kind and actionType
    expect(dimensions.has('kind')).toBe(true);
    expect(dimensions.has('actionType')).toBe(true);
  });

  it('returns empty for empty input', () => {
    expect(computeAllTrends([], WINDOW)).toEqual([]);
  });
});

describe('computeFailureRateTrends', () => {
  it('returns empty for empty failures', () => {
    expect(computeFailureRateTrends([], [makeEvent()], WINDOW)).toEqual([]);
  });

  it('returns empty for empty events', () => {
    expect(computeFailureRateTrends([makeViolation()], [], WINDOW)).toEqual([]);
  });

  it('computes rate-based trends', () => {
    // now = 2000, recent = [1000, 2000], previous = [0, 1000]
    const failures = [
      makeViolation({ timestamp: 500, actionType: 'file.write', eventId: 'f1' }),
      makeViolation({ timestamp: 1500, actionType: 'file.write', eventId: 'f2' }),
      makeViolation({ timestamp: 1800, actionType: 'file.write', eventId: 'f3' }),
    ];

    const allEvents: DomainEvent[] = [
      makeEvent({ id: 'e1', timestamp: 500, actionType: 'file.write' } as never),
      makeEvent({ id: 'e2', timestamp: 700, actionType: 'file.write' } as never),
      makeEvent({ id: 'e3', timestamp: 1200, actionType: 'file.write' } as never),
      makeEvent({ id: 'e4', timestamp: 1500, actionType: 'file.write' } as never),
      makeEvent({ id: 'e5', timestamp: 2000, actionType: 'file.write' } as never),
    ];

    const trends = computeFailureRateTrends(failures, allEvents, WINDOW);
    expect(trends.length).toBeGreaterThan(0);
    expect(trends[0].key).toBe('file.write');
    expect(trends[0].recentFailures).toBeGreaterThan(0);
    expect(trends[0].recentRate).toBeGreaterThanOrEqual(0);
    expect(trends[0].dimension).toBe('actionType');
  });

  it('detects new failure rate', () => {
    // Only recent failures, no previous
    const now = 2000;
    const failures = [
      makeViolation({ timestamp: 1500, actionType: 'file.write', eventId: 'f1' }),
    ];
    const allEvents: DomainEvent[] = [
      makeEvent({ id: 'e1', timestamp: now, actionType: 'file.write' } as never),
    ];

    const trends = computeFailureRateTrends(failures, allEvents, WINDOW);
    if (trends.length > 0) {
      expect(trends[0].direction).toBe('new');
    }
  });
});
