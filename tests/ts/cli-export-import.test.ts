// Tests for CLI export and import commands
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  appendFileSync: vi.fn(),
}));

import { exportSession, EXPORT_SCHEMA_VERSION } from '../../src/cli/commands/export.js';
import { importSession } from '../../src/cli/commands/import.js';
import { readFileSync, writeFileSync, existsSync, readdirSync, appendFileSync } from 'node:fs';

function makeEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'evt_1700000000000_1',
    kind: 'ActionRequested',
    timestamp: 1700000000000,
    fingerprint: 'fp_abc',
    actionType: 'file.read',
    target: 'test.ts',
    justification: 'testing',
    ...overrides,
  };
}

function makeDecision(): Record<string, unknown> {
  return {
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
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  process.exitCode = undefined;
});

describe('exportSession CLI', () => {
  it('shows usage when no arguments provided', async () => {
    await exportSession([]);

    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('Usage:'));
    expect(process.exitCode).toBe(1);
  });

  it('exports a run with events and decisions', async () => {
    const event1 = makeEvent({ id: 'evt_1' });
    const event2 = makeEvent({ id: 'evt_2', timestamp: 1700000001000 });
    const decision = makeDecision();

    vi.mocked(existsSync).mockImplementation((p) => {
      const path = String(p);
      if (path.includes('events')) return true;
      if (path.includes('decisions')) return true;
      return false;
    });
    vi.mocked(readFileSync).mockImplementation((p) => {
      const path = String(p);
      if (path.includes('decisions')) {
        return JSON.stringify(decision) + '\n';
      }
      return [JSON.stringify(event1), JSON.stringify(event2)].join('\n') + '\n';
    });

    await exportSession(['run_test']);

    expect(writeFileSync).toHaveBeenCalledTimes(1);
    const written = vi.mocked(writeFileSync).mock.calls[0][1] as string;
    const lines = written.trim().split('\n');

    // header + 2 events + 1 decision
    expect(lines).toHaveLength(4);

    const header = JSON.parse(lines[0]);
    expect(header.__agentguard_export).toBe(true);
    expect(header.version).toBe(1);
    expect(header.schemaVersion).toBe(EXPORT_SCHEMA_VERSION);
    expect(header.runId).toBe('run_test');
    expect(header.eventCount).toBe(2);
    expect(header.decisionCount).toBe(1);
    expect(header.sourceBackend).toBe('jsonl');

    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('Exported run'));
  });

  it('exports using --last flag', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([
      'run_001.jsonl',
      'run_002.jsonl',
    ] as unknown as ReturnType<typeof readdirSync>);

    const event = makeEvent();
    vi.mocked(readFileSync).mockImplementation((p) => {
      const path = String(p);
      if (path.includes('decisions')) return '';
      return JSON.stringify(event) + '\n';
    });

    await exportSession(['--last']);

    expect(writeFileSync).toHaveBeenCalledTimes(1);
    const header = JSON.parse((vi.mocked(writeFileSync).mock.calls[0][1] as string).split('\n')[0]);
    expect(header.runId).toBe('run_002');
  });

  it('supports --output flag', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockImplementation((p) => {
      const path = String(p);
      if (path.includes('decisions')) return '';
      return JSON.stringify(makeEvent()) + '\n';
    });

    await exportSession(['run_test', '--output', 'custom-output.jsonl']);

    expect(writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('custom-output.jsonl'),
      expect.any(String),
      'utf8'
    );
  });

  it('errors when run has no events', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await exportSession(['run_missing']);

    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('no events to export')
    );
    expect(process.exitCode).toBe(1);
  });

  it('errors when --last and no runs exist', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readdirSync).mockReturnValue([]);

    await exportSession(['--last']);

    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('No runs recorded'));
    expect(process.exitCode).toBe(1);
  });
});

describe('importSession CLI', () => {
  it('shows usage when no arguments provided', async () => {
    await importSession([]);

    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('Usage:'));
    expect(process.exitCode).toBe(1);
  });

  it('imports events from an exported file', async () => {
    const event = makeEvent();
    const header = {
      __agentguard_export: true,
      version: 1,
      runId: 'run_imported',
      exportedAt: Date.now(),
      eventCount: 1,
      decisionCount: 0,
    };
    const fileContent = JSON.stringify(header) + '\n' + JSON.stringify(event) + '\n';

    vi.mocked(existsSync).mockImplementation((p) => {
      const path = String(p);
      // File exists, but the run doesn't yet
      if (path.includes('.agentguard')) return false;
      return true;
    });
    vi.mocked(readFileSync).mockReturnValue(fileContent);

    await importSession(['session.jsonl']);

    expect(appendFileSync).toHaveBeenCalledTimes(1);
    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('Imported run'));
  });

  it('imports events and decisions', async () => {
    const event = makeEvent();
    const decision = makeDecision();
    const header = {
      __agentguard_export: true,
      version: 1,
      runId: 'run_full',
      exportedAt: Date.now(),
      eventCount: 1,
      decisionCount: 1,
    };
    const fileContent =
      JSON.stringify(header) +
      '\n' +
      JSON.stringify(event) +
      '\n' +
      JSON.stringify(decision) +
      '\n';

    vi.mocked(existsSync).mockImplementation((p) => {
      const path = String(p);
      if (path.includes('.agentguard')) return false;
      return true;
    });
    vi.mocked(readFileSync).mockReturnValue(fileContent);

    await importSession(['session.jsonl']);

    // Should write events and decisions
    expect(appendFileSync).toHaveBeenCalledTimes(2);
    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('Decisions: 1'));
  });

  it('uses --as flag to override runId', async () => {
    const event = makeEvent();
    const header = {
      __agentguard_export: true,
      version: 1,
      runId: 'original_run',
      exportedAt: Date.now(),
      eventCount: 1,
      decisionCount: 0,
    };
    const fileContent = JSON.stringify(header) + '\n' + JSON.stringify(event) + '\n';

    vi.mocked(existsSync).mockImplementation((p) => {
      const path = String(p);
      if (path.includes('.agentguard')) return false;
      return true;
    });
    vi.mocked(readFileSync).mockReturnValue(fileContent);

    await importSession(['session.jsonl', '--as', 'custom_run']);

    expect(appendFileSync).toHaveBeenCalledWith(
      expect.stringContaining('custom_run'),
      expect.any(String),
      'utf8'
    );
  });

  it('errors when file does not exist', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await importSession(['missing.jsonl']);

    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('File not found'));
    expect(process.exitCode).toBe(1);
  });

  it('errors on empty file', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('');

    await importSession(['empty.jsonl']);

    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('Import file is empty')
    );
    expect(process.exitCode).toBe(1);
  });

  it('errors on invalid header', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('not-valid-json\n');

    await importSession(['bad.jsonl']);

    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('invalid header'));
    expect(process.exitCode).toBe(1);
  });

  it('errors on missing export marker', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ version: 1 }) + '\n');

    await importSession(['bad.jsonl']);

    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('Not a valid AgentGuard export')
    );
    expect(process.exitCode).toBe(1);
  });

  it('errors when no valid events found', async () => {
    const header = {
      __agentguard_export: true,
      version: 1,
      runId: 'run_bad',
      exportedAt: Date.now(),
      eventCount: 1,
      decisionCount: 0,
    };

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(header) + '\ngarbage\n');

    await importSession(['bad-events.jsonl']);

    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('no valid events'));
    expect(process.exitCode).toBe(1);
  });

  it('warns when run already exists', async () => {
    const event = makeEvent();
    const header = {
      __agentguard_export: true,
      version: 1,
      runId: 'existing_run',
      exportedAt: Date.now(),
      eventCount: 1,
      decisionCount: 0,
    };
    const fileContent = JSON.stringify(header) + '\n' + JSON.stringify(event) + '\n';

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(fileContent);

    await importSession(['session.jsonl']);

    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('already exists'));
  });

  it('accepts exports without schemaVersion (backward compatibility)', async () => {
    const event = makeEvent();
    const header = {
      __agentguard_export: true,
      version: 1,
      // no schemaVersion — old-format export
      runId: 'run_old_format',
      exportedAt: Date.now(),
      eventCount: 1,
      decisionCount: 0,
    };
    const fileContent = JSON.stringify(header) + '\n' + JSON.stringify(event) + '\n';

    vi.mocked(existsSync).mockImplementation((p) => {
      const path = String(p);
      if (path.includes('.agentguard')) return false;
      return true;
    });
    vi.mocked(readFileSync).mockReturnValue(fileContent);

    await importSession(['old-export.jsonl']);

    expect(appendFileSync).toHaveBeenCalledTimes(1);
    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('Imported run'));
  });

  it('rejects exports with unsupported schemaVersion', async () => {
    const header = {
      __agentguard_export: true,
      version: 1,
      schemaVersion: 999,
      runId: 'run_future',
      exportedAt: Date.now(),
      eventCount: 1,
      decisionCount: 0,
    };
    const fileContent = JSON.stringify(header) + '\n' + JSON.stringify(makeEvent()) + '\n';

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(fileContent);

    await importSession(['future-export.jsonl']);

    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('schema version 999')
    );
    expect(process.exitCode).toBe(1);
  });

  it('accepts exports with current schemaVersion', async () => {
    const event = makeEvent();
    const header = {
      __agentguard_export: true,
      version: 1,
      schemaVersion: EXPORT_SCHEMA_VERSION,
      runId: 'run_current',
      exportedAt: Date.now(),
      eventCount: 1,
      decisionCount: 0,
    };
    const fileContent = JSON.stringify(header) + '\n' + JSON.stringify(event) + '\n';

    vi.mocked(existsSync).mockImplementation((p) => {
      const path = String(p);
      if (path.includes('.agentguard')) return false;
      return true;
    });
    vi.mocked(readFileSync).mockReturnValue(fileContent);

    await importSession(['current-export.jsonl']);

    expect(appendFileSync).toHaveBeenCalledTimes(1);
    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('Imported run'));
  });
});
