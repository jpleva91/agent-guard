// Tests for TUI governance renderer plugin (GovernanceRenderer implementation)
import { describe, it, expect, vi } from 'vitest';
import { createTuiRenderer } from '../../src/renderers/tui-renderer.js';
import type { RendererConfig, RunSummary } from '../../src/renderers/types.js';
import type { KernelResult } from '../../src/kernel/kernel.js';
import type { MonitorDecision } from '../../src/kernel/monitor.js';

function makeOutput() {
  const chunks: string[] = [];
  return {
    write: vi.fn((s: string) => {
      chunks.push(s);
      return true;
    }),
    chunks,
    text: () => chunks.join(''),
  };
}

function makeConfig(overrides: Partial<RendererConfig> = {}): RendererConfig {
  return {
    runId: 'run_test_123',
    policyName: 'test-policy',
    invariantCount: 6,
    ...overrides,
  };
}

function makeKernelResult(overrides: Partial<KernelResult> = {}): KernelResult {
  return {
    allowed: true,
    executed: true,
    decision: {
      allowed: true,
      intent: { action: 'file.read', target: 'src/index.ts', agent: 'test', destructive: false },
      decision: {
        allowed: true,
        decision: 'allow',
        reason: 'Default allow',
        matchedPolicy: null,
      },
      violations: [],
      events: [],
      evidencePack: null,
      intervention: null,
      monitor: { escalationLevel: 0, totalEvaluations: 1, totalDenials: 0, totalViolations: 0 },
    } as unknown as MonitorDecision,
    execution: null,
    action: null,
    events: [],
    runId: 'run_test_123',
    ...overrides,
  } as KernelResult;
}

describe('TuiRenderer plugin', () => {
  it('has correct id and name', () => {
    const renderer = createTuiRenderer();
    expect(renderer.id).toBe('tui');
    expect(renderer.name).toBe('Terminal UI Renderer');
  });

  describe('onRunStarted', () => {
    it('renders banner with policy name and run ID', () => {
      const output = makeOutput();
      const renderer = createTuiRenderer({ output });
      renderer.onRunStarted!(makeConfig({ policyName: 'my-policy' }));

      const text = output.text();
      expect(text).toContain('AgentGuard Runtime Active');
      expect(text).toContain('my-policy');
      expect(text).toContain('run_test_123');
    });

    it('renders simulator count when > 0', () => {
      const output = makeOutput();
      const renderer = createTuiRenderer({ output });
      renderer.onRunStarted!(makeConfig({ simulatorCount: 3 }));

      const text = output.text();
      expect(text).toContain('simulators: 3 active');
    });

    it('omits simulator line when count is 0', () => {
      const output = makeOutput();
      const renderer = createTuiRenderer({ output });
      renderer.onRunStarted!(makeConfig({ simulatorCount: 0 }));

      const text = output.text();
      expect(text).not.toContain('simulators');
    });
  });

  describe('onActionResult', () => {
    it('renders allowed action', () => {
      const output = makeOutput();
      const renderer = createTuiRenderer({ output });
      renderer.onActionResult!(makeKernelResult());

      const text = output.text();
      expect(text).toContain('file.read');
      expect(text).toContain('src/index.ts');
    });

    it('renders denied action with monitor status', () => {
      const output = makeOutput();
      const renderer = createTuiRenderer({ output });
      renderer.onActionResult!(
        makeKernelResult({
          allowed: false,
          decision: {
            allowed: false,
            intent: {
              action: 'shell.exec',
              target: 'rm -rf /',
              agent: 'test',
              destructive: true,
            },
            decision: {
              allowed: false,
              decision: 'deny',
              reason: 'Destructive command',
              matchedPolicy: { id: 'no-shell' },
            },
            violations: [],
            events: [],
            evidencePack: null,
            intervention: 'deny',
            monitor: {
              escalationLevel: 1,
              totalEvaluations: 1,
              totalDenials: 1,
              totalViolations: 0,
            },
          } as unknown as MonitorDecision,
        })
      );

      const text = output.text();
      expect(text).toContain('DENIED');
      expect(text).toContain('ELEVATED');
    });
  });

  describe('onRunEnded', () => {
    it('renders run summary', () => {
      const output = makeOutput();
      const renderer = createTuiRenderer({ output });
      const summary: RunSummary = {
        runId: 'run_test_123',
        totalActions: 10,
        allowed: 8,
        denied: 2,
        violations: 1,
        durationMs: 5000,
      };
      renderer.onRunEnded!(summary);

      const text = output.text();
      expect(text).toContain('Run Complete');
      expect(text).toContain('run_test_123');
      expect(text).toContain('actions: 10');
      expect(text).toContain('allowed: 8');
      expect(text).toContain('denied: 2');
      expect(text).toContain('5000ms');
    });
  });

  describe('onDecisionRecord', () => {
    it('renders decision records when verbose', () => {
      const output = makeOutput();
      const renderer = createTuiRenderer({ output, verbose: true });

      renderer.onDecisionRecord!({
        recordId: 'dec_123',
        runId: 'run_test_123',
        timestamp: Date.now(),
        sequence: 1,
        action: { type: 'file.read', target: 'src/index.ts', class: 'file' },
        outcome: 'allow',
        reason: 'Default allow',
        policy: {
          matchedPolicyId: null,
          matchedPolicyName: null,
          evaluatedRules: 0,
        },
        invariants: { checked: 6, violations: [] },
        execution: { executed: true, success: true, durationMs: 5 },
        simulation: null,
      });

      const text = output.text();
      expect(text).toContain('Decision Record');
      expect(text).toContain('dec_123');
    });

    it('suppresses decision records when not verbose', () => {
      const output = makeOutput();
      const renderer = createTuiRenderer({ output, verbose: false });

      renderer.onDecisionRecord!({
        recordId: 'dec_123',
        runId: 'run_test_123',
        timestamp: Date.now(),
        sequence: 1,
        action: { type: 'file.read', target: 'src/index.ts', class: 'file' },
        outcome: 'allow',
        reason: 'Default allow',
        policy: {
          matchedPolicyId: null,
          matchedPolicyName: null,
          evaluatedRules: 0,
        },
        invariants: { checked: 6, violations: [] },
        execution: { executed: true, success: true, durationMs: 5 },
        simulation: null,
      });

      expect(output.write).not.toHaveBeenCalled();
    });
  });

  describe('implements GovernanceRenderer contract', () => {
    it('has all optional lifecycle hooks', () => {
      const renderer = createTuiRenderer();
      expect(renderer.onRunStarted).toBeDefined();
      expect(renderer.onActionResult).toBeDefined();
      expect(renderer.onMonitorStatus).toBeDefined();
      expect(renderer.onSimulation).toBeDefined();
      expect(renderer.onDecisionRecord).toBeDefined();
      expect(renderer.onRunEnded).toBeDefined();
    });
  });
});
