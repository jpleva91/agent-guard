// Tests for TUI renderer — pure string-rendering functions
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
  renderEventStream,
} from '../../src/cli/tui.js';
import type { KernelResult } from '../../src/kernel/kernel.js';
import type { MonitorDecision } from '../../src/kernel/monitor.js';
import type { GovernanceDecisionRecord } from '../../src/kernel/decisions/types.js';
import type { SimulationResult } from '../../src/kernel/simulation/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeKernelResult(overrides: Partial<KernelResult> = {}): KernelResult {
  return {
    allowed: true,
    executed: true,
    decision: {
      intent: { action: 'file.read', target: 'src/index.ts', agent: 'test' },
      decision: { allowed: true, reason: 'default allow', matchedPolicy: null },
      violations: [],
      monitor: { escalationLevel: 0, totalEvaluations: 1, totalDenials: 0, totalViolations: 0 },
    } as unknown as MonitorDecision,
    execution: null,
    action: null,
    events: [],
    runId: 'run_123',
    ...overrides,
  };
}

function makeDeniedResult(overrides: Partial<KernelResult> = {}): KernelResult {
  return makeKernelResult({
    allowed: false,
    executed: false,
    decision: {
      intent: { action: 'git.push', target: 'origin/main', agent: 'test' },
      decision: {
        allowed: false,
        reason: 'Protected branch',
        matchedPolicy: { id: 'protect-main', name: 'Protect Main', severity: 4 },
      },
      violations: [],
      monitor: { escalationLevel: 0, totalEvaluations: 1, totalDenials: 1, totalViolations: 0 },
    } as unknown as MonitorDecision,
    ...overrides,
  });
}

function makeDecisionRecord(overrides: Partial<GovernanceDecisionRecord> = {}): GovernanceDecisionRecord {
  return {
    recordId: 'dec_123',
    runId: 'run_123',
    timestamp: 1700000000000,
    action: { type: 'file.write', target: 'src/app.ts', agent: 'test', destructive: false },
    outcome: 'allow',
    reason: 'Default allow',
    intervention: null,
    policy: { matchedPolicyId: null, matchedPolicyName: null, severity: 3 },
    invariants: { allHold: true, violations: [] },
    simulation: null,
    evidencePackId: null,
    monitor: { escalationLevel: 0, totalEvaluations: 1, totalDenials: 0 },
    execution: { executed: true, success: true, durationMs: 12, error: null },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// renderBanner
// ---------------------------------------------------------------------------

describe('renderBanner', () => {
  it('renders banner with no config', () => {
    const output = renderBanner({});
    expect(output).toContain('AgentGuard Runtime Active');
  });

  it('includes policy name when provided', () => {
    const output = renderBanner({ policyName: 'security-policy' });
    expect(output).toContain('policy:');
    expect(output).toContain('security-policy');
  });

  it('includes invariant count when provided', () => {
    const output = renderBanner({ invariantCount: 6 });
    expect(output).toContain('invariants:');
    expect(output).toContain('6');
    expect(output).toContain('active');
  });

  it('includes both policy name and invariant count', () => {
    const output = renderBanner({ policyName: 'test-policy', invariantCount: 3 });
    expect(output).toContain('test-policy');
    expect(output).toContain('3');
  });
});

// ---------------------------------------------------------------------------
// renderAction
// ---------------------------------------------------------------------------

describe('renderAction', () => {
  it('renders allowed action with checkmark', () => {
    const output = renderAction(makeKernelResult());
    expect(output).toContain('\u2713'); // ✓
    expect(output).toContain('file.read');
    expect(output).toContain('src/index.ts');
  });

  it('renders dry-run tag when not executed', () => {
    const output = renderAction(makeKernelResult({ executed: false }));
    expect(output).toContain('dry-run');
  });

  it('renders denied action with cross mark and reason', () => {
    const output = renderAction(makeDeniedResult());
    expect(output).toContain('\u2717'); // ✗
    expect(output).toContain('DENIED');
    expect(output).toContain('protect-main');
  });

  it('shows reason in verbose mode', () => {
    const output = renderAction(makeDeniedResult(), true);
    expect(output).toContain('Protected branch');
  });

  it('does not show reason when not verbose', () => {
    const lines = renderAction(makeDeniedResult(), false).split('\n');
    // Only the main line, no reason line
    expect(lines).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// renderViolations
// ---------------------------------------------------------------------------

describe('renderViolations', () => {
  it('returns empty string when no violations', () => {
    const output = renderViolations(makeKernelResult());
    expect(output).toBe('');
  });

  it('renders each violation with warning icon', () => {
    const result = makeKernelResult({
      decision: {
        ...makeKernelResult().decision,
        violations: [
          { name: 'no-secret-exposure', holds: false, severity: 5, expected: 'no secrets', actual: 'found API key' },
          { name: 'blast-radius-limit', holds: false, severity: 3, expected: '<=10', actual: '25' },
        ],
      } as unknown as MonitorDecision,
    });
    const output = renderViolations(result);
    expect(output).toContain('\u26A0'); // ⚠
    expect(output).toContain('no-secret-exposure');
    expect(output).toContain('blast-radius-limit');
  });
});

// ---------------------------------------------------------------------------
// renderMonitorStatus
// ---------------------------------------------------------------------------

describe('renderMonitorStatus', () => {
  it('renders NORMAL level in green', () => {
    const output = renderMonitorStatus({
      monitor: { escalationLevel: 0, totalEvaluations: 5, totalDenials: 0, totalViolations: 0 },
    } as MonitorDecision);
    expect(output).toContain('NORMAL');
    expect(output).toContain('evals:5');
    expect(output).toContain('denied:0');
  });

  it('renders ELEVATED level', () => {
    const output = renderMonitorStatus({
      monitor: { escalationLevel: 1, totalEvaluations: 10, totalDenials: 3, totalViolations: 1 },
    } as MonitorDecision);
    expect(output).toContain('ELEVATED');
    expect(output).toContain('denied:3');
  });

  it('renders HIGH level', () => {
    const output = renderMonitorStatus({
      monitor: { escalationLevel: 2, totalEvaluations: 20, totalDenials: 8, totalViolations: 3 },
    } as MonitorDecision);
    expect(output).toContain('HIGH');
  });

  it('renders LOCKDOWN level', () => {
    const output = renderMonitorStatus({
      monitor: { escalationLevel: 3, totalEvaluations: 50, totalDenials: 20, totalViolations: 10 },
    } as MonitorDecision);
    expect(output).toContain('LOCKDOWN');
  });
});

// ---------------------------------------------------------------------------
// renderSimulation
// ---------------------------------------------------------------------------

describe('renderSimulation', () => {
  it('renders simulation with predicted changes', () => {
    const sim: SimulationResult = {
      predictedChanges: ['Create file: src/new.ts', 'Modify file: src/app.ts'],
      blastRadius: 2,
      riskLevel: 'low',
      details: {},
      simulatorId: 'filesystem',
      durationMs: 5,
    };
    const output = renderSimulation(sim);
    expect(output).toContain('Simulation');
    expect(output).toContain('filesystem');
    expect(output).toContain('Create file: src/new.ts');
    expect(output).toContain('Modify file: src/app.ts');
    expect(output).toContain('blast radius:');
    expect(output).toContain('2');
    expect(output).toContain('low');
    expect(output).toContain('5ms');
  });

  it('applies red color for high risk', () => {
    const sim: SimulationResult = {
      predictedChanges: ['Delete entire dist/'],
      blastRadius: 50,
      riskLevel: 'high',
      details: {},
      simulatorId: 'filesystem',
      durationMs: 10,
    };
    const output = renderSimulation(sim);
    expect(output).toContain('high');
    expect(output).toContain('\x1b[31m'); // red ANSI code
  });

  it('applies yellow color for medium risk', () => {
    const sim: SimulationResult = {
      predictedChanges: [],
      blastRadius: 5,
      riskLevel: 'medium',
      details: {},
      simulatorId: 'git',
      durationMs: 3,
    };
    const output = renderSimulation(sim);
    expect(output).toContain('medium');
    expect(output).toContain('\x1b[33m'); // yellow ANSI code
  });
});

// ---------------------------------------------------------------------------
// renderDecisionRecord
// ---------------------------------------------------------------------------

describe('renderDecisionRecord', () => {
  it('renders an allow decision', () => {
    const output = renderDecisionRecord(makeDecisionRecord());
    expect(output).toContain('Decision Record');
    expect(output).toContain('dec_123');
    expect(output).toContain('file.write');
    expect(output).toContain('ALLOW');
    expect(output).toContain('\u2713'); // ✓
    expect(output).toContain('12ms');
  });

  it('renders a deny decision', () => {
    const output = renderDecisionRecord(
      makeDecisionRecord({ outcome: 'deny', reason: 'Policy denied' })
    );
    expect(output).toContain('DENY');
    expect(output).toContain('\u2717'); // ✗
    expect(output).toContain('Policy denied');
  });

  it('shows matched policy when present', () => {
    const output = renderDecisionRecord(
      makeDecisionRecord({
        policy: { matchedPolicyId: 'p1', matchedPolicyName: 'Security', severity: 4 },
      })
    );
    expect(output).toContain('Security');
    expect(output).toContain('p1');
  });

  it('shows invariant violations', () => {
    const output = renderDecisionRecord(
      makeDecisionRecord({
        invariants: {
          allHold: false,
          violations: [
            { invariantId: 'inv_1', name: 'no-force-push', severity: 5, expected: 'no force push', actual: 'force push detected' },
          ],
        },
      })
    );
    expect(output).toContain('\u26A0'); // ⚠
    expect(output).toContain('no-force-push');
  });

  it('shows simulation summary when present', () => {
    const output = renderDecisionRecord(
      makeDecisionRecord({
        simulation: {
          predictedChanges: ['x'],
          blastRadius: 3,
          riskLevel: 'medium',
          simulatorId: 'fs',
          durationMs: 2,
        },
      })
    );
    expect(output).toContain('simulation:');
    expect(output).toContain('blast=3');
    expect(output).toContain('medium');
  });

  it('shows failed execution status', () => {
    const output = renderDecisionRecord(
      makeDecisionRecord({
        execution: { executed: true, success: false, durationMs: 50, error: 'ENOENT' },
      })
    );
    expect(output).toContain('failed');
    expect(output).toContain('50ms');
  });
});

// ---------------------------------------------------------------------------
// renderDecisionTable
// ---------------------------------------------------------------------------

describe('renderDecisionTable', () => {
  it('renders table header with count', () => {
    const output = renderDecisionTable([makeDecisionRecord()]);
    expect(output).toContain('Decision Records');
    expect(output).toContain('1 decisions');
  });

  it('renders multiple records with numbering', () => {
    const records = [
      makeDecisionRecord({ outcome: 'allow' }),
      makeDecisionRecord({ recordId: 'dec_456', outcome: 'deny', reason: 'denied by policy' }),
    ];
    const output = renderDecisionTable(records);
    expect(output).toContain('2 decisions');
    expect(output).toContain('\u2713'); // ✓
    expect(output).toContain('\u2717'); // ✗
  });

  it('shows violations for denied records', () => {
    const records = [
      makeDecisionRecord({
        outcome: 'deny',
        invariants: {
          allHold: false,
          violations: [
            { invariantId: 'inv_1', name: 'protected-branch', severity: 4, expected: '', actual: '' },
          ],
        },
      }),
    ];
    const output = renderDecisionTable(records);
    expect(output).toContain('protected-branch');
  });
});

// ---------------------------------------------------------------------------
// renderKernelResult
// ---------------------------------------------------------------------------

describe('renderKernelResult', () => {
  it('renders action without violations', () => {
    const output = renderKernelResult(makeKernelResult());
    expect(output).toContain('file.read');
    expect(output).toContain('\u2713');
  });

  it('renders action with violations', () => {
    const result = makeKernelResult({
      decision: {
        ...makeKernelResult().decision,
        violations: [
          { name: 'lockfile-integrity', holds: false, severity: 3, expected: '', actual: '' },
        ],
      } as unknown as MonitorDecision,
    });
    const output = renderKernelResult(result);
    expect(output).toContain('lockfile-integrity');
  });
});

// ---------------------------------------------------------------------------
// renderActionGraph
// ---------------------------------------------------------------------------

describe('renderActionGraph', () => {
  it('renders graph header with action count', () => {
    const output = renderActionGraph([makeKernelResult()]);
    expect(output).toContain('Action Graph');
    expect(output).toContain('1 actions');
  });

  it('renders mixed allowed and denied actions', () => {
    const results = [makeKernelResult(), makeDeniedResult()];
    const output = renderActionGraph(results);
    expect(output).toContain('EXECUTED');
    expect(output).toContain('DENIED');
    expect(output).toContain('Protected branch');
  });

  it('shows ALLOWED status for allowed but not executed', () => {
    const output = renderActionGraph([makeKernelResult({ executed: false })]);
    expect(output).toContain('ALLOWED');
  });

  it('renders violations for denied actions', () => {
    const denied = makeDeniedResult({
      decision: {
        ...makeDeniedResult().decision,
        violations: [
          { name: 'no-force-push', holds: false, severity: 5, expected: '', actual: '' },
        ],
      } as unknown as MonitorDecision,
    });
    const output = renderActionGraph([denied]);
    expect(output).toContain('no-force-push');
  });
});

// ---------------------------------------------------------------------------
// renderEventStream
// ---------------------------------------------------------------------------

describe('renderEventStream', () => {
  it('renders event stream header with count', () => {
    const events = [{ kind: 'ActionRequested', timestamp: 1700000000000 }];
    const output = renderEventStream(events);
    expect(output).toContain('Event Stream');
    expect(output).toContain('1 events');
  });

  it('colors denied/violation events in red', () => {
    const events = [{ kind: 'ActionDenied', timestamp: 1700000000000 }];
    const output = renderEventStream(events);
    expect(output).toContain('\x1b[31m'); // red
    expect(output).toContain('ActionDenied');
  });

  it('colors allowed/executed events in green', () => {
    const events = [{ kind: 'ActionAllowed', timestamp: 1700000000000 }];
    const output = renderEventStream(events);
    expect(output).toContain('\x1b[32m'); // green
  });

  it('colors other events in cyan', () => {
    const events = [{ kind: 'RunStarted', timestamp: 1700000000000 }];
    const output = renderEventStream(events);
    expect(output).toContain('\x1b[36m'); // cyan
  });

  it('formats timestamps as HH:MM:SS.mmm', () => {
    const events = [{ kind: 'RunStarted', timestamp: 1700000000000 }];
    const output = renderEventStream(events);
    // Should contain a time format like HH:MM:SS.mmm
    expect(output).toMatch(/\d{2}:\d{2}:\d{2}\.\d{3}/);
  });

  it('renders multiple events in order', () => {
    const events = [
      { kind: 'ActionRequested', timestamp: 1700000000000 },
      { kind: 'ActionAllowed', timestamp: 1700000001000 },
      { kind: 'ActionExecuted', timestamp: 1700000002000 },
    ];
    const output = renderEventStream(events);
    expect(output).toContain('3 events');
    const lines = output.split('\n');
    const eventLines = lines.filter((l) => l.includes('Action'));
    expect(eventLines).toHaveLength(3);
  });
});
