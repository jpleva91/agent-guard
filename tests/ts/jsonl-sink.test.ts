// Tests for JSONL event and decision persistence sinks
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
  mkdirSync: vi.fn(),
  appendFileSync: vi.fn(),
}));

import { createJsonlSink, getEventFilePath } from '../../src/events/jsonl.js';
import {
  createDecisionJsonlSink,
  getDecisionFilePath,
} from '../../src/events/decision-jsonl.js';
import { mkdirSync, appendFileSync } from 'node:fs';
import type { DomainEvent } from '../../src/core/types.js';
import type { GovernanceDecisionRecord } from '../../src/kernel/decisions/types.js';

function makeFakeEvent(overrides: Partial<DomainEvent> = {}): DomainEvent {
  return {
    id: 'evt_1',
    kind: 'ACTION_REQUESTED',
    timestamp: 1700000000000,
    fingerprint: 'fp_1',
    payload: { action: 'file.read', target: 'test.ts' },
    ...overrides,
  } as DomainEvent;
}

function makeFakeDecisionRecord(
  overrides: Partial<GovernanceDecisionRecord> = {}
): GovernanceDecisionRecord {
  return {
    recordId: 'dec_1',
    runId: 'run_1',
    timestamp: 1700000000000,
    action: { type: 'file.read', target: 'test.ts', agent: 'test', destructive: false },
    outcome: 'allow',
    reason: 'Allowed',
    intervention: null,
    policy: { matchedPolicyId: null, matchedPolicyName: null, severity: 0 },
    invariants: { allHold: true, violations: [] },
    simulation: null,
    evidencePackId: null,
    monitor: { escalationLevel: 'NORMAL', totalEvaluations: 1, totalDenials: 0 },
    execution: { executed: false, success: null, durationMs: null, error: null },
    ...overrides,
  } as GovernanceDecisionRecord;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createJsonlSink', () => {
  it('creates directory on first write', () => {
    const sink = createJsonlSink({ runId: 'run_123' });
    const event = makeFakeEvent();
    sink.write(event);

    expect(mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('events'),
      { recursive: true }
    );
  });

  it('only creates directory once', () => {
    const sink = createJsonlSink({ runId: 'run_123' });
    sink.write(makeFakeEvent());
    sink.write(makeFakeEvent({ id: 'evt_2' }));

    expect(mkdirSync).toHaveBeenCalledTimes(1);
  });

  it('writes event as JSON line', () => {
    const sink = createJsonlSink({ runId: 'run_123' });
    const event = makeFakeEvent();
    sink.write(event);

    expect(appendFileSync).toHaveBeenCalledWith(
      expect.stringContaining('run_123.jsonl'),
      JSON.stringify(event) + '\n',
      'utf8'
    );
  });

  it('handles directory creation errors gracefully', () => {
    vi.mocked(mkdirSync).mockImplementation(() => {
      throw new Error('EEXIST');
    });

    const sink = createJsonlSink({ runId: 'run_123' });
    // Should not throw
    expect(() => sink.write(makeFakeEvent())).not.toThrow();
  });

  it('swallows write errors without crashing', () => {
    vi.mocked(appendFileSync).mockImplementation(() => {
      throw new Error('ENOSPC');
    });

    const sink = createJsonlSink({ runId: 'run_123' });
    expect(() => sink.write(makeFakeEvent())).not.toThrow();
  });

  it('uses custom baseDir when provided', () => {
    const sink = createJsonlSink({ runId: 'run_1', baseDir: '/custom' });
    sink.write(makeFakeEvent());

    expect(mkdirSync).toHaveBeenCalledWith('/custom/events', { recursive: true });
    expect(appendFileSync).toHaveBeenCalledWith(
      '/custom/events/run_1.jsonl',
      expect.any(String),
      'utf8'
    );
  });

  it('flush clears the internal buffer', () => {
    const sink = createJsonlSink({ runId: 'run_1' });
    sink.write(makeFakeEvent());
    // flush should not throw
    expect(() => sink.flush()).not.toThrow();
  });
});

describe('getEventFilePath', () => {
  it('returns default path', () => {
    const path = getEventFilePath('run_42');
    expect(path).toContain('.agentguard');
    expect(path).toContain('events');
    expect(path).toContain('run_42.jsonl');
  });

  it('uses custom baseDir', () => {
    const path = getEventFilePath('run_42', '/my/dir');
    expect(path).toBe('/my/dir/events/run_42.jsonl');
  });
});

describe('createDecisionJsonlSink', () => {
  it('creates decisions directory on first write', () => {
    const sink = createDecisionJsonlSink({ runId: 'run_1' });
    sink.write(makeFakeDecisionRecord());

    expect(mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('decisions'),
      { recursive: true }
    );
  });

  it('writes decision record as JSON line', () => {
    const sink = createDecisionJsonlSink({ runId: 'run_1' });
    const record = makeFakeDecisionRecord();
    sink.write(record);

    expect(appendFileSync).toHaveBeenCalledWith(
      expect.stringContaining('run_1.jsonl'),
      JSON.stringify(record) + '\n',
      'utf8'
    );
  });

  it('swallows write errors', () => {
    vi.mocked(appendFileSync).mockImplementation(() => {
      throw new Error('ENOSPC');
    });

    const sink = createDecisionJsonlSink({ runId: 'run_1' });
    expect(() => sink.write(makeFakeDecisionRecord())).not.toThrow();
  });

  it('uses custom baseDir', () => {
    const sink = createDecisionJsonlSink({ runId: 'run_1', baseDir: '/audit' });
    sink.write(makeFakeDecisionRecord());

    expect(mkdirSync).toHaveBeenCalledWith('/audit/decisions', { recursive: true });
  });
});

describe('getDecisionFilePath', () => {
  it('returns default path', () => {
    const path = getDecisionFilePath('run_1');
    expect(path).toContain('.agentguard');
    expect(path).toContain('decisions');
    expect(path).toContain('run_1.jsonl');
  });

  it('uses custom baseDir', () => {
    const path = getDecisionFilePath('run_1', '/audit');
    expect(path).toBe('/audit/decisions/run_1.jsonl');
  });
});
