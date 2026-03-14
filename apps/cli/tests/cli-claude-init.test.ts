// Tests for claude-init CLI command
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

import { claudeInit } from '../src/commands/claude-init.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

describe('claudeInit', () => {
  it('creates fresh settings with both PreToolUse and PostToolUse hooks on first install', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await claudeInit([]);

    expect(mkdirSync).toHaveBeenCalledWith(expect.stringContaining('.claude'), { recursive: true });
    expect(writeFileSync).toHaveBeenCalledTimes(1);

    const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string);
    expect(written.hooks).toBeDefined();

    // PreToolUse — governance enforcement for all tools
    expect(written.hooks.PreToolUse).toHaveLength(1);
    expect(written.hooks.PreToolUse[0].matcher).toBeUndefined(); // no matcher = match all
    expect(written.hooks.PreToolUse[0].hooks[0].type).toBe('command');
    expect(written.hooks.PreToolUse[0].hooks[0].command).toContain('claude-hook');
    expect(written.hooks.PreToolUse[0].hooks[0].command).toContain('pre');

    // PostToolUse — error monitoring for Bash
    expect(written.hooks.PostToolUse).toHaveLength(1);
    expect(written.hooks.PostToolUse[0].matcher).toBe('Bash');
    expect(written.hooks.PostToolUse[0].hooks[0].type).toBe('command');
    expect(written.hooks.PostToolUse[0].hooks[0].command).toContain('claude-hook');
    expect(written.hooks.PostToolUse[0].hooks[0].command).toContain('post');
  });

  it('detects already-configured hook in PreToolUse and warns', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              hooks: [{ type: 'command', command: 'node /path/to/claude-hook.js pre' }],
            },
          ],
        },
      })
    );

    await claudeInit([]);

    expect(writeFileSync).not.toHaveBeenCalled();
    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('Already configured')
    );
  });

  it('detects already-configured hook in PostToolUse and warns', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({
        hooks: {
          PostToolUse: [
            {
              matcher: 'Bash',
              hooks: [{ type: 'command', command: 'node /path/to/claude-hook.js post' }],
            },
          ],
        },
      })
    );

    await claudeInit([]);

    expect(writeFileSync).not.toHaveBeenCalled();
    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('Already configured')
    );
  });

  it('handles corrupt settings.json gracefully', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('not valid json{{{');

    await claudeInit([]);

    // Should still install hooks (with fresh config)
    expect(writeFileSync).toHaveBeenCalledTimes(1);
    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('Warning')
    );
  });

  it('uses global path with --global flag', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await claudeInit(['--global']);

    expect(mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining(join('/mock-home', '.claude')),
      { recursive: true }
    );
    expect(writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining(join('/mock-home', '.claude', 'settings.json')),
      expect.any(String),
      'utf8'
    );
  });

  it('uses global path with -g alias', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await claudeInit(['-g']);

    expect(mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining(join('/mock-home', '.claude')),
      { recursive: true }
    );
  });

  it('removes hooks from both PreToolUse and PostToolUse with --remove flag', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              hooks: [{ type: 'command', command: 'node /path/to/claude-hook.js pre' }],
            },
          ],
          PostToolUse: [
            {
              matcher: 'Bash',
              hooks: [{ type: 'command', command: 'node /path/to/claude-hook.js post' }],
            },
          ],
        },
      })
    );

    await claudeInit(['--remove']);

    expect(writeFileSync).toHaveBeenCalledTimes(1);
    const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string);
    // Both hook types should be cleaned up
    expect(written.hooks).toBeUndefined();
  });

  it('removes hook with --uninstall alias', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              hooks: [{ type: 'command', command: 'node /path/to/claude-hook.js pre' }],
            },
          ],
          PostToolUse: [
            {
              matcher: 'Bash',
              hooks: [{ type: 'command', command: 'node /path/to/claude-hook.js post' }],
            },
          ],
        },
      })
    );

    await claudeInit(['--uninstall']);

    expect(writeFileSync).toHaveBeenCalledTimes(1);
  });

  it('reports nothing to remove when no hook is present', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({}));

    await claudeInit(['--remove']);

    expect(writeFileSync).not.toHaveBeenCalled();
    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('No AgentGuard hook found')
    );
  });

  it('reports nothing to remove when no settings file exists', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await claudeInit(['--remove']);

    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('No settings file found')
    );
  });

  // --- --store flag ---

  it('embeds --store sqlite in hook commands when --store flag is provided', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await claudeInit(['--store', 'sqlite']);

    expect(writeFileSync).toHaveBeenCalledTimes(1);
    const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string);

    // PreToolUse command should include --store sqlite
    expect(written.hooks.PreToolUse[0].hooks[0].command).toContain('pre --store sqlite');

    // PostToolUse command should include --store sqlite
    expect(written.hooks.PostToolUse[0].hooks[0].command).toContain('post --store sqlite');
  });

  it('does not include --store suffix when no --store flag is provided', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await claudeInit([]);

    const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string);

    // Commands should end with just 'pre' and 'post', no trailing flags
    expect(written.hooks.PreToolUse[0].hooks[0].command).not.toContain('--store');
    expect(written.hooks.PostToolUse[0].hooks[0].command).not.toContain('--store');
  });

  it('combines --store with --global flag', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await claudeInit(['--global', '--store', 'sqlite']);

    expect(writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining(join('/mock-home', '.claude', 'settings.json')),
      expect.any(String),
      'utf8'
    );
    const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string);
    expect(written.hooks.PreToolUse[0].hooks[0].command).toContain('--store sqlite');
  });

  it('outputs storage backend info when --store is specified', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await claudeInit(['--store', 'sqlite']);

    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('sqlite'));
  });

  // --- --db-path flag ---

  it('embeds --db-path in hook commands when --db-path flag is provided', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await claudeInit(['--db-path', '/home/user/.agentguard/agentguard.db']);

    expect(writeFileSync).toHaveBeenCalledTimes(1);
    const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string);

    expect(written.hooks.PreToolUse[0].hooks[0].command).toContain(
      'pre --db-path "/home/user/.agentguard/agentguard.db"'
    );
    expect(written.hooks.PostToolUse[0].hooks[0].command).toContain(
      'post --db-path "/home/user/.agentguard/agentguard.db"'
    );
  });

  it('does not include --db-path suffix when no --db-path flag is provided', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await claudeInit([]);

    const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string);

    expect(written.hooks.PreToolUse[0].hooks[0].command).not.toContain('--db-path');
    expect(written.hooks.PostToolUse[0].hooks[0].command).not.toContain('--db-path');
  });

  it('quotes --db-path value to handle paths with spaces', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await claudeInit(['--db-path', '/Users/John Doe/.agentguard/agentguard.db']);

    const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string);

    expect(written.hooks.PreToolUse[0].hooks[0].command).toContain(
      '--db-path "/Users/John Doe/.agentguard/agentguard.db"'
    );
  });

  it('combines --db-path with --store flag', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await claudeInit(['--store', 'sqlite', '--db-path', '/custom/path/db.sqlite']);

    const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string);

    expect(written.hooks.PreToolUse[0].hooks[0].command).toContain('--store sqlite');
    expect(written.hooks.PreToolUse[0].hooks[0].command).toContain(
      '--db-path "/custom/path/db.sqlite"'
    );
  });

  it('preserves other hooks when removing', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              hooks: [{ type: 'command', command: 'node /path/to/claude-hook.js pre' }],
            },
            { matcher: 'Write', hooks: [{ type: 'command', command: 'echo custom-pre' }] },
          ],
          PostToolUse: [
            {
              matcher: 'Bash',
              hooks: [{ type: 'command', command: 'node /path/to/claude-hook.js post' }],
            },
            {
              matcher: 'Write',
              hooks: [{ type: 'command', command: 'echo custom' }],
            },
          ],
        },
      })
    );

    await claudeInit(['--remove']);

    const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string);
    // PreToolUse should retain the custom Write hook
    expect(written.hooks.PreToolUse).toHaveLength(1);
    expect(written.hooks.PreToolUse[0].matcher).toBe('Write');
    // PostToolUse should retain the custom Write hook
    expect(written.hooks.PostToolUse).toHaveLength(1);
    expect(written.hooks.PostToolUse[0].matcher).toBe('Write');
  });
});
