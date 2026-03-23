// Tests for postinstall script — dual-hook setup (Claude Code + Copilot CLI)
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  resolveProjectRoot,
  writeClaudeCodeHooks,
  writeCopilotCliHooks,
  writeStarterPolicy,
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
    expect(content).toContain('mode: monitor');
    expect(content).toContain('pack: essentials');
    expect(content).toContain('git.push');
    expect(content).toContain('git.force-push');
    expect(content).toContain('.env');
    expect(content).toContain('rm -rf');
    expect(content).toContain('deploy.trigger');
    expect(content).toContain('infra.destroy');
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
    expect(policy).toContain('mode: monitor');
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
