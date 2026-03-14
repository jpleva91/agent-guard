// Tests for event session export/import functionality
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  appendFileSync: vi.fn(),
}));

vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/mock-home'),
}));

import { exportSession, importSession } from '../src/file-event-store.js';
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import type { DomainEvent } from '@red-codes/core';

function makeFakeEvent(overrides: Partial<DomainEvent> = {}): DomainEvent {
  return {
    id: 'evt_1700000000000_1',
    kind: 'ActionRequested',
    timestamp: 1700000000000,
    fingerprint: 'fp_abc',
    actionType: 'file.read',
    target: 'test.ts',
    justification: 'testing',
    ...overrides,
  } as DomainEvent;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('exportSession', () => {
  it('exports a session with header and events', () => {
    const events = [
      makeFakeEvent({ id: 'evt_1' }),
      makeFakeEvent({ id: 'evt_2', timestamp: 1700000001000 }),
    ];
    const fileContent = events.map((e) => JSON.stringify(e)).join('\n') + '\n';
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(fileContent);

    const count = exportSession('test-session', '/tmp/export.jsonl');

    expect(count).toBe(2);
    expect(writeFileSync).toHaveBeenCalledTimes(1);
    const written = vi.mocked(writeFileSync).mock.calls[0][1] as string;
    const lines = written.trim().split('\n');
    expect(lines).toHaveLength(3); // header + 2 events

    const header = JSON.parse(lines[0]);
    expect(header.__agentguard_export).toBe(true);
    expect(header.version).toBe(1);
    expect(header.sessionId).toBe('test-session');
    expect(header.eventCount).toBe(2);
  });

  it('throws if session has no events', () => {
    vi.mocked(existsSync).mockReturnValue(false);

    expect(() => exportSession('empty-session', '/tmp/out.jsonl')).toThrow(
      'has no events to export'
    );
  });
});

describe('importSession', () => {
  it('imports events from an exported file', () => {
    const event = makeFakeEvent();
    const header = JSON.stringify({
      __agentguard_export: true,
      version: 1,
      sessionId: 'original-session',
      exportedAt: Date.now(),
      eventCount: 1,
    });
    const fileContent = header + '\n' + JSON.stringify(event) + '\n';

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(fileContent);

    const result = importSession('/tmp/export.jsonl');

    expect(result.sessionId).toBe('original-session');
    expect(result.eventCount).toBe(1);
    expect(appendFileSync).toHaveBeenCalledTimes(1);
  });

  it('uses targetSessionId when provided', () => {
    const event = makeFakeEvent();
    const header = JSON.stringify({
      __agentguard_export: true,
      version: 1,
      sessionId: 'original',
      exportedAt: Date.now(),
      eventCount: 1,
    });
    const fileContent = header + '\n' + JSON.stringify(event) + '\n';

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(fileContent);

    const result = importSession('/tmp/export.jsonl', 'custom-session');

    expect(result.sessionId).toBe('custom-session');
    expect(appendFileSync).toHaveBeenCalledWith(
      expect.stringContaining('custom-session.jsonl'),
      expect.any(String),
      'utf8'
    );
  });

  it('throws if file does not exist', () => {
    vi.mocked(existsSync).mockReturnValue(false);

    expect(() => importSession('/tmp/missing.jsonl')).toThrow('Import file not found');
  });

  it('throws if file is empty', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('');

    expect(() => importSession('/tmp/empty.jsonl')).toThrow('Import file is empty');
  });

  it('throws if header is not valid JSON', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('not-json\n');

    expect(() => importSession('/tmp/bad.jsonl')).toThrow('invalid header line');
  });

  it('throws if header is missing export marker', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ version: 1 }) + '\n');

    expect(() => importSession('/tmp/bad.jsonl')).toThrow('not a valid AgentGuard export');
  });

  it('skips malformed event lines and still imports valid ones', () => {
    const event = makeFakeEvent();
    const header = JSON.stringify({
      __agentguard_export: true,
      version: 1,
      sessionId: 'sess',
      exportedAt: Date.now(),
      eventCount: 2,
    });
    const fileContent = header + '\n' + 'garbage-line\n' + JSON.stringify(event) + '\n';

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(fileContent);

    const result = importSession('/tmp/mixed.jsonl');
    expect(result.eventCount).toBe(1);
  });

  it('throws if no valid events found after header', () => {
    const header = JSON.stringify({
      __agentguard_export: true,
      version: 1,
      sessionId: 'sess',
      exportedAt: Date.now(),
      eventCount: 1,
    });
    const fileContent = header + '\ngarbageline\n';

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(fileContent);

    expect(() => importSession('/tmp/noevents.jsonl')).toThrow('no valid events');
  });
});
