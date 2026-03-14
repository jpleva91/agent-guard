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
import type { ViolationRecord, ClusterDimension } from '@red-codes/analytics';
import { clusterViolations, clusterByDimension, clusterFailures, normalizeErrorPattern } from '@red-codes/analytics';
import { computeTrends, computeAllTrends, computeFailureRateTrends } from '@red-codes/analytics';
import { toMarkdown, toJson, toTerminal } from '@red-codes/analytics';
import {
  aggregateViolations,
  aggregateFailures,
  categorizeFailure,
  listSessionIds,
  loadSessionEvents,
} from '@red-codes/analytics';
import { analyze } from '@red-codes/analytics';

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

  it('includes failure analysis in report', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(['s1.jsonl'] as unknown as ReturnType<
      typeof readdirSync
    >);
    vi.mocked(readFileSync).mockReturnValue(
      makeJsonlContent([
        {
          id: 'e1',
          kind: 'ActionFailed',
          timestamp: 1000,
          fingerprint: 'fp',
          actionType: 'shell.exec',
          target: 'npm test',
          error: 'Exit code 1',
        },
        {
          id: 'e2',
          kind: 'ActionFailed',
          timestamp: 2000,
          fingerprint: 'fp',
          actionType: 'shell.exec',
          target: 'npm build',
          error: 'Compilation error',
        },
        {
          id: 'e3',
          kind: 'ActionDenied',
          timestamp: 3000,
          fingerprint: 'fp',
          actionType: 'git.push',
          target: 'main',
          reason: 'Protected branch',
        },
        {
          id: 'e4',
          kind: 'ActionEscalated',
          timestamp: 4000,
          fingerprint: 'fp',
          actionType: 'file.write',
          target: 'src/kernel/kernel.ts',
          reason: 'Protected path',
        },
        {
          id: 'e5',
          kind: 'InvariantViolation',
          timestamp: 5000,
          fingerprint: 'fp',
          invariant: 'blast-radius',
          actionType: 'file.write',
          target: 'many-files',
          expected: 'under limit',
          actual: 'over limit',
        },
      ])
    );

    const report = analyze({ minClusterSize: 2 });
    expect(report.failureAnalysis).toBeDefined();
    expect(report.failureAnalysis!.totalFailures).toBe(5);
    expect(report.failureAnalysis!.failuresByKind.ActionFailed).toBe(2);
    expect(report.failureAnalysis!.failuresByKind.ActionDenied).toBe(1);
    expect(report.failureAnalysis!.failuresByKind.ActionEscalated).toBe(1);
    expect(report.failureAnalysis!.failuresByCategory.execution).toBe(2);
    expect(report.failureAnalysis!.failuresByCategory.denial).toBe(1);
    expect(report.failureAnalysis!.failuresByCategory.escalation).toBe(1);
    expect(report.failureAnalysis!.topPatterns.length).toBeGreaterThan(0);
  });
});

// --- Failure Aggregation Tests ---

describe('failure aggregation', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('categorizeFailure', () => {
    it('categorizes ActionFailed as execution', () => {
      expect(categorizeFailure('ActionFailed')).toBe('execution');
    });

    it('categorizes ActionEscalated as escalation', () => {
      expect(categorizeFailure('ActionEscalated')).toBe('escalation');
    });

    it('categorizes StageFailed as pipeline', () => {
      expect(categorizeFailure('StageFailed')).toBe('pipeline');
    });

    it('categorizes PipelineFailed as pipeline', () => {
      expect(categorizeFailure('PipelineFailed')).toBe('pipeline');
    });

    it('categorizes ActionDenied as denial', () => {
      expect(categorizeFailure('ActionDenied')).toBe('denial');
    });

    it('categorizes PolicyDenied as denial', () => {
      expect(categorizeFailure('PolicyDenied')).toBe('denial');
    });

    it('categorizes InvariantViolation as violation', () => {
      expect(categorizeFailure('InvariantViolation')).toBe('violation');
    });
  });

  describe('aggregateFailures', () => {
    it('captures all failure types including ActionFailed and ActionEscalated', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue(['s1.jsonl'] as unknown as ReturnType<
        typeof readdirSync
      >);
      vi.mocked(readFileSync).mockReturnValue(
        makeJsonlContent([
          {
            id: 'e1',
            kind: 'ActionFailed',
            timestamp: 1000,
            fingerprint: 'fp',
            actionType: 'shell.exec',
            target: 'npm test',
            error: 'Exit code 1',
          },
          {
            id: 'e2',
            kind: 'ActionEscalated',
            timestamp: 2000,
            fingerprint: 'fp',
            actionType: 'file.write',
            target: 'src/kernel/kernel.ts',
            reason: 'Protected path',
          },
          {
            id: 'e3',
            kind: 'ActionAllowed',
            timestamp: 3000,
            fingerprint: 'fp',
            actionType: 'file.read',
            target: 'README.md',
            capability: 'read',
          },
          {
            id: 'e4',
            kind: 'InvariantViolation',
            timestamp: 4000,
            fingerprint: 'fp',
            invariant: 'protected-branches',
            actionType: 'git.push',
            target: 'main',
            expected: 'no push',
            actual: 'push',
          },
          {
            id: 'e5',
            kind: 'StageFailed',
            timestamp: 5000,
            fingerprint: 'fp',
            runId: 'run-1',
            stageId: 'test',
            errors: ['Test suite failed'],
          },
        ])
      );

      const result = aggregateFailures();
      expect(result.sessionCount).toBe(1);
      // Should capture ActionFailed, ActionEscalated, InvariantViolation, StageFailed
      // but NOT ActionAllowed
      expect(result.failures).toHaveLength(4);
      expect(result.failures.map((f) => f.kind)).toContain('ActionFailed');
      expect(result.failures.map((f) => f.kind)).toContain('ActionEscalated');
      expect(result.failures.map((f) => f.kind)).toContain('InvariantViolation');
      expect(result.failures.map((f) => f.kind)).toContain('StageFailed');
      expect(result.allEvents).toHaveLength(5);
    });

    it('extracts error field as reason for ActionFailed events', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue(['s1.jsonl'] as unknown as ReturnType<
        typeof readdirSync
      >);
      vi.mocked(readFileSync).mockReturnValue(
        makeJsonlContent([
          {
            id: 'e1',
            kind: 'ActionFailed',
            timestamp: 1000,
            fingerprint: 'fp',
            actionType: 'shell.exec',
            target: 'npm test',
            error: 'Exit code 1',
          },
        ])
      );

      const result = aggregateFailures();
      expect(result.failures[0].reason).toBe('Exit code 1');
    });

    it('extracts failedStage as target for PipelineFailed events', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue(['s1.jsonl'] as unknown as ReturnType<
        typeof readdirSync
      >);
      vi.mocked(readFileSync).mockReturnValue(
        makeJsonlContent([
          {
            id: 'e1',
            kind: 'PipelineFailed',
            timestamp: 1000,
            fingerprint: 'fp',
            runId: 'run-1',
            failedStage: 'test',
            errors: ['Test failed'],
          },
        ])
      );

      const result = aggregateFailures();
      expect(result.failures[0].target).toBe('test');
      expect(result.failures[0].reason).toBe('Test failed');
    });

    it('handles empty event store', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const result = aggregateFailures();
      expect(result.failures).toEqual([]);
      expect(result.sessionCount).toBe(0);
    });
  });
});

// --- Failure Reporter Tests ---

describe('failure reporter', () => {
  const reportWithFailures = {
    generatedAt: 1700000000000,
    sessionsAnalyzed: 3,
    totalViolations: 5,
    violationsByKind: { InvariantViolation: 3, PolicyDenied: 2 },
    clusters: [],
    trends: [],
    topInferredCauses: [],
    runRiskScores: [],
    failureAnalysis: {
      totalFailures: 8,
      failuresByKind: { ActionFailed: 3, ActionDenied: 2, ActionEscalated: 1, StageFailed: 2 },
      failuresByCategory: { execution: 3, denial: 2, escalation: 1, pipeline: 2 },
      clusters: [],
      trends: [],
      rateTrends: [],
      topPatterns: [
        { pattern: 'ActionFailed:shell.exec', count: 3, category: 'execution' as const },
        { pattern: 'ActionDenied:git.push', count: 2, category: 'denial' as const },
      ],
    },
  };

  describe('toMarkdown with failure analysis', () => {
    it('includes failure analysis section', () => {
      const md = toMarkdown(reportWithFailures);
      expect(md).toContain('## Failure Analysis');
      expect(md).toContain('Total failures: 8');
      expect(md).toContain('### Failures by Category');
      expect(md).toContain('execution');
      expect(md).toContain('### Top Failure Patterns');
      expect(md).toContain('ActionFailed:shell.exec');
    });
  });

  describe('toTerminal with failure analysis', () => {
    it('includes failure analysis section', () => {
      const output = toTerminal(reportWithFailures);
      expect(output).toContain('Failure Analysis');
      expect(output).toContain('8 total');
      expect(output).toContain('execution: 3');
      expect(output).toContain('Top Failure Patterns');
      expect(output).toContain('ActionFailed:shell.exec');
    });
  });

  describe('toJson with failure analysis', () => {
    it('includes failure analysis in JSON output', () => {
      const json = toJson(reportWithFailures);
      const parsed = JSON.parse(json);
      expect(parsed.failureAnalysis).toBeDefined();
      expect(parsed.failureAnalysis.totalFailures).toBe(8);
      expect(parsed.failureAnalysis.failuresByCategory.execution).toBe(3);
    });
  });

  describe('reporter with rate trends', () => {
    const reportWithRateTrends = {
      ...reportWithFailures,
      failureAnalysis: {
        ...reportWithFailures.failureAnalysis,
        rateTrends: [
          {
            key: 'shell.exec',
            dimension: 'actionType' as ClusterDimension,
            recentRate: 0.5,
            previousRate: 0.2,
            recentFailures: 5,
            recentTotal: 10,
            previousFailures: 2,
            previousTotal: 10,
            direction: 'increasing' as const,
            changePercent: 150,
          },
        ],
      },
    };

    it('includes rate trends in markdown output', () => {
      const md = toMarkdown(reportWithRateTrends);
      expect(md).toContain('### Failure Rate Trends');
      expect(md).toContain('shell.exec');
      expect(md).toContain('50.0%');
      expect(md).toContain('20.0%');
    });

    it('includes rate trends in terminal output', () => {
      const output = toTerminal(reportWithRateTrends);
      expect(output).toContain('Failure Rate Trends');
      expect(output).toContain('shell.exec');
      expect(output).toContain('50.0%');
    });
  });
});

// --- Error Pattern Normalization Tests ---

describe('normalizeErrorPattern', () => {
  it('returns null for null input', () => {
    expect(normalizeErrorPattern(null)).toBeNull();
  });

  it('replaces Unix file paths with <path>', () => {
    const result = normalizeErrorPattern('Failed to read /usr/local/bin/config.json');
    expect(result).toContain('<path>');
    expect(result).not.toContain('/usr/local');
  });

  it('replaces Windows file paths with <path>', () => {
    const result = normalizeErrorPattern('Cannot open C:\\Users\\test\\file.ts');
    expect(result).toContain('<path>');
    expect(result).not.toContain('C:\\Users');
  });

  it('replaces UUIDs with <uuid>', () => {
    const result = normalizeErrorPattern('Session 550e8400-e29b-41d4-a716-446655440000 failed');
    expect(result).toContain('<uuid>');
    expect(result).not.toContain('550e8400');
  });

  it('replaces standalone numbers with <N>', () => {
    const result = normalizeErrorPattern('Exit code 137 after 3000ms');
    expect(result).toBe('Exit code <N> after <N>ms');
  });

  it('truncates long patterns', () => {
    const longMessage = 'Error: '.repeat(50);
    const result = normalizeErrorPattern(longMessage);
    expect(result!.length).toBeLessThanOrEqual(120);
    expect(result).toContain('...');
  });

  it('collapses whitespace', () => {
    const result = normalizeErrorPattern('Error:   multiple    spaces');
    expect(result).toBe('Error: multiple spaces');
  });
});

// --- Failure-Specific Clustering Tests ---

describe('clusterFailures', () => {
  const failures: ViolationRecord[] = [
    makeViolation({
      eventId: 'f1',
      kind: 'ActionFailed',
      actionType: 'shell.exec',
      reason: 'Exit code 1',
    }),
    makeViolation({
      eventId: 'f2',
      kind: 'ActionFailed',
      actionType: 'shell.exec',
      reason: 'Exit code 2',
    }),
    makeViolation({
      eventId: 'f3',
      kind: 'ActionDenied',
      actionType: 'git.push',
      reason: 'Protected branch',
    }),
    makeViolation({
      eventId: 'f4',
      kind: 'ActionDenied',
      actionType: 'git.push',
      reason: 'Protected branch',
    }),
    makeViolation({
      eventId: 'f5',
      kind: 'ActionEscalated',
      actionType: 'file.write',
      reason: 'Blast radius exceeded',
    }),
    makeViolation({
      eventId: 'f6',
      kind: 'ActionEscalated',
      actionType: 'file.write',
      reason: 'Blast radius exceeded',
    }),
  ];

  it('clusters by category dimension', () => {
    const clusters = clusterFailures(failures, 2);
    const categoryClusters = clusters.filter((c) => c.groupBy === 'category');
    expect(categoryClusters.length).toBeGreaterThanOrEqual(2);

    const executionCluster = categoryClusters.find((c) => c.key === 'execution');
    expect(executionCluster).toBeDefined();
    expect(executionCluster!.count).toBe(2);

    const denialCluster = categoryClusters.find((c) => c.key === 'denial');
    expect(denialCluster).toBeDefined();
    expect(denialCluster!.count).toBe(2);
  });

  it('clusters by errorPattern dimension', () => {
    const clusters = clusterFailures(failures, 2);
    const errorClusters = clusters.filter((c) => c.groupBy === 'errorPattern');
    expect(errorClusters.length).toBeGreaterThanOrEqual(1);

    // "Exit code 1" and "Exit code 2" should normalize to the same pattern
    const exitCodeCluster = errorClusters.find((c) => c.key.includes('Exit code'));
    expect(exitCodeCluster).toBeDefined();
    expect(exitCodeCluster!.count).toBe(2);
  });

  it('includes inferred cause for category clusters', () => {
    const clusters = clusterFailures(failures, 2);
    const executionCluster = clusters.find(
      (c) => c.groupBy === 'category' && c.key === 'execution'
    );
    expect(executionCluster?.inferredCause).toContain('Execution failures');
  });

  it('includes standard dimensions alongside failure-specific ones', () => {
    const clusters = clusterFailures(failures, 2);
    const dimensions = new Set(clusters.map((c) => c.groupBy));
    expect(dimensions.has('category')).toBe(true);
    expect(dimensions.has('actionType')).toBe(true);
  });
});

// --- Failure Rate Trend Tests ---

describe('computeFailureRateTrends', () => {
  const oneDay = 24 * 60 * 60 * 1000;
  const windowMs = 7 * oneDay;
  const now = Date.now();

  it('returns empty for no failures', () => {
    const trends = computeFailureRateTrends([], [], windowMs);
    expect(trends).toEqual([]);
  });

  it('detects increasing failure rate', () => {
    const allEvents = [
      // Previous window: 10 shell.exec events, 1 failure
      ...Array.from({ length: 10 }, (_, i) => ({
        id: `prev_${i}`,
        kind: 'ActionAllowed',
        timestamp: now - windowMs - oneDay * 3 + i,
        fingerprint: 'fp',
        actionType: 'shell.exec',
      })),
      // Recent window: 10 shell.exec events, 5 failures
      ...Array.from({ length: 10 }, (_, i) => ({
        id: `recent_${i}`,
        kind: 'ActionAllowed',
        timestamp: now - oneDay + i,
        fingerprint: 'fp',
        actionType: 'shell.exec',
      })),
    ];

    const failures: ViolationRecord[] = [
      // 1 failure in previous window
      makeViolation({
        eventId: 'pf1',
        kind: 'ActionFailed',
        actionType: 'shell.exec',
        timestamp: now - windowMs - oneDay * 3,
      }),
      // 5 failures in recent window
      ...Array.from({ length: 5 }, (_, i) =>
        makeViolation({
          eventId: `rf_${i}`,
          kind: 'ActionFailed',
          actionType: 'shell.exec',
          timestamp: now - oneDay + i,
        })
      ),
    ];

    const trends = computeFailureRateTrends(failures, allEvents, windowMs);
    const shellTrend = trends.find((t) => t.key === 'shell.exec');
    expect(shellTrend).toBeDefined();
    expect(shellTrend!.direction).toBe('increasing');
    expect(shellTrend!.recentRate).toBeGreaterThan(shellTrend!.previousRate);
  });

  it('detects new failure pattern', () => {
    const allEvents = [
      { id: 'e1', kind: 'ActionAllowed', timestamp: now, fingerprint: 'fp', actionType: 'git.push' },
    ];

    const failures: ViolationRecord[] = [
      makeViolation({
        eventId: 'f1',
        kind: 'ActionFailed',
        actionType: 'git.push',
        timestamp: now,
      }),
    ];

    const trends = computeFailureRateTrends(failures, allEvents, windowMs);
    const pushTrend = trends.find((t) => t.key === 'git.push');
    expect(pushTrend).toBeDefined();
    expect(pushTrend!.direction).toBe('new');
  });

  it('detects resolved failure pattern', () => {
    const allEvents = [
      // Previous and recent window events
      { id: 'p1', kind: 'ActionAllowed', timestamp: now - windowMs - oneDay * 3, fingerprint: 'fp', actionType: 'npm.install' },
      { id: 'r1', kind: 'ActionAllowed', timestamp: now, fingerprint: 'fp', actionType: 'npm.install' },
    ];

    const failures: ViolationRecord[] = [
      // Only in previous window
      makeViolation({
        eventId: 'f1',
        kind: 'ActionFailed',
        actionType: 'npm.install',
        timestamp: now - windowMs - oneDay * 3,
      }),
    ];

    const trends = computeFailureRateTrends(failures, allEvents, windowMs);
    const npmTrend = trends.find((t) => t.key === 'npm.install');
    expect(npmTrend).toBeDefined();
    expect(npmTrend!.direction).toBe('resolved');
  });

  it('returns stable when rate change is exactly +20% (strict > threshold)', () => {
    // Validates the strict inequality: rateChange of 20.0 is NOT > 20, so direction = 'stable'
    // even though changePercent (Math.rounded) will display as 20%.
    const pBase = now - windowMs * 2;
    const rBase = now - windowMs;
    const mkEvt = (id: string, ts: number) => ({
      id,
      kind: 'ActionAllowed' as const,
      timestamp: ts,
      fingerprint: 'fp',
      actionType: 'file.write',
    });
    // 10 events in each window; last event timestamp = now so computed now aligns
    const allEvents = [
      ...Array.from({ length: 10 }, (_, i) => mkEvt(`p${i}`, pBase + i * 1000)),
      ...Array.from({ length: 9 }, (_, i) => mkEvt(`r${i}`, rBase + i * 1000)),
      mkEvt('r9', now),
    ];
    // prev: 5/10 = 0.5 rate; recent: 6/10 = 0.6 rate → rateChange = 20.0 (not > 20) → stable
    const failures: ViolationRecord[] = [
      ...Array.from({ length: 5 }, (_, i) =>
        makeViolation({ eventId: `pf${i}`, actionType: 'file.write', timestamp: pBase + i * 1000 })
      ),
      ...Array.from({ length: 6 }, (_, i) =>
        makeViolation({ eventId: `rf${i}`, actionType: 'file.write', timestamp: rBase + i * 1000 })
      ),
    ];
    const result = computeFailureRateTrends(failures, allEvents, windowMs);
    const trend = result.find((t) => t.key === 'file.write');
    expect(trend).toBeDefined();
    expect(trend!.direction).toBe('stable');
    expect(trend!.changePercent).toBe(20);
  });

  it('returns stable when rate change is exactly -20% (strict < threshold)', () => {
    // Validates the strict inequality: rateChange of -20.0 is NOT < -20, so direction = 'stable'.
    const pBase = now - windowMs * 2;
    const rBase = now - windowMs;
    const mkEvt = (id: string, ts: number) => ({
      id,
      kind: 'ActionAllowed' as const,
      timestamp: ts,
      fingerprint: 'fp',
      actionType: 'file.delete',
    });
    const allEvents = [
      ...Array.from({ length: 10 }, (_, i) => mkEvt(`p${i}`, pBase + i * 1000)),
      ...Array.from({ length: 9 }, (_, i) => mkEvt(`r${i}`, rBase + i * 1000)),
      mkEvt('r9', now),
    ];
    // prev: 5/10 = 0.5 rate; recent: 4/10 = 0.4 rate → rateChange = -20.0 (not < -20) → stable
    const failures: ViolationRecord[] = [
      ...Array.from({ length: 5 }, (_, i) =>
        makeViolation({
          eventId: `pf${i}`,
          actionType: 'file.delete',
          timestamp: pBase + i * 1000,
        })
      ),
      ...Array.from({ length: 4 }, (_, i) =>
        makeViolation({
          eventId: `rf${i}`,
          actionType: 'file.delete',
          timestamp: rBase + i * 1000,
        })
      ),
    ];
    const result = computeFailureRateTrends(failures, allEvents, windowMs);
    const trend = result.find((t) => t.key === 'file.delete');
    expect(trend).toBeDefined();
    expect(trend!.direction).toBe('stable');
    expect(trend!.changePercent).toBe(-20);
  });
});
