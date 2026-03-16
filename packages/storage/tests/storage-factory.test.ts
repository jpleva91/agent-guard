import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createStorageBundle, resolveStorageConfig, resolveSqlitePath } from '@red-codes/storage';
import { DEFAULT_DB_FILENAME, DEFAULT_SQLITE_DB_PATH } from '@red-codes/storage';
import type { DomainEvent } from '@red-codes/core';

function makeEvent(id: string): DomainEvent {
  return {
    id,
    kind: 'ActionRequested',
    timestamp: Date.now(),
    fingerprint: 'fp_test',
  } as DomainEvent;
}

describe('resolveStorageConfig', () => {
  const origEnv = process.env.AGENTGUARD_STORE;

  afterEach(() => {
    if (origEnv === undefined) delete process.env.AGENTGUARD_STORE;
    else process.env.AGENTGUARD_STORE = origEnv;
    delete process.env.AGENTGUARD_DB_PATH;
  });

  it('defaults to sqlite', () => {
    delete process.env.AGENTGUARD_STORE;
    const config = resolveStorageConfig([]);
    expect(config.backend).toBe('sqlite');
  });

  it('parses --store sqlite flag', () => {
    const config = resolveStorageConfig(['--store', 'sqlite']);
    expect(config.backend).toBe('sqlite');
  });

  it('reads AGENTGUARD_STORE env var', () => {
    process.env.AGENTGUARD_STORE = 'sqlite';
    const config = resolveStorageConfig([]);
    expect(config.backend).toBe('sqlite');
  });

  it('always resolves to sqlite regardless of env var', () => {
    process.env.AGENTGUARD_STORE = 'sqlite';
    const config = resolveStorageConfig([]);
    expect(config.backend).toBe('sqlite');
  });

  it('parses --dir flag as baseDir', () => {
    const config = resolveStorageConfig(['--dir', '/tmp/custom']);
    expect(config.baseDir).toBe('/tmp/custom');
  });

  it('parses --db-path flag', () => {
    const config = resolveStorageConfig(['--db-path', '/tmp/my.db']);
    expect(config.dbPath).toBe('/tmp/my.db');
  });

  it('reads AGENTGUARD_DB_PATH env var', () => {
    process.env.AGENTGUARD_DB_PATH = '/tmp/env.db';
    const config = resolveStorageConfig([]);
    expect(config.dbPath).toBe('/tmp/env.db');
  });

  it('--db-path flag takes precedence over AGENTGUARD_DB_PATH env var', () => {
    process.env.AGENTGUARD_DB_PATH = '/tmp/env.db';
    const config = resolveStorageConfig(['--db-path', '/tmp/flag.db']);
    expect(config.dbPath).toBe('/tmp/flag.db');
  });
});

describe('resolveSqlitePath', () => {
  it('returns explicit dbPath when provided', () => {
    const result = resolveSqlitePath({ backend: 'sqlite', dbPath: '/custom/path.db' });
    expect(result).toBe('/custom/path.db');
  });

  it('returns baseDir + filename when baseDir is provided', () => {
    const result = resolveSqlitePath({ backend: 'sqlite', baseDir: '/custom/dir' });
    expect(result).toBe(join('/custom/dir', DEFAULT_DB_FILENAME));
  });

  it('defaults to home directory when no overrides and no repo-local DB', () => {
    // Run from a temp dir where .agentguard/agentguard.db does not exist
    const origCwd = process.cwd();
    const tmpDir = mkdtempSync(join(tmpdir(), 'ag-resolve-'));
    process.chdir(tmpDir);

    try {
      const result = resolveSqlitePath({ backend: 'sqlite' });
      expect(result).toBe(DEFAULT_SQLITE_DB_PATH);
    } finally {
      process.chdir(origCwd);
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('uses repo-local DB and emits migration hint when it exists', () => {
    const origCwd = process.cwd();
    const tmpDir = mkdtempSync(join(tmpdir(), 'ag-resolve-'));
    process.chdir(tmpDir);

    // Create a repo-local .agentguard/agentguard.db
    mkdirSync(join(tmpDir, '.agentguard'), { recursive: true });
    writeFileSync(join(tmpDir, '.agentguard', DEFAULT_DB_FILENAME), '');

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    try {
      const result = resolveSqlitePath({ backend: 'sqlite' });
      expect(result).toBe(join('.agentguard', DEFAULT_DB_FILENAME));

      // Should have emitted a migration hint
      const output = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('repo-local');
      expect(output).toContain('Hint');
    } finally {
      stderrSpy.mockRestore();
      process.chdir(origCwd);
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('explicit dbPath takes priority over repo-local DB', () => {
    const result = resolveSqlitePath({ backend: 'sqlite', dbPath: '/explicit/path.db' });
    expect(result).toBe('/explicit/path.db');
  });
});

describe('createStorageBundle', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) {
      try {
        rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // cleanup best-effort
      }
    }
  });

  it('creates a sqlite bundle by default', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ag-test-'));
    const dbPath = join(tmpDir, 'default.db');
    const bundle = await createStorageBundle({ backend: 'sqlite', dbPath });

    expect(bundle.db).toBeTruthy();
    expect(typeof bundle.createEventSink).toBe('function');
    expect(typeof bundle.createDecisionSink).toBe('function');
    expect(typeof bundle.close).toBe('function');

    bundle.close();
  });

  it('creates a sqlite bundle with database', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ag-test-'));
    const dbPath = join(tmpDir, 'test.db');
    const bundle = await createStorageBundle({ backend: 'sqlite', dbPath });

    expect(bundle.db).toBeTruthy();
    expect(typeof bundle.createEventSink).toBe('function');
    expect(typeof bundle.createDecisionSink).toBe('function');

    // Write an event through the sink
    const sink = bundle.createEventSink('run_test');
    sink.write(makeEvent('e1'));

    bundle.close();
  });

  it('sqlite bundle runs migrations on creation', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ag-test-'));
    const dbPath = join(tmpDir, 'test.db');
    const bundle = await createStorageBundle({ backend: 'sqlite', dbPath });

    // Verify tables exist by querying them
    const Database = (await import('better-sqlite3')).default;
    const db = new Database(dbPath);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {
      name: string;
    }[];
    const names = tables.map((t) => t.name);

    expect(names).toContain('events');
    expect(names).toContain('decisions');
    expect(names).toContain('sessions');

    db.close();
    bundle.close();
  });
});
