// Tests for CLI analytics command — stub pointing to AgentGuard Cloud
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock process.stdout to capture output
const stdoutChunks: string[] = [];
vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
  stdoutChunks.push(chunk.toString());
  return true;
});

// Mock console.log to capture output
const logMessages: string[] = [];
vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
  logMessages.push(args.map(String).join(' '));
});

beforeEach(() => {
  stdoutChunks.length = 0;
  logMessages.length = 0;
});

describe('analytics()', () => {
  it('returns 0 and points to AgentGuard Cloud', async () => {
    const { analytics } = await import('../src/commands/analytics.js');
    const code = await analytics([]);

    expect(code).toBe(0);
    const output = logMessages.join('');
    expect(output).toContain('AgentGuard Cloud');
    expect(output).toContain('agentguard.dev');
  });

  it('returns 0 regardless of args', async () => {
    const { analytics } = await import('../src/commands/analytics.js');
    const code = await analytics(['--json', '--dir', '/some/dir']);
    expect(code).toBe(0);
  });
});
