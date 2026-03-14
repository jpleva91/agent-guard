import { describe, it, expect } from 'vitest';
import {
  generateSuggestions,
  toYaml,
  toJsonSuggestions,
  toTerminalSuggestions,
  toMarkdownSuggestions,
} from '@red-codes/analytics';
import type {
  AnalyticsReport,
  ViolationCluster,
  ViolationRecord,
} from '@red-codes/analytics';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeViolation(overrides: Partial<ViolationRecord> = {}): ViolationRecord {
  return {
    sessionId: 'session-1',
    eventId: 'evt-1',
    kind: 'ActionDenied',
    timestamp: Date.now(),
    actionType: 'git.push',
    target: 'origin/main',
    reason: 'Direct push to protected branch',
    ...overrides,
  };
}

function makeCluster(overrides: Partial<ViolationCluster> = {}): ViolationCluster {
  const violations = overrides.violations ?? [
    makeViolation({ sessionId: 'session-1' }),
    makeViolation({ sessionId: 'session-2' }),
    makeViolation({ sessionId: 'session-3' }),
  ];
  return {
    id: 'cluster-1',
    label: 'Action: git.push',
    groupBy: 'actionType',
    key: 'git.push',
    violations,
    count: violations.length,
    firstSeen: Date.now() - 86400000,
    lastSeen: Date.now(),
    sessionCount: new Set(violations.map((v) => v.sessionId)).size,
    inferredCause: 'Agent frequently attempts direct pushes to protected branches',
    ...overrides,
  };
}

function makeReport(overrides: Partial<AnalyticsReport> = {}): AnalyticsReport {
  return {
    generatedAt: Date.now(),
    sessionsAnalyzed: 5,
    totalViolations: 10,
    violationsByKind: { ActionDenied: 8, PolicyDenied: 2 },
    clusters: [makeCluster()],
    trends: [],
    topInferredCauses: [],
    runRiskScores: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generateSuggestions', () => {
  it('generates suggestions from action-type clusters', () => {
    const report = makeReport();
    const result = generateSuggestions(report);

    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.sessionsAnalyzed).toBe(5);
    expect(result.totalViolations).toBe(10);

    const first = result.suggestions[0];
    expect(first.action).toBe('git.push');
    expect(first.effect).toBe('deny');
    expect(first.evidence.violationCount).toBe(3);
    expect(first.evidence.sessionCount).toBe(3);
  });

  it('generates suggestions from target clusters', () => {
    const violations = [
      makeViolation({
        sessionId: 's1',
        kind: 'PolicyDenied',
        actionType: 'file.write',
        target: '.env',
      }),
      makeViolation({
        sessionId: 's2',
        kind: 'PolicyDenied',
        actionType: 'file.write',
        target: '.env',
      }),
      makeViolation({
        sessionId: 's3',
        kind: 'PolicyDenied',
        actionType: 'file.write',
        target: '.env',
      }),
    ];
    const cluster = makeCluster({
      groupBy: 'target',
      key: '.env',
      label: 'Target: .env',
      violations,
    });
    const report = makeReport({ clusters: [cluster] });
    const result = generateSuggestions(report);

    expect(result.suggestions.length).toBe(1);
    expect(result.suggestions[0].target).toBe('.env');
    expect(result.suggestions[0].action).toBe('file.write');
  });

  it('generates suggestions from invariant clusters', () => {
    const violations = [
      makeViolation({
        sessionId: 's1',
        kind: 'InvariantViolation',
        invariantId: 'no-force-push',
      }),
      makeViolation({
        sessionId: 's2',
        kind: 'InvariantViolation',
        invariantId: 'no-force-push',
      }),
    ];
    const cluster = makeCluster({
      groupBy: 'invariant',
      key: 'no-force-push',
      label: 'Invariant: no-force-push',
      violations,
    });
    const report = makeReport({ clusters: [cluster] });
    const result = generateSuggestions(report);

    expect(result.suggestions.length).toBe(1);
    expect(result.suggestions[0].action).toBe('git.force-push');
    expect(result.suggestions[0].effect).toBe('deny');
  });

  it('returns empty suggestions when no clusters exist', () => {
    const report = makeReport({ clusters: [], totalViolations: 0 });
    const result = generateSuggestions(report);
    expect(result.suggestions).toHaveLength(0);
  });

  it('deduplicates suggestions with the same action and target', () => {
    const cluster1 = makeCluster({ id: 'c1', key: 'git.push' });
    const cluster2 = makeCluster({ id: 'c2', key: 'git.push' });
    const report = makeReport({ clusters: [cluster1, cluster2] });
    const result = generateSuggestions(report);

    const pushSuggestions = result.suggestions.filter((s) => s.action === 'git.push');
    expect(pushSuggestions).toHaveLength(1);
  });

  it('assigns confidence levels based on violation count and sessions', () => {
    // High confidence: 10+ violations, 3+ sessions
    const highViolations = Array.from({ length: 12 }, (_, i) =>
      makeViolation({ sessionId: `s${i % 4}`, eventId: `e${i}` })
    );
    const highCluster = makeCluster({
      violations: highViolations,
      count: 12,
      sessionCount: 4,
    });

    // Low confidence: 2 violations, 1 session
    const lowViolations = [
      makeViolation({ sessionId: 's1', eventId: 'e1', actionType: 'file.delete' }),
      makeViolation({ sessionId: 's1', eventId: 'e2', actionType: 'file.delete' }),
    ];
    const lowCluster = makeCluster({
      id: 'c2',
      key: 'file.delete',
      label: 'Action: file.delete',
      violations: lowViolations,
      count: 2,
      sessionCount: 1,
    });

    const report = makeReport({ clusters: [highCluster, lowCluster] });
    const result = generateSuggestions(report);

    const pushSuggestion = result.suggestions.find((s) => s.action === 'git.push');
    const deleteSuggestion = result.suggestions.find((s) => s.action === 'file.delete');

    expect(pushSuggestion?.confidence).toBe('high');
    expect(deleteSuggestion?.confidence).toBe('low');
  });

  it('skips action-type clusters where most violations are not denials', () => {
    const violations = [
      makeViolation({ kind: 'BlastRadiusExceeded' }),
      makeViolation({ kind: 'BlastRadiusExceeded' }),
      makeViolation({ kind: 'BlastRadiusExceeded' }),
    ];
    const cluster = makeCluster({
      violations,
      key: 'file.write',
      label: 'Action: file.write',
    });
    const report = makeReport({ clusters: [cluster] });
    const result = generateSuggestions(report);

    const writeSuggestion = result.suggestions.find((s) => s.action === 'file.write');
    expect(writeSuggestion).toBeUndefined();
  });

  it('sorts suggestions by confidence then violation count', () => {
    const highViolations = Array.from({ length: 12 }, (_, i) =>
      makeViolation({ sessionId: `s${i % 4}`, eventId: `e${i}`, actionType: 'git.push' })
    );
    const medViolations = Array.from({ length: 5 }, (_, i) =>
      makeViolation({ sessionId: `s${i}`, eventId: `m${i}`, actionType: 'shell.exec' })
    );

    const clusters = [
      makeCluster({
        id: 'c1',
        key: 'shell.exec',
        label: 'Action: shell.exec',
        violations: medViolations,
        count: 5,
        sessionCount: 2,
      }),
      makeCluster({
        id: 'c2',
        key: 'git.push',
        violations: highViolations,
        count: 12,
        sessionCount: 4,
      }),
    ];

    const report = makeReport({ clusters });
    const result = generateSuggestions(report);

    if (result.suggestions.length >= 2) {
      const confOrder = { high: 0, medium: 1, low: 2 };
      expect(confOrder[result.suggestions[0].confidence]).toBeLessThanOrEqual(
        confOrder[result.suggestions[1].confidence]
      );
    }
  });

  it('maps known invariant IDs to specific policy rules', () => {
    const invariantTests = [
      { invariantId: 'secret-exposure', expectedAction: 'file.write', expectedTarget: '.env' },
      { invariantId: 'protected-branches', expectedAction: 'git.push' },
      {
        invariantId: 'lockfile-integrity',
        expectedAction: 'file.write',
        expectedTarget: 'package-lock.json',
      },
      {
        invariantId: 'no-skill-modification',
        expectedAction: 'file.write',
        expectedTarget: '.claude/skills/',
      },
    ];

    for (const { invariantId, expectedAction, expectedTarget } of invariantTests) {
      const violations = [
        makeViolation({ sessionId: 's1', kind: 'InvariantViolation', invariantId }),
        makeViolation({ sessionId: 's2', kind: 'InvariantViolation', invariantId }),
      ];
      const cluster = makeCluster({
        groupBy: 'invariant',
        key: invariantId,
        label: `Invariant: ${invariantId}`,
        violations,
      });
      const report = makeReport({ clusters: [cluster] });
      const result = generateSuggestions(report);

      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(result.suggestions[0].action).toBe(expectedAction);
      if (expectedTarget) {
        expect(result.suggestions[0].target).toBe(expectedTarget);
      }
    }
  });
});

describe('toYaml', () => {
  it('formats suggestions as YAML policy rules', () => {
    const report = makeReport();
    const suggestions = generateSuggestions(report);
    const yaml = toYaml(suggestions);

    expect(yaml).toContain('rules:');
    expect(yaml).toContain('action: git.push');
    expect(yaml).toContain('effect: deny');
    expect(yaml).toContain('# Suggested policy rules');
  });

  it('outputs a comment when no suggestions exist', () => {
    const report = makeReport({ clusters: [], totalViolations: 0 });
    const suggestions = generateSuggestions(report);
    const yaml = toYaml(suggestions);

    expect(yaml).toContain('No policy suggestions');
  });
});

describe('toJsonSuggestions', () => {
  it('produces valid JSON', () => {
    const report = makeReport();
    const suggestions = generateSuggestions(report);
    const json = toJsonSuggestions(suggestions);
    const parsed = JSON.parse(json);

    expect(parsed.suggestions).toBeDefined();
    expect(Array.isArray(parsed.suggestions)).toBe(true);
    expect(parsed.generatedAt).toBeDefined();
  });
});

describe('toTerminalSuggestions', () => {
  it('formats suggestions for terminal output', () => {
    const report = makeReport();
    const suggestions = generateSuggestions(report);
    const output = toTerminalSuggestions(suggestions);

    expect(output).toContain('Policy Suggestions');
    expect(output).toContain('git.push');
    expect(output).toContain('deny');
  });

  it('shows empty message when no suggestions', () => {
    const report = makeReport({ clusters: [], totalViolations: 0 });
    const suggestions = generateSuggestions(report);
    const output = toTerminalSuggestions(suggestions);

    expect(output).toContain('No policy suggestions');
  });
});

describe('toMarkdownSuggestions', () => {
  it('formats suggestions as markdown', () => {
    const report = makeReport();
    const suggestions = generateSuggestions(report);
    const md = toMarkdownSuggestions(suggestions);

    expect(md).toContain('## Policy Suggestions');
    expect(md).toContain('`git.push`');
    expect(md).toContain('```yaml');
  });

  it('shows empty message when no suggestions', () => {
    const report = makeReport({ clusters: [], totalViolations: 0 });
    const suggestions = generateSuggestions(report);
    const md = toMarkdownSuggestions(suggestions);

    expect(md).toContain('No recurring violation patterns detected');
  });
});
