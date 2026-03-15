// Tests for hash-chained JSONL sink — tamper-resistant audit trail
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, appendFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { DomainEvent } from '@red-codes/core';

// We need real fs for verification tests, so we use a mixed approach:
// - Mock fs for sink creation tests
// - Use the verification function's logic directly for integrity tests

vi.mock('node:fs', () => ({
  mkdirSync: vi.fn(),
  appendFileSync: vi.fn(),
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

import {
  createChainedJsonlSink,
  verifyChainedJsonl,
  getChainedEventFilePath,
} from '@red-codes/events';
import type { ChainedRecord } from '@red-codes/events';

const GENESIS_PREV_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

function makeFakeEvent(overrides: Partial<DomainEvent> = {}): DomainEvent {
  return {
    id: 'evt_1',
    kind: 'ActionRequested',
    timestamp: 1700000000000,
    fingerprint: 'fp_1',
    actionType: 'file.read',
    target: 'test.ts',
    justification: 'test',
    ...overrides,
  } as DomainEvent;
}

function computeChainHash(prevHash: string, seq: number, event: DomainEvent): string {
  const content = `${prevHash}:${seq}:${JSON.stringify(event)}`;
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function buildChainedLines(events: DomainEvent[]): string {
  const lines: string[] = [];
  let prevHash = GENESIS_PREV_HASH;
  for (let i = 0; i < events.length; i++) {
    const chainHash = computeChainHash(prevHash, i, events[i]);
    const record: ChainedRecord = { seq: i, chainHash, prevHash, event: events[i] };
    lines.push(JSON.stringify(record));
    prevHash = chainHash;
  }
  return lines.join('\n');
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createChainedJsonlSink', () => {
  it('creates directory on first write', () => {
    const sink = createChainedJsonlSink({ runId: 'run_chain_1' });
    sink.write(makeFakeEvent());

    expect(mkdirSync).toHaveBeenCalledWith(expect.stringContaining('events'), { recursive: true });
  });

  it('writes chained records with seq, chainHash, prevHash', () => {
    const written: string[] = [];
    vi.mocked(appendFileSync).mockImplementation((_path, data) => {
      written.push(data as string);
    });

    const sink = createChainedJsonlSink({ runId: 'run_chain_1' });
    const evt1 = makeFakeEvent({ id: 'evt_1' });
    const evt2 = makeFakeEvent({ id: 'evt_2' });

    sink.write(evt1);
    sink.write(evt2);

    expect(written.length).toBe(2);

    const record1 = JSON.parse(written[0]) as ChainedRecord;
    expect(record1.seq).toBe(0);
    expect(record1.prevHash).toBe(GENESIS_PREV_HASH);
    expect(record1.event).toEqual(evt1);
    expect(record1.chainHash).toBeTruthy();

    const record2 = JSON.parse(written[1]) as ChainedRecord;
    expect(record2.seq).toBe(1);
    expect(record2.prevHash).toBe(record1.chainHash);
    expect(record2.event).toEqual(evt2);
  });

  it('computes chain hash correctly', () => {
    const written: string[] = [];
    vi.mocked(appendFileSync).mockImplementation((_path, data) => {
      written.push(data as string);
    });

    const sink = createChainedJsonlSink({ runId: 'run_chain_1' });
    const evt = makeFakeEvent();
    sink.write(evt);

    const record = JSON.parse(written[0]) as ChainedRecord;
    const expected = computeChainHash(GENESIS_PREV_HASH, 0, evt);
    expect(record.chainHash).toBe(expected);
  });

  it('tracks length and headHash', () => {
    vi.mocked(appendFileSync).mockImplementation(() => {});

    const sink = createChainedJsonlSink({ runId: 'run_chain_1' });
    expect(sink.length()).toBe(0);
    expect(sink.headHash()).toBe(GENESIS_PREV_HASH);

    sink.write(makeFakeEvent());
    expect(sink.length()).toBe(1);
    expect(sink.headHash()).not.toBe(GENESIS_PREV_HASH);
  });

  it('swallows write errors without crashing', () => {
    vi.mocked(appendFileSync).mockImplementation(() => {
      throw new Error('ENOSPC');
    });

    const sink = createChainedJsonlSink({ runId: 'run_chain_1' });
    expect(() => sink.write(makeFakeEvent())).not.toThrow();
  });

  it('calls onError callback on write failure', () => {
    const onError = vi.fn();
    vi.mocked(appendFileSync).mockImplementation(() => {
      throw new Error('ENOSPC');
    });

    const sink = createChainedJsonlSink({ runId: 'run_chain_1', onError });
    sink.write(makeFakeEvent());

    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it('writes to .chained.jsonl file', () => {
    const sink = createChainedJsonlSink({ runId: 'run_chain_1' });
    sink.write(makeFakeEvent());

    expect(appendFileSync).toHaveBeenCalledWith(
      expect.stringContaining('run_chain_1.chained.jsonl'),
      expect.any(String),
      'utf8'
    );
  });
});

describe('verifyChainedJsonl', () => {
  it('returns valid for empty file', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('');

    const result = verifyChainedJsonl('/test/empty.chained.jsonl');
    expect(result.valid).toBe(true);
    expect(result.totalRecords).toBe(0);
  });

  it('returns error for missing file', () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const result = verifyChainedJsonl('/test/missing.chained.jsonl');
    expect(result.valid).toBe(false);
    expect(result.brokenAt?.reason).toContain('File not found');
  });

  it('verifies a valid chain', () => {
    const events = [
      makeFakeEvent({ id: 'evt_1', timestamp: 1700000000000 }),
      makeFakeEvent({ id: 'evt_2', timestamp: 1700000001000 }),
      makeFakeEvent({ id: 'evt_3', timestamp: 1700000002000 }),
    ];
    const content = buildChainedLines(events);

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(content);

    const result = verifyChainedJsonl('/test/valid.chained.jsonl');
    expect(result.valid).toBe(true);
    expect(result.totalRecords).toBe(3);
    expect(result.verifiedRecords).toBe(3);
    expect(result.timeRange?.first).toBe(1700000000000);
    expect(result.timeRange?.last).toBe(1700000002000);
  });

  it('detects tampered event data', () => {
    const events = [makeFakeEvent({ id: 'evt_1' }), makeFakeEvent({ id: 'evt_2' })];
    const content = buildChainedLines(events);
    const lines = content.split('\n');

    // Tamper with the second record's event data
    const record = JSON.parse(lines[1]) as ChainedRecord;
    record.event.id = 'evt_TAMPERED';
    lines[1] = JSON.stringify(record);

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(lines.join('\n'));

    const result = verifyChainedJsonl('/test/tampered.chained.jsonl');
    expect(result.valid).toBe(false);
    expect(result.brokenAt?.seq).toBe(1);
    expect(result.brokenAt?.reason).toContain('Chain hash mismatch');
  });

  it('detects deleted record (sequence gap)', () => {
    const events = [
      makeFakeEvent({ id: 'evt_1' }),
      makeFakeEvent({ id: 'evt_2' }),
      makeFakeEvent({ id: 'evt_3' }),
    ];
    const content = buildChainedLines(events);
    const lines = content.split('\n');

    // Remove the middle record
    lines.splice(1, 1);

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(lines.join('\n'));

    const result = verifyChainedJsonl('/test/deleted.chained.jsonl');
    expect(result.valid).toBe(false);
    // Either sequence gap or prev hash mismatch will be detected
    expect(result.brokenAt).toBeDefined();
    expect(result.verifiedRecords).toBeLessThan(3);
  });

  it('detects inserted record (prev hash mismatch)', () => {
    const events = [makeFakeEvent({ id: 'evt_1' }), makeFakeEvent({ id: 'evt_2' })];
    const content = buildChainedLines(events);
    const lines = content.split('\n');

    // Insert a fake record between them
    const fakeRecord: ChainedRecord = {
      seq: 1,
      chainHash: 'fakehash',
      prevHash: 'fakeprev',
      event: makeFakeEvent({ id: 'evt_inserted' }),
    };
    lines.splice(1, 0, JSON.stringify(fakeRecord));

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(lines.join('\n'));

    const result = verifyChainedJsonl('/test/inserted.chained.jsonl');
    expect(result.valid).toBe(false);
  });

  it('detects invalid JSON', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('not valid json\n');

    const result = verifyChainedJsonl('/test/bad.chained.jsonl');
    expect(result.valid).toBe(false);
    expect(result.brokenAt?.reason).toContain('Invalid JSON');
  });

  it('extracts runId from file path', () => {
    const events = [makeFakeEvent({ id: 'evt_1' })];
    const content = buildChainedLines(events);

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(content);

    const result = verifyChainedJsonl('/test/run_abc123.chained.jsonl');
    expect(result.runId).toBe('run_abc123');
  });
});

describe('getChainedEventFilePath', () => {
  it('returns default path with .chained.jsonl extension', () => {
    const path = getChainedEventFilePath('run_42');
    expect(path).toContain('.agentguard');
    expect(path).toContain('events');
    expect(path).toContain('run_42.chained.jsonl');
  });

  it('uses custom baseDir', () => {
    const path = getChainedEventFilePath('run_42', '/audit');
    expect(path).toBe(join('/audit', 'events', 'run_42.chained.jsonl'));
  });
});
