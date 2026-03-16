// Tests for auto-setup CLI command
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

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

import {
  autoSetup,
  detectAgentGuardDependency,
  detectClaudeCodeEnvironment,
  detectExistingHooks,
} from '../src/commands/auto-setup.js';
import { readFileSync, existsSync } from 'node:fs';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

describe('detectAgentGuardDependency', () => {
  it('returns found when @red-codes/agentguard is in dependencies', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({
        dependencies: { '@red-codes/agentguard': '^1.0.0' },
      })
    );

    const result = detectAgentGuardDependency('/mock-cwd');
    expect(result.found).toBe(true);
    expect(result.source).toContain('@red-codes/agentguard');
  });

  it('returns found when agentguard is in devDependencies', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({
        devDependencies: { agentguard: '^1.0.0' },
      })
    );

    const result = detectAgentGuardDependency('/mock-cwd');
    expect(result.found).toBe(true);
    expect(result.source).toContain('agentguard');
  });

  it('returns not found when package.json missing', () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const result = detectAgentGuardDependency('/mock-cwd');
    expect(result.found).toBe(false);
    expect(result.source).toBeNull();
  });

  it('returns not found when agentguard not in deps', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({
        dependencies: { express: '^4.0.0' },
      })
    );

    const result = detectAgentGuardDependency('/mock-cwd');
    expect(result.found).toBe(false);
  });

  it('handles corrupt package.json gracefully', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('not json{{{');

    const result = detectAgentGuardDependency('/mock-cwd');
    expect(result.found).toBe(false);
  });
});

describe('detectClaudeCodeEnvironment', () => {
  it('returns true when .claude/ exists', () => {
    vi.mocked(existsSync).mockImplementation((p: unknown) => {
      return String(p).includes('.claude');
    });

    expect(detectClaudeCodeEnvironment('/mock-cwd')).toBe(true);
  });

  it('returns false when .claude/ missing', () => {
    vi.mocked(existsSync).mockReturnValue(false);

    expect(detectClaudeCodeEnvironment('/mock-cwd')).toBe(false);
  });
});

describe('detectExistingHooks', () => {
  it('returns true when claude-hook found in local settings', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({
        hooks: {
          PreToolUse: [{ hooks: [{ type: 'command', command: 'agentguard claude-hook pre' }] }],
        },
      })
    );

    expect(detectExistingHooks('/mock-cwd')).toBe(true);
  });

  it('returns false when no settings exist', () => {
    vi.mocked(existsSync).mockReturnValue(false);

    expect(detectExistingHooks('/mock-cwd')).toBe(false);
  });

  it('returns false when settings exist but no hooks', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({}));

    expect(detectExistingHooks('/mock-cwd')).toBe(false);
  });
});

describe('autoSetup', () => {
  it('reports not detected when no package.json or dev repo', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const result = await autoSetup(['--quiet']);
    expect(result.detected).toBe(false);
    expect(result.skipped).toContain('not found');
  });

  it('detects agentguard dev repo via apps/cli/src/bin.ts marker', async () => {
    vi.mocked(existsSync).mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.endsWith(join('apps', 'cli', 'src', 'bin.ts'))) return true;
      return false;
    });

    // It will call claudeInit which reads/writes settings
    const result = await autoSetup(['--dry-run']);
    expect(result.detected).toBe(true);
    expect(result.source).toBe('agentguard-dev-repo');
  });

  it('skips installation when hooks already present', async () => {
    vi.mocked(existsSync).mockImplementation((p: unknown) => {
      const path = String(p);
      // Dev repo marker
      if (path.endsWith(join('apps', 'cli', 'src', 'bin.ts'))) return true;
      // Settings file exists
      if (path.includes('settings.json')) return true;
      return false;
    });
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({
        hooks: {
          PreToolUse: [{ hooks: [{ type: 'command', command: 'node dist/claude-hook pre' }] }],
        },
      })
    );

    const result = await autoSetup([]);
    expect(result.detected).toBe(true);
    expect(result.hooksMissing).toBe(false);
    expect(result.installed).toBe(false);
    expect(result.skipped).toBe('Hooks already installed');
  });

  it('dry-run mode detects but does not install', async () => {
    vi.mocked(existsSync).mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.endsWith(join('apps', 'cli', 'src', 'bin.ts'))) return true;
      return false;
    });

    const result = await autoSetup(['--dry-run']);
    expect(result.detected).toBe(true);
    expect(result.hooksMissing).toBe(true);
    expect(result.installed).toBe(false);
    expect(result.skipped).toContain('Dry run');
  });

  it('detects from package.json dependency', async () => {
    vi.mocked(existsSync).mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.endsWith('package.json')) return true;
      return false;
    });
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({
        dependencies: { '@red-codes/agentguard': '^1.0.0' },
      })
    );

    const result = await autoSetup(['--dry-run']);
    expect(result.detected).toBe(true);
    expect(result.source).toContain('@red-codes/agentguard');
  });
});
