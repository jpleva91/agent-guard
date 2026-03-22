// Tests for CLI analytics command — SQL aggregation-based governance analytics
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { runMigrations } from '@red-codes/storage';
import type { StorageConfig } from '@red-codes/storage';

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

beforeEach(() => {
  stderrChunks.length = 0;
  stdoutChunks.length = 0;
});

/** Seed a database with events and decisions from multiple agents */
function seedTeamData(dbPath: string): void {
  const db = new Database(dbPath);
  runMigrations(db);

  // Events from multiple runs
  const insertEvent = db.prepare(
    `INSERT INTO events (id, run_id, kind, timestamp, fingerprint, data, action_type)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const insertDecision = db.prepare(
    `INSERT INTO decisions (record_id, run_id, timestamp, outcome, action_type, target, reason, data, severity)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  // Day 1: alice's session
  const day1 = new Date('2024-01-15T10:00:00Z').getTime();
  insertEvent.run('e1', 'run_alice_1', 'ActionAllowed', day1, 'fp1', JSON.stringify({ id: 'e1', kind: 'ActionAllowed', timestamp: day1, fingerprint: 'fp1', agent: 'alice' }), 'file.write');
  insertEvent.run('e2', 'run_alice_1', 'ActionDenied', day1 + 1000, 'fp2', JSON.stringify({ id: 'e2', kind: 'ActionDenied', timestamp: day1 + 1000, fingerprint: 'fp2', agent: 'alice' }), 'git.push');
  insertEvent.run('e3', 'run_alice_1', 'InvariantViolation', day1 + 2000, 'fp3', JSON.stringify({ id: 'e3', kind: 'InvariantViolation', timestamp: day1 + 2000, fingerprint: 'fp3', invariant: 'no-force-push', agent: 'alice' }), null);

  insertDecision.run('d1', 'run_alice_1', day1, 'allowed', 'file.write', 'src/a.ts', 'ok', JSON.stringify({ action: { agent: 'alice', type: 'file.write', target: 'src/a.ts' } }), null);
  insertDecision.run('d2', 'run_alice_1', day1 + 1000, 'denied', 'git.push', 'main', 'protected branch', JSON.stringify({ action: { agent: 'alice', type: 'git.push', target: 'main' } }), 5);

  // Day 2: bob's session
  const day2 = new Date('2024-01-16T14:00:00Z').getTime();
  insertEvent.run('e4', 'run_bob_1', 'ActionAllowed', day2, 'fp4', JSON.stringify({ id: 'e4', kind: 'ActionAllowed', timestamp: day2, fingerprint: 'fp4', agent: 'bob' }), 'file.read');
  insertEvent.run('e5', 'run_bob_1', 'ActionAllowed', day2 + 1000, 'fp5', JSON.stringify({ id: 'e5', kind: 'ActionAllowed', timestamp: day2 + 1000, fingerprint: 'fp5', agent: 'bob' }), 'file.write');
  insertEvent.run('e6', 'run_bob_1', 'InvariantViolation', day2 + 2000, 'fp6', JSON.stringify({ id: 'e6', kind: 'InvariantViolation', timestamp: day2 + 2000, fingerprint: 'fp6', invariant: 'no-force-push', agent: 'bob' }), null);

  insertDecision.run('d3', 'run_bob_1', day2, 'allowed', 'file.read', 'src/b.ts', 'ok', JSON.stringify({ action: { agent: 'bob', type: 'file.read', target: 'src/b.ts' } }), null);
  insertDecision.run('d4', 'run_bob_1', day2 + 1000, 'allowed', 'file.write', 'src/b.ts', 'ok', JSON.stringify({ action: { agent: 'bob', type: 'file.write', target: 'src/b.ts' } }), null);

  db.close();
}

describe('analytics()', () => {
  let tmpDir: string;
  let storageConfig: StorageConfig;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ag-analytics-test-'));
    storageConfig = { backend: 'sqlite', dbPath: join(tmpDir, 'test.db') };
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('prints help text with --help flag', async () => {
    const { analytics } = await import('../src/commands/analytics.js');
    const code = await analytics(['--help']);

    expect(code).toBe(0);
    const output = stderrChunks.join('');
    expect(output).toContain('agentguard analytics');
    expect(output).toContain('--json');
    expect(output).toContain('--since');
    expect(output).toContain('--team');
    expect(output).toContain('--rollup');
    expect(output).toContain('--format');
  });

  it('reports no events on an empty database', async () => {
    // Create an in-memory DB with schema
    const db = new Database(':memory:');
    runMigrations(db);

    const { analytics } = await import('../src/commands/analytics.js');
    // Pass a storage config with the in-memory db path (will fail gracefully)
    const code = await analytics([], { backend: 'sqlite', dbPath: ':memory:' });

    expect(code).toBe(0);
    const output = stderrChunks.join('');
    expect(output).toContain('No governance events found');
    db.close();
  });

  it('outputs JSON with --json flag on an empty database', async () => {
    const { analytics } = await import('../src/commands/analytics.js');
    const code = await analytics(['--json'], { backend: 'sqlite', dbPath: ':memory:' });

    // Empty database returns 0 with "no events" message (not JSON)
    expect(code).toBe(0);
  });

  // ── Team mode tests ──

  it('displays team view with --team flag', async () => {
    seedTeamData(storageConfig.dbPath!);

    const { analytics } = await import('../src/commands/analytics.js');
    const code = await analytics(['--team'], storageConfig);

    expect(code).toBe(0);
    const output = stderrChunks.join('');
    expect(output).toContain('Team Governance Analytics');
    expect(output).toContain('Per-Agent Breakdown');
    expect(output).toContain('alice');
    expect(output).toContain('bob');
    expect(output).toContain('Agents:');
  });

  it('outputs team JSON with --team --json flags', async () => {
    seedTeamData(storageConfig.dbPath!);

    const { analytics } = await import('../src/commands/analytics.js');
    const code = await analytics(['--team', '--json'], storageConfig);

    expect(code).toBe(0);
    const jsonOutput = stdoutChunks.join('');
    const report = JSON.parse(jsonOutput);
    expect(report.agents).toBeDefined();
    expect(report.agents.length).toBeGreaterThan(0);
    expect(report.teamViolationPatterns).toBeDefined();

    const alice = report.agents.find((a: { agent: string }) => a.agent === 'alice');
    expect(alice).toBeDefined();
    expect(alice.denied).toBe(1);
  });

  it('includes rollup data with --rollup daily', async () => {
    seedTeamData(storageConfig.dbPath!);

    const { analytics } = await import('../src/commands/analytics.js');
    const code = await analytics(['--rollup', 'daily'], storageConfig);

    expect(code).toBe(0);
    const output = stderrChunks.join('');
    expect(output).toContain('Daily Rollup');
    expect(output).toContain('2024-01-15');
    expect(output).toContain('2024-01-16');
  });

  it('includes rollup in JSON output', async () => {
    seedTeamData(storageConfig.dbPath!);

    const { analytics } = await import('../src/commands/analytics.js');
    const code = await analytics(['--rollup', 'weekly', '--json'], storageConfig);

    expect(code).toBe(0);
    const jsonOutput = stdoutChunks.join('');
    const report = JSON.parse(jsonOutput);
    expect(report.rollup).toBeDefined();
    expect(report.rollup.granularity).toBe('weekly');
    expect(report.rollup.periods.length).toBeGreaterThan(0);
  });

  it('outputs markdown with --format markdown', async () => {
    seedTeamData(storageConfig.dbPath!);

    const { analytics } = await import('../src/commands/analytics.js');
    const code = await analytics(['--team', '--format', 'markdown'], storageConfig);

    expect(code).toBe(0);
    const md = stdoutChunks.join('');
    expect(md).toContain('# Team Governance Report');
    expect(md).toContain('## Overview');
    expect(md).toContain('## Per-Agent Breakdown');
    expect(md).toContain('alice');
    expect(md).toContain('bob');
    expect(md).toContain('| Agent |');
  });

  it('shows team-wide violation patterns in team mode', async () => {
    seedTeamData(storageConfig.dbPath!);

    const { analytics } = await import('../src/commands/analytics.js');
    const code = await analytics(['--team'], storageConfig);

    expect(code).toBe(0);
    const output = stderrChunks.join('');
    expect(output).toContain('Team-Wide Violation Patterns');
    expect(output).toContain('no-force-push');
  });
});
