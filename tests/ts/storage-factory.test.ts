import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createStorageBundle, resolveStorageConfig } from '../../src/storage/factory.js';
import type { DomainEvent } from '../../src/core/types.js';

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
  });

  it('defaults to jsonl', () => {
    delete process.env.AGENTGUARD_STORE;
    const config = resolveStorageConfig([]);
    expect(config.backend).toBe('jsonl');
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

  it('CLI flag takes precedence over env var', () => {
    process.env.AGENTGUARD_STORE = 'jsonl';
    const config = resolveStorageConfig(['--store', 'sqlite']);
    expect(config.backend).toBe('sqlite');
  });

  it('CLI --store jsonl overrides AGENTGUARD_STORE=sqlite', () => {
    process.env.AGENTGUARD_STORE = 'sqlite';
    const config = resolveStorageConfig(['--store', 'jsonl']);
    expect(config.backend).toBe('jsonl');
  });

  it('parses --dir flag as baseDir', () => {
    const config = resolveStorageConfig(['--dir', '/tmp/custom']);
    expect(config.baseDir).toBe('/tmp/custom');
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

  it('creates a jsonl bundle by default', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ag-test-'));
    const bundle = await createStorageBundle({ backend: 'jsonl', baseDir: tmpDir });

    expect(bundle.db).toBeUndefined();
    expect(typeof bundle.createEventSink).toBe('function');
    expect(typeof bundle.createDecisionSink).toBe('function');
    expect(typeof bundle.close).toBe('function');

    // close is a no-op for jsonl
    expect(() => bundle.close()).not.toThrow();
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
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);

    expect(names).toContain('events');
    expect(names).toContain('decisions');
    expect(names).toContain('sessions');

    db.close();
    bundle.close();
  });
});
