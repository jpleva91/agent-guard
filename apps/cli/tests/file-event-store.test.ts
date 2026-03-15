// Tests for createFileEventStore, listSessions, loadSession
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

import { createFileEventStore, listSessions, loadSession } from '../src/file-event-store.js';
import { readFileSync, writeFileSync, existsSync, readdirSync, appendFileSync } from 'node:fs';
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

// ---------------------------------------------------------------------------
// createFileEventStore
// ---------------------------------------------------------------------------

describe('createFileEventStore', () => {
  it('creates with provided session ID', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    const store = createFileEventStore('my-session');
    expect(store.sessionId).toBe('my-session');
  });

  it('generates session ID when not provided', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    const store = createFileEventStore();
    expect(store.sessionId).toMatch(/^session_/);
  });

  describe('append', () => {
    it('appends valid event to file', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      const store = createFileEventStore('sess1');
      const event = makeFakeEvent();

      store.append(event);

      expect(appendFileSync).toHaveBeenCalledWith(
        expect.stringContaining('sess1.jsonl'),
        expect.stringContaining('"ActionRequested"'),
        'utf8'
      );
    });

    it('throws for invalid event', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      const store = createFileEventStore('sess1');

      expect(() => store.append({} as DomainEvent)).toThrow('Cannot append invalid event');
    });
  });

  describe('query', () => {
    it('returns all events with no filter', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue(['s1.jsonl'] as unknown as ReturnType<
        typeof readdirSync
      >);
      const event = makeFakeEvent();
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(event) + '\n');

      const store = createFileEventStore('s1');
      const results = store.query();
      expect(results).toHaveLength(1);
      expect(results[0].kind).toBe('ActionRequested');
    });

    it('filters by kind', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue(['s1.jsonl'] as unknown as ReturnType<
        typeof readdirSync
      >);
      const events = [
        makeFakeEvent({ kind: 'ActionRequested' }),
        makeFakeEvent({ id: 'evt_2', kind: 'ActionAllowed' }),
      ];
      vi.mocked(readFileSync).mockReturnValue(
        events.map((e) => JSON.stringify(e)).join('\n') + '\n'
      );

      const store = createFileEventStore('s1');
      const results = store.query({ kind: 'ActionAllowed' });
      expect(results).toHaveLength(1);
      expect(results[0].kind).toBe('ActionAllowed');
    });

    it('filters by since timestamp', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue(['s1.jsonl'] as unknown as ReturnType<
        typeof readdirSync
      >);
      const events = [
        makeFakeEvent({ timestamp: 1000 }),
        makeFakeEvent({ id: 'evt_2', timestamp: 2000 }),
      ];
      vi.mocked(readFileSync).mockReturnValue(
        events.map((e) => JSON.stringify(e)).join('\n') + '\n'
      );

      const store = createFileEventStore('s1');
      const results = store.query({ since: 1500 });
      expect(results).toHaveLength(1);
      expect(results[0].timestamp).toBe(2000);
    });

    it('filters by until timestamp', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue(['s1.jsonl'] as unknown as ReturnType<
        typeof readdirSync
      >);
      const events = [
        makeFakeEvent({ timestamp: 1000 }),
        makeFakeEvent({ id: 'evt_2', timestamp: 2000 }),
      ];
      vi.mocked(readFileSync).mockReturnValue(
        events.map((e) => JSON.stringify(e)).join('\n') + '\n'
      );

      const store = createFileEventStore('s1');
      const results = store.query({ until: 1500 });
      expect(results).toHaveLength(1);
      expect(results[0].timestamp).toBe(1000);
    });

    it('filters by fingerprint', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue(['s1.jsonl'] as unknown as ReturnType<
        typeof readdirSync
      >);
      const events = [
        makeFakeEvent({ fingerprint: 'fp_1' }),
        makeFakeEvent({ id: 'evt_2', fingerprint: 'fp_2' }),
      ];
      vi.mocked(readFileSync).mockReturnValue(
        events.map((e) => JSON.stringify(e)).join('\n') + '\n'
      );

      const store = createFileEventStore('s1');
      const results = store.query({ fingerprint: 'fp_2' });
      expect(results).toHaveLength(1);
    });
  });

  describe('replay', () => {
    it('returns all events when no fromId specified', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue(['s1.jsonl'] as unknown as ReturnType<
        typeof readdirSync
      >);
      const events = [makeFakeEvent({ id: 'evt_1' }), makeFakeEvent({ id: 'evt_2' })];
      vi.mocked(readFileSync).mockReturnValue(
        events.map((e) => JSON.stringify(e)).join('\n') + '\n'
      );

      const store = createFileEventStore('s1');
      const results = store.replay();
      expect(results).toHaveLength(2);
    });

    it('returns events from specific ID onward', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue(['s1.jsonl'] as unknown as ReturnType<
        typeof readdirSync
      >);
      const events = [
        makeFakeEvent({ id: 'evt_1', timestamp: 1000 }),
        makeFakeEvent({ id: 'evt_2', timestamp: 2000 }),
        makeFakeEvent({ id: 'evt_3', timestamp: 3000 }),
      ];
      vi.mocked(readFileSync).mockReturnValue(
        events.map((e) => JSON.stringify(e)).join('\n') + '\n'
      );

      const store = createFileEventStore('s1');
      const results = store.replay('evt_2');
      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('evt_2');
    });

    it('returns empty array when fromId not found', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue(['s1.jsonl'] as unknown as ReturnType<
        typeof readdirSync
      >);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(makeFakeEvent()) + '\n');

      const store = createFileEventStore('s1');
      const results = store.replay('nonexistent');
      expect(results).toEqual([]);
    });
  });

  describe('count', () => {
    it('returns total event count', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue(['s1.jsonl'] as unknown as ReturnType<
        typeof readdirSync
      >);
      const events = [makeFakeEvent({ id: 'evt_1' }), makeFakeEvent({ id: 'evt_2' })];
      vi.mocked(readFileSync).mockReturnValue(
        events.map((e) => JSON.stringify(e)).join('\n') + '\n'
      );

      const store = createFileEventStore('s1');
      expect(store.count()).toBe(2);
    });
  });

  describe('clear', () => {
    it('empties the session file', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      const store = createFileEventStore('sess1');

      store.clear();

      expect(writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('sess1.jsonl'),
        '',
        'utf8'
      );
    });

    it('does nothing when session file does not exist', () => {
      vi.mocked(existsSync).mockImplementation((p) => {
        // Return true for dir creation, false for session file
        return !String(p).endsWith('.jsonl');
      });
      const store = createFileEventStore('missing');

      store.clear(); // Should not throw

      expect(writeFileSync).not.toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// listSessions
// ---------------------------------------------------------------------------

describe('listSessions', () => {
  it('returns session IDs from directory', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([
      'session_1.jsonl',
      'session_2.jsonl',
      'other.txt',
    ] as unknown as ReturnType<typeof readdirSync>);

    const sessions = listSessions();
    expect(sessions).toEqual(['session_1', 'session_2']);
  });

  it('returns empty array when no files exist', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([]);

    expect(listSessions()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// loadSession
// ---------------------------------------------------------------------------

describe('loadSession', () => {
  it('loads events from a specific session file', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    const event = makeFakeEvent();
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(event) + '\n');

    const events = loadSession('my-session');
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('ActionRequested');
  });

  it('returns empty array when session file does not exist', () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const events = loadSession('nonexistent');
    expect(events).toEqual([]);
  });

  it('skips malformed lines', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    const event = makeFakeEvent();
    vi.mocked(readFileSync).mockReturnValue('garbage\n' + JSON.stringify(event) + '\n');

    const events = loadSession('partial');
    expect(events).toHaveLength(1);
  });
});
