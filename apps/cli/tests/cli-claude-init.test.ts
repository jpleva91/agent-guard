// Tests for claude-init CLI command
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { join } from 'node:path';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  copyFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  chmodSync: vi.fn(),
}));

vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/mock-home'),
}));

vi.mock('node:readline', () => ({
  createInterface: vi.fn(() => ({
    question: vi.fn((_q: string, cb: (answer: string) => void) => cb('')),
    close: vi.fn(),
  })),
}));

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
  execFileSync: vi.fn(),
}));

vi.mock('@red-codes/core', () => ({
  resolveMainRepoRoot: vi.fn(() => '/mock-repo-root'),
  detectRtk: vi.fn(() => ({ available: false })),
}));

vi.mock('@red-codes/adapters', () => ({
  storeHookBaseline: vi.fn(),
}));

vi.mock('../src/identity.js', () => ({
  detectDriver: vi.fn(() => 'human'),
  detectModel: vi.fn(() => 'unknown'),
  detectProject: vi.fn(() => 'mock-project'),
  VALID_ROLES: ['developer', 'reviewer', 'ops', 'security', 'planner'],
}));

vi.mock('../src/templates/scripts.js', () => ({
  AGENT_IDENTITY_BRIDGE: '#!/usr/bin/env bash\n# agent-identity-bridge.sh mock',
  WRITE_PERSONA: '#!/usr/bin/env bash\n# write-persona.sh mock',
  SESSION_PERSONA_CHECK: '#!/usr/bin/env bash\n# session-persona-check.sh mock',
  claudeHookWrapper: vi.fn(
    (cli: string, store: string, dbPath: string) =>
      `#!/usr/bin/env bash\nexec ${cli} claude-hook pre${store}${dbPath}`
  ),
  claudeHookStopWrapper: vi.fn(
    (cli: string, store: string, dbPath: string) =>
      `#!/usr/bin/env bash\nexec ${cli} claude-hook stop${store}${dbPath}`
  ),
}));

vi.mock('../src/templates/skills.js', () => ({
  STARTER_SKILLS: [
    { filename: 'run-tests.md', content: '# Run Tests' },
    { filename: 'implement-issue.md', content: '# Implement Issue' },
    { filename: 'governance-audit.md', content: '# Governance Audit' },
  ],
}));

import { claudeInit } from '../src/commands/claude-init.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { claudeHookWrapper, claudeHookStopWrapper } from '../src/templates/scripts.js';

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

/** Helper: parse the settings.json write (always the first call writing to settings.json) */
function writtenSettings() {
  const calls = writeCalls('settings.json');
  expect(calls.length).toBeGreaterThanOrEqual(1);
  return JSON.parse(calls[0][1] as string);
}

describe('claudeInit', () => {
  it('creates fresh settings with both PreToolUse and PostToolUse hooks on first install', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await claudeInit([]);

    expect(mkdirSync).toHaveBeenCalledWith(expect.stringContaining('.claude'), { recursive: true });

    const written = writtenSettings();
    expect(written.hooks).toBeDefined();

    // PreToolUse — governance enforcement for all tools (via wrapper)
    expect(written.hooks.PreToolUse).toHaveLength(1);
    expect(written.hooks.PreToolUse[0].matcher).toBeUndefined(); // no matcher = match all
    expect(written.hooks.PreToolUse[0].hooks[0].type).toBe('command');
    expect(written.hooks.PreToolUse[0].hooks[0].command).toContain('claude-hook-wrapper.sh');

    // PostToolUse — error monitoring for Bash
    expect(written.hooks.PostToolUse).toHaveLength(1);
    expect(written.hooks.PostToolUse[0].matcher).toBe('Bash');
    expect(written.hooks.PostToolUse[0].hooks[0].type).toBe('command');
    expect(written.hooks.PostToolUse[0].hooks[0].command).toContain('claude-hook');
    expect(written.hooks.PostToolUse[0].hooks[0].command).toContain('post');
  });

  it('installs SessionStart persona check + status hooks for globally-installed case', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await claudeInit([]);

    const written = writtenSettings();
    expect(written.hooks.SessionStart).toHaveLength(1);
    // Persona check + status (no build step when agentguard is globally installed)
    expect(written.hooks.SessionStart[0].hooks).toHaveLength(2);
    expect(written.hooks.SessionStart[0].hooks[0].command).toContain('session-persona-check');
    expect(written.hooks.SessionStart[0].hooks[1].command).toContain('status');
  });

  it('installs SessionStart build + persona check + status hooks in local dev repo', async () => {
    // Simulate being in the agentguard dev repo (apps/cli/src/bin.ts exists)
    vi.mocked(existsSync).mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.endsWith(join('apps', 'cli', 'src', 'bin.ts'))) return true;
      return false;
    });

    await claudeInit([]);

    const written = writtenSettings();
    expect(written.hooks.SessionStart).toHaveLength(1);
    expect(written.hooks.SessionStart[0].hooks).toHaveLength(3);
    // Build hook first
    expect(written.hooks.SessionStart[0].hooks[0].command).toContain('pnpm build');
    expect(written.hooks.SessionStart[0].hooks[0].blocking).toBe(true);
    expect(written.hooks.SessionStart[0].hooks[0].timeout).toBe(120000);
    // Persona check second
    expect(written.hooks.SessionStart[0].hooks[1].command).toContain('session-persona-check');
    // Status hook third, using local binary
    expect(written.hooks.SessionStart[0].hooks[2].command).toContain('AGENTGUARD_WORKSPACE');
    expect(written.hooks.SessionStart[0].hooks[2].command).toContain('status');
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

    expect(writeCalls('settings.json')).toHaveLength(0);
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

    expect(writeCalls('settings.json')).toHaveLength(0);
    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('Already configured')
    );
  });

  it('handles corrupt settings.json gracefully', async () => {
    vi.mocked(existsSync).mockImplementation((p: unknown) => {
      const path = String(p);
      // settings.json exists (corrupt), but agentguard.yaml and skills do not
      if (path.includes('settings.json')) return true;
      return false;
    });
    vi.mocked(readFileSync).mockReturnValue('not valid json{{{');

    await claudeInit([]);

    // Should still install hooks (with fresh config)
    expect(writeCalls('settings.json')).toHaveLength(1);
    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('Warning'));
  });

  it('uses global path with --global flag', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await claudeInit(['--global']);

    expect(mkdirSync).toHaveBeenCalledWith(expect.stringContaining(join('/mock-home', '.claude')), {
      recursive: true,
    });
    expect(writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining(join('/mock-home', '.claude', 'settings.json')),
      expect.any(String),
      'utf8'
    );
  });

  it('uses global path with -g alias', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await claudeInit(['-g']);

    expect(mkdirSync).toHaveBeenCalledWith(expect.stringContaining(join('/mock-home', '.claude')), {
      recursive: true,
    });
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

    expect(writeCalls('settings.json')).toHaveLength(1);
    const written = JSON.parse(writeCalls('settings.json')[0][1] as string);
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

    expect(writeCalls('settings.json')).toHaveLength(1);
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

    const written = writtenSettings();

    // PreToolUse uses the wrapper script (store suffix baked into wrapper content)
    expect(written.hooks.PreToolUse[0].hooks[0].command).toContain('claude-hook-wrapper.sh');
    // claudeHookWrapper should have been called with the store suffix
    expect(claudeHookWrapper).toHaveBeenCalledWith(
      expect.any(String),
      ' --store sqlite',
      ''
    );

    // PostToolUse command should include --store sqlite
    expect(written.hooks.PostToolUse[0].hooks[0].command).toContain('post --store sqlite');
  });

  it('does not include --store suffix when no --store flag is provided', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await claudeInit([]);

    const written = writtenSettings();

    // Wrapper gets empty store suffix
    expect(claudeHookWrapper).toHaveBeenCalledWith(expect.any(String), '', '');
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
    const written = writtenSettings();
    expect(written.hooks.PostToolUse[0].hooks[0].command).toContain('--store sqlite');
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

    const written = writtenSettings();

    // Wrapper gets the db-path suffix
    expect(claudeHookWrapper).toHaveBeenCalledWith(
      expect.any(String),
      '',
      ' --db-path "/home/user/.agentguard/agentguard.db"'
    );

    expect(written.hooks.PostToolUse[0].hooks[0].command).toContain(
      'post --db-path "/home/user/.agentguard/agentguard.db"'
    );
  });

  it('does not include --db-path suffix when no --db-path flag is provided', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await claudeInit([]);

    const written = writtenSettings();

    expect(written.hooks.PostToolUse[0].hooks[0].command).not.toContain('--db-path');
  });

  it('quotes --db-path value to handle paths with spaces', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await claudeInit(['--db-path', '/Users/John Doe/.agentguard/agentguard.db']);

    expect(claudeHookWrapper).toHaveBeenCalledWith(
      expect.any(String),
      '',
      ' --db-path "/Users/John Doe/.agentguard/agentguard.db"'
    );
  });

  it('combines --db-path with --store flag', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await claudeInit(['--store', 'sqlite', '--db-path', '/custom/path/db.sqlite']);

    const written = writtenSettings();

    expect(written.hooks.PostToolUse[0].hooks[0].command).toContain('--store sqlite');
    expect(written.hooks.PostToolUse[0].hooks[0].command).toContain(
      '--db-path "/custom/path/db.sqlite"'
    );
  });

  // --- Starter policy generation ---

  it('generates starter agentguard.yaml when no policy file exists', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await claudeInit([]);

    // Second writeFileSync call should be the policy file
    const policyCalls = writeCalls('agentguard.yaml');
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

    // Policy file should not be written
    const policyCalls = writeCalls('agentguard.yaml');
    expect(policyCalls).toHaveLength(0);
  });

  it('shows active protection summary after install', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await claudeInit([]);

    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('Guiding')
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

    const written = JSON.parse(writeCalls('settings.json')[0][1] as string);
    // PreToolUse should retain the custom Write hook
    expect(written.hooks.PreToolUse).toHaveLength(1);
    expect(written.hooks.PreToolUse[0].matcher).toBe('Write');
    // PostToolUse should retain the custom Write hook
    expect(written.hooks.PostToolUse).toHaveLength(1);
    expect(written.hooks.PostToolUse[0].matcher).toBe('Write');
  });

  // --- Identity, skills, and wrapper tests ---

  it('installs identity scripts to scripts/ directory', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await claudeInit(['--role', 'developer']);

    const scriptWrites = vi
      .mocked(writeFileSync)
      .mock.calls.filter((call) => {
        const p = call[0] as string;
        return p.includes('scripts/') || p.includes('scripts\\');
      });

    // All 5 identity scripts should be written
    const scriptNames = scriptWrites.map((call) => {
      const p = call[0] as string;
      return p.split(/[/\\]/).pop();
    });
    expect(scriptNames).toContain('agent-identity-bridge.sh');
    expect(scriptNames).toContain('write-persona.sh');
    expect(scriptNames).toContain('session-persona-check.sh');
    expect(scriptNames).toContain('claude-hook-wrapper.sh');
    expect(scriptWrites).toHaveLength(4);

    // Every script path should end with .sh
    for (const call of scriptWrites) {
      expect((call[0] as string).endsWith('.sh')).toBe(true);
    }
  });

  it('scaffolds starter skills to .claude/skills/', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await claudeInit([]);

    const skillWrites = vi
      .mocked(writeFileSync)
      .mock.calls.filter((call) => {
        const p = call[0] as string;
        return p.includes('skills/') || p.includes('skills\\');
      });

    // 3 starter skill .md files
    expect(skillWrites).toHaveLength(3);
    const filenames = skillWrites.map((call) => (call[0] as string).split(/[/\\]/).pop());
    expect(filenames).toContain('run-tests.md');
    expect(filenames).toContain('implement-issue.md');
    expect(filenames).toContain('governance-audit.md');
  });

  it('skips skills when --no-skills flag is set', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await claudeInit(['--no-skills']);

    const skillWrites = vi
      .mocked(writeFileSync)
      .mock.calls.filter((call) => {
        const p = call[0] as string;
        return (p.includes('skills/') || p.includes('skills\\')) && p.endsWith('.md');
      });

    expect(skillWrites).toHaveLength(0);
  });

  it('uses --role flag to skip role prompt', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await claudeInit(['--role', 'security']);

    // Identity output should reference security role
    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('security')
    );
  });

  it('uses wrapper script for PreToolUse hook', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await claudeInit([]);

    const written = writtenSettings();
    expect(written.hooks.PreToolUse[0].hooks[0].command).toContain('claude-hook-wrapper.sh');
  });

  it('uses workspace-resolved path for Stop hook', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await claudeInit([]);

    const written = writtenSettings();
    // Stop hook resolves binary from AGENTGUARD_WORKSPACE at runtime
    expect(written.hooks.Stop[0].hooks[0].command).toContain('AGENTGUARD_WORKSPACE');
    expect(written.hooks.Stop[0].hooks[0].command).toContain('claude-hook stop');
    expect(written.hooks.Stop[0].hooks[0].blocking).toBe(false);
    expect(written.hooks.Stop[0].hooks[0].timeout).toBe(15000);
  });

  // --- Binary path resolution (#964) ---

  it('resolves ./node_modules/.bin/agentguard for project-level npm installs', async () => {
    vi.mocked(existsSync).mockImplementation((p: unknown) => {
      const path = String(p);
      // Simulate npm-installed package: node_modules/.bin/agentguard exists,
      // but NOT the local dev marker (apps/cli/src/bin.ts)
      if (path.includes(join('node_modules', '.bin', 'agentguard'))) return true;
      return false;
    });

    await claudeInit([]);

    const written = writtenSettings();
    // All hooks now resolve from AGENTGUARD_WORKSPACE at runtime
    expect(written.hooks.PostToolUse[0].hooks[0].command).toContain('AGENTGUARD_WORKSPACE');
    expect(written.hooks.PostToolUse[0].hooks[0].command).toContain('claude-hook post');

    const statusHook = written.hooks.SessionStart[0].hooks.find(
      (h: { command: string }) => h.command.includes('status')
    );
    expect(statusHook.command).toContain('AGENTGUARD_WORKSPACE');
  });

  it('uses bare agentguard for --global even when node_modules/.bin exists', async () => {
    vi.mocked(existsSync).mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.includes(join('node_modules', '.bin', 'agentguard'))) return true;
      return false;
    });

    await claudeInit(['--global']);

    const written = writtenSettings();
    // All hooks resolve from AGENTGUARD_WORKSPACE at runtime
    expect(written.hooks.PostToolUse[0].hooks[0].command).toContain('AGENTGUARD_WORKSPACE');
  });

  it('falls back to bare agentguard when node_modules/.bin does not exist', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await claudeInit([]);

    const written = writtenSettings();
    // All hooks resolve from AGENTGUARD_WORKSPACE at runtime
    expect(written.hooks.PostToolUse[0].hooks[0].command).toContain('AGENTGUARD_WORKSPACE');
  });

  it('adds SessionStart persona check hook', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await claudeInit([]);

    const written = writtenSettings();
    const sessionHooks = written.hooks.SessionStart[0].hooks;
    const personaHook = sessionHooks.find(
      (h: { command: string }) => h.command.includes('session-persona-check')
    );
    expect(personaHook).toBeDefined();
    expect(personaHook.blocking).toBe(true);
  });

  it('does not overwrite existing skills', async () => {
    vi.mocked(existsSync).mockImplementation((p: unknown) => {
      const path = String(p);
      // Skill files already exist
      if (path.endsWith('.md') && (path.includes('skills/') || path.includes('skills\\'))) {
        return true;
      }
      return false;
    });

    await claudeInit([]);

    const skillWrites = vi
      .mocked(writeFileSync)
      .mock.calls.filter((call) => {
        const p = call[0] as string;
        return (p.includes('skills/') || p.includes('skills\\')) && p.endsWith('.md');
      });

    expect(skillWrites).toHaveLength(0);
  });

  // --- .agentguard-identity file creation (#850) ---

  it('creates .agentguard-identity file during fresh install', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await claudeInit(['--role', 'developer']);

    const identityCalls = writeCalls('.agentguard-identity');
    expect(identityCalls).toHaveLength(1);
    const content = identityCalls[0][1] as string;
    // Format: driver:model:role
    expect(content).toMatch(/^.+:.+:developer$/);
  });

  it('does not overwrite existing .agentguard-identity file', async () => {
    vi.mocked(existsSync).mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.endsWith('.agentguard-identity')) return true;
      return false;
    });

    await claudeInit([]);

    const identityCalls = writeCalls('.agentguard-identity');
    expect(identityCalls).toHaveLength(0);
  });

  it('creates .agentguard-identity during --refresh if missing', async () => {
    // Simulate existing settings with a hook (so --refresh path is taken)
    vi.mocked(existsSync).mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.includes('settings.json')) return true;
      // .agentguard-identity does NOT exist
      if (path.endsWith('.agentguard-identity')) return false;
      return false;
    });
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              hooks: [{ type: 'command', command: 'bash scripts/claude-hook-wrapper.sh' }],
            },
          ],
        },
      })
    );

    await claudeInit(['--refresh']);

    const identityCalls = writeCalls('.agentguard-identity');
    expect(identityCalls).toHaveLength(1);
    const content = identityCalls[0][1] as string;
    expect(content).toMatch(/^.+:.+:.+$/);
  });

  it('uses detected driver and model in .agentguard-identity', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await claudeInit(['--role', 'security']);

    const identityCalls = writeCalls('.agentguard-identity');
    expect(identityCalls).toHaveLength(1);
    const content = identityCalls[0][1] as string;
    // Mock returns human:unknown, role is security
    expect(content).toBe('human:unknown:security');
  });

  it('appends identity block to existing CLAUDE.md', async () => {
    vi.mocked(existsSync).mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.endsWith('CLAUDE.md')) return true;
      return false;
    });
    vi.mocked(readFileSync).mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.endsWith('CLAUDE.md')) return '# Existing Content\n';
      return '';
    });

    await claudeInit([]);

    const claudeMdWrites = writeCalls('CLAUDE.md');
    expect(claudeMdWrites.length).toBeGreaterThanOrEqual(1);
    const content = claudeMdWrites[0][1] as string;
    expect(content).toContain('Agent Identity');
    expect(content).toContain('write-persona.sh');
    // Should preserve existing content
    expect(content).toContain('Existing Content');
  });
});
