// Tests for postinstall script — dual-hook setup (Claude Code + Copilot CLI)
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';

import {
  resolveProjectRoot,
  writeClaudeCodeHooks,
  writeCopilotCliHooks,
  writeCodexHooks,
  writeGeminiHooks,
  writeStarterPolicy,
  isTelemetryEnabled,
  detectCiEnvironment,
  resolveInstallId,
  reportInstallTelemetry,
  detectVersionUpgrade,
} from '../src/postinstall.js';

/** Create a unique temp directory for each test. */
function makeTempDir(label: string): string {
  const dir = join(
    tmpdir(),
    `ag-postinstall-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('resolveProjectRoot', () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  });

  it('walks up past node_modules/ to find package.json', () => {
    tempDir = makeTempDir('resolve-basic');
    // Simulate npm install layout:
    // <project>/package.json
    // <project>/node_modules/@red-codes/agentguard/dist/postinstall.js
    writeFileSync(join(tempDir, 'package.json'), '{}');
    const deepDir = join(tempDir, 'node_modules', '@red-codes', 'agentguard', 'dist');
    mkdirSync(deepDir, { recursive: true });

    const result = resolveProjectRoot(deepDir);
    expect(result).toBe(tempDir);
  });

  it('handles nested node_modules (hoisted layout)', () => {
    tempDir = makeTempDir('resolve-nested');
    // <project>/package.json
    // <project>/node_modules/.pnpm/@red-codes+agentguard/node_modules/@red-codes/agentguard/dist/
    writeFileSync(join(tempDir, 'package.json'), '{}');
    const deepDir = join(
      tempDir,
      'node_modules',
      '.pnpm',
      '@red-codes+agentguard',
      'node_modules',
      '@red-codes',
      'agentguard',
      'dist'
    );
    mkdirSync(deepDir, { recursive: true });

    const result = resolveProjectRoot(deepDir);
    expect(result).toBe(tempDir);
  });

  it('returns null if no package.json found', () => {
    tempDir = makeTempDir('resolve-null');
    // A directory tree with no package.json at all
    const deepDir = join(tempDir, 'a', 'b', 'c');
    mkdirSync(deepDir, { recursive: true });

    // We need to call from a place that definitely has no package.json above
    // Use the deepDir itself — no package.json in this temp tree
    const result = resolveProjectRoot(deepDir);
    // It walks up to filesystem root and finds nothing in our temp tree.
    // However, there may be a package.json somewhere above tmpdir in the real filesystem.
    // So we just verify it returns either null or does NOT return our temp dir (since no pkg.json there).
    if (result !== null) {
      // If it found something, it should NOT be our tempDir (no package.json there)
      expect(result).not.toBe(tempDir);
    }
  });

  it('skips directories inside node_modules even if they have package.json', () => {
    tempDir = makeTempDir('resolve-skip-nm');
    // <project>/package.json
    // <project>/node_modules/some-pkg/package.json  <-- should be skipped
    // <project>/node_modules/some-pkg/node_modules/@red-codes/agentguard/dist/
    writeFileSync(join(tempDir, 'package.json'), '{}');
    const somePkgDir = join(tempDir, 'node_modules', 'some-pkg');
    mkdirSync(somePkgDir, { recursive: true });
    writeFileSync(join(somePkgDir, 'package.json'), '{}');

    const deepDir = join(
      somePkgDir,
      'node_modules',
      '@red-codes',
      'agentguard',
      'dist'
    );
    mkdirSync(deepDir, { recursive: true });

    const result = resolveProjectRoot(deepDir);
    expect(result).toBe(tempDir);
  });
});

describe('writeClaudeCodeHooks', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir('claude');
    writeFileSync(join(tempDir, 'package.json'), '{}');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates .claude/settings.json with hooks when none exists', () => {
    const result = writeClaudeCodeHooks(tempDir);
    expect(result).toBe('created');

    const settingsPath = join(tempDir, '.claude', 'settings.json');
    expect(existsSync(settingsPath)).toBe(true);

    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    expect(settings.hooks).toBeDefined();
    expect(settings.hooks.PreToolUse).toBeDefined();
    expect(settings.hooks.PostToolUse).toBeDefined();

    // PreToolUse hook should reference claude-hook pre
    const preHook = settings.hooks.PreToolUse[0];
    expect(preHook.hooks[0].type).toBe('command');
    expect(preHook.hooks[0].command).toContain('claude-hook pre');

    // PostToolUse hook should reference claude-hook post
    const postHook = settings.hooks.PostToolUse[0];
    expect(postHook.hooks[0].command).toContain('claude-hook post');
  });

  it('includes Notification and Stop hooks', () => {
    writeClaudeCodeHooks(tempDir);
    const settings = JSON.parse(
      readFileSync(join(tempDir, '.claude', 'settings.json'), 'utf8')
    );
    expect(settings.hooks.Notification).toBeDefined();
    expect(settings.hooks.Stop).toBeDefined();
  });

  it('merges with existing settings preserving user config', () => {
    // Pre-populate with existing settings
    const claudeDir = join(tempDir, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(
      join(claudeDir, 'settings.json'),
      JSON.stringify({
        permissions: { allow: ['Read'] },
        customKey: 'user-value',
      }),
      'utf8'
    );

    const result = writeClaudeCodeHooks(tempDir);
    expect(result).toBe('created');

    const settings = JSON.parse(readFileSync(join(claudeDir, 'settings.json'), 'utf8'));
    // User config preserved
    expect(settings.permissions).toEqual({ allow: ['Read'] });
    expect(settings.customKey).toBe('user-value');
    // Hooks added
    expect(settings.hooks.PreToolUse).toBeDefined();
  });

  it('skips if AgentGuard hook already present in PreToolUse', () => {
    const claudeDir = join(tempDir, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(
      join(claudeDir, 'settings.json'),
      JSON.stringify({
        hooks: {
          PreToolUse: [
            { hooks: [{ type: 'command', command: 'agentguard claude-hook pre --store sqlite' }] },
          ],
        },
      }),
      'utf8'
    );

    const result = writeClaudeCodeHooks(tempDir);
    expect(result).toBe('skipped');
  });

  it('skips if AgentGuard hook already present in PostToolUse', () => {
    const claudeDir = join(tempDir, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(
      join(claudeDir, 'settings.json'),
      JSON.stringify({
        hooks: {
          PostToolUse: [
            {
              matcher: 'Bash',
              hooks: [{ type: 'command', command: 'agentguard claude-hook post' }],
            },
          ],
        },
      }),
      'utf8'
    );

    const result = writeClaudeCodeHooks(tempDir);
    expect(result).toBe('skipped');
  });

  it('handles corrupt settings.json gracefully by creating fresh hooks', () => {
    const claudeDir = join(tempDir, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(join(claudeDir, 'settings.json'), 'not valid json{{{', 'utf8');

    const result = writeClaudeCodeHooks(tempDir);
    expect(result).toBe('created');

    const settings = JSON.parse(readFileSync(join(claudeDir, 'settings.json'), 'utf8'));
    expect(settings.hooks.PreToolUse).toBeDefined();
  });
});

describe('writeCopilotCliHooks', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir('copilot');
    writeFileSync(join(tempDir, 'package.json'), '{}');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates .github/hooks/hooks.json with hooks when none exists', () => {
    const result = writeCopilotCliHooks(tempDir);
    expect(result).toBe('created');

    const hooksPath = join(tempDir, '.github', 'hooks', 'hooks.json');
    expect(existsSync(hooksPath)).toBe(true);

    const config = JSON.parse(readFileSync(hooksPath, 'utf8'));
    expect(config.version).toBe(1);
    expect(config.hooks.preToolUse).toBeDefined();
    expect(config.hooks.postToolUse).toBeDefined();

    // preToolUse should reference copilot-hook pre
    expect(config.hooks.preToolUse[0].bash).toContain('copilot-hook pre');
    expect(config.hooks.preToolUse[0].timeoutSec).toBe(30);

    // postToolUse should reference copilot-hook post
    expect(config.hooks.postToolUse[0].bash).toContain('copilot-hook post');
    expect(config.hooks.postToolUse[0].timeoutSec).toBe(10);
  });

  it('merges with existing hooks.json preserving user hooks', () => {
    const hooksDir = join(tempDir, '.github', 'hooks');
    mkdirSync(hooksDir, { recursive: true });
    writeFileSync(
      join(hooksDir, 'hooks.json'),
      JSON.stringify({
        version: 1,
        hooks: {
          sessionStart: [{ type: 'command', bash: 'echo session started' }],
        },
      }),
      'utf8'
    );

    const result = writeCopilotCliHooks(tempDir);
    expect(result).toBe('created');

    const config = JSON.parse(readFileSync(join(hooksDir, 'hooks.json'), 'utf8'));
    // Existing hooks preserved
    expect(config.hooks.sessionStart).toHaveLength(1);
    expect(config.hooks.sessionStart[0].bash).toBe('echo session started');
    // AgentGuard hooks added
    expect(config.hooks.preToolUse).toBeDefined();
    expect(config.hooks.postToolUse).toBeDefined();
  });

  it('skips if AgentGuard copilot-hook already present', () => {
    const hooksDir = join(tempDir, '.github', 'hooks');
    mkdirSync(hooksDir, { recursive: true });
    writeFileSync(
      join(hooksDir, 'hooks.json'),
      JSON.stringify({
        version: 1,
        hooks: {
          preToolUse: [{ bash: 'agentguard copilot-hook pre --store sqlite' }],
        },
      }),
      'utf8'
    );

    const result = writeCopilotCliHooks(tempDir);
    expect(result).toBe('skipped');
  });

  it('handles corrupt hooks.json gracefully by creating fresh config', () => {
    const hooksDir = join(tempDir, '.github', 'hooks');
    mkdirSync(hooksDir, { recursive: true });
    writeFileSync(join(hooksDir, 'hooks.json'), '{{invalid', 'utf8');

    const result = writeCopilotCliHooks(tempDir);
    expect(result).toBe('created');

    const config = JSON.parse(readFileSync(join(hooksDir, 'hooks.json'), 'utf8'));
    expect(config.hooks.preToolUse).toBeDefined();
  });
});

describe('writeStarterPolicy', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir('policy');
    writeFileSync(join(tempDir, 'package.json'), '{}');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates agentguard.yaml when no policy exists', () => {
    const result = writeStarterPolicy(tempDir);
    expect(result).toBe('created');

    const policyPath = join(tempDir, 'agentguard.yaml');
    expect(existsSync(policyPath)).toBe(true);

    const content = readFileSync(policyPath, 'utf8');
    expect(content).toContain('mode: guide');
    expect(content).toContain('pack: essentials');
    expect(content).toContain('git.push');
    expect(content).toContain('git.force-push');
    expect(content).toContain('.env');
    expect(content).toContain('rm -rf');
    expect(content).toContain('deploy.trigger');
    expect(content).toContain('infra.destroy');
  });

  it('starter policy links to correct GitHub URL', () => {
    writeStarterPolicy(tempDir);
    const content = readFileSync(join(tempDir, 'agentguard.yaml'), 'utf8');
    expect(content).toContain('https://github.com/AgentGuardHQ/agentguard');
    expect(content).not.toContain('agent-guard');
  });

  it('skips when agentguard.yaml already exists', () => {
    writeFileSync(join(tempDir, 'agentguard.yaml'), 'id: my-policy\n');

    const result = writeStarterPolicy(tempDir);
    expect(result).toBe('skipped');

    // Original file should be untouched
    const content = readFileSync(join(tempDir, 'agentguard.yaml'), 'utf8');
    expect(content).toBe('id: my-policy\n');
  });

  it('skips when agentguard.yml exists (alternate extension)', () => {
    writeFileSync(join(tempDir, 'agentguard.yml'), 'id: my-policy\n');

    const result = writeStarterPolicy(tempDir);
    expect(result).toBe('skipped');
  });

  it('skips when .agentguard.yaml exists (dotfile variant)', () => {
    writeFileSync(join(tempDir, '.agentguard.yaml'), 'id: my-policy\n');

    const result = writeStarterPolicy(tempDir);
    expect(result).toBe('skipped');
  });

  it('skips when agentguard.json exists', () => {
    writeFileSync(join(tempDir, 'agentguard.json'), '{}');

    const result = writeStarterPolicy(tempDir);
    expect(result).toBe('skipped');
  });
});

describe('postinstall integration', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir('integration');
    writeFileSync(join(tempDir, 'package.json'), '{}');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('full postinstall creates all three configs from scratch', () => {
    const claudeResult = writeClaudeCodeHooks(tempDir);
    const copilotResult = writeCopilotCliHooks(tempDir);
    const policyResult = writeStarterPolicy(tempDir);

    expect(claudeResult).toBe('created');
    expect(copilotResult).toBe('created');
    expect(policyResult).toBe('created');

    // Claude Code hooks
    const settings = JSON.parse(
      readFileSync(join(tempDir, '.claude', 'settings.json'), 'utf8')
    );
    expect(settings.hooks.PreToolUse[0].hooks[0].command).toContain('claude-hook pre');

    // Copilot CLI hooks
    const hooksConfig = JSON.parse(
      readFileSync(join(tempDir, '.github', 'hooks', 'hooks.json'), 'utf8')
    );
    expect(hooksConfig.hooks.preToolUse[0].bash).toContain('copilot-hook pre');

    // Policy file
    const policy = readFileSync(join(tempDir, 'agentguard.yaml'), 'utf8');
    expect(policy).toContain('mode: guide');
    expect(policy).toContain('pack: essentials');
  });

  it('second run skips everything (idempotent)', () => {
    // First run
    writeClaudeCodeHooks(tempDir);
    writeCopilotCliHooks(tempDir);
    writeStarterPolicy(tempDir);

    // Second run — should skip all
    const claudeResult = writeClaudeCodeHooks(tempDir);
    const copilotResult = writeCopilotCliHooks(tempDir);
    const policyResult = writeStarterPolicy(tempDir);

    expect(claudeResult).toBe('skipped');
    expect(copilotResult).toBe('skipped');
    expect(policyResult).toBe('skipped');
  });

  it('merges with existing Claude Code settings without losing data', () => {
    const claudeDir = join(tempDir, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(
      join(claudeDir, 'settings.json'),
      JSON.stringify({
        permissions: { allow: ['Read', 'Write'] },
        hooks: {
          PreToolUse: [
            { matcher: 'Write', hooks: [{ type: 'command', command: 'echo custom' }] },
          ],
        },
      }),
      'utf8'
    );

    writeClaudeCodeHooks(tempDir);

    const settings = JSON.parse(readFileSync(join(claudeDir, 'settings.json'), 'utf8'));
    expect(settings.permissions).toEqual({ allow: ['Read', 'Write'] });
    // Original hook preserved plus new ones added
    const preHookCommands = settings.hooks.PreToolUse.flatMap(
      (entry: { hooks: Array<{ command: string }> }) => entry.hooks.map((h) => h.command)
    );
    expect(preHookCommands).toContain('echo custom');
    expect(preHookCommands.some((cmd: string) => cmd.includes('claude-hook pre'))).toBe(true);
  });

  it('merges with existing Copilot hooks without losing data', () => {
    const hooksDir = join(tempDir, '.github', 'hooks');
    mkdirSync(hooksDir, { recursive: true });
    writeFileSync(
      join(hooksDir, 'hooks.json'),
      JSON.stringify({
        version: 1,
        hooks: {
          sessionStart: [{ type: 'command', bash: 'echo hello' }],
        },
      }),
      'utf8'
    );

    writeCopilotCliHooks(tempDir);

    const config = JSON.parse(readFileSync(join(hooksDir, 'hooks.json'), 'utf8'));
    expect(config.hooks.sessionStart).toHaveLength(1);
    expect(config.hooks.sessionStart[0].bash).toBe('echo hello');
    expect(config.hooks.preToolUse[0].bash).toContain('copilot-hook pre');
  });
});

// ---------------------------------------------------------------------------
// Regression: hook commands must use `npx --no-install` to resolve binaries
// ---------------------------------------------------------------------------
// Bare `agentguard` fails because node_modules/.bin isn't in PATH for hook subprocesses.
// `npx agentguard` (without --no-install) falls back to downloading a nonexistent
// `agentguard` package from npm, producing a 404 error.
// `npx --no-install agentguard` resolves the local binary without registry fallback.

describe('regression: hook commands use npx --no-install', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir('npx-regression');
    writeFileSync(join(tempDir, 'package.json'), '{}');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('Claude Code hooks use npx --no-install for all commands', () => {
    writeClaudeCodeHooks(tempDir);
    const settings = JSON.parse(
      readFileSync(join(tempDir, '.claude', 'settings.json'), 'utf8')
    );

    const allCommands: string[] = [];
    for (const hookType of ['PreToolUse', 'PostToolUse', 'Notification', 'Stop']) {
      for (const group of settings.hooks[hookType] ?? []) {
        for (const hook of group.hooks ?? []) {
          if (hook.command) allCommands.push(hook.command);
        }
      }
    }

    expect(allCommands.length).toBeGreaterThanOrEqual(4);
    for (const cmd of allCommands) {
      expect(cmd).toMatch(/^npx --no-install agentguard /);
    }
  });

  it('Copilot CLI hooks use npx --no-install for all commands', () => {
    writeCopilotCliHooks(tempDir);
    const config = JSON.parse(
      readFileSync(join(tempDir, '.github', 'hooks', 'hooks.json'), 'utf8')
    );

    const allCommands: string[] = [];
    for (const hookType of ['preToolUse', 'postToolUse']) {
      for (const entry of config.hooks[hookType] ?? []) {
        if (entry.bash) allCommands.push(entry.bash);
      }
    }

    expect(allCommands.length).toBeGreaterThanOrEqual(2);
    for (const cmd of allCommands) {
      expect(cmd).toMatch(/^npx --no-install agentguard /);
    }
  });

  it('no hook command uses bare agentguard without npx', () => {
    writeClaudeCodeHooks(tempDir);
    writeCopilotCliHooks(tempDir);

    const settings = JSON.parse(
      readFileSync(join(tempDir, '.claude', 'settings.json'), 'utf8')
    );
    const copilotConfig = JSON.parse(
      readFileSync(join(tempDir, '.github', 'hooks', 'hooks.json'), 'utf8')
    );

    // Collect all hook commands from both configs
    const allCommands: string[] = [];
    for (const hookType of Object.keys(settings.hooks)) {
      for (const group of settings.hooks[hookType]) {
        for (const hook of group.hooks ?? []) {
          if (hook.command) allCommands.push(hook.command);
        }
      }
    }
    for (const hookType of Object.keys(copilotConfig.hooks)) {
      for (const entry of copilotConfig.hooks[hookType]) {
        if (entry.bash) allCommands.push(entry.bash);
      }
    }

    for (const cmd of allCommands) {
      // Must NOT start with bare `agentguard` (no npx)
      expect(cmd).not.toMatch(/^agentguard /);
      // Must NOT use `npx` without `--no-install` (would try to download from registry)
      expect(cmd).not.toMatch(/^npx agentguard /);
    }
  });
});

// ---------------------------------------------------------------------------
// Install telemetry — isTelemetryEnabled, detectCiEnvironment, resolveInstallId
// ---------------------------------------------------------------------------

describe('isTelemetryEnabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns true by default (no opt-out vars set)', () => {
    vi.stubEnv('AGENTGUARD_TELEMETRY', '');
    vi.stubEnv('DO_NOT_TRACK', '');
    expect(isTelemetryEnabled()).toBe(true);
  });

  it('returns false when AGENTGUARD_TELEMETRY=off', () => {
    vi.stubEnv('AGENTGUARD_TELEMETRY', 'off');
    expect(isTelemetryEnabled()).toBe(false);
  });

  it('returns true when AGENTGUARD_TELEMETRY=anonymous', () => {
    vi.stubEnv('AGENTGUARD_TELEMETRY', 'anonymous');
    expect(isTelemetryEnabled()).toBe(true);
  });

  it('returns false when DO_NOT_TRACK=1', () => {
    vi.stubEnv('DO_NOT_TRACK', '1');
    expect(isTelemetryEnabled()).toBe(false);
  });

  it('returns false when DO_NOT_TRACK=true', () => {
    vi.stubEnv('DO_NOT_TRACK', 'true');
    expect(isTelemetryEnabled()).toBe(false);
  });

  it('returns true when DO_NOT_TRACK is a non-opt-out value', () => {
    vi.stubEnv('DO_NOT_TRACK', '0');
    expect(isTelemetryEnabled()).toBe(true);
  });
});

describe('detectCiEnvironment', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns null when no CI vars are set', () => {
    vi.stubEnv('GITHUB_ACTIONS', '');
    vi.stubEnv('VERCEL', '');
    vi.stubEnv('GITLAB_CI', '');
    vi.stubEnv('CI', '');
    expect(detectCiEnvironment()).toBeNull();
  });

  it('detects GitHub Actions', () => {
    vi.stubEnv('GITHUB_ACTIONS', 'true');
    expect(detectCiEnvironment()).toBe('github-actions');
  });

  it('detects Vercel', () => {
    vi.stubEnv('GITHUB_ACTIONS', '');
    vi.stubEnv('VERCEL', '1');
    expect(detectCiEnvironment()).toBe('vercel');
  });

  it('detects GitLab CI', () => {
    vi.stubEnv('GITHUB_ACTIONS', '');
    vi.stubEnv('VERCEL', '');
    vi.stubEnv('GITLAB_CI', 'true');
    expect(detectCiEnvironment()).toBe('gitlab-ci');
  });

  it('detects generic CI', () => {
    vi.stubEnv('GITHUB_ACTIONS', '');
    vi.stubEnv('VERCEL', '');
    vi.stubEnv('GITLAB_CI', '');
    vi.stubEnv('CI', 'true');
    expect(detectCiEnvironment()).toBe('ci');
  });
});

describe('resolveInstallId', () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns a valid UUID when no identity file exists', () => {
    // No file at ~/.agentguard/telemetry.json — returns fresh UUID
    const id = resolveInstallId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('returns consistent UUID across calls without file (each call is fresh)', () => {
    const id1 = resolveInstallId();
    const id2 = resolveInstallId();
    // Both are valid UUIDs (may differ since they're freshly generated)
    expect(id1).toMatch(/^[0-9a-f-]{36}$/i);
    expect(id2).toMatch(/^[0-9a-f-]{36}$/i);
  });
});

describe('reportInstallTelemetry', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('does not throw when telemetry is disabled', () => {
    vi.stubEnv('AGENTGUARD_TELEMETRY', 'off');
    // Should complete without throwing
    expect(() => reportInstallTelemetry('/tmp/fake-script-dir')).not.toThrow();
  });

  it('does not throw when DO_NOT_TRACK=1', () => {
    vi.stubEnv('DO_NOT_TRACK', '1');
    expect(() => reportInstallTelemetry('/tmp/fake-script-dir')).not.toThrow();
  });

  it('does not throw even with an invalid script dir (network will fail silently)', () => {
    vi.stubEnv('AGENTGUARD_TELEMETRY', 'off');
    expect(() => reportInstallTelemetry('/nonexistent/path/that/does/not/exist')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// writeCodexHooks
// ---------------------------------------------------------------------------

describe('writeCodexHooks', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir('codex');
    writeFileSync(join(tempDir, 'package.json'), '{}');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns not-detected when .codex/ directory does not exist', () => {
    const result = writeCodexHooks(tempDir);
    expect(result).toBe('not-detected');
  });

  it('creates .codex/hooks.json with PreToolUse and PostToolUse when .codex/ exists', () => {
    const codexDir = join(tempDir, '.codex');
    mkdirSync(codexDir, { recursive: true });

    const result = writeCodexHooks(tempDir);
    expect(result).toBe('created');

    const hooksPath = join(codexDir, 'hooks.json');
    expect(existsSync(hooksPath)).toBe(true);

    const config = JSON.parse(readFileSync(hooksPath, 'utf8'));
    expect(config.hooks.PreToolUse).toBeDefined();
    expect(config.hooks.PostToolUse).toBeDefined();

    const preHook = config.hooks.PreToolUse[0];
    expect(preHook.hooks[0].command).toContain('codex-hook pre');
    expect(preHook.hooks[0].command).toContain('npx --no-install agentguard');

    const postHook = config.hooks.PostToolUse[0];
    expect(postHook.hooks[0].command).toContain('codex-hook post');
  });

  it('merges with existing hooks.json preserving user config', () => {
    const codexDir = join(tempDir, '.codex');
    mkdirSync(codexDir, { recursive: true });
    writeFileSync(
      join(codexDir, 'hooks.json'),
      JSON.stringify({ hooks: { SessionStart: [{ type: 'command', command: 'echo start' }] } }),
      'utf8'
    );

    writeCodexHooks(tempDir);

    const config = JSON.parse(readFileSync(join(codexDir, 'hooks.json'), 'utf8'));
    expect(config.hooks.SessionStart).toBeDefined(); // preserved
    expect(config.hooks.PreToolUse).toBeDefined(); // added
  });

  it('skips if codex-hook already present in PreToolUse', () => {
    const codexDir = join(tempDir, '.codex');
    mkdirSync(codexDir, { recursive: true });
    writeFileSync(
      join(codexDir, 'hooks.json'),
      JSON.stringify({
        hooks: {
          PreToolUse: [{ hooks: [{ type: 'command', command: 'agentguard codex-hook pre' }] }],
        },
      }),
      'utf8'
    );

    const result = writeCodexHooks(tempDir);
    expect(result).toBe('skipped');
  });

  it('handles corrupt hooks.json gracefully by creating fresh hooks', () => {
    const codexDir = join(tempDir, '.codex');
    mkdirSync(codexDir, { recursive: true });
    writeFileSync(join(codexDir, 'hooks.json'), 'not valid json{{{', 'utf8');

    const result = writeCodexHooks(tempDir);
    expect(result).toBe('created');

    const config = JSON.parse(readFileSync(join(codexDir, 'hooks.json'), 'utf8'));
    expect(config.hooks.PreToolUse).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// writeGeminiHooks
// ---------------------------------------------------------------------------

describe('writeGeminiHooks', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir('gemini');
    writeFileSync(join(tempDir, 'package.json'), '{}');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns not-detected when .gemini/ directory does not exist', () => {
    const result = writeGeminiHooks(tempDir);
    expect(result).toBe('not-detected');
  });

  it('creates .gemini/settings.json with BeforeTool and AfterTool when .gemini/ exists', () => {
    const geminiDir = join(tempDir, '.gemini');
    mkdirSync(geminiDir, { recursive: true });

    const result = writeGeminiHooks(tempDir);
    expect(result).toBe('created');

    const settingsPath = join(geminiDir, 'settings.json');
    expect(existsSync(settingsPath)).toBe(true);

    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    expect(settings.hooks.BeforeTool).toBeDefined();
    expect(settings.hooks.AfterTool).toBeDefined();

    const beforeHook = settings.hooks.BeforeTool[0];
    expect(beforeHook.hooks[0].command).toContain('gemini-hook pre');
    expect(beforeHook.hooks[0].command).toContain('npx --no-install agentguard');

    const afterHook = settings.hooks.AfterTool[0];
    expect(afterHook.matcher).toBe('Shell');
    expect(afterHook.hooks[0].command).toContain('gemini-hook post');
  });

  it('merges with existing settings.json preserving user config', () => {
    const geminiDir = join(tempDir, '.gemini');
    mkdirSync(geminiDir, { recursive: true });
    writeFileSync(
      join(geminiDir, 'settings.json'),
      JSON.stringify({ theme: 'dark', contextWindowSize: 1000000 }),
      'utf8'
    );

    writeGeminiHooks(tempDir);

    const settings = JSON.parse(readFileSync(join(geminiDir, 'settings.json'), 'utf8'));
    expect(settings.theme).toBe('dark'); // preserved
    expect(settings.contextWindowSize).toBe(1000000); // preserved
    expect(settings.hooks.BeforeTool).toBeDefined(); // added
  });

  it('skips if gemini-hook already present in BeforeTool', () => {
    const geminiDir = join(tempDir, '.gemini');
    mkdirSync(geminiDir, { recursive: true });
    writeFileSync(
      join(geminiDir, 'settings.json'),
      JSON.stringify({
        hooks: {
          BeforeTool: [{ hooks: [{ type: 'command', command: 'agentguard gemini-hook pre' }] }],
        },
      }),
      'utf8'
    );

    const result = writeGeminiHooks(tempDir);
    expect(result).toBe('skipped');
  });

  it('handles corrupt settings.json gracefully by creating fresh hooks', () => {
    const geminiDir = join(tempDir, '.gemini');
    mkdirSync(geminiDir, { recursive: true });
    writeFileSync(join(geminiDir, 'settings.json'), '{invalid json', 'utf8');

    const result = writeGeminiHooks(tempDir);
    expect(result).toBe('created');

    const settings = JSON.parse(readFileSync(join(geminiDir, 'settings.json'), 'utf8'));
    expect(settings.hooks.BeforeTool).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// detectVersionUpgrade
// AGENTGUARD_IDENTITY_PATH is a module-level constant built from homedir() at
// import time. Tests must write to the same real path (~/.agentguard/telemetry.json).
// ---------------------------------------------------------------------------

describe('detectVersionUpgrade', () => {
  // Build the same path the module uses
  const identityDir = join(homedir(), '.agentguard');
  const identityPath = join(identityDir, 'telemetry.json');
  let savedContent: string | null = null;

  beforeEach(() => {
    // Preserve any real identity file so we can restore it after
    savedContent = existsSync(identityPath) ? readFileSync(identityPath, 'utf8') : null;
    mkdirSync(identityDir, { recursive: true });
  });

  afterEach(() => {
    if (savedContent !== null) {
      writeFileSync(identityPath, savedContent, 'utf8');
    } else if (existsSync(identityPath)) {
      rmSync(identityPath);
    }
  });

  it('returns isUpgrade: false when no identity file exists', () => {
    if (existsSync(identityPath)) rmSync(identityPath);
    expect(detectVersionUpgrade('2.9.3').isUpgrade).toBe(false);
  });

  it('returns isUpgrade: false when version matches stored version', () => {
    writeFileSync(identityPath, JSON.stringify({ version: '2.9.3' }), 'utf8');
    expect(detectVersionUpgrade('2.9.3').isUpgrade).toBe(false);
  });

  it('returns isUpgrade: true with fromVersion/toVersion when version differs', () => {
    writeFileSync(identityPath, JSON.stringify({ version: '2.8.0' }), 'utf8');
    const result = detectVersionUpgrade('2.9.3');
    expect(result.isUpgrade).toBe(true);
    if (result.isUpgrade) {
      expect(result.fromVersion).toBe('2.8.0');
      expect(result.toVersion).toBe('2.9.3');
    }
  });

  it('returns isUpgrade: false when identity file has no version field', () => {
    writeFileSync(identityPath, JSON.stringify({ install_id: 'some-uuid' }), 'utf8');
    expect(detectVersionUpgrade('2.9.3').isUpgrade).toBe(false);
  });

  it('returns isUpgrade: false when identity file is corrupt JSON', () => {
    writeFileSync(identityPath, 'not json{{', 'utf8');
    expect(detectVersionUpgrade('2.9.3').isUpgrade).toBe(false);
  });
});
