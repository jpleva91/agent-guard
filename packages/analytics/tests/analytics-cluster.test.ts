import { describe, it, expect } from 'vitest';
import {
  normalizeErrorPattern,
  clusterByDimension,
  clusterViolations,
  clusterFailures,
} from '@red-codes/analytics';
import type { ViolationRecord } from '@red-codes/analytics';

function makeViolation(overrides: Partial<ViolationRecord> = {}): ViolationRecord {
  return {
    sessionId: 'session-1',
    eventId: 'evt-1',
    kind: 'PolicyDenied',
    timestamp: 1000,
    actionType: 'file.write',
    target: 'src/index.ts',
    reason: 'Blocked by policy',
    invariantId: undefined,
    ...overrides,
  };
}

describe('normalizeErrorPattern', () => {
  it('returns null for null input', () => {
    expect(normalizeErrorPattern(null)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(normalizeErrorPattern('')).toBeNull();
  });

  it('replaces Unix file paths with <path>', () => {
    const result = normalizeErrorPattern('Failed to read /home/user/project/file.ts');
    expect(result).toContain('<path>');
    expect(result).not.toContain('/home/user');
  });

  it('replaces Windows file paths with <path>', () => {
    const result = normalizeErrorPattern('Failed at C:\\Users\\dev\\project\\file.ts');
    expect(result).toContain('<path>');
  });

  it('replaces UUIDs with <uuid>', () => {
    const result = normalizeErrorPattern(
      'Error for session 550e8400-e29b-41d4-a716-446655440000'
    );
    expect(result).toContain('<uuid>');
    expect(result).not.toContain('550e8400');
  });

  it('replaces hex hashes with <hash>', () => {
    const result = normalizeErrorPattern('Commit abc1234def not found');
    expect(result).toContain('<hash>');
  });

  it('replaces numbers with <N>', () => {
    const result = normalizeErrorPattern('Timeout after 5000ms, 3 retries');
    expect(result).toContain('<N>ms');
    expect(result).toContain('<N> retries');
  });

  it('collapses whitespace', () => {
    const result = normalizeErrorPattern('Error   with   spaces');
    expect(result).toBe('Error with spaces');
  });

  it('truncates long patterns to 120 characters', () => {
    const long = 'x'.repeat(200);
    const result = normalizeErrorPattern(long)!;
    expect(result.length).toBe(120);
    expect(result.endsWith('...')).toBe(true);
  });
});

describe('clusterByDimension', () => {
  it('clusters violations by actionType', () => {
    const violations = [
      makeViolation({ actionType: 'file.write', eventId: 'e1' }),
      makeViolation({ actionType: 'file.write', eventId: 'e2' }),
      makeViolation({ actionType: 'git.push', eventId: 'e3' }),
    ];

    const clusters = clusterByDimension(violations, 'actionType');
    expect(clusters).toHaveLength(1); // Only file.write has 2+ (minSize=2)
    expect(clusters[0].key).toBe('file.write');
    expect(clusters[0].count).toBe(2);
    expect(clusters[0].label).toBe('Action: file.write');
  });

  it('clusters violations by invariant', () => {
    const violations = [
      makeViolation({ invariantId: 'secret-exposure', eventId: 'e1' }),
      makeViolation({ invariantId: 'secret-exposure', eventId: 'e2' }),
    ];

    const clusters = clusterByDimension(violations, 'invariant');
    expect(clusters).toHaveLength(1);
    expect(clusters[0].key).toBe('secret-exposure');
    expect(clusters[0].inferredCause).toContain('.gitignore');
  });

  it('respects minSize parameter', () => {
    const violations = [
      makeViolation({ actionType: 'file.write', eventId: 'e1' }),
      makeViolation({ actionType: 'file.write', eventId: 'e2' }),
    ];

    expect(clusterByDimension(violations, 'actionType', 3)).toHaveLength(0);
    expect(clusterByDimension(violations, 'actionType', 2)).toHaveLength(1);
  });

  it('computes firstSeen and lastSeen correctly', () => {
    const violations = [
      makeViolation({ timestamp: 100, eventId: 'e1' }),
      makeViolation({ timestamp: 300, eventId: 'e2' }),
      makeViolation({ timestamp: 200, eventId: 'e3' }),
    ];

    const clusters = clusterByDimension(violations, 'actionType');
    expect(clusters[0].firstSeen).toBe(100);
    expect(clusters[0].lastSeen).toBe(300);
  });

  it('computes sessionCount correctly', () => {
    const violations = [
      makeViolation({ sessionId: 's1', eventId: 'e1' }),
      makeViolation({ sessionId: 's2', eventId: 'e2' }),
      makeViolation({ sessionId: 's1', eventId: 'e3' }),
    ];

    const clusters = clusterByDimension(violations, 'actionType');
    expect(clusters[0].sessionCount).toBe(2);
  });

  it('sorts clusters by count descending', () => {
    const violations = [
      makeViolation({ actionType: 'file.write', eventId: 'e1' }),
      makeViolation({ actionType: 'file.write', eventId: 'e2' }),
      makeViolation({ actionType: 'file.write', eventId: 'e3' }),
      makeViolation({ actionType: 'git.push', eventId: 'e4' }),
      makeViolation({ actionType: 'git.push', eventId: 'e5' }),
    ];

    const clusters = clusterByDimension(violations, 'actionType');
    expect(clusters[0].count).toBeGreaterThanOrEqual(clusters[1].count);
  });

  it('skips violations with null key', () => {
    const violations = [
      makeViolation({ actionType: undefined, eventId: 'e1' }),
      makeViolation({ actionType: undefined, eventId: 'e2' }),
    ];

    const clusters = clusterByDimension(violations, 'actionType');
    expect(clusters).toHaveLength(0);
  });
});

describe('inferCause via clusters', () => {
  it('infers cause for known invariants', () => {
    const knownInvariants = [
      { id: 'protected-branches', expected: 'direct pushes' },
      { id: 'blast-radius', expected: 'too many files' },
      { id: 'test-before-push', expected: 'test-first' },
      { id: 'no-force-push', expected: 'git workflow' },
      { id: 'lockfile-integrity', expected: 'manual edits' },
    ];

    for (const { id, expected } of knownInvariants) {
      const violations = [
        makeViolation({ invariantId: id, eventId: 'e1' }),
        makeViolation({ invariantId: id, eventId: 'e2' }),
      ];
      const clusters = clusterByDimension(violations, 'invariant');
      expect(clusters[0].inferredCause).toContain(expected);
    }
  });

  it('infers cause for unknown invariant', () => {
    const violations = [
      makeViolation({ invariantId: 'custom-inv', eventId: 'e1' }),
      makeViolation({ invariantId: 'custom-inv', eventId: 'e2' }),
    ];
    const clusters = clusterByDimension(violations, 'invariant');
    expect(clusters[0].inferredCause).toContain('custom-inv');
    expect(clusters[0].inferredCause).toContain('2 times');
  });

  it('infers cause for actionType with PolicyDenied', () => {
    const violations = [
      makeViolation({ kind: 'PolicyDenied', actionType: 'shell.exec', eventId: 'e1' }),
      makeViolation({ kind: 'PolicyDenied', actionType: 'shell.exec', eventId: 'e2' }),
    ];
    const clusters = clusterByDimension(violations, 'actionType');
    expect(clusters[0].inferredCause).toContain('repeatedly denied by policy');
  });

  it('infers cause for target across multiple sessions', () => {
    const violations = [
      makeViolation({ target: '.env', sessionId: 's1', eventId: 'e1' }),
      makeViolation({ target: '.env', sessionId: 's2', eventId: 'e2' }),
    ];
    const clusters = clusterByDimension(violations, 'target');
    expect(clusters[0].inferredCause).toContain('repeated violation target');
    expect(clusters[0].inferredCause).toContain('2 sessions');
  });

  it('infers cause for target in single session', () => {
    const violations = [
      makeViolation({ target: '.env', sessionId: 's1', eventId: 'e1' }),
      makeViolation({ target: '.env', sessionId: 's1', eventId: 'e2' }),
    ];
    const clusters = clusterByDimension(violations, 'target');
    expect(clusters[0].inferredCause).toContain('single session');
  });

  it('infers cause for ActionDenied with single reason', () => {
    const violations = [
      makeViolation({ kind: 'ActionDenied', reason: 'Not authorized', eventId: 'e1' }),
      makeViolation({ kind: 'ActionDenied', reason: 'Not authorized', eventId: 'e2' }),
    ];
    const clusters = clusterByDimension(violations, 'kind');
    expect(clusters[0].inferredCause).toContain('same reason');
  });
});

describe('clusterViolations', () => {
  it('clusters across standard dimensions', () => {
    const violations = [
      makeViolation({ eventId: 'e1' }),
      makeViolation({ eventId: 'e2' }),
    ];

    const clusters = clusterViolations(violations);
    expect(clusters.length).toBeGreaterThan(0);
  });

  it('returns empty for single violation', () => {
    const clusters = clusterViolations([makeViolation()], 2);
    expect(clusters).toHaveLength(0);
  });
});

describe('clusterFailures', () => {
  it('includes category and errorPattern dimensions', () => {
    const violations = [
      makeViolation({ kind: 'ActionDenied', reason: 'Error at /tmp/file.txt', eventId: 'e1' }),
      makeViolation({ kind: 'ActionDenied', reason: 'Error at /tmp/other.txt', eventId: 'e2' }),
    ];

    const clusters = clusterFailures(violations);
    // Should have clusters from category and errorPattern dimensions too
    expect(clusters.length).toBeGreaterThan(0);
  });
});
