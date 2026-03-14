// Tests for CLI analytics command — cross-session violation pattern analysis
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @red-codes/analytics before importing the command
vi.mock('@red-codes/analytics', () => ({
  analyze: vi.fn(),
  toMarkdown: vi.fn(() => '# Markdown Report'),
  toJson: vi.fn(() => '{"json":true}'),
  toTerminal: vi.fn(() => '\n  Terminal Report\n'),
  computeAllRunRiskScores: vi.fn(() => []),
}));

import { analyze, toMarkdown, toJson, toTerminal } from '@red-codes/analytics';

// Mock process.stderr and process.stdout to capture output
const stderrChunks: string[] = [];
const stdoutChunks: string[] = [];
vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
  stderrChunks.push(chunk.toString());
  return true;
});
vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
  stdoutChunks.push(chunk.toString());
  return true;
});

beforeEach(() => {
  vi.clearAllMocks();
  stderrChunks.length = 0;
  stdoutChunks.length = 0;
});

const mockAnalyze = vi.mocked(analyze);
const mockToTerminal = vi.mocked(toTerminal);
const mockToJson = vi.mocked(toJson);
const mockToMarkdown = vi.mocked(toMarkdown);

const emptyReport = {
  generatedAt: Date.now(),
  sessionsAnalyzed: 0,
  totalViolations: 0,
  violationsByKind: {},
  clusters: [],
  trends: [],
  topInferredCauses: [],
  runRiskScores: [],
};

const violationReport = {
  generatedAt: Date.now(),
  sessionsAnalyzed: 3,
  totalViolations: 5,
  violationsByKind: { PolicyDenied: 3, InvariantViolation: 2 },
  clusters: [],
  trends: [],
  topInferredCauses: [],
  runRiskScores: [],
};

describe('analytics() with JSONL backend (no storageConfig)', () => {
  it('returns 0 and writes "No violations found" when analyze returns totalViolations: 0', async () => {
    mockAnalyze.mockReturnValue(emptyReport);

    const { analytics } = await import('../src/commands/analytics.js');
    const code = await analytics([]);

    expect(code).toBe(0);
    const output = stderrChunks.join('');
    expect(output).toContain('No violations found');
  });

  it('returns 0 and calls toTerminal when violations exist (default format)', async () => {
    mockAnalyze.mockReturnValue(violationReport);

    const { analytics } = await import('../src/commands/analytics.js');
    const code = await analytics([]);

    expect(code).toBe(0);
    expect(mockToTerminal).toHaveBeenCalledWith(violationReport);
  });

  it('calls toJson when --json flag is present', async () => {
    mockAnalyze.mockReturnValue(violationReport);

    const { analytics } = await import('../src/commands/analytics.js');
    const code = await analytics(['--json']);

    expect(code).toBe(0);
    expect(mockToJson).toHaveBeenCalledWith(violationReport);
    expect(stdoutChunks.join('')).toContain('{"json":true}');
  });

  it('calls toJson when --format json is present', async () => {
    mockAnalyze.mockReturnValue(violationReport);

    const { analytics } = await import('../src/commands/analytics.js');
    const code = await analytics(['--format', 'json']);

    expect(code).toBe(0);
    expect(mockToJson).toHaveBeenCalledWith(violationReport);
  });

  it('calls toMarkdown when --markdown flag is present', async () => {
    mockAnalyze.mockReturnValue(violationReport);

    const { analytics } = await import('../src/commands/analytics.js');
    const code = await analytics(['--markdown']);

    expect(code).toBe(0);
    expect(mockToMarkdown).toHaveBeenCalledWith(violationReport);
    expect(stdoutChunks.join('')).toContain('# Markdown Report');
  });

  it('calls toMarkdown when --md flag is present', async () => {
    mockAnalyze.mockReturnValue(violationReport);

    const { analytics } = await import('../src/commands/analytics.js');
    const code = await analytics(['--md']);

    expect(code).toBe(0);
    expect(mockToMarkdown).toHaveBeenCalledWith(violationReport);
  });

  it('passes --dir to analyze', async () => {
    mockAnalyze.mockReturnValue(emptyReport);

    const { analytics } = await import('../src/commands/analytics.js');
    await analytics(['--dir', '/tmp/sessions']);

    expect(mockAnalyze).toHaveBeenCalledWith(
      expect.objectContaining({ baseDir: '/tmp/sessions' })
    );
  });

  it('passes --min-cluster to analyze', async () => {
    mockAnalyze.mockReturnValue(emptyReport);

    const { analytics } = await import('../src/commands/analytics.js');
    await analytics(['--min-cluster', '5']);

    expect(mockAnalyze).toHaveBeenCalledWith(
      expect.objectContaining({ minClusterSize: 5 })
    );
  });
});

describe('analytics() with --query (requires sqlite)', () => {
  it('returns 1 with error when storageConfig is not sqlite', async () => {
    const { analytics } = await import('../src/commands/analytics.js');
    const code = await analytics(['--query', 'top-denied'], {
      backend: 'jsonl',
    } as unknown as import('@red-codes/storage').StorageConfig);

    expect(code).toBe(1);
    const output = stderrChunks.join('');
    expect(output).toContain('--query requires SQLite storage backend');
  });

  it('returns 1 with error when storageConfig is undefined', async () => {
    const { analytics } = await import('../src/commands/analytics.js');
    const code = await analytics(['--query', 'top-denied']);

    expect(code).toBe(1);
    const output = stderrChunks.join('');
    expect(output).toContain('--query requires SQLite storage backend');
  });
});
