// Tests for the analytics module — violation pattern detection,
// clustering, trends, and reporting.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock node:fs before importing modules that use it
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  mkdirSync: vi.fn(),
  appendFileSync: vi.fn(),
}));

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import type { ViolationRecord, ClusterDimension } from '../../src/analytics/types.js';
import { clusterViolations, clusterByDimension } from '../../src/analytics/cluster.js';
import { computeTrends, computeAllTrends } from '../../src/analytics/trends.js';
import { toMarkdown, toJson, toTerminal } from '../../src/analytics/reporter.js';
import {
  aggregateViolations,
  listSessionIds,
  loadSessionEvents,
} from '../../src/analytics/aggregator.js';
import { analyze } from '../../src/analytics/engine.js';

// --- Helpers ---

function makeViolation(overrides: Partial<ViolationRecord> = {}): ViolationRecord {
  return {
    sessionId: 'session-1',
    eventId: 'evt_1',
    kind: 'InvariantViolation',
    timestamp: 1700000000000,
    actionType: 'git.push',
    target: 'src/main.ts',
    reason: 'Protected branch',
    invariantId: 'protected-branches',
    metadata: {},
    ...overrides,
  };
}

function makeJsonlContent(events: Record<string, unknown>[]): string {
  return events.map((e) => JSON.stringify(e)).join('\n');
}

// --- Aggregator Tests ---

describe('aggregator', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('listSessionIds', () => {
    it('returns empty array when events directory does not exist', () => {
      vi.mocked(existsSync).mockReturnValue(false);
      expect(listSessionIds()).toEqual([]);
    });

    it('returns sorted session IDs from JSONL files', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue([
        'run_b.jsonl',
        'run_a.jsonl',
        'readme.md',
      ] as unknown as ReturnType<typeof readdirSync>);
      expect(listSessionIds()).toEqual(['run_a', 'run_b']);
    });
  });

  describe('loadSessionEvents', () => {
    it('returns empty array when file does not exist', () => {
      vi.mocked(existsSync).mockReturnValue(false);
      expect(loadSessionEvents('missing')).toEqual([]);
    });

    it('parses JSONL events from file', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(
        makeJsonlContent([
          { id: 'evt_1', kind: 'ActionAllowed', timestamp: 1000, fingerprint: 'fp' },
          { id: 'evt_2', kind: 'InvariantViolation', timestamp: 2000, fingerprint: 'fp' },
        ])
      );

      const events = loadSessionEvents('run_1');
      expect(events).toHaveLength(2);
      expect(events[0].kind).toBe('ActionAllowed');
      expect(events[1].kind).toBe('InvariantViolation');
    });

    it('skips malformed lines', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(
        '{"id":"e1","kind":"ActionAllowed","timestamp":1,"fingerprint":"fp"}\n{invalid\n'
      );

      const events = loadSessionEvents('run_1');
      expect(events).toHaveLength(1);
    });
  });

  describe('aggregateViolations', () => {
    it('extracts violation records from multiple sessions', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue(['s1.jsonl', 's2.jsonl'] as unknown as ReturnType<
        typeof readdirSync
      >);

      // First call for s1, second for s2
      vi.mocked(readFileSync)
        .mockReturnValueOnce(
          makeJsonlContent([
            {
              id: 'e1',
              kind: 'InvariantViolation',
              timestamp: 1000,
              fingerprint: 'fp',
              invariant: 'protected-branches',
              actionType: 'git.push',
              target: 'main',
              expected: 'no push',
              actual: 'push',
            },
            {
              id: 'e2',
              kind: 'ActionAllowed',
              timestamp: 2000,
              fingerprint: 'fp',
              actionType: 'file.read',
              target: 'test.ts',
              capability: 'read',
            },
          ])
        )
        .mockReturnValueOnce(
          makeJsonlContent([
            {
              id: 'e3',
              kind: 'PolicyDenied',
              timestamp: 3000,
              fingerprint: 'fp',
              policy: 'strict',
              action: 'shell.exec',
              reason: 'Denied by policy',
            },
          ])
        );

      const result = aggregateViolations();
      expect(result.sessionCount).toBe(2);
      expect(result.violations).toHaveLength(2);
      expect(result.violations[0].kind).toBe('InvariantViolation');
      expect(result.violations[1].kind).toBe('PolicyDenied');
      expect(result.allEvents).toHaveLength(3);
    });
  });
});

// --- Cluster Tests ---

describe('cluster', () => {
  const violations: ViolationRecord[] = [
    makeViolation({
      eventId: 'e1',
      sessionId: 's1',
      invariantId: 'protected-branches',
      actionType: 'git.push',
    }),
    makeViolation({
      eventId: 'e2',
      sessionId: 's1',
      invariantId: 'protected-branches',
      actionType: 'git.push',
    }),
    makeViolation({
      eventId: 'e3',
      sessionId: 's2',
      invariantId: 'protected-branches',
      actionType: 'git.push',
    }),
    makeViolation({
      eventId: 'e4',
      sessionId: 's1',
      invariantId: 'blast-radius',
      actionType: 'file.write',
      target: 'src/big.ts',
    }),
    makeViolation({
      eventId: 'e5',
      sessionId: 's2',
      invariantId: 'blast-radius',
      actionType: 'file.write',
      target: 'src/big.ts',
    }),
    makeViolation({
      eventId: 'e6',
      sessionId: 's1',
      kind: 'PolicyDenied',
      invariantId: undefined,
      actionType: 'shell.exec',
      reason: 'Not allowed',
    }),
  ];

  describe('clusterByDimension', () => {
    it('clusters by invariant', () => {
      const clusters = clusterByDimension(violations, 'invariant');
      expect(clusters.length).toBeGreaterThanOrEqual(2);

      const protectedCluster = clusters.find((c) => c.key === 'protected-branches');
      expect(protectedCluster).toBeDefined();
      expect(protectedCluster!.count).toBe(3);
      expect(protectedCluster!.sessionCount).toBe(2);
    });

    it('clusters by actionType', () => {
      const clusters = clusterByDimension(violations, 'actionType');
      const pushCluster = clusters.find((c) => c.key === 'git.push');
      expect(pushCluster).toBeDefined();
      expect(pushCluster!.count).toBe(3);
    });

    it('clusters by target', () => {
      const clusters = clusterByDimension(violations, 'target');
      const targetCluster = clusters.find((c) => c.key === 'src/big.ts');
      expect(targetCluster).toBeDefined();
      expect(targetCluster!.count).toBe(2);
    });

    it('respects minSize threshold', () => {
      const clusters = clusterByDimension(violations, 'invariant', 3);
      expect(clusters.length).toBe(1); // Only protected-branches has 3
      expect(clusters[0].key).toBe('protected-branches');
    });

    it('sorts clusters by count descending', () => {
      const clusters = clusterByDimension(violations, 'invariant');
      for (let i = 1; i < clusters.length; i++) {
        expect(clusters[i].count).toBeLessThanOrEqual(clusters[i - 1].count);
      }
    });
  });

  describe('clusterViolations (all dimensions)', () => {
    it('returns clusters across all dimensions', () => {
      const clusters = clusterViolations(violations);
      expect(clusters.length).toBeGreaterThan(0);

      const dimensions = new Set(clusters.map((c) => c.groupBy));
      expect(dimensions.size).toBeGreaterThan(1);
    });

    it('includes inferred causes for known invariants', () => {
      const clusters = clusterViolations(violations);
      const protectedCluster = clusters.find(
        (c) => c.groupBy === 'invariant' && c.key === 'protected-branches'
      );
      expect(protectedCluster?.inferredCause).toBeDefined();
    });
  });
});

// --- Trend Tests ---

describe('trends', () => {
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  const windowMs = 7 * oneDay;

  describe('computeTrends', () => {
    it('detects increasing trend', () => {
      // splitByWindow uses max(timestamps) as "now", so we use a fixed reference
      // and place violations clearly within the recent/previous windows.
      const ref = now;
      const violations: ViolationRecord[] = [
        // 1 in previous window (well inside the boundary)
        makeViolation({ timestamp: ref - windowMs - oneDay * 3, invariantId: 'blast-radius' }),
        // 3 in recent window + a reference point at "now" to anchor the max
        makeViolation({ timestamp: ref, invariantId: 'blast-radius' }),
        makeViolation({ timestamp: ref - oneDay, invariantId: 'blast-radius' }),
        makeViolation({ timestamp: ref - oneDay * 2, invariantId: 'blast-radius' }),
      ];

      const trends = computeTrends(violations, 'invariant', windowMs);
      const blastTrend = trends.find((t) => t.key === 'blast-radius');
      expect(blastTrend).toBeDefined();
      expect(blastTrend!.direction).toBe('increasing');
      expect(blastTrend!.recentCount).toBe(3);
      expect(blastTrend!.previousCount).toBe(1);
    });

    it('detects decreasing trend', () => {
      const ref = now;
      const violations: ViolationRecord[] = [
        // 3 in previous window (well inside)
        makeViolation({ timestamp: ref - windowMs - oneDay * 2, invariantId: 'secret-exposure' }),
        makeViolation({ timestamp: ref - windowMs - oneDay * 3, invariantId: 'secret-exposure' }),
        makeViolation({ timestamp: ref - windowMs - oneDay * 4, invariantId: 'secret-exposure' }),
        // 1 in recent window + anchor at "now"
        makeViolation({ timestamp: ref, invariantId: 'secret-exposure' }),
      ];

      const trends = computeTrends(violations, 'invariant', windowMs);
      const trend = trends.find((t) => t.key === 'secret-exposure');
      expect(trend).toBeDefined();
      expect(trend!.direction).toBe('decreasing');
    });

    it('detects new pattern', () => {
      const violations: ViolationRecord[] = [
        // Only in recent window
        makeViolation({ timestamp: now, invariantId: 'lockfile-integrity' }),
      ];

      const trends = computeTrends(violations, 'invariant', windowMs);
      const trend = trends.find((t) => t.key === 'lockfile-integrity');
      expect(trend).toBeDefined();
      expect(trend!.direction).toBe('new');
    });

    it('detects resolved pattern', () => {
      const ref = now;
      const violations: ViolationRecord[] = [
        // One in previous window, one at "now" for a different invariant to anchor max
        makeViolation({ timestamp: ref - windowMs - oneDay * 3, invariantId: 'no-force-push' }),
        makeViolation({ timestamp: ref, invariantId: 'other-invariant' }),
      ];

      const trends = computeTrends(violations, 'invariant', windowMs);
      const trend = trends.find((t) => t.key === 'no-force-push');
      expect(trend).toBeDefined();
      expect(trend!.direction).toBe('resolved');
    });

    it('detects stable pattern', () => {
      const ref = now;
      const violations: ViolationRecord[] = [
        // 1 in previous window (well inside)
        makeViolation({ timestamp: ref - windowMs - oneDay * 3, invariantId: 'test-before-push' }),
        // 1 in recent window at "now"
        makeViolation({ timestamp: ref, invariantId: 'test-before-push' }),
      ];

      const trends = computeTrends(violations, 'invariant', windowMs);
      const trend = trends.find((t) => t.key === 'test-before-push');
      expect(trend).toBeDefined();
      expect(trend!.direction).toBe('stable');
    });
  });

  describe('computeAllTrends', () => {
    it('computes trends across multiple dimensions', () => {
      const violations: ViolationRecord[] = [
        makeViolation({
          timestamp: now - oneDay,
          invariantId: 'blast-radius',
          actionType: 'file.write',
        }),
        makeViolation({
          timestamp: now - oneDay * 2,
          invariantId: 'blast-radius',
          actionType: 'file.write',
        }),
      ];

      const trends = computeAllTrends(violations, windowMs);
      const dimensions = new Set(trends.map((t) => t.dimension));
      expect(dimensions.size).toBeGreaterThanOrEqual(1);
    });
  });
});

// --- Reporter Tests ---

describe('reporter', () => {
  const report = {
    generatedAt: 1700000000000,
    sessionsAnalyzed: 5,
    totalViolations: 10,
    violationsByKind: {
      InvariantViolation: 6,
      PolicyDenied: 3,
      ActionDenied: 1,
    },
    clusters: [
      {
        id: 'c1',
        label: 'Invariant: protected-branches',
        groupBy: 'invariant' as ClusterDimension,
        key: 'protected-branches',
        violations: [],
        count: 5,
        firstSeen: 1699900000000,
        lastSeen: 1700000000000,
        sessionCount: 3,
        inferredCause: 'Agent frequently attempts direct pushes to protected branches',
      },
    ],
    trends: [
      {
        key: 'blast-radius',
        dimension: 'invariant' as ClusterDimension,
        direction: 'increasing' as const,
        recentCount: 4,
        previousCount: 1,
        changePercent: 300,
      },
    ],
    topInferredCauses: [
      { cause: 'Agent frequently attempts direct pushes to protected branches', count: 2 },
    ],
    runRiskScores: [
      {
        sessionId: 'session-abc123',
        score: 42.5,
        riskLevel: 'medium' as const,
        factors: [
          {
            dimension: 'violations' as const,
            rawValue: 60,
            normalizedScore: 60,
            weight: 0.35,
            details: 'InvariantViolation: 2',
          },
          {
            dimension: 'escalation' as const,
            rawValue: 1,
            normalizedScore: 33.33,
            weight: 0.25,
            details: 'peak: ELEVATED',
          },
          {
            dimension: 'blastRadius' as const,
            rawValue: 20,
            normalizedScore: 20,
            weight: 0.25,
            details: '5 files affected',
          },
          {
            dimension: 'operations' as const,
            rawValue: 30,
            normalizedScore: 30,
            weight: 0.15,
            details: 'git.push: 2',
          },
        ],
        totalActions: 10,
        totalDenials: 3,
        totalViolations: 2,
        peakEscalation: 1,
      },
    ],
  };

  describe('toMarkdown', () => {
    it('produces valid markdown with all sections', () => {
      const md = toMarkdown(report);
      expect(md).toContain('# Violation Pattern Analysis');
      expect(md).toContain('Sessions analyzed: 5');
      expect(md).toContain('Total violations: 10');
      expect(md).toContain('## Violations by Kind');
      expect(md).toContain('InvariantViolation');
      expect(md).toContain('## Violation Clusters');
      expect(md).toContain('protected-branches');
      expect(md).toContain('## Trends');
      expect(md).toContain('blast-radius');
      expect(md).toContain('## Top Inferred Causes');
      expect(md).toContain('## Run Risk Scores');
      expect(md).toContain('session-abc1');
      expect(md).toContain('42.5');
      expect(md).toContain('medium');
    });
  });

  describe('toJson', () => {
    it('produces valid JSON', () => {
      const json = toJson(report);
      const parsed = JSON.parse(json);
      expect(parsed.sessionsAnalyzed).toBe(5);
      expect(parsed.totalViolations).toBe(10);
      expect(parsed.clusters).toHaveLength(1);
    });
  });

  describe('toTerminal', () => {
    it('produces readable terminal output', () => {
      const output = toTerminal(report);
      expect(output).toContain('Violation Pattern Analysis');
      expect(output).toContain('Sessions: 5');
      expect(output).toContain('Violations: 10');
      expect(output).toContain('Clusters');
      expect(output).toContain('Trends');
      expect(output).toContain('Run Risk Scores');
      expect(output).toContain('session-abc1');
    });
  });
});

// --- Engine Tests ---

describe('engine', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('produces a complete report', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(['s1.jsonl'] as unknown as ReturnType<
      typeof readdirSync
    >);
    vi.mocked(readFileSync).mockReturnValue(
      makeJsonlContent([
        {
          id: 'e1',
          kind: 'InvariantViolation',
          timestamp: 1000,
          fingerprint: 'fp',
          invariant: 'protected-branches',
          actionType: 'git.push',
          target: 'main',
          expected: 'no push',
          actual: 'push',
        },
        {
          id: 'e2',
          kind: 'InvariantViolation',
          timestamp: 2000,
          fingerprint: 'fp',
          invariant: 'protected-branches',
          actionType: 'git.push',
          target: 'main',
          expected: 'no push',
          actual: 'push',
        },
        {
          id: 'e3',
          kind: 'PolicyDenied',
          timestamp: 3000,
          fingerprint: 'fp',
          policy: 'strict',
          action: 'shell.exec',
          reason: 'Denied',
        },
      ])
    );

    const report = analyze({ minClusterSize: 2 });
    expect(report.sessionsAnalyzed).toBe(1);
    expect(report.totalViolations).toBe(3);
    expect(report.violationsByKind.InvariantViolation).toBe(2);
    expect(report.violationsByKind.PolicyDenied).toBe(1);
    expect(report.clusters.length).toBeGreaterThan(0);
    expect(report.runRiskScores).toHaveLength(1);
    expect(report.runRiskScores[0].sessionId).toBe('s1');
    expect(report.runRiskScores[0].score).toBeGreaterThan(0);
    expect(report.runRiskScores[0].totalViolations).toBe(3);
  });

  it('handles empty event store', () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const report = analyze();
    expect(report.sessionsAnalyzed).toBe(0);
    expect(report.totalViolations).toBe(0);
    expect(report.clusters).toEqual([]);
    expect(report.trends).toEqual([]);
    expect(report.runRiskScores).toEqual([]);
  });
});
