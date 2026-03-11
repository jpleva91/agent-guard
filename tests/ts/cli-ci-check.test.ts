// Tests for the agentguard ci-check CLI command
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
}));

vi.mock('../../src/kernel/replay-engine.js', () => ({
  loadReplaySession: vi.fn(),
  getLatestRunId: vi.fn(),
  buildReplaySession: vi.fn(),
}));

import { ciCheck } from '../../src/cli/commands/ci-check.js';
import { readFileSync, existsSync } from 'node:fs';
import {
  loadReplaySession,
  getLatestRunId,
  buildReplaySession,
} from '../../src/kernel/replay-engine.js';

function makeReplaySession(overrides: Record<string, unknown> = {}) {
  return {
    runId: 'run_test_123',
    events: [],
    actions: [],
    startEvent: null,
    endEvent: null,
    summary: {
      totalActions: 10,
      allowed: 8,
      denied: 2,
      executed: 8,
      failed: 0,
      violations: 1,
      escalations: 0,
      simulationsRun: 0,
      durationMs: 5000,
      actionTypes: { 'file.write': 5, 'git.push': 3, 'shell.exec': 2 },
      denialReasons: ['Protected branch violation', 'Blast radius exceeded'],
      ...overrides,
    },
  };
}

function makeExportFile(eventCount = 2, runId = 'run_export_1') {
  const header = {
    __agentguard_export: true,
    version: 1,
    runId,
    exportedAt: Date.now(),
    eventCount,
    decisionCount: 0,
  };

  const events = Array.from({ length: eventCount }, (_, i) => ({
    id: `evt_${i}`,
    kind: i === 0 ? 'ActionRequested' : 'ActionAllowed',
    timestamp: 1700000000000 + i * 1000,
    fingerprint: `fp_${i}`,
    actionType: 'file.write',
    target: 'src/test.ts',
    justification: 'testing',
  }));

  return [JSON.stringify(header), ...events.map((e) => JSON.stringify(e))].join('\n') + '\n';
}

let stderrOutput: string[];
let stdoutOutput: string[];

beforeEach(() => {
  vi.clearAllMocks();
  stderrOutput = [];
  stdoutOutput = [];
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    stderrOutput.push(String(chunk));
    return true;
  });
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    stdoutOutput.push(String(chunk));
    return true;
  });
  // Ensure GITHUB_ACTIONS is not set during tests
  delete process.env.GITHUB_ACTIONS;
});

describe('ciCheck CLI', () => {
  it('shows usage when no arguments provided', async () => {
    const code = await ciCheck([]);

    expect(code).toBe(1);
    expect(stderrOutput.join('')).toContain('Usage:');
  });

  it('loads a session from exported file', async () => {
    const session = makeReplaySession({ denied: 0, violations: 0 });
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(makeExportFile());
    vi.mocked(buildReplaySession).mockReturnValue(session as never);

    const code = await ciCheck(['session.agentguard.jsonl']);

    expect(code).toBe(0);
    expect(buildReplaySession).toHaveBeenCalledWith('run_export_1', expect.any(Array));
    expect(stderrOutput.join('')).toContain('PASS');
  });

  it('errors when session file not found', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const code = await ciCheck(['missing.jsonl']);

    expect(code).toBe(1);
    expect(stderrOutput.join('')).toContain('Session file not found');
  });

  it('errors when session file is invalid', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('not-json\n');

    const code = await ciCheck(['bad.jsonl']);

    expect(code).toBe(1);
    expect(stderrOutput.join('')).toContain('Could not parse');
  });

  it('uses --last to load most recent local run', async () => {
    const session = makeReplaySession({ denied: 0, violations: 0 });
    vi.mocked(getLatestRunId).mockReturnValue('run_latest_1');
    vi.mocked(loadReplaySession).mockReturnValue(session as never);

    const code = await ciCheck(['--last']);

    expect(code).toBe(0);
    expect(getLatestRunId).toHaveBeenCalledWith('.agentguard');
    expect(loadReplaySession).toHaveBeenCalledWith('run_latest_1', { baseDir: '.agentguard' });
  });

  it('errors when --last and no runs found', async () => {
    vi.mocked(getLatestRunId).mockReturnValue(undefined as never);

    const code = await ciCheck(['--last']);

    expect(code).toBe(1);
    expect(stderrOutput.join('')).toContain('No governance runs found');
  });

  it('passes when no violations and --fail-on-violation set', async () => {
    const session = makeReplaySession({ denied: 0, violations: 0 });
    vi.mocked(getLatestRunId).mockReturnValue('run_clean');
    vi.mocked(loadReplaySession).mockReturnValue(session as never);

    const code = await ciCheck(['--last', '--fail-on-violation']);

    expect(code).toBe(0);
    expect(stderrOutput.join('')).toContain('PASS');
  });

  it('fails when violations exist and --fail-on-violation set', async () => {
    const session = makeReplaySession({ violations: 3 });
    vi.mocked(getLatestRunId).mockReturnValue('run_bad');
    vi.mocked(loadReplaySession).mockReturnValue(session as never);

    const code = await ciCheck(['--last', '--fail-on-violation']);

    expect(code).toBe(1);
    expect(stderrOutput.join('')).toContain('FAIL');
  });

  it('passes when violations exist but --fail-on-violation not set', async () => {
    const session = makeReplaySession({ violations: 3, denied: 0 });
    vi.mocked(getLatestRunId).mockReturnValue('run_violations');
    vi.mocked(loadReplaySession).mockReturnValue(session as never);

    const code = await ciCheck(['--last']);

    expect(code).toBe(0);
  });

  it('fails when denials exist and --fail-on-denial set', async () => {
    const session = makeReplaySession({ denied: 5, violations: 0 });
    vi.mocked(getLatestRunId).mockReturnValue('run_denied');
    vi.mocked(loadReplaySession).mockReturnValue(session as never);

    const code = await ciCheck(['--last', '--fail-on-denial']);

    expect(code).toBe(1);
  });

  it('passes when no denials and --fail-on-denial set', async () => {
    const session = makeReplaySession({ denied: 0, violations: 0 });
    vi.mocked(getLatestRunId).mockReturnValue('run_clean');
    vi.mocked(loadReplaySession).mockReturnValue(session as never);

    const code = await ciCheck(['--last', '--fail-on-denial']);

    expect(code).toBe(0);
  });

  it('outputs JSON when --json flag set', async () => {
    const session = makeReplaySession();
    vi.mocked(getLatestRunId).mockReturnValue('run_json');
    vi.mocked(loadReplaySession).mockReturnValue(session as never);

    const code = await ciCheck(['--last', '--json']);

    const output = stdoutOutput.join('');
    const result = JSON.parse(output);
    expect(result.runId).toBe('run_test_123');
    expect(result.totalActions).toBe(10);
    expect(result.allowed).toBe(8);
    expect(result.denied).toBe(2);
    expect(result.violations).toBe(1);
    expect(result.pass).toBe(true); // no --fail flags
    expect(code).toBe(0);
  });

  it('outputs GitHub Actions annotations when GITHUB_ACTIONS is set', async () => {
    process.env.GITHUB_ACTIONS = 'true';
    const session = makeReplaySession({ denied: 1, violations: 1 });
    vi.mocked(getLatestRunId).mockReturnValue('run_ci');
    vi.mocked(loadReplaySession).mockReturnValue(session as never);

    const code = await ciCheck(['--last', '--fail-on-violation']);

    const output = stdoutOutput.join('');
    expect(output).toContain('::error title=Governance Check Failed');
    expect(output).toContain('::notice title=Governance Summary');
    expect(code).toBe(1);

    delete process.env.GITHUB_ACTIONS;
  });

  it('shows denial reasons in terminal output', async () => {
    const session = makeReplaySession();
    vi.mocked(getLatestRunId).mockReturnValue('run_reasons');
    vi.mocked(loadReplaySession).mockReturnValue(session as never);

    await ciCheck(['--last']);

    const output = stderrOutput.join('');
    expect(output).toContain('Protected branch violation');
    expect(output).toContain('Blast radius exceeded');
  });

  it('uses custom --base-dir', async () => {
    const session = makeReplaySession({ denied: 0, violations: 0 });
    vi.mocked(getLatestRunId).mockReturnValue('run_custom');
    vi.mocked(loadReplaySession).mockReturnValue(session as never);

    await ciCheck(['--last', '--base-dir', '/custom/path']);

    expect(getLatestRunId).toHaveBeenCalledWith('/custom/path');
    expect(loadReplaySession).toHaveBeenCalledWith('run_custom', { baseDir: '/custom/path' });
  });

  it('combines --fail-on-violation and --fail-on-denial', async () => {
    // Violations but no denials — should still fail
    const session = makeReplaySession({ denied: 0, violations: 2 });
    vi.mocked(getLatestRunId).mockReturnValue('run_combo');
    vi.mocked(loadReplaySession).mockReturnValue(session as never);

    const code = await ciCheck(['--last', '--fail-on-violation', '--fail-on-denial']);

    expect(code).toBe(1);
  });
});
