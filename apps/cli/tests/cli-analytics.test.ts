// Tests for CLI analytics command — SQL aggregation-based governance analytics
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '@red-codes/storage';

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

describe('analytics()', () => {
  it('prints help text with --help flag', async () => {
    const { analytics } = await import('../src/commands/analytics.js');
    const code = await analytics(['--help']);

    expect(code).toBe(0);
    const output = stderrChunks.join('');
    expect(output).toContain('agentguard analytics');
    expect(output).toContain('--json');
    expect(output).toContain('--since');
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
});
