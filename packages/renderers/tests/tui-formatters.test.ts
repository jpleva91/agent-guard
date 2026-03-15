import { describe, it, expect } from 'vitest';
import {
  renderBanner,
  renderAction,
  renderViolations,
  renderMonitorStatus,
  renderSimulation,
  renderDecisionRecord,
  renderDecisionTable,
  renderKernelResult,
  renderActionGraph,
  renderPolicyTraces,
  renderEventStream,
} from '../src/tui-formatters.js';

function makeKernelResult(overrides: Record<string, unknown> = {}) {
  return {
    allowed: true,
    executed: true,
    decision: {
      intent: { action: 'file.write', target: '/tmp/test.ts' },
      decision: { reason: 'allowed by policy', matchedPolicy: null },
      violations: [],
    },
    ...overrides,
  };
}

function makeDeniedResult() {
  return makeKernelResult({
    allowed: false,
    executed: false,
    decision: {
      intent: { action: 'git.push', target: 'origin/main' },
      decision: {
        reason: 'protected branch',
        matchedPolicy: { id: 'policy-1' },
      },
      violations: [],
    },
  });
}

function makeDecisionRecord(outcome: 'allow' | 'deny') {
  return {
    recordId: 'rec-1',
    outcome,
    timestamp: Date.now(),
    action: { type: 'file.write', target: '/tmp/test' },
    reason: outcome === 'allow' ? 'policy allowed' : 'invariant violated',
    policy: {
      matchedPolicyId: outcome === 'deny' ? 'pol-1' : null,
      matchedPolicyName: outcome === 'deny' ? 'strict' : null,
    },
    invariants: {
      violations:
        outcome === 'deny' ? [{ name: 'no-secret-exposure', actual: '.env file detected' }] : [],
    },
    simulation: outcome === 'deny' ? { blastRadius: 5, riskLevel: 'high' } : null,
    execution: {
      executed: outcome === 'allow',
      success: outcome === 'allow',
      durationMs: 12,
    },
  };
}

describe('renderBanner', () => {
  it('renders banner with policy name and invariant count', () => {
    const output = renderBanner({ policyName: 'strict', invariantCount: 17 });
    expect(output).toContain('AgentGuard Runtime Active');
    expect(output).toContain('strict');
    expect(output).toContain('17');
  });

  it('renders banner without config details', () => {
    const output = renderBanner({});
    expect(output).toContain('AgentGuard Runtime Active');
  });
});

describe('renderAction', () => {
  it('renders allowed action with checkmark', () => {
    const output = renderAction(makeKernelResult() as never);
    expect(output).toContain('file.write');
    expect(output).toContain('/tmp/test.ts');
    expect(output).toContain('\u2713'); // checkmark
  });

  it('renders dry-run indicator when not executed', () => {
    const output = renderAction(makeKernelResult({ executed: false }) as never);
    expect(output).toContain('dry-run');
  });

  it('renders denied action with reason', () => {
    const output = renderAction(makeDeniedResult() as never, true);
    expect(output).toContain('DENIED');
    expect(output).toContain('git.push');
    expect(output).toContain('protected branch');
  });
});

describe('renderViolations', () => {
  it('returns empty string when no violations', () => {
    const output = renderViolations(makeKernelResult() as never);
    expect(output).toBe('');
  });

  it('renders violation names', () => {
    const result = makeKernelResult({
      decision: {
        intent: { action: 'file.write', target: '/tmp/.env' },
        decision: { reason: 'denied', matchedPolicy: null },
        violations: [{ name: 'no-secret-exposure' }],
      },
    });
    const output = renderViolations(result as never);
    expect(output).toContain('no-secret-exposure');
    expect(output).toContain('\u26A0'); // warning icon
  });
});

describe('renderMonitorStatus', () => {
  it('renders NORMAL level in green context', () => {
    const decision = {
      monitor: {
        escalationLevel: 0,
        totalEvaluations: 10,
        totalDenials: 0,
        totalViolations: 0,
      },
    };
    const output = renderMonitorStatus(decision as never);
    expect(output).toContain('NORMAL');
    expect(output).toContain('evals:10');
  });

  it('renders LOCKDOWN level', () => {
    const decision = {
      monitor: {
        escalationLevel: 3,
        totalEvaluations: 50,
        totalDenials: 20,
        totalViolations: 15,
      },
    };
    const output = renderMonitorStatus(decision as never);
    expect(output).toContain('LOCKDOWN');
    expect(output).toContain('denied:20');
  });
});

describe('renderSimulation', () => {
  it('renders simulation with predicted changes', () => {
    const sim = {
      simulatorId: 'fs-sim',
      predictedChanges: ['write /tmp/a.ts', 'write /tmp/b.ts'],
      blastRadius: 2,
      riskLevel: 'low',
      durationMs: 5,
    };
    const output = renderSimulation(sim as never);
    expect(output).toContain('Simulation');
    expect(output).toContain('fs-sim');
    expect(output).toContain('write /tmp/a.ts');
    expect(output).toContain('blast radius:');
    expect(output).toContain('2');
    expect(output).toContain('low');
  });

  it('uses red for high risk', () => {
    const sim = {
      simulatorId: 'git-sim',
      predictedChanges: [],
      blastRadius: 10,
      riskLevel: 'high',
      durationMs: 3,
    };
    const output = renderSimulation(sim as never);
    expect(output).toContain('high');
  });
});

describe('renderDecisionRecord', () => {
  it('renders allowed decision record', () => {
    const record = makeDecisionRecord('allow');
    const output = renderDecisionRecord(record as never);
    expect(output).toContain('Decision Record');
    expect(output).toContain('ALLOW');
    expect(output).toContain('file.write');
  });

  it('renders denied decision record with violations', () => {
    const record = makeDecisionRecord('deny');
    const output = renderDecisionRecord(record as never);
    expect(output).toContain('DENY');
    expect(output).toContain('no-secret-exposure');
    expect(output).toContain('strict');
  });
});

describe('renderDecisionTable', () => {
  it('renders table with multiple records', () => {
    const records = [makeDecisionRecord('allow'), makeDecisionRecord('deny')];
    const output = renderDecisionTable(records as never);
    expect(output).toContain('Decision Records');
    expect(output).toContain('2 decisions');
  });

  it('renders empty table', () => {
    const output = renderDecisionTable([]);
    expect(output).toContain('0 decisions');
  });
});

describe('renderKernelResult', () => {
  it('combines action and violations output', () => {
    const result = makeKernelResult({
      decision: {
        intent: { action: 'file.write', target: '/tmp/.env' },
        decision: { reason: 'denied', matchedPolicy: null },
        violations: [{ name: 'no-secret-exposure' }],
      },
      allowed: false,
      executed: false,
    });
    const output = renderKernelResult(result as never);
    expect(output).toContain('file.write');
    expect(output).toContain('no-secret-exposure');
  });
});

describe('renderActionGraph', () => {
  it('renders action graph with multiple results', () => {
    const results = [makeKernelResult(), makeDeniedResult()];
    const output = renderActionGraph(results as never);
    expect(output).toContain('Action Graph');
    expect(output).toContain('2 actions');
    expect(output).toContain('EXECUTED');
    expect(output).toContain('DENIED');
  });
});

describe('renderPolicyTraces', () => {
  it('renders policy evaluation traces', () => {
    const traces = [
      {
        kind: 'PolicyTraceRecorded',
        timestamp: Date.now(),
        actionType: 'file.write',
        target: '/tmp/test',
        decision: 'allow',
        totalRulesChecked: 3,
        phaseThatMatched: 'allow',
        durationMs: 0.5,
        rulesEvaluated: [
          {
            policyId: 'p1',
            policyName: 'default',
            ruleIndex: 0,
            effect: 'allow',
            actionPattern: 'file.*',
            actionMatched: true,
            conditionsMatched: true,
            conditionDetails: { scopeMatched: true },
            outcome: 'match' as const,
          },
        ],
      },
    ];
    const output = renderPolicyTraces(traces);
    expect(output).toContain('Policy Evaluation Traces');
    expect(output).toContain('file.write');
    expect(output).toContain('ALLOW');
    expect(output).toContain('default#0');
  });
});

describe('renderEventStream', () => {
  it('renders event stream with color-coded kinds', () => {
    const events = [
      { kind: 'ActionAllowed', timestamp: Date.now() },
      { kind: 'ActionDenied', timestamp: Date.now() },
      { kind: 'InvariantViolation', timestamp: Date.now() },
    ];
    const output = renderEventStream(events);
    expect(output).toContain('Event Stream');
    expect(output).toContain('3 events');
    expect(output).toContain('ActionAllowed');
    expect(output).toContain('ActionDenied');
  });
});
