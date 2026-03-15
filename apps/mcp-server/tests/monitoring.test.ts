import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createLocalDataSource } from '../src/backends/local.js';
import type { McpConfig } from '../src/config.js';

const TEST_DIR = '/tmp/agentguard-mcp-test';
const EVENTS_DIR = join(TEST_DIR, 'events');
const DECISIONS_DIR = join(TEST_DIR, 'decisions');

function makeConfig(): McpConfig {
  return {
    backend: 'local',
    localStore: 'jsonl',
    baseDir: TEST_DIR,
  };
}

function writeEvents(runId: string, events: object[]): void {
  const content = events.map((e) => JSON.stringify(e)).join('\n') + '\n';
  writeFileSync(join(EVENTS_DIR, `${runId}.jsonl`), content);
}

function writeDecisions(runId: string, decisions: object[]): void {
  const content = decisions.map((d) => JSON.stringify(d)).join('\n') + '\n';
  writeFileSync(join(DECISIONS_DIR, `${runId}.jsonl`), content);
}

beforeEach(() => {
  mkdirSync(EVENTS_DIR, { recursive: true });
  mkdirSync(DECISIONS_DIR, { recursive: true });
});

afterEach(() => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
});

describe('Local data source - monitoring', () => {
  it('lists runs from events directory', async () => {
    writeEvents('run_001', [{ kind: 'RunStarted', timestamp: 1000 }]);
    writeEvents('run_002', [{ kind: 'RunStarted', timestamp: 2000 }]);

    const ds = createLocalDataSource(makeConfig());
    const runs = await ds.listRuns();
    expect(runs).toContain('run_001');
    expect(runs).toContain('run_002');
    expect(runs.length).toBe(2);
  });

  it('respects limit on listRuns', async () => {
    writeEvents('run_001', [{ kind: 'RunStarted', timestamp: 1000 }]);
    writeEvents('run_002', [{ kind: 'RunStarted', timestamp: 2000 }]);
    writeEvents('run_003', [{ kind: 'RunStarted', timestamp: 3000 }]);

    const ds = createLocalDataSource(makeConfig());
    const runs = await ds.listRuns(2);
    expect(runs.length).toBe(2);
  });

  it('loads events for a run', async () => {
    const events = [
      { kind: 'RunStarted', timestamp: 1000 },
      { kind: 'ActionRequested', timestamp: 1001 },
      { kind: 'ActionAllowed', timestamp: 1002 },
    ];
    writeEvents('run_001', events);

    const ds = createLocalDataSource(makeConfig());
    const loaded = await ds.loadEvents('run_001');
    expect(loaded.length).toBe(3);
    expect(loaded[0].kind).toBe('RunStarted');
    expect(loaded[2].kind).toBe('ActionAllowed');
  });

  it('returns empty for nonexistent run', async () => {
    const ds = createLocalDataSource(makeConfig());
    const events = await ds.loadEvents('nonexistent');
    expect(events).toEqual([]);
  });

  it('loads decisions for a run', async () => {
    const decisions = [
      {
        recordId: 'dec_001',
        outcome: 'allow',
        action: { type: 'file.read', target: 'foo.ts' },
        reason: 'Allowed by policy',
      },
    ];
    writeDecisions('run_001', decisions);

    const ds = createLocalDataSource(makeConfig());
    const loaded = await ds.loadDecisions('run_001');
    expect(loaded.length).toBe(1);
    expect(loaded[0].recordId).toBe('dec_001');
  });

  it('queries events by kind', async () => {
    const events = [
      { kind: 'ActionRequested', timestamp: 1000 },
      { kind: 'PolicyDenied', timestamp: 1001 },
      { kind: 'ActionRequested', timestamp: 1002 },
    ];
    writeEvents('run_001', events);

    const ds = createLocalDataSource(makeConfig());
    const filtered = await ds.queryEvents({ runId: 'run_001', kind: 'PolicyDenied' });
    expect(filtered.length).toBe(1);
    expect(filtered[0].kind).toBe('PolicyDenied');
  });

  it('queries events with limit', async () => {
    const events = Array.from({ length: 10 }, (_, i) => ({
      kind: 'ActionRequested',
      timestamp: 1000 + i,
    }));
    writeEvents('run_001', events);

    const ds = createLocalDataSource(makeConfig());
    const limited = await ds.queryEvents({ runId: 'run_001', limit: 3 });
    expect(limited.length).toBe(3);
  });
});
