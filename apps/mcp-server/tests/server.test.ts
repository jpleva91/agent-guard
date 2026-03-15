import { describe, it, expect } from 'vitest';
import { resolveConfig } from '../src/config.js';
import { createLocalDataSource } from '../src/backends/local.js';

describe('MCP server config', () => {
  it('resolves default config', () => {
    const config = resolveConfig();
    expect(config.backend).toBe('local');
    expect(config.localStore).toBe('jsonl');
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
  it('creates a local data source', () => {
    const config = resolveConfig();
    const ds = createLocalDataSource(config);
    expect(ds).toBeDefined();
    expect(typeof ds.listRuns).toBe('function');
    expect(typeof ds.loadEvents).toBe('function');
    expect(typeof ds.loadDecisions).toBe('function');
    expect(typeof ds.queryEvents).toBe('function');
  });

  it('returns empty runs for nonexistent directory', async () => {
    const config = { ...resolveConfig(), baseDir: '/tmp/nonexistent-agentguard-test' };
    const ds = createLocalDataSource(config);
    const runs = await ds.listRuns();
    expect(runs).toEqual([]);
  });
});
