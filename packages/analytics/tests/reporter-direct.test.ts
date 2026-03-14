// Direct tests for the analytics reporter — toTerminal, toMarkdown, toJson
import { describe, it, expect } from 'vitest';
import { toTerminal, toMarkdown, toJson } from '@red-codes/analytics';
import type { AnalyticsReport } from '@red-codes/analytics';

function makeReport(overrides: Partial<AnalyticsReport> = {}): AnalyticsReport {
  return {
    generatedAt: Date.now(),
    sessionsAnalyzed: 5,
    totalViolations: 10,
    violationsByKind: { InvariantViolation: 6, PolicyDenied: 4 },
    clusters: [
      {
        id: 'c1',
        label: 'secret-exposure',
        groupBy: 'invariant',
        key: 'no-secret-exposure',
        violations: [],
        count: 6,
        firstSeen: Date.now() - 86400000,
        lastSeen: Date.now(),
        sessionCount: 3,
        inferredCause: 'Developers frequently modify .env files',
      },
    ],
    trends: [
      {
        key: 'InvariantViolation',
        dimension: 'kind',
        direction: 'increasing',
        recentCount: 8,
        previousCount: 2,
        changePercent: 300,
      },
    ],
    topInferredCauses: [{ cause: 'Developers frequently modify .env files', count: 3 }],
    runRiskScores: [
      {
        sessionId: 'session_abc123def456',
        score: 75,
        riskLevel: 'high',
        factors: [],
        totalActions: 20,
        totalDenials: 5,
        totalViolations: 3,
        peakEscalation: 2,
      },
    ],
    ...overrides,
  };
}

function makeEmptyReport(): AnalyticsReport {
  return {
    generatedAt: Date.now(),
    sessionsAnalyzed: 0,
    totalViolations: 0,
    violationsByKind: {},
    clusters: [],
    trends: [],
    topInferredCauses: [],
    runRiskScores: [],
  };
}

describe('toTerminal', () => {
  it('contains violation counts and session info', () => {
    const output = toTerminal(makeReport());
    expect(output).toContain('Violation Pattern Analysis');
    expect(output).toContain('Sessions: 5');
    expect(output).toContain('Violations: 10');
  });

  it('contains violations by kind', () => {
    const output = toTerminal(makeReport());
    expect(output).toContain('InvariantViolation: 6');
    expect(output).toContain('PolicyDenied: 4');
  });

  it('contains cluster information', () => {
    const output = toTerminal(makeReport());
    expect(output).toContain('Clusters');
    expect(output).toContain('secret-exposure');
    expect(output).toContain('6 violations');
  });

  it('contains trend indicators', () => {
    const output = toTerminal(makeReport());
    expect(output).toContain('Trends');
    expect(output).toContain('+300%');
  });

  it('contains inferred causes', () => {
    const output = toTerminal(makeReport());
    expect(output).toContain('Top Inferred Causes');
    expect(output).toContain('Developers frequently modify .env files');
  });

  it('contains risk scores', () => {
    const output = toTerminal(makeReport());
    expect(output).toContain('Run Risk Scores');
    expect(output).toContain('score: 75');
    expect(output).toContain('HIGH');
  });

  it('handles empty report gracefully', () => {
    const output = toTerminal(makeEmptyReport());
    expect(output).toContain('Violation Pattern Analysis');
    expect(output).toContain('Sessions: 0');
    expect(output).toContain('Violations: 0');
    // Should not contain section headers for empty data
    expect(output).not.toContain('Clusters');
    expect(output).not.toContain('Trends');
    expect(output).not.toContain('Top Inferred Causes');
  });
});

describe('toMarkdown', () => {
  it('produces valid markdown structure', () => {
    const output = toMarkdown(makeReport());
    expect(output).toContain('# Violation Pattern Analysis');
    expect(output).toContain('## Violations by Kind');
    expect(output).toContain('| Kind | Count |');
  });

  it('includes violation kind table rows', () => {
    const output = toMarkdown(makeReport());
    expect(output).toContain('| InvariantViolation | 6 |');
    expect(output).toContain('| PolicyDenied | 4 |');
  });

  it('includes cluster sections', () => {
    const output = toMarkdown(makeReport());
    expect(output).toContain('## Violation Clusters');
    expect(output).toContain('### secret-exposure');
    expect(output).toContain('**Count**: 6');
  });

  it('includes trend table', () => {
    const output = toMarkdown(makeReport());
    expect(output).toContain('## Trends');
    expect(output).toContain('| Pattern | Direction |');
    expect(output).toContain('+300%');
  });

  it('includes risk score table', () => {
    const output = toMarkdown(makeReport());
    expect(output).toContain('## Run Risk Scores');
    expect(output).toContain('| Session | Score |');
  });

  it('handles empty report', () => {
    const output = toMarkdown(makeEmptyReport());
    expect(output).toContain('# Violation Pattern Analysis');
    expect(output).toContain('Total violations: 0');
  });
});

describe('toJson', () => {
  it('returns valid JSON', () => {
    const output = toJson(makeReport());
    const parsed = JSON.parse(output);
    expect(parsed.totalViolations).toBe(10);
    expect(parsed.sessionsAnalyzed).toBe(5);
  });

  it('preserves all report fields', () => {
    const report = makeReport();
    const parsed = JSON.parse(toJson(report));
    expect(parsed.violationsByKind).toEqual(report.violationsByKind);
    expect(parsed.clusters).toHaveLength(1);
    expect(parsed.trends).toHaveLength(1);
    expect(parsed.runRiskScores).toHaveLength(1);
  });

  it('handles empty report', () => {
    const output = toJson(makeEmptyReport());
    const parsed = JSON.parse(output);
    expect(parsed.totalViolations).toBe(0);
    expect(parsed.clusters).toEqual([]);
  });

  it('is pretty-printed with 2-space indent', () => {
    const output = toJson(makeReport());
    // Pretty-printed JSON has newlines and indentation
    expect(output).toContain('\n');
    expect(output).toContain('  ');
  });
});
