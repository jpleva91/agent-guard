// Tests for gemini-init CLI command
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { join } from 'node:path';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/mock-home'),
}));

vi.mock('@red-codes/core', () => ({
  resolveMainRepoRoot: vi.fn(() => '/mock-repo-root'),
}));

import { geminiInit } from '../src/commands/gemini-init.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

/** Helper: find all writeFileSync calls whose path matches a substring */
function writeCalls(substr: string) {
  return vi
    .mocked(writeFileSync)
    .mock.calls.filter((call) => (call[0] as string).includes(substr));
}

/** Helper: parse the settings.json write */
function writtenSettings() {
  const calls = writeCalls('settings.json');
  expect(calls.length).toBeGreaterThanOrEqual(1);
  return JSON.parse(calls[0][1] as string);
}

describe('geminiInit', () => {
  it('creates fresh settings.json with both BeforeTool and AfterTool hooks on first install', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await geminiInit([]);

    expect(mkdirSync).toHaveBeenCalledWith(expect.stringContaining('.gemini'), { recursive: true });

    const written = writtenSettings();
    expect(written.hooks).toBeDefined();

    // BeforeTool — governance enforcement
    expect(written.hooks.BeforeTool).toHaveLength(1);
    expect(written.hooks.BeforeTool[0].matcher).toBe('Shell|WriteFile|EditFile');
    expect(written.hooks.BeforeTool[0].hooks[0].type).toBe('command');
    expect(written.hooks.BeforeTool[0].hooks[0].command).toContain('gemini-hook');
    expect(written.hooks.BeforeTool[0].hooks[0].command).toContain('pre');

    // AfterTool — error monitoring for Shell
    expect(written.hooks.AfterTool).toHaveLength(1);
    expect(written.hooks.AfterTool[0].matcher).toBe('Shell');
    expect(written.hooks.AfterTool[0].hooks[0].type).toBe('command');
    expect(written.hooks.AfterTool[0].hooks[0].command).toContain('gemini-hook');
    expect(written.hooks.AfterTool[0].hooks[0].command).toContain('post');
  });

  it('detects already-configured hook and warns', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({
        hooks: {
          BeforeTool: [
            {
              matcher: 'Shell|WriteFile|EditFile',
              hooks: [{ type: 'command', command: 'agentguard gemini-hook pre' }],
            },
          ],
        },
      })
    );

    await geminiInit([]);

    expect(writeCalls('settings.json')).toHaveLength(0);
    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('Already configured')
    );
  });

  it('handles corrupt settings.json gracefully', async () => {
    vi.mocked(existsSync).mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.includes('settings.json')) return true;
      return false;
    });
    vi.mocked(readFileSync).mockReturnValue('not valid json!!!');

    await geminiInit([]);

    // Should warn but still proceed
    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('Warning')
    );
    // Should write a fresh config
    expect(writeCalls('settings.json').length).toBeGreaterThanOrEqual(1);
  });

  it('removes hooks with --remove flag', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({
        hooks: {
          BeforeTool: [
            {
              matcher: 'Shell|WriteFile|EditFile',
              hooks: [{ type: 'command', command: 'agentguard gemini-hook pre' }],
            },
          ],
          AfterTool: [
            {
              matcher: 'Shell',
              hooks: [{ type: 'command', command: 'agentguard gemini-hook post' }],
            },
          ],
        },
      })
    );

    await geminiInit(['--remove']);

    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('Hooks removed')
    );
  });

  it('embeds --store flag into hook commands', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await geminiInit(['--store', 'sqlite']);

    const written = writtenSettings();
    expect(written.hooks.BeforeTool[0].hooks[0].command).toContain('--store sqlite');
    expect(written.hooks.AfterTool[0].hooks[0].command).toContain('--store sqlite');
  });

  it('generates starter policy when none exists', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await geminiInit([]);

    const policyCalls = writeCalls('agentguard.yaml');
    expect(policyCalls.length).toBeGreaterThanOrEqual(1);
    expect(policyCalls[0][1]).toContain('Default Safety Policy');
  });

  it('uses global path with --global flag', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await geminiInit(['--global']);

    expect(mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining(join('/mock-home', '.gemini')),
      { recursive: true }
    );
  });
});
