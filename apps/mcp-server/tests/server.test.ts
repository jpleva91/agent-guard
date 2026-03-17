import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveConfig } from '../src/config.js';
import { createLocalDataSource } from '../src/backends/local.js';

describe('MCP server config', () => {
  it('resolves default config', () => {
    const config = resolveConfig();
    expect(config.backend).toBe('local');
    expect(config.localStore).toBe('sqlite');
    expect(config.baseDir).toBe('.agentguard');
  });

  it('resolves config from env vars', () => {
    const orig = process.env.AGENTGUARD_MCP_BACKEND;
    process.env.AGENTGUARD_MCP_BACKEND = 'firestore';
    try {
      const config = resolveConfig();
      expect(config.backend).toBe('firestore');
    } finally {
      if (orig) process.env.AGENTGUARD_MCP_BACKEND = orig;
      else delete process.env.AGENTGUARD_MCP_BACKEND;
    }
  });
});

describe('Local data source', () => {
  let tmpDir: string | undefined;
  let activeDs: ReturnType<typeof createLocalDataSource> | undefined;

  afterEach(() => {
    if (activeDs) {
      activeDs.close?.();
      activeDs = undefined;
    }
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it('creates a local data source', () => {
    const config = resolveConfig();
    const ds = createLocalDataSource(config);
    expect(ds).toBeDefined();
    expect(typeof ds.listRuns).toBe('function');
    expect(typeof ds.loadEvents).toBe('function');
    expect(typeof ds.loadDecisions).toBe('function');
    expect(typeof ds.queryEvents).toBe('function');
  });

  it('returns empty runs for empty database', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'agentguard-mcp-test-'));
    const config = {
      ...resolveConfig(),
      dbPath: join(tmpDir, 'test.db'),
      baseDir: tmpDir,
    };
    const ds = createLocalDataSource(config);
    activeDs = ds;
    const runs = await ds.listRuns();
    expect(runs).toEqual([]);
  });
});
