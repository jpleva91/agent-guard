import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDecisionJsonlSink, getDecisionFilePath } from '@red-codes/events';
import type { GovernanceDecisionRecord } from '@red-codes/core';

vi.mock('node:fs', () => ({
  mkdirSync: vi.fn(),
  appendFileSync: vi.fn(),
}));

import { mkdirSync, appendFileSync } from 'node:fs';

const mockedMkdirSync = vi.mocked(mkdirSync);
const mockedAppendFileSync = vi.mocked(appendFileSync);

function makeRecord(overrides: Partial<GovernanceDecisionRecord> = {}): GovernanceDecisionRecord {
  return {
    recordId: 'dec_123_abc',
    runId: 'run-1',
    timestamp: Date.now(),
    action: {
      type: 'file.write',
      target: 'src/index.ts',
      agent: 'test-agent',
      destructive: false,
    },
    outcome: 'allow',
    reason: 'No deny rule',
    intervention: null,
    policy: {
      matchedPolicyId: null,
      matchedPolicyName: null,
      severity: 0,
    },
    invariants: {
      checked: 10,
      violations: [],
    },
    execution: null,
    evidence: null,
    ...overrides,
  } as GovernanceDecisionRecord;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createDecisionJsonlSink', () => {
  it('creates directory on first write', () => {
    const sink = createDecisionJsonlSink({ runId: 'run-1' });
    sink.write(makeRecord());

    expect(mockedMkdirSync).toHaveBeenCalledWith(expect.stringContaining('decisions'), {
      recursive: true,
    });
  });

  it('creates directory only once', () => {
    const sink = createDecisionJsonlSink({ runId: 'run-1' });
    sink.write(makeRecord());
    sink.write(makeRecord());

    expect(mockedMkdirSync).toHaveBeenCalledTimes(1);
  });

  it('writes record as JSONL', () => {
    const sink = createDecisionJsonlSink({ runId: 'run-1' });
    const record = makeRecord();
    sink.write(record);

    expect(mockedAppendFileSync).toHaveBeenCalledWith(
      expect.stringContaining('run-1.jsonl'),
      expect.stringContaining('"recordId"'),
      'utf8'
    );

    // Verify it ends with newline
    const written = mockedAppendFileSync.mock.calls[0][1] as string;
    expect(written.endsWith('\n')).toBe(true);

    // Verify valid JSON
    const parsed = JSON.parse(written.trim());
    expect(parsed.recordId).toBe('dec_123_abc');
  });

  it('flush does not throw', () => {
    const sink = createDecisionJsonlSink({ runId: 'run-1' });
    expect(() => sink.flush?.()).not.toThrow();
  });

  it('calls onError when appendFileSync fails', () => {
    const onError = vi.fn();
    mockedAppendFileSync.mockImplementation(() => {
      throw new Error('disk full');
    });

    const sink = createDecisionJsonlSink({ runId: 'run-1', onError });
    sink.write(makeRecord());

    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(onError.mock.calls[0][0].message).toBe('disk full');
  });

  it('does not throw when appendFileSync fails without onError', () => {
    mockedAppendFileSync.mockImplementation(() => {
      throw new Error('disk full');
    });

    const sink = createDecisionJsonlSink({ runId: 'run-1' });
    expect(() => sink.write(makeRecord())).not.toThrow();
  });

  it('uses custom baseDir', () => {
    const sink = createDecisionJsonlSink({ runId: 'run-1', baseDir: '/custom' });
    sink.write(makeRecord());

    expect(mockedMkdirSync).toHaveBeenCalledWith(expect.stringContaining('custom'), {
      recursive: true,
    });
  });
});

describe('getDecisionFilePath', () => {
  it('returns correct path with default base dir', () => {
    const path = getDecisionFilePath('run-1');
    expect(path).toContain('.agentguard');
    expect(path).toContain('decisions');
    expect(path).toContain('run-1.jsonl');
  });

  it('returns correct path with custom base dir', () => {
    const filePath = getDecisionFilePath('run-1', '/custom');
    expect(filePath).toContain('custom');
    expect(filePath).toContain('run-1.jsonl');
  });
});
