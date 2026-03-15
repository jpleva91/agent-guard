import { describe, it, expect, vi, beforeEach } from 'vitest';

// We need to mock session-store and colors before importing replay
vi.mock('../src/session-store.js', () => ({
  loadSession: vi.fn(),
  listSessions: vi.fn(() => []),
}));

vi.mock('../src/colors.js', () => ({
  color: (_text: string, _c: string) => _text,
  bold: (text: string) => text,
  dim: (text: string) => text,
}));

import { replay } from '../src/replay.js';
import { loadSession, listSessions } from '../src/session-store.js';

const mockedLoadSession = vi.mocked(loadSession);
const mockedListSessions = vi.mocked(listSessions);

let stdoutOutput: string;
let stderrOutput: string;

beforeEach(() => {
  vi.clearAllMocks();
  stdoutOutput = '';
  stderrOutput = '';
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
    stdoutOutput += typeof chunk === 'string' ? chunk : chunk.toString();
    return true;
  });
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
    stderrOutput += typeof chunk === 'string' ? chunk : chunk.toString();
    return true;
  });
});

describe('replay CLI functions', () => {
  describe('replay() with no args', () => {
    it('renders session list when no args', async () => {
      mockedListSessions.mockReturnValue([]);
      await replay([]);
      expect(stderrOutput).toContain('No sessions recorded');
    });

    it('renders sessions when available', async () => {
      mockedListSessions.mockReturnValue([
        {
          id: 'sess-1',
          startedAt: '2024-01-01T00:00:00Z',
          endedAt: '2024-01-01T01:00:00Z',
          eventCount: 10,
          command: 'guard',
          summary: null,
        },
      ] as never);
      await replay([]);
      expect(stdoutOutput).toContain('sess-1');
    });
  });

  describe('replay() with --last flag', () => {
    it('shows message when no sessions exist', async () => {
      mockedListSessions.mockReturnValue([]);
      await replay(['--last']);
      expect(stderrOutput).toContain('No sessions recorded');
    });

    it('loads most recent session', async () => {
      mockedListSessions.mockReturnValue([{ id: 'latest' }] as never);
      mockedLoadSession.mockReturnValue({
        id: 'latest',
        startedAt: '2024-01-01T00:00:00Z',
        events: [{ kind: 'RunStarted', timestamp: 1000 }],
      } as never);
      await replay(['--last']);
      expect(mockedLoadSession).toHaveBeenCalledWith('latest');
    });
  });

  describe('replay() with session ID', () => {
    it('shows error for non-existent session', async () => {
      mockedLoadSession.mockReturnValue(null);
      await replay(['non-existent']);
      expect(stderrOutput).toContain('not found');
    });

    it('renders timeline for existing session', async () => {
      mockedLoadSession.mockReturnValue({
        id: 'sess-1',
        startedAt: '2024-01-01T00:00:00Z',
        events: [
          { kind: 'RunStarted', timestamp: 1000 },
          { kind: 'ErrorObserved', timestamp: 2000, message: 'Something broke' },
        ],
      } as never);
      await replay(['sess-1']);
      expect(stdoutOutput).toContain('Session Replay');
      expect(stdoutOutput).toContain('Run started');
    });

    it('renders empty events message', async () => {
      mockedLoadSession.mockReturnValue({
        id: 'sess-1',
        startedAt: '2024-01-01T00:00:00Z',
        events: [],
      } as never);
      await replay(['sess-1']);
      expect(stderrOutput).toContain('no events');
    });
  });

  describe('replay() with --stats flag', () => {
    it('renders session stats', async () => {
      mockedLoadSession.mockReturnValue({
        id: 'sess-1',
        startedAt: '2024-01-01T00:00:00Z',
        events: [
          { kind: 'ErrorObserved', timestamp: 1000, message: 'err' },
          {
            kind: 'ENCOUNTER_STARTED',
            timestamp: 2000,
            monster: { name: 'Bug', type: 'fire', hp: 10 },
          },
          { kind: 'BATTLE_ENDED', timestamp: 3000, result: 'victory' },
        ],
        summary: { duration: 3000 },
      } as never);
      await replay(['sess-1', '--stats']);
      expect(stdoutOutput).toContain('Session Stats');
      expect(stdoutOutput).toContain('Errors');
      expect(stdoutOutput).toContain('Encounters');
    });
  });

  describe('replay() with --filter', () => {
    it('filters events by kind', async () => {
      mockedLoadSession.mockReturnValue({
        id: 'sess-1',
        startedAt: '2024-01-01T00:00:00Z',
        events: [
          { kind: 'RunStarted', timestamp: 1000 },
          { kind: 'ErrorObserved', timestamp: 2000, message: 'err' },
          { kind: 'RunEnded', timestamp: 3000 },
        ],
      } as never);
      await replay(['sess-1', '--filter', 'ErrorObserved']);
      expect(stdoutOutput).toContain('Error observed');
      // RunStarted should be filtered out
    });

    it('shows empty when filter matches nothing', async () => {
      mockedLoadSession.mockReturnValue({
        id: 'sess-1',
        startedAt: '2024-01-01T00:00:00Z',
        events: [{ kind: 'RunStarted', timestamp: 1000 }],
      } as never);
      await replay(['sess-1', '--filter', 'NonExistentKind']);
      expect(stderrOutput).toContain('no events');
    });
  });
});
