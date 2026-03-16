// Tests for the agentguard evidence-pr CLI command
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('../src/args.js', () => ({
  parseArgs: vi.fn(),
}));

vi.mock('../src/evidence-summary.js', () => ({
  aggregateEvents: vi.fn(),
  formatEvidenceMarkdown: vi.fn(),
}));

vi.mock('@red-codes/storage', () => {
  const db = {};
  const close = vi.fn();
  return {
    createStorageBundle: vi.fn().mockResolvedValue({ db, close }),
    listRunIds: vi.fn(),
    getLatestRunId: vi.fn(),
    loadRunEvents: vi.fn(),
  };
});

import { evidencePr } from '../src/commands/evidence-pr.js';
import { execSync } from 'node:child_process';
import { parseArgs } from '../src/args.js';
import { aggregateEvents, formatEvidenceMarkdown } from '../src/evidence-summary.js';
import {
  createStorageBundle,
  listRunIds,
  getLatestRunId,
  loadRunEvents,
} from '@red-codes/storage';
import type { StorageConfig } from '@red-codes/storage';

const mockSummary = {
  totalEvents: 5,
  actionsAllowed: 3,
  actionsDenied: 1,
  policyDenials: 0,
  invariantViolations: 1,
  escalations: 0,
  blastRadiusExceeded: 0,
  evidencePacksGenerated: 0,
  maxEscalationLevel: 'NORMAL',
  actionTypeBreakdown: {},
  denialReasons: [],
  violationDetails: [],
  runIds: [],
};

let stderrOutput: string[];
let stdoutOutput: string[];

const sqliteConfig: StorageConfig = { backend: 'sqlite' };
const mockEvent = { id: 'evt_1', kind: 'ActionAllowed', timestamp: 1700000000000 };

beforeEach(() => {
  vi.clearAllMocks();
  stderrOutput = [];
  stdoutOutput = [];
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    stderrOutput.push(String(chunk));
    return true;
  });
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    stdoutOutput.push(String(chunk));
    return true;
  });
});

/** Helper: set up parseArgs to return the given flags and positional args. */
function mockParsed(flags: Record<string, unknown>, positional: string[] = []) {
  vi.mocked(parseArgs).mockReturnValue({ flags, positional, rest: [] });
}

/** Helper: set up aggregate + format mocks with defaults. */
function mockEvidencePipeline(markdown = '## Governance Evidence Report') {
  vi.mocked(aggregateEvents).mockReturnValue(mockSummary as never);
  vi.mocked(formatEvidenceMarkdown).mockReturnValue(markdown);
}

describe('evidencePr CLI', () => {
  describe('--dry-run mode', () => {
    it('returns 0 and writes markdown to stdout', async () => {
      mockParsed({ 'dry-run': true, run: 'run_abc' });
      vi.mocked(loadRunEvents).mockReturnValue([mockEvent] as never);
      mockEvidencePipeline('# Evidence MD');

      const code = await evidencePr([], sqliteConfig);

      expect(code).toBe(0);
      expect(stdoutOutput.join('')).toContain('# Evidence MD');
    });

    it('aggregates events from specified run (--run flag)', async () => {
      mockParsed({ 'dry-run': true, run: 'run_xyz' });
      vi.mocked(loadRunEvents).mockReturnValue([mockEvent] as never);
      mockEvidencePipeline();

      await evidencePr([], sqliteConfig);

      expect(aggregateEvents).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ kind: 'ActionAllowed' })])
      );
    });
  });

  describe('--run flag', () => {
    it('returns 1 with error when run has no events', async () => {
      mockParsed({ run: 'run_empty' });
      vi.mocked(loadRunEvents).mockReturnValue([]);

      const code = await evidencePr([], sqliteConfig);

      expect(code).toBe(1);
      expect(stderrOutput.join('')).toContain('run_empty');
      expect(stderrOutput.join('')).toContain('no events');
    });

    it('loads events for the specified run ID', async () => {
      mockParsed({ run: 'run_specific', 'dry-run': true });
      vi.mocked(loadRunEvents).mockReturnValue([mockEvent] as never);
      mockEvidencePipeline();

      const code = await evidencePr([], sqliteConfig);

      expect(code).toBe(0);
      expect(createStorageBundle).toHaveBeenCalledWith(sqliteConfig);
      expect(loadRunEvents).toHaveBeenCalledWith(expect.anything(), 'run_specific');
      expect(aggregateEvents).toHaveBeenCalled();
    });
  });

  describe('--last flag', () => {
    it('returns 1 when no runs exist', async () => {
      mockParsed({ last: true });
      vi.mocked(getLatestRunId).mockReturnValue(null);

      const code = await evidencePr([], sqliteConfig);

      expect(code).toBe(1);
      expect(stderrOutput.join('')).toContain('No governance runs');
    });

    it('returns 1 when most recent run has no events', async () => {
      mockParsed({ last: true });
      vi.mocked(getLatestRunId).mockReturnValue('run_latest');
      vi.mocked(loadRunEvents).mockReturnValue([]);

      const code = await evidencePr([], sqliteConfig);

      expect(code).toBe(1);
      expect(stderrOutput.join('')).toContain('Most recent run');
      expect(stderrOutput.join('')).toContain('no events');
    });

    it('loads most recent run events', async () => {
      mockParsed({ last: true, 'dry-run': true });
      vi.mocked(getLatestRunId).mockReturnValue('run_latest_sq');
      vi.mocked(loadRunEvents).mockReturnValue([mockEvent] as never);
      mockEvidencePipeline();

      const code = await evidencePr([], sqliteConfig);

      expect(code).toBe(0);
      expect(getLatestRunId).toHaveBeenCalledWith(expect.anything());
      expect(loadRunEvents).toHaveBeenCalledWith(expect.anything(), 'run_latest_sq');
    });
  });

  describe('default mode (all runs)', () => {
    it('returns 1 when no events found anywhere', async () => {
      mockParsed({});
      vi.mocked(listRunIds).mockReturnValue([]);

      const code = await evidencePr([], sqliteConfig);

      expect(code).toBe(1);
      expect(stderrOutput.join('')).toContain('No governance events found');
    });

    it('aggregates all runs from SQLite', async () => {
      mockParsed({ 'dry-run': true });
      vi.mocked(listRunIds).mockReturnValue(['run_a', 'run_b']);
      vi.mocked(loadRunEvents)
        .mockReturnValueOnce([mockEvent] as never)
        .mockReturnValueOnce([{ ...mockEvent, id: 'evt_2' }] as never);
      mockEvidencePipeline();

      const code = await evidencePr([], sqliteConfig);

      expect(code).toBe(0);
      expect(listRunIds).toHaveBeenCalledWith(expect.anything());
      expect(loadRunEvents).toHaveBeenCalledTimes(2);
      expect(aggregateEvents).toHaveBeenCalledWith(expect.arrayContaining([mockEvent]));
    });
  });

  describe('PR number resolution', () => {
    it('uses --pr flag when provided', async () => {
      mockParsed({ pr: '42', run: 'run_pr' });
      vi.mocked(loadRunEvents).mockReturnValue([mockEvent] as never);
      mockEvidencePipeline();
      vi.mocked(execSync).mockReturnValue('' as never);

      const code = await evidencePr([], sqliteConfig);

      expect(code).toBe(0);
      expect(stderrOutput.join('')).toContain('PR #42');
    });

    it('uses positional arg for PR number', async () => {
      mockParsed({}, ['99']);
      vi.mocked(listRunIds).mockReturnValue(['run_1']);
      vi.mocked(loadRunEvents).mockReturnValue([mockEvent] as never);
      mockEvidencePipeline();
      vi.mocked(execSync).mockReturnValue('' as never);

      const code = await evidencePr([], sqliteConfig);

      expect(code).toBe(0);
      expect(stderrOutput.join('')).toContain('PR #99');
    });

    it('auto-detects via execSync gh pr view', async () => {
      mockParsed({ run: 'run_auto' });
      vi.mocked(loadRunEvents).mockReturnValue([mockEvent] as never);
      mockEvidencePipeline();
      vi.mocked(execSync).mockReturnValue('77' as never);

      const code = await evidencePr([], sqliteConfig);

      expect(code).toBe(0);
      expect(stderrOutput.join('')).toContain('PR #77');
    });

    it('returns 1 when PR number cannot be determined', async () => {
      mockParsed({ run: 'run_nopr' });
      vi.mocked(loadRunEvents).mockReturnValue([mockEvent] as never);
      mockEvidencePipeline();
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('gh not found');
      });

      const code = await evidencePr([], sqliteConfig);

      expect(code).toBe(1);
      expect(stderrOutput.join('')).toContain('Could not determine PR number');
    });

    it('returns 1 when PR number is non-numeric', async () => {
      mockParsed({ pr: 'abc', run: 'run_badpr' });
      vi.mocked(loadRunEvents).mockReturnValue([mockEvent] as never);
      mockEvidencePipeline();

      const code = await evidencePr([], sqliteConfig);

      expect(code).toBe(1);
      expect(stderrOutput.join('')).toContain('PR number must be numeric');
    });
  });

  describe('comment posting', () => {
    it('returns 1 when postPrComment fails (execSync throws)', async () => {
      mockParsed({ pr: '10', run: 'run_fail' });
      vi.mocked(loadRunEvents).mockReturnValue([mockEvent] as never);
      mockEvidencePipeline();
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('gh error');
      });

      const code = await evidencePr([], sqliteConfig);

      expect(code).toBe(1);
      expect(stderrOutput.join('')).toContain('Failed to post evidence comment');
    });

    it('returns 0 on success and writes confirmation to stderr', async () => {
      mockParsed({ pr: '55', run: 'run_ok' });
      vi.mocked(loadRunEvents).mockReturnValue([mockEvent] as never);
      mockEvidencePipeline();
      vi.mocked(execSync).mockReturnValue('' as never);

      const code = await evidencePr([], sqliteConfig);

      expect(code).toBe(0);
      expect(stderrOutput.join('')).toContain('Evidence report posted to PR #55');
      expect(stderrOutput.join('')).toContain('Events analyzed');
    });
  });
});
