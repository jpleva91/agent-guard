// Tests for claude-init CLI command
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { join } from 'node:path';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  copyFileSync: vi.fn(),
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
    // settings.json + agentguard.yaml (starter policy)
    expect(writeFileSync).toHaveBeenCalledTimes(2);

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

  it('installs SessionStart status hook (no build hook) for globally-installed case', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await claudeInit([]);

    const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string);
    expect(written.hooks.SessionStart).toHaveLength(1);
    // Only the status hook — no build step when agentguard is globally installed
    expect(written.hooks.SessionStart[0].hooks).toHaveLength(1);
    expect(written.hooks.SessionStart[0].hooks[0].command).toContain('status');
  });

  it('installs SessionStart build + status hooks in local dev repo', async () => {
    // Simulate being in the agentguard dev repo (apps/cli/src/bin.ts exists)
    vi.mocked(existsSync).mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.endsWith(join('apps', 'cli', 'src', 'bin.ts'))) return true;
      return false;
    });

    await claudeInit([]);

    const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string);
    expect(written.hooks.SessionStart).toHaveLength(1);
    expect(written.hooks.SessionStart[0].hooks).toHaveLength(2);
    // Build hook first
    expect(written.hooks.SessionStart[0].hooks[0].command).toContain('pnpm build');
    expect(written.hooks.SessionStart[0].hooks[0].blocking).toBe(true);
    expect(written.hooks.SessionStart[0].hooks[0].timeout).toBe(120000);
    // Status hook second, using local binary
    expect(written.hooks.SessionStart[0].hooks[1].command).toContain('node apps/cli/dist/bin.js');
    expect(written.hooks.SessionStart[0].hooks[1].command).toContain('status');
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

    // Should still install hooks (with fresh config); policy not generated since existsSync returns true
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

  it('removes hooks from PreToolUse, PostToolUse, and SessionStart with --remove flag', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({
        hooks: {
          SessionStart: [
            {
              hooks: [
                {
                  type: 'command',
                  command: 'test -f apps/cli/dist/bin.js || npm run build',
                  timeout: 120000,
                  blocking: true,
                },
              ],
            },
          ],
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
    // All hook types should be cleaned up
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

    // settings.json + agentguard.yaml (starter policy)
    expect(writeFileSync).toHaveBeenCalledTimes(2);
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

    // settings.json + agentguard.yaml (starter policy)
    expect(writeFileSync).toHaveBeenCalledTimes(2);
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

  // --- Starter policy generation ---

  it('generates starter agentguard.yaml when no policy file exists', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await claudeInit([]);

    // Second writeFileSync call should be the policy file
    const policyCalls = vi.mocked(writeFileSync).mock.calls.filter(
      (call) => (call[0] as string).includes('agentguard.yaml')
    );
    expect(policyCalls).toHaveLength(1);
    expect(policyCalls[0][1]).toContain('id: default-policy');
    expect(policyCalls[0][1]).toContain('git.push');
    expect(policyCalls[0][1]).toContain('file.write');
  });

  it('skips policy generation when agentguard.yaml already exists', async () => {
    vi.mocked(existsSync).mockImplementation((path) => {
      if ((path as string).includes('agentguard.yaml')) return true;
      return false;
    });

    await claudeInit([]);

    // Only settings.json should be written, not policy
    const policyCalls = vi.mocked(writeFileSync).mock.calls.filter(
      (call) => (call[0] as string).endsWith('agentguard.yaml')
    );
    expect(policyCalls).toHaveLength(0);
  });

  it('shows active protection summary after install', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await claudeInit([]);

    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('Active protections')
    );
    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('AgentGuard is active')
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
