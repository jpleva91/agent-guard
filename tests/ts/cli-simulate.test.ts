// Tests for CLI simulate command — standalone impact analysis
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock process.exit, stderr, stdout to capture output
const _mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
const stderrChunks: string[] = [];
const stdoutChunks: string[] = [];
const _mockStderr = vi
  .spyOn(process.stderr, 'write')
  .mockImplementation((chunk: string | Uint8Array) => {
    stderrChunks.push(chunk.toString());
    return true;
  });
const _mockStdout = vi
  .spyOn(process.stdout, 'write')
  .mockImplementation((chunk: string | Uint8Array) => {
    stdoutChunks.push(chunk.toString());
    return true;
  });

beforeEach(() => {
  vi.clearAllMocks();
  stderrChunks.length = 0;
  stdoutChunks.length = 0;
});

describe('simulate command', () => {
  it('simulates a file.write action via structured flags', async () => {
    const { simulate } = await import('../../src/cli/commands/simulate.js');
    const code = await simulate(['--action', 'file.write', '--target', 'src/index.ts']);
    expect(code).toBe(0);
    const output = stderrChunks.join('');
    expect(output).toContain('filesystem-simulator');
    expect(output).toContain('Write: src/index.ts');
  });

  it('simulates a sensitive file write as high risk', async () => {
    const { simulate } = await import('../../src/cli/commands/simulate.js');
    const code = await simulate(['--action', 'file.write', '--target', '.env']);
    expect(code).toBe(0);
    const output = stderrChunks.join('');
    expect(output).toContain('HIGH');
    expect(output).toContain('Sensitive file');
  });

  it('simulates a file.delete action', async () => {
    const { simulate } = await import('../../src/cli/commands/simulate.js');
    const code = await simulate(['--action', 'file.delete', '--target', 'package-lock.json']);
    expect(code).toBe(0);
    const output = stderrChunks.join('');
    expect(output).toContain('Delete: package-lock.json');
    expect(output).toContain('Lockfile');
  });

  it('outputs JSON when --json flag is set', async () => {
    const { simulate } = await import('../../src/cli/commands/simulate.js');
    const code = await simulate(['--action', 'file.write', '--target', 'readme.md', '--json']);
    expect(code).toBe(0);
    const output = stdoutChunks.join('');
    const result = JSON.parse(output.trim());
    expect(result.simulatorId).toBe('filesystem-simulator');
    expect(result.riskLevel).toBe('low');
    expect(result.blastRadius).toBeTypeOf('number');
    expect(result.predictedChanges).toBeInstanceOf(Array);
    expect(result.durationMs).toBeTypeOf('number');
  });

  it('accepts JSON action descriptor as positional argument', async () => {
    const { simulate } = await import('../../src/cli/commands/simulate.js');
    const json = JSON.stringify({ tool: 'Write', file: '.env.production' });
    const code = await simulate([json]);
    expect(code).toBe(0);
    const output = stderrChunks.join('');
    expect(output).toContain('HIGH');
  });

  it('returns error for unsupported action type', async () => {
    const { simulate } = await import('../../src/cli/commands/simulate.js');
    const code = await simulate(['--action', 'http.request', '--target', 'https://example.com']);
    expect(code).toBe(1);
    const output = stderrChunks.join('');
    expect(output).toContain('No simulator available');
  });

  it('returns error when no action is provided', async () => {
    const { simulate } = await import('../../src/cli/commands/simulate.js');
    const code = await simulate([]);
    expect(code).toBe(1);
    const output = stderrChunks.join('');
    expect(output).toContain('No action provided');
  });

  it('returns JSON error when no action provided with --json', async () => {
    const { simulate } = await import('../../src/cli/commands/simulate.js');
    const code = await simulate(['--json']);
    expect(code).toBe(1);
    const output = stdoutChunks.join('');
    const result = JSON.parse(output.trim());
    expect(result.error).toBe('No action provided');
  });

  it('validates unknown action types with --action flag', async () => {
    const { simulate } = await import('../../src/cli/commands/simulate.js');
    const code = await simulate(['--action', 'not.a.real.action', '--target', 'foo']);
    expect(code).toBe(1);
    const output = stderrChunks.join('');
    expect(output).toContain('Unknown action type');
  });

  it('simulates npm install via shell.exec command', async () => {
    const { simulate } = await import('../../src/cli/commands/simulate.js');
    const json = JSON.stringify({ tool: 'Bash', command: 'npm install express' });
    const code = await simulate([json, '--json']);
    expect(code).toBe(0);
    const output = stdoutChunks.join('');
    const result = JSON.parse(output.trim());
    expect(result.simulatorId).toBe('package-simulator');
  });

  it('passes json option from SimulateOptions', async () => {
    const { simulate } = await import('../../src/cli/commands/simulate.js');
    const code = await simulate(['--action', 'file.write', '--target', 'src/a.ts'], {
      json: true,
    });
    expect(code).toBe(0);
    const output = stdoutChunks.join('');
    const result = JSON.parse(output.trim());
    expect(result.simulatorId).toBe('filesystem-simulator');
  });
});
