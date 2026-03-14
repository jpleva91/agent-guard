// Tests for the traces CLI command and renderTracesSummary
import { describe, it, expect } from 'vitest';
import { renderPolicyTraces } from '@red-codes/renderers';
import type { PolicyTraceEvent } from '@red-codes/renderers';
import {
  computeSummary,
  renderTracesSummary,
} from '../src/commands/traces.js';
import type { TraceSummary } from '../src/commands/traces.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTraceEvent(overrides: Partial<PolicyTraceEvent> = {}): PolicyTraceEvent {
  return {
    kind: 'PolicyTraceRecorded',
    timestamp: Date.now(),
    actionType: 'file.write',
    target: 'src/index.ts',
    decision: 'allow',
    totalRulesChecked: 3,
    phaseThatMatched: 'allow',
    durationMs: 0.5,
    rulesEvaluated: [
      {
        policyId: 'default',
        policyName: 'default',
        ruleIndex: 0,
        effect: 'deny',
        actionPattern: 'file.delete',
        actionMatched: false,
        conditionsMatched: false,
        conditionDetails: {},
        outcome: 'no-match' as const,
      },
      {
        policyId: 'default',
        policyName: 'default',
        ruleIndex: 1,
        effect: 'allow',
        actionPattern: 'file.*',
        actionMatched: true,
        conditionsMatched: true,
        conditionDetails: { scopeMatched: true },
        outcome: 'match' as const,
      },
    ],
    ...overrides,
  };
}

function makeDeniedTraceEvent(overrides: Partial<PolicyTraceEvent> = {}): PolicyTraceEvent {
  return makeTraceEvent({
    actionType: 'git.push',
    target: 'origin/main',
    decision: 'deny',
    phaseThatMatched: 'deny',
    rulesEvaluated: [
      {
        policyId: 'protect-main',
        policyName: 'protect-main',
        ruleIndex: 0,
        effect: 'deny',
        actionPattern: 'git.push',
        actionMatched: true,
        conditionsMatched: true,
        conditionDetails: { branchMatched: true },
        outcome: 'match' as const,
      },
    ],
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// computeSummary
// ---------------------------------------------------------------------------

describe('computeSummary', () => {
  it('returns zeroed summary for empty traces', () => {
    const summary = computeSummary([]);
    expect(summary.totalEvaluations).toBe(0);
    expect(summary.allowed).toBe(0);
    expect(summary.denied).toBe(0);
    expect(summary.avgDurationMs).toBeNull();
    expect(Object.keys(summary.actionTypes)).toHaveLength(0);
    expect(summary.topMatchedRules).toHaveLength(0);
  });

  it('counts allowed and denied correctly', () => {
    const traces = [makeTraceEvent(), makeDeniedTraceEvent(), makeTraceEvent()];
    const summary = computeSummary(traces);
    expect(summary.totalEvaluations).toBe(3);
    expect(summary.allowed).toBe(2);
    expect(summary.denied).toBe(1);
  });

  it('computes average duration', () => {
    const traces = [
      makeTraceEvent({ durationMs: 1.0 }),
      makeTraceEvent({ durationMs: 3.0 }),
    ];
    const summary = computeSummary(traces);
    expect(summary.avgDurationMs).toBe(2.0);
  });

  it('handles traces without duration', () => {
    const traces = [makeTraceEvent({ durationMs: undefined })];
    const summary = computeSummary(traces);
    expect(summary.avgDurationMs).toBeNull();
  });

  it('breaks down action types', () => {
    const traces = [
      makeTraceEvent({ actionType: 'file.write' }),
      makeTraceEvent({ actionType: 'file.write' }),
      makeDeniedTraceEvent({ actionType: 'git.push' }),
    ];
    const summary = computeSummary(traces);
    expect(summary.actionTypes['file.write']).toEqual({ allowed: 2, denied: 0 });
    expect(summary.actionTypes['git.push']).toEqual({ allowed: 0, denied: 1 });
  });

  it('tracks phase breakdown', () => {
    const traces = [
      makeTraceEvent({ phaseThatMatched: 'allow' }),
      makeDeniedTraceEvent({ phaseThatMatched: 'deny' }),
      makeTraceEvent({ phaseThatMatched: 'default' }),
    ];
    const summary = computeSummary(traces);
    expect(summary.phaseBreakdown).toEqual({ allow: 1, deny: 1, default: 1 });
  });

  it('aggregates top matched rules', () => {
    const rule = {
      policyId: 'default',
      policyName: 'default',
      ruleIndex: 1,
      effect: 'allow',
      actionPattern: 'file.*',
      actionMatched: true,
      conditionsMatched: true,
      conditionDetails: {},
      outcome: 'match' as const,
    };
    const traces = [
      makeTraceEvent({ rulesEvaluated: [rule] }),
      makeTraceEvent({ rulesEvaluated: [rule] }),
      makeTraceEvent({ rulesEvaluated: [rule] }),
    ];
    const summary = computeSummary(traces);
    expect(summary.topMatchedRules).toHaveLength(1);
    expect(summary.topMatchedRules[0].matchCount).toBe(3);
    expect(summary.topMatchedRules[0].policy).toBe('default#1');
  });

  it('limits top matched rules to 5', () => {
    const rules = Array.from({ length: 8 }, (_, i) => ({
      policyId: `p${i}`,
      policyName: `policy-${i}`,
      ruleIndex: 0,
      effect: 'allow',
      actionPattern: `action.${i}`,
      actionMatched: true,
      conditionsMatched: true,
      conditionDetails: {},
      outcome: 'match' as const,
    }));
    const traces = rules.map((rule) => makeTraceEvent({ rulesEvaluated: [rule] }));
    const summary = computeSummary(traces);
    expect(summary.topMatchedRules.length).toBeLessThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------
// renderTracesSummary
// ---------------------------------------------------------------------------

describe('renderTracesSummary', () => {
  it('renders summary header with evaluation count', () => {
    const summary: TraceSummary = {
      totalEvaluations: 5,
      allowed: 3,
      denied: 2,
      avgDurationMs: 1.5,
      actionTypes: {},
      topMatchedRules: [],
      phaseBreakdown: {},
    };
    const output = renderTracesSummary(summary);
    expect(output).toContain('Trace Summary');
    expect(output).toContain('5 evaluations');
  });

  it('shows allowed and denied counts with percentages', () => {
    const summary: TraceSummary = {
      totalEvaluations: 4,
      allowed: 3,
      denied: 1,
      avgDurationMs: null,
      actionTypes: {},
      topMatchedRules: [],
      phaseBreakdown: {},
    };
    const output = renderTracesSummary(summary);
    expect(output).toContain('Allowed:');
    expect(output).toContain('3');
    expect(output).toContain('Denied:');
    expect(output).toContain('1');
    expect(output).toContain('75%');
    expect(output).toContain('25%');
  });

  it('shows average duration when available', () => {
    const summary: TraceSummary = {
      totalEvaluations: 2,
      allowed: 2,
      denied: 0,
      avgDurationMs: 2.35,
      actionTypes: {},
      topMatchedRules: [],
      phaseBreakdown: {},
    };
    const output = renderTracesSummary(summary);
    expect(output).toContain('2.35ms');
  });

  it('omits duration when null', () => {
    const summary: TraceSummary = {
      totalEvaluations: 1,
      allowed: 1,
      denied: 0,
      avgDurationMs: null,
      actionTypes: {},
      topMatchedRules: [],
      phaseBreakdown: {},
    };
    const output = renderTracesSummary(summary);
    expect(output).not.toContain('Avg evaluation time');
  });

  it('renders phase breakdown', () => {
    const summary: TraceSummary = {
      totalEvaluations: 3,
      allowed: 2,
      denied: 1,
      avgDurationMs: null,
      actionTypes: {},
      topMatchedRules: [],
      phaseBreakdown: { allow: 2, deny: 1 },
    };
    const output = renderTracesSummary(summary);
    expect(output).toContain('Phase Breakdown');
    expect(output).toContain('allow');
    expect(output).toContain('deny');
  });

  it('renders action type breakdown', () => {
    const summary: TraceSummary = {
      totalEvaluations: 3,
      allowed: 2,
      denied: 1,
      avgDurationMs: null,
      actionTypes: {
        'file.write': { allowed: 2, denied: 0 },
        'git.push': { allowed: 0, denied: 1 },
      },
      topMatchedRules: [],
      phaseBreakdown: {},
    };
    const output = renderTracesSummary(summary);
    expect(output).toContain('Action Types');
    expect(output).toContain('file.write');
    expect(output).toContain('git.push');
    expect(output).toContain('2 allowed');
    expect(output).toContain('1 denied');
  });

  it('renders top matched rules', () => {
    const summary: TraceSummary = {
      totalEvaluations: 5,
      allowed: 5,
      denied: 0,
      avgDurationMs: null,
      actionTypes: {},
      topMatchedRules: [
        { rule: '[allow] file.*', policy: 'default#1', matchCount: 5 },
      ],
      phaseBreakdown: {},
    };
    const output = renderTracesSummary(summary);
    expect(output).toContain('Top Matched Rules');
    expect(output).toContain('5x');
    expect(output).toContain('[allow] file.*');
  });
});

// ---------------------------------------------------------------------------
// renderPolicyTraces (existing, verify integration)
// ---------------------------------------------------------------------------

describe('renderPolicyTraces with trace events', () => {
  it('renders a single allowed trace', () => {
    const output = renderPolicyTraces([makeTraceEvent()]);
    expect(output).toContain('Policy Evaluation Traces');
    expect(output).toContain('file.write');
    expect(output).toContain('ALLOW');
  });

  it('renders a denied trace', () => {
    const output = renderPolicyTraces([makeDeniedTraceEvent()]);
    expect(output).toContain('git.push');
    expect(output).toContain('DENY');
  });

  it('renders multiple traces with numbering', () => {
    const traces = [makeTraceEvent(), makeDeniedTraceEvent()];
    const output = renderPolicyTraces(traces);
    expect(output).toContain('2 evaluations');
  });

  it('shows rule evaluation details', () => {
    const output = renderPolicyTraces([makeTraceEvent()]);
    expect(output).toContain('file.*');
    expect(output).toContain('match');
  });

  it('shows condition details for matched rules', () => {
    const output = renderPolicyTraces([makeTraceEvent()]);
    expect(output).toContain('scope');
  });
});
