// Tests for inspect CLI command
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
}));

import { inspect, events } from '../src/commands/inspect.js';
import { readFileSync, existsSync, readdirSync } from 'node:fs';

const EVENTS_DIR = '.agentguard/events';

function makeActionEvent(kind: string, overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: `evt_${Date.now()}_1`,
    kind,
    timestamp: 1700000000000,
    fingerprint: 'fp_1',
    actionType: 'file.write',
    target: 'src/app.ts',
    reason: 'test reason',
    ...overrides,
  });
}

function makeDecisionRecord(): string {
  return JSON.stringify({
    recordId: 'dec_123',
    runId: 'run_1',
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
    execution: { executed: true, success: true, durationMs: 5, error: null },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
});

describe('inspect', () => {
  it('shows "no runs" message when events directory is missing', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readdirSync).mockReturnValue([]);

    await inspect([]);

    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('No runs recorded yet')
    );
  });

  it('lists runs when called with --list', async () => {
    vi.mocked(existsSync).mockImplementation((p) => {
      if (String(p) === EVENTS_DIR) return true;
      return true;
    });
    vi.mocked(readdirSync).mockReturnValue(['run_001.jsonl', 'run_002.jsonl'] as unknown as ReturnType<typeof readdirSync>);

    const eventContent = makeActionEvent('ActionAllowed') + '\n';
    vi.mocked(readFileSync).mockReturnValue(eventContent);

    await inspect(['--list']);

    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('Recorded Runs')
    );
  });

  it('loads specific run by ID', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    const content =
      makeActionEvent('ActionAllowed') + '\n' + makeActionEvent('ActionExecuted') + '\n';
    vi.mocked(readFileSync).mockReturnValue(content);

    await inspect(['run_001']);

    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('run_001')
    );
  });

  it('loads most recent run with --last', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(['run_001.jsonl', 'run_002.jsonl'] as unknown as ReturnType<typeof readdirSync>);
    const content = makeActionEvent('ActionAllowed') + '\n';
    vi.mocked(readFileSync).mockReturnValue(content);

    await inspect(['--last']);

    // Should load the most recent (sorted reverse → run_002)
    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('run_002')
    );
  });

  it('shows decision records with --decisions flag', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockImplementation((p) => {
      const path = String(p);
      if (path.includes('decisions')) {
        return makeDecisionRecord() + '\n';
      }
      return makeActionEvent('ActionAllowed') + '\n';
    });

    await inspect(['run_001', '--decisions']);

    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('Decision Records')
    );
  });

  it('handles no events found for a run', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await inspect(['run_missing']);

    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('No events found')
    );
  });

  it('skips malformed JSONL lines gracefully', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    const content = 'garbage-line\n' + makeActionEvent('ActionAllowed') + '\n';
    vi.mocked(readFileSync).mockReturnValue(content);

    await inspect(['run_001']);

    // Should still render without throwing
    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('run_001')
    );
  });

  it('shows policy traces with --traces flag', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    const traceEvent = JSON.stringify({
      id: 'evt_1',
      kind: 'PolicyTraceRecorded',
      timestamp: 1700000000000,
      fingerprint: 'fp_1',
      actionType: 'file.write',
      target: 'src/app.ts',
      decision: 'allow',
      totalRulesChecked: 2,
      phaseThatMatched: 'allow',
      rulesEvaluated: [
        {
          policyId: 'security',
          policyName: 'Security Policy',
          ruleIndex: 0,
          effect: 'deny',
          actionPattern: 'git.push',
          actionMatched: false,
          conditionsMatched: false,
          conditionDetails: {},
          outcome: 'no-match',
        },
      ],
      durationMs: 0.15,
    });
    const content = makeActionEvent('ActionAllowed') + '\n' + traceEvent + '\n';
    vi.mocked(readFileSync).mockReturnValue(content);

    await inspect(['run_001', '--traces']);

    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('Policy Evaluation Traces')
    );
  });

  it('shows no traces message when no trace events exist', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    const content = makeActionEvent('ActionAllowed') + '\n';
    vi.mocked(readFileSync).mockReturnValue(content);

    await inspect(['run_001', '--traces']);

    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('No policy evaluation traces found')
    );
  });

  it('supports both --traces and --decisions flags together', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    const traceEvent = JSON.stringify({
      id: 'evt_1',
      kind: 'PolicyTraceRecorded',
      timestamp: 1700000000000,
      fingerprint: 'fp_1',
      actionType: 'file.write',
      target: 'src/app.ts',
      decision: 'allow',
      totalRulesChecked: 1,
      phaseThatMatched: 'allow',
      durationMs: 0.1,
    });
    vi.mocked(readFileSync).mockImplementation((p) => {
      const path = String(p);
      if (path.includes('decisions')) {
        return makeDecisionRecord() + '\n';
      }
      return makeActionEvent('ActionAllowed') + '\n' + traceEvent + '\n';
    });

    await inspect(['run_001', '--decisions', '--traces']);

    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('Decision Records')
    );
    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('Policy Evaluation Traces')
    );
  });

  it('shows denied actions with reason', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    const denied = makeActionEvent('ActionDenied', {
      reason: 'Protected branch policy',
      metadata: { violations: [{ name: 'no-force-push' }] },
    });
    const content = denied + '\n';
    vi.mocked(readFileSync).mockReturnValue(content);

    await inspect(['run_001']);

    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('DENIED')
    );
  });
});

describe('events', () => {
  it('shows usage when no run ID provided', async () => {
    await events([]);

    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('Usage:')
    );
  });

  it('dumps raw events as JSON to stdout', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    const content = makeActionEvent('ActionRequested') + '\n';
    vi.mocked(readFileSync).mockReturnValue(content);

    await events(['run_001']);

    expect(process.stdout.write).toHaveBeenCalled();
    const written = vi.mocked(process.stdout.write).mock.calls[0][0] as string;
    const parsed = JSON.parse(written.trim());
    expect(parsed.kind).toBe('ActionRequested');
  });

  it('handles --last flag', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(['run_latest.jsonl'] as unknown as ReturnType<typeof readdirSync>);
    const content = makeActionEvent('ActionAllowed') + '\n';
    vi.mocked(readFileSync).mockReturnValue(content);

    await events(['--last']);

    expect(process.stdout.write).toHaveBeenCalled();
  });

  it('shows no runs message for --last when no runs exist', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readdirSync).mockReturnValue([]);

    await events(['--last']);

    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('No runs recorded')
    );
  });
});
