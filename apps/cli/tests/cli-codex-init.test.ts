// Tests for codex-init CLI command
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

import { codexInit } from '../src/commands/codex-init.js';
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

/** Helper: parse the hooks.json write */
function writtenHooks() {
  const calls = writeCalls('hooks.json');
  expect(calls.length).toBeGreaterThanOrEqual(1);
  return JSON.parse(calls[0][1] as string);
}

describe('codexInit', () => {
  it('creates fresh hooks.json with both PreToolUse and PostToolUse hooks on first install', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await codexInit([]);

    expect(mkdirSync).toHaveBeenCalledWith(expect.stringContaining('.codex'), { recursive: true });

    const written = writtenHooks();
    expect(written.hooks).toBeDefined();

    // PreToolUse — governance enforcement
    expect(written.hooks.PreToolUse).toHaveLength(1);
    expect(written.hooks.PreToolUse[0].matcher).toBe('Bash|Write|Edit');
    expect(written.hooks.PreToolUse[0].hooks[0].type).toBe('command');
    expect(written.hooks.PreToolUse[0].hooks[0].command).toContain('codex-hook');
    expect(written.hooks.PreToolUse[0].hooks[0].command).toContain('pre');

    // PostToolUse — error monitoring for Bash
    expect(written.hooks.PostToolUse).toHaveLength(1);
    expect(written.hooks.PostToolUse[0].matcher).toBe('Bash');
    expect(written.hooks.PostToolUse[0].hooks[0].type).toBe('command');
    expect(written.hooks.PostToolUse[0].hooks[0].command).toContain('codex-hook');
    expect(written.hooks.PostToolUse[0].hooks[0].command).toContain('post');
  });

  it('detects already-configured hook and warns', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              matcher: 'Bash|Write|Edit',
              hooks: [{ type: 'command', command: 'agentguard codex-hook pre' }],
            },
          ],
        },
      })
    );

    await codexInit([]);

    expect(writeCalls('hooks.json')).toHaveLength(0);
    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('Already configured')
    );
  });

  it('handles corrupt hooks.json gracefully', async () => {
    vi.mocked(existsSync).mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.includes('hooks.json')) return true;
      return false;
    });
    vi.mocked(readFileSync).mockReturnValue('not valid json!!!');

    await codexInit([]);

    // Should warn but still proceed
    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('Warning')
    );
    // Should write a fresh config
    expect(writeCalls('hooks.json').length).toBeGreaterThanOrEqual(1);
  });

  it('removes hooks with --remove flag', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              matcher: 'Bash|Write|Edit',
              hooks: [{ type: 'command', command: 'agentguard codex-hook pre' }],
            },
          ],
          PostToolUse: [
            {
              matcher: 'Bash',
              hooks: [{ type: 'command', command: 'agentguard codex-hook post' }],
            },
          ],
        },
      })
    );

    await codexInit(['--remove']);

    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('Hooks removed')
    );
  });

  it('embeds --store flag into hook commands', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await codexInit(['--store', 'sqlite']);

    const written = writtenHooks();
    expect(written.hooks.PreToolUse[0].hooks[0].command).toContain('--store sqlite');
    expect(written.hooks.PostToolUse[0].hooks[0].command).toContain('--store sqlite');
  });

  it('generates starter policy when none exists', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await codexInit([]);

    const policyCalls = writeCalls('agentguard.yaml');
    expect(policyCalls.length).toBeGreaterThanOrEqual(1);
    expect(policyCalls[0][1]).toContain('Default Safety Policy');
  });

  it('uses global path with --global flag', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await codexInit(['--global']);

    expect(mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining(join('/mock-home', '.codex')),
      { recursive: true }
    );
  });
});
