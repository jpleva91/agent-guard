import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DomainEvent, GovernanceDecisionRecord } from '@red-codes/core';

// Mock @red-codes/storage to avoid requiring better-sqlite3
const mockEvents: Record<string, DomainEvent[]> = {};
const mockDecisions: Record<string, GovernanceDecisionRecord[]> = {};
const mockRunIds: string[] = [];
const mockDb = {};
const mockClose = vi.fn();

vi.mock('@red-codes/storage', () => ({
  createStorageBundle: vi.fn().mockResolvedValue({ db: mockDb, close: mockClose }),
  listRunIds: vi.fn(() => mockRunIds),
  loadRunEvents: vi.fn((_, runId: string) => mockEvents[runId] || []),
  loadRunDecisions: vi.fn((_, runId: string) => mockDecisions[runId] || []),
}));

import { createLocalDataSource } from '../src/backends/local.js';
import type { McpConfig } from '../src/config.js';

function makeConfig(): McpConfig {
  return {
    backend: 'local',
    localStore: 'sqlite',
    baseDir: '/tmp/test',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Reset mock data
  for (const key of Object.keys(mockEvents)) delete mockEvents[key];
  for (const key of Object.keys(mockDecisions)) delete mockDecisions[key];
  mockRunIds.length = 0;
});

describe('Local data source - monitoring', () => {
  it('lists runs from SQLite database', async () => {
    mockRunIds.push('run_001', 'run_002');

    const ds = createLocalDataSource(makeConfig());
    const runs = await ds.listRuns();
    expect(runs).toContain('run_001');
    expect(runs).toContain('run_002');
    expect(runs.length).toBe(2);
  });

  it('respects limit on listRuns', async () => {
    mockRunIds.push('run_001', 'run_002', 'run_003');

    const ds = createLocalDataSource(makeConfig());
    const runs = await ds.listRuns(2);
    expect(runs.length).toBe(2);
  });

  it('loads events for a run', async () => {
    mockEvents['run_001'] = [
      { id: 'e1', kind: 'RunStarted', timestamp: 1000, fingerprint: 'fp1' },
      { id: 'e2', kind: 'ActionRequested', timestamp: 1001, fingerprint: 'fp2' },
      { id: 'e3', kind: 'ActionAllowed', timestamp: 1002, fingerprint: 'fp3' },
    ] as DomainEvent[];

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
    mockDecisions['run_001'] = [
      {
        recordId: 'dec_001',
        runId: 'run_001',
        timestamp: 1000,
        outcome: 'allow',
        action: { type: 'file.read', target: 'foo.ts' },
        reason: 'Allowed by policy',
      },
    ] as unknown as GovernanceDecisionRecord[];

    const ds = createLocalDataSource(makeConfig());
    const loaded = await ds.loadDecisions('run_001');
    expect(loaded.length).toBe(1);
    expect(loaded[0].recordId).toBe('dec_001');
  });

  it('queries events by kind', async () => {
    mockEvents['run_001'] = [
      { id: 'e1', kind: 'ActionRequested', timestamp: 1000, fingerprint: 'fp1' },
      { id: 'e2', kind: 'PolicyDenied', timestamp: 1001, fingerprint: 'fp2' },
      { id: 'e3', kind: 'ActionRequested', timestamp: 1002, fingerprint: 'fp3' },
    ] as DomainEvent[];
    mockRunIds.push('run_001');

    const ds = createLocalDataSource(makeConfig());
    const filtered = await ds.queryEvents({ runId: 'run_001', kind: 'PolicyDenied' });
    expect(filtered.length).toBe(1);
    expect(filtered[0].kind).toBe('PolicyDenied');
  });

  it('queries events with limit', async () => {
    mockEvents['run_001'] = Array.from({ length: 10 }, (_, i) => ({
      id: `e${i}`,
      kind: 'ActionRequested',
      timestamp: 1000 + i,
      fingerprint: `fp${i}`,
    })) as DomainEvent[];
    mockRunIds.push('run_001');

    const ds = createLocalDataSource(makeConfig());
    const limited = await ds.queryEvents({ runId: 'run_001', limit: 3 });
    expect(limited.length).toBe(3);
  });
});
