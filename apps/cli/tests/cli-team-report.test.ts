// Tests for CLI team-report command — team-level governance observability
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '@red-codes/storage';
import { unlinkSync } from 'node:fs';

const stderrChunks: string[] = [];
vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
  stderrChunks.push(chunk.toString());
  return true;
});

const stdoutChunks: string[] = [];
vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
  stdoutChunks.push(chunk.toString());
  return true;
});

const tmpFiles: string[] = [];

beforeEach(() => {
  stderrChunks.length = 0;
  stdoutChunks.length = 0;
});

afterEach(() => {
  for (const f of tmpFiles) {
    try {
      unlinkSync(f);
    } catch {
      // ignore
    }
  }
  tmpFiles.length = 0;
});

function createSeededDb(): string {
  const tmpPath = `/tmp/team-report-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.db`;
  tmpFiles.push(tmpPath);

  const db = new Database(tmpPath);
  runMigrations(db);

  const now = Date.now();

  // Agent alpha: 2 sessions, 4 decisions (3 allowed, 1 denied)
  db.prepare(
    'INSERT INTO events (id, run_id, kind, timestamp, fingerprint, data) VALUES (?, ?, ?, ?, ?, ?)'
  ).run('e1', 'run_1', 'RunStarted', now - 5000, 'fp1', JSON.stringify({ agentName: 'alpha' }));
  db.prepare(
    'INSERT INTO events (id, run_id, kind, timestamp, fingerprint, data) VALUES (?, ?, ?, ?, ?, ?)'
  ).run('e2', 'run_1', 'ActionAllowed', now - 4000, 'fp2', '{}');

  db.prepare(
    'INSERT INTO events (id, run_id, kind, timestamp, fingerprint, data) VALUES (?, ?, ?, ?, ?, ?)'
  ).run('e3', 'run_2', 'RunStarted', now - 3000, 'fp3', JSON.stringify({ agentName: 'alpha' }));
  db.prepare(
    'INSERT INTO events (id, run_id, kind, timestamp, fingerprint, data) VALUES (?, ?, ?, ?, ?, ?)'
  ).run('e4', 'run_2', 'ActionDenied', now - 2000, 'fp4', '{}');

  // Agent beta: 1 session, 2 decisions (2 allowed)
  db.prepare(
    'INSERT INTO events (id, run_id, kind, timestamp, fingerprint, data) VALUES (?, ?, ?, ?, ?, ?)'
  ).run('e5', 'run_3', 'RunStarted', now - 1000, 'fp5', JSON.stringify({ agentName: 'beta' }));
  db.prepare(
    'INSERT INTO events (id, run_id, kind, timestamp, fingerprint, data) VALUES (?, ?, ?, ?, ?, ?)'
  ).run('e6', 'run_3', 'ActionAllowed', now - 500, 'fp6', '{}');

  // Decisions for alpha
  db.prepare(
    `INSERT INTO decisions (record_id, run_id, timestamp, outcome, action_type, target, reason, data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run('d1', 'run_1', now - 4000, 'allowed', 'file.write', 'a.ts', 'match', '{}');
  db.prepare(
    `INSERT INTO decisions (record_id, run_id, timestamp, outcome, action_type, target, reason, data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run('d2', 'run_1', now - 3500, 'allowed', 'file.write', 'b.ts', 'match', '{}');
  db.prepare(
    `INSERT INTO decisions (record_id, run_id, timestamp, outcome, action_type, target, reason, data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run('d3', 'run_1', now - 3000, 'allowed', 'file.read', 'c.ts', 'match', '{}');
  db.prepare(
    `INSERT INTO decisions (record_id, run_id, timestamp, outcome, action_type, target, reason, data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run('d4', 'run_2', now - 2000, 'denied', 'git.push', 'main', 'protected branch', '{}');

  // Decisions for beta
  db.prepare(
    `INSERT INTO decisions (record_id, run_id, timestamp, outcome, action_type, target, reason, data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run('d5', 'run_3', now - 500, 'allowed', 'file.write', 'd.ts', 'match', '{}');
  db.prepare(
    `INSERT INTO decisions (record_id, run_id, timestamp, outcome, action_type, target, reason, data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run('d6', 'run_3', now - 400, 'allowed', 'file.read', 'e.ts', 'match', '{}');

  db.close();
  return tmpPath;
}

describe('teamReportCommand()', () => {
  it('prints help text with --help flag', async () => {
    const { teamReportCommand } = await import('../src/commands/team-report.js');
    const code = await teamReportCommand(['--help']);

    expect(code).toBe(0);
    const output = stderrChunks.join('');
    expect(output).toContain('agentguard team-report');
    expect(output).toContain('--json');
    expect(output).toContain('--markdown');
    expect(output).toContain('--csv');
  });

  it('reports no events on an empty database', async () => {
    const { teamReportCommand } = await import('../src/commands/team-report.js');
    const code = await teamReportCommand([], { backend: 'sqlite', dbPath: ':memory:' });

    expect(code).toBe(0);
    const output = stderrChunks.join('');
    expect(output).toContain('No governance events found');
  });

  it('renders text output with agent profiles', async () => {
    const tmpPath = createSeededDb();

    const { teamReportCommand } = await import('../src/commands/team-report.js');
    const code = await teamReportCommand([], {
      backend: 'sqlite',
      dbPath: tmpPath,
    });

    expect(code).toBe(0);
    const output = stderrChunks.join('');
    expect(output).toContain('Team Governance Report');
    expect(output).toContain('Agent Profiles');
    expect(output).toContain('alpha');
    expect(output).toContain('beta');
  });

  it('outputs JSON with --json flag', async () => {
    const tmpPath = createSeededDb();

    const { teamReportCommand } = await import('../src/commands/team-report.js');
    const code = await teamReportCommand(['--json'], {
      backend: 'sqlite',
      dbPath: tmpPath,
    });

    expect(code).toBe(0);
    const json = JSON.parse(stdoutChunks.join(''));
    expect(json.overview).toBeDefined();
    expect(json.agents).toBeInstanceOf(Array);
    expect(json.agents.length).toBe(2);

    const alpha = json.agents.find((a: { agent: string }) => a.agent === 'alpha');
    expect(alpha.sessions).toBe(2);
    expect(alpha.allowed).toBe(3);
    expect(alpha.denied).toBe(1);
  });

  it('outputs markdown with --markdown flag', async () => {
    const tmpPath = createSeededDb();

    const { teamReportCommand } = await import('../src/commands/team-report.js');
    const code = await teamReportCommand(['--markdown'], {
      backend: 'sqlite',
      dbPath: tmpPath,
    });

    expect(code).toBe(0);
    const output = stdoutChunks.join('');
    expect(output).toContain('# Team Governance Report');
    expect(output).toContain('## Agent Profiles');
    expect(output).toContain('| alpha |');
    expect(output).toContain('| beta |');
  });

  it('outputs CSV with --csv flag', async () => {
    const tmpPath = createSeededDb();

    const { teamReportCommand } = await import('../src/commands/team-report.js');
    const code = await teamReportCommand(['--csv'], {
      backend: 'sqlite',
      dbPath: tmpPath,
    });

    expect(code).toBe(0);
    const output = stdoutChunks.join('');
    expect(output).toContain('agent,sessions,total_actions,allowed,denied');
    expect(output).toContain('alpha,');
    expect(output).toContain('beta,');
  });
});
