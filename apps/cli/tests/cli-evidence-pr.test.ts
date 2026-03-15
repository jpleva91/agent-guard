// Tests for the agentguard evidence-pr CLI command
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
}));

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

import { evidencePr } from '../src/commands/evidence-pr.js';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { parseArgs } from '../src/args.js';
import { aggregateEvents, formatEvidenceMarkdown } from '../src/evidence-summary.js';

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

/** Helper: set up a run directory with the given JSONL file names. */
function mockRunDir(files: string[]) {
  vi.mocked(existsSync).mockReturnValue(true);
  vi.mocked(readdirSync).mockReturnValue(files as never);
}

/** Helper: make existsSync respond true for the events dir and a specific run file. */
function mockRunFile(content: string) {
  vi.mocked(existsSync).mockReturnValue(true);
  vi.mocked(readFileSync).mockReturnValue(content);
}

/** Helper: set up aggregate + format mocks with defaults. */
function mockEvidencePipeline(markdown = '## Governance Evidence Report') {
  vi.mocked(aggregateEvents).mockReturnValue(mockSummary as never);
  vi.mocked(formatEvidenceMarkdown).mockReturnValue(markdown);
}

function makeEventLine(kind: string) {
  return JSON.stringify({ id: 'evt_1', kind, timestamp: 1700000000000 });
}

describe('evidencePr CLI', () => {
  describe('--dry-run mode', () => {
    it('returns 0 and writes markdown to stdout', async () => {
      mockParsed({ 'dry-run': true, run: 'run_abc' });
      const eventLine = makeEventLine('ActionAllowed');
      mockRunFile(eventLine + '\n');
      mockEvidencePipeline('# Evidence MD');

      const code = await evidencePr([]);

      expect(code).toBe(0);
      expect(stdoutOutput.join('')).toContain('# Evidence MD');
    });

    it('aggregates events from specified run (--run flag)', async () => {
      mockParsed({ 'dry-run': true, run: 'run_xyz' });
      const eventLine = makeEventLine('ActionDenied');
      mockRunFile(eventLine + '\n');
      mockEvidencePipeline();

      await evidencePr([]);

      expect(aggregateEvents).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ kind: 'ActionDenied' })])
      );
    });
  });

  describe('--run flag', () => {
    it('returns 1 with error when run has no events', async () => {
      mockParsed({ run: 'run_empty' });
      // existsSync returns false for the run file so loadRunEvents returns []
      vi.mocked(existsSync).mockReturnValue(false);

      const code = await evidencePr([]);

      expect(code).toBe(1);
      expect(stderrOutput.join('')).toContain('run_empty');
      expect(stderrOutput.join('')).toContain('no events');
    });

    it('loads events for the specified run ID', async () => {
      mockParsed({ run: 'run_specific', 'dry-run': true });
      const eventLine = makeEventLine('ActionRequested');
      mockRunFile(eventLine + '\n');
      mockEvidencePipeline();

      const code = await evidencePr([]);

      expect(code).toBe(0);
      expect(readFileSync).toHaveBeenCalled();
      expect(aggregateEvents).toHaveBeenCalled();
    });
  });

  describe('--last flag', () => {
    it('returns 1 when no runs exist (readdirSync returns [])', async () => {
      mockParsed({ last: true });
      // existsSync for EVENTS_DIR returns false
      vi.mocked(existsSync).mockReturnValue(false);

      const code = await evidencePr([]);

      expect(code).toBe(1);
      expect(stderrOutput.join('')).toContain('No governance runs');
    });

    it('returns 1 when most recent run has no events', async () => {
      mockParsed({ last: true });
      // First call: existsSync for EVENTS_DIR → true (for listRuns)
      // Second call: existsSync for run file → false (no events)
      vi.mocked(existsSync).mockReturnValueOnce(true).mockReturnValueOnce(false);
      vi.mocked(readdirSync).mockReturnValue(['run_latest.jsonl'] as never);

      const code = await evidencePr([]);

      expect(code).toBe(1);
      expect(stderrOutput.join('')).toContain('Most recent run');
      expect(stderrOutput.join('')).toContain('no events');
    });

    it('loads most recent run events', async () => {
      mockParsed({ last: true, 'dry-run': true });
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue(['run_a.jsonl', 'run_b.jsonl'] as never);
      const eventLine = makeEventLine('ActionAllowed');
      vi.mocked(readFileSync).mockReturnValue(eventLine + '\n');
      mockEvidencePipeline();

      const code = await evidencePr([]);

      expect(code).toBe(0);
      expect(aggregateEvents).toHaveBeenCalled();
    });
  });

  describe('default mode (all runs)', () => {
    it('returns 1 when no events found anywhere', async () => {
      mockParsed({});
      // existsSync for EVENTS_DIR returns false → listRuns returns []
      vi.mocked(existsSync).mockReturnValue(false);

      const code = await evidencePr([]);

      expect(code).toBe(1);
      expect(stderrOutput.join('')).toContain('No governance events found');
    });
  });

  describe('PR number resolution', () => {
    it('uses --pr flag when provided', async () => {
      mockParsed({ pr: '42', run: 'run_pr' });
      const eventLine = makeEventLine('ActionAllowed');
      mockRunFile(eventLine + '\n');
      mockEvidencePipeline();
      vi.mocked(execSync).mockReturnValue('' as never);

      const code = await evidencePr([]);

      expect(code).toBe(0);
      expect(stderrOutput.join('')).toContain('PR #42');
    });

    it('uses positional arg for PR number', async () => {
      mockParsed({}, ['99']);
      // Load all runs with events
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue(['run_1.jsonl'] as never);
      const eventLine = makeEventLine('ActionAllowed');
      vi.mocked(readFileSync).mockReturnValue(eventLine + '\n');
      mockEvidencePipeline();
      vi.mocked(execSync).mockReturnValue('' as never);

      const code = await evidencePr([]);

      expect(code).toBe(0);
      expect(stderrOutput.join('')).toContain('PR #99');
    });

    it('auto-detects via execSync gh pr view', async () => {
      mockParsed({ run: 'run_auto' });
      const eventLine = makeEventLine('ActionAllowed');
      mockRunFile(eventLine + '\n');
      mockEvidencePipeline();
      // First execSync call: detectPrNumber → returns '77'
      // Subsequent calls: postPrComment
      vi.mocked(execSync).mockReturnValue('77' as never);

      const code = await evidencePr([]);

      expect(code).toBe(0);
      expect(stderrOutput.join('')).toContain('PR #77');
    });

    it('returns 1 when PR number cannot be determined', async () => {
      mockParsed({ run: 'run_nopr' });
      const eventLine = makeEventLine('ActionAllowed');
      mockRunFile(eventLine + '\n');
      mockEvidencePipeline();
      // detectPrNumber throws → returns null
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('gh not found');
      });

      const code = await evidencePr([]);

      expect(code).toBe(1);
      expect(stderrOutput.join('')).toContain('Could not determine PR number');
    });

    it('returns 1 when PR number is non-numeric', async () => {
      mockParsed({ pr: 'abc', run: 'run_badpr' });
      const eventLine = makeEventLine('ActionAllowed');
      mockRunFile(eventLine + '\n');
      mockEvidencePipeline();

      const code = await evidencePr([]);

      expect(code).toBe(1);
      expect(stderrOutput.join('')).toContain('PR number must be numeric');
    });
  });

  describe('comment posting', () => {
    it('returns 1 when postPrComment fails (execSync throws)', async () => {
      mockParsed({ pr: '10', run: 'run_fail' });
      const eventLine = makeEventLine('ActionAllowed');
      mockRunFile(eventLine + '\n');
      mockEvidencePipeline();
      // All execSync calls throw (checking existing comments fails, posting fails)
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('gh error');
      });

      const code = await evidencePr([]);

      expect(code).toBe(1);
      expect(stderrOutput.join('')).toContain('Failed to post evidence comment');
    });

    it('returns 0 on success and writes confirmation to stderr', async () => {
      mockParsed({ pr: '55', run: 'run_ok' });
      const eventLine = makeEventLine('ActionAllowed');
      mockRunFile(eventLine + '\n');
      mockEvidencePipeline();
      // execSync succeeds for comment posting
      vi.mocked(execSync).mockReturnValue('' as never);

      const code = await evidencePr([]);

      expect(code).toBe(0);
      expect(stderrOutput.join('')).toContain('Evidence report posted to PR #55');
      expect(stderrOutput.join('')).toContain('Events analyzed');
    });
  });
});
