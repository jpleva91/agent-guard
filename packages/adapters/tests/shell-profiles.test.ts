// Tests for shell adapter privilege profiles
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:child_process', () => ({
  exec: vi.fn(),
}));

import {
  commandMatchesPattern,
  checkProfile,
  ShellProfileViolationError,
  createShellAdapter,
  READONLY_PROFILE,
  DEVELOPER_PROFILE,
  CI_PROFILE,
  ADMIN_PROFILE,
  SHELL_PROFILES,
} from '@red-codes/adapters';
import type { ShellPrivilegeProfile } from '@red-codes/adapters';
import { exec } from 'node:child_process';
import type { CanonicalAction } from '@red-codes/core';

function makeAction(overrides: Record<string, unknown>): CanonicalAction {
  return {
    id: 'act_1',
    type: 'shell.exec',
    target: '',
    class: 'shell',
    justification: 'test',
    timestamp: Date.now(),
    fingerprint: 'fp_1',
    ...overrides,
  } as CanonicalAction;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// commandMatchesPattern
// ---------------------------------------------------------------------------

describe('commandMatchesPattern', () => {
  it('matches exact command', () => {
    expect(commandMatchesPattern('ls', 'ls')).toBe(true);
  });

  it('matches command with arguments', () => {
    expect(commandMatchesPattern('ls -la /tmp', 'ls')).toBe(true);
  });

  it('does not match partial command name', () => {
    expect(commandMatchesPattern('lsof', 'ls')).toBe(false);
  });

  it('matches wildcard *', () => {
    expect(commandMatchesPattern('anything at all', '*')).toBe(true);
  });

  it('matches glob with trailing *', () => {
    expect(commandMatchesPattern('git status -s', 'git status*')).toBe(true);
  });

  it('matches multi-word prefix', () => {
    expect(commandMatchesPattern('git push origin main', 'git push')).toBe(true);
  });

  it('does not match unrelated command', () => {
    expect(commandMatchesPattern('rm -rf /', 'ls')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(commandMatchesPattern('Git Status', 'git status')).toBe(true);
  });

  it('handles empty command', () => {
    expect(commandMatchesPattern('', 'ls')).toBe(false);
  });

  it('handles empty pattern', () => {
    expect(commandMatchesPattern('ls', '')).toBe(false);
  });

  it('trims whitespace', () => {
    expect(commandMatchesPattern('  ls -la  ', 'ls')).toBe(true);
  });

  it('matches mid-pattern wildcard', () => {
    expect(commandMatchesPattern('git push --force origin', 'git push --force*')).toBe(true);
  });

  it('matches git push -f variant', () => {
    expect(commandMatchesPattern('git push -f origin main', 'git push -f*')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// checkProfile
// ---------------------------------------------------------------------------

describe('checkProfile', () => {
  it('returns null for allowed command', () => {
    const profile: ShellPrivilegeProfile = {
      name: 'test',
      allow: ['ls', 'cat'],
      deny: [],
    };
    expect(checkProfile('ls -la', profile)).toBeNull();
  });

  it('returns reason for non-allowed command', () => {
    const profile: ShellPrivilegeProfile = {
      name: 'test',
      allow: ['ls', 'cat'],
      deny: [],
    };
    const result = checkProfile('rm -rf /', profile);
    expect(result).toContain('not in allowlist');
    expect(result).toContain('test');
  });

  it('deny takes precedence over allow', () => {
    const profile: ShellPrivilegeProfile = {
      name: 'test',
      allow: ['git *'],
      deny: ['git push --force*'],
    };
    const result = checkProfile('git push --force origin main', profile);
    expect(result).toContain('denied by pattern');
  });

  it('empty allow list means all non-denied allowed', () => {
    const profile: ShellPrivilegeProfile = {
      name: 'test',
      allow: [],
      deny: ['rm -rf *'],
    };
    expect(checkProfile('ls', profile)).toBeNull();
    expect(checkProfile('git push', profile)).toBeNull();
    expect(checkProfile('rm -rf /', profile)).toContain('denied');
  });

  it('admin profile allows everything', () => {
    expect(checkProfile('rm -rf /', ADMIN_PROFILE)).toBeNull();
    expect(checkProfile('git push --force', ADMIN_PROFILE)).toBeNull();
    expect(checkProfile('shutdown now', ADMIN_PROFILE)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Built-in profiles
// ---------------------------------------------------------------------------

describe('READONLY_PROFILE', () => {
  it('allows ls', () => {
    expect(checkProfile('ls -la', READONLY_PROFILE)).toBeNull();
  });

  it('allows cat', () => {
    expect(checkProfile('cat README.md', READONLY_PROFILE)).toBeNull();
  });

  it('allows git status', () => {
    expect(checkProfile('git status', READONLY_PROFILE)).toBeNull();
  });

  it('allows git log with flags', () => {
    expect(checkProfile('git log --oneline -5', READONLY_PROFILE)).toBeNull();
  });

  it('allows git diff', () => {
    expect(checkProfile('git diff HEAD~1', READONLY_PROFILE)).toBeNull();
  });

  it('denies git push', () => {
    expect(checkProfile('git push origin main', READONLY_PROFILE)).not.toBeNull();
  });

  it('denies git commit', () => {
    expect(checkProfile('git commit -m "test"', READONLY_PROFILE)).not.toBeNull();
  });

  it('denies npm install', () => {
    expect(checkProfile('npm install express', READONLY_PROFILE)).not.toBeNull();
  });

  it('denies rm', () => {
    expect(checkProfile('rm -rf /tmp/test', READONLY_PROFILE)).not.toBeNull();
  });

  it('allows echo', () => {
    expect(checkProfile('echo hello', READONLY_PROFILE)).toBeNull();
  });

  it('allows grep', () => {
    expect(checkProfile('grep -r "pattern" src/', READONLY_PROFILE)).toBeNull();
  });

  it('allows node --version', () => {
    expect(checkProfile('node --version', READONLY_PROFILE)).toBeNull();
  });
});

describe('DEVELOPER_PROFILE', () => {
  it('allows normal commands', () => {
    expect(checkProfile('pnpm build', DEVELOPER_PROFILE)).toBeNull();
  });

  it('allows git push (non-force)', () => {
    expect(checkProfile('git push origin main', DEVELOPER_PROFILE)).toBeNull();
  });

  it('denies git push --force', () => {
    expect(checkProfile('git push --force origin main', DEVELOPER_PROFILE)).not.toBeNull();
  });

  it('denies git push -f', () => {
    expect(checkProfile('git push -f origin main', DEVELOPER_PROFILE)).not.toBeNull();
  });

  it('denies git reset --hard', () => {
    expect(checkProfile('git reset --hard HEAD~1', DEVELOPER_PROFILE)).not.toBeNull();
  });

  it('denies rm -rf /', () => {
    expect(checkProfile('rm -rf /', DEVELOPER_PROFILE)).not.toBeNull();
  });

  it('denies shutdown', () => {
    expect(checkProfile('shutdown now', DEVELOPER_PROFILE)).not.toBeNull();
  });

  it('allows npm install', () => {
    expect(checkProfile('npm install express', DEVELOPER_PROFILE)).toBeNull();
  });
});

describe('CI_PROFILE', () => {
  it('allows pnpm build', () => {
    expect(checkProfile('pnpm build', CI_PROFILE)).toBeNull();
  });

  it('allows pnpm test', () => {
    expect(checkProfile('pnpm test', CI_PROFILE)).toBeNull();
  });

  it('allows pnpm lint', () => {
    expect(checkProfile('pnpm lint', CI_PROFILE)).toBeNull();
  });

  it('allows git status', () => {
    expect(checkProfile('git status', CI_PROFILE)).toBeNull();
  });

  it('denies git push', () => {
    expect(checkProfile('git push origin main', CI_PROFILE)).not.toBeNull();
  });

  it('denies pnpm install', () => {
    expect(checkProfile('pnpm install', CI_PROFILE)).not.toBeNull();
  });

  it('denies npm install', () => {
    expect(checkProfile('npm install express', CI_PROFILE)).not.toBeNull();
  });

  it('allows npx commands', () => {
    expect(checkProfile('npx vitest run', CI_PROFILE)).toBeNull();
  });

  it('allows node commands', () => {
    expect(checkProfile('node apps/cli/dist/bin.js guard', CI_PROFILE)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// SHELL_PROFILES lookup
// ---------------------------------------------------------------------------

describe('SHELL_PROFILES', () => {
  it('contains all four built-in profiles', () => {
    expect(Object.keys(SHELL_PROFILES)).toEqual(['readonly', 'developer', 'ci', 'admin']);
  });

  it('maps names to profile objects', () => {
    expect(SHELL_PROFILES.readonly).toBe(READONLY_PROFILE);
    expect(SHELL_PROFILES.developer).toBe(DEVELOPER_PROFILE);
    expect(SHELL_PROFILES.ci).toBe(CI_PROFILE);
    expect(SHELL_PROFILES.admin).toBe(ADMIN_PROFILE);
  });
});

// ---------------------------------------------------------------------------
// ShellProfileViolationError
// ---------------------------------------------------------------------------

describe('ShellProfileViolationError', () => {
  it('has correct properties', () => {
    const err = new ShellProfileViolationError('readonly', 'rm -rf /');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ShellProfileViolationError');
    expect(err.profileName).toBe('readonly');
    expect(err.command).toBe('rm -rf /');
    expect(err.message).toContain('readonly');
    expect(err.message).toContain('rm -rf /');
  });
});

// ---------------------------------------------------------------------------
// createShellAdapter with profile
// ---------------------------------------------------------------------------

describe('createShellAdapter with profile', () => {
  it('blocks commands denied by profile', async () => {
    const adapter = createShellAdapter({ profile: 'readonly' });
    await expect(adapter(makeAction({ command: 'rm -rf /tmp/test' }))).rejects.toThrow(
      ShellProfileViolationError
    );
  });

  it('allows commands matching profile allowlist', async () => {
    vi.mocked(exec).mockImplementation((_cmd, _opts, cb) => {
      (cb as (...args: unknown[]) => void)(null, 'output', '');
      return {} as ReturnType<typeof exec>;
    });

    const adapter = createShellAdapter({ profile: 'readonly' });
    const result = await adapter(makeAction({ command: 'ls -la' }));
    expect(result.stdout).toBe('output');
    expect(result.profileName).toBe('readonly');
  });

  it('accepts a profile object directly', async () => {
    const custom: ShellPrivilegeProfile = {
      name: 'custom',
      allow: ['echo *'],
      deny: [],
    };

    vi.mocked(exec).mockImplementation((_cmd, _opts, cb) => {
      (cb as (...args: unknown[]) => void)(null, 'hello', '');
      return {} as ReturnType<typeof exec>;
    });

    const adapter = createShellAdapter({ profile: custom });
    const result = await adapter(makeAction({ command: 'echo hello' }));
    expect(result.stdout).toBe('hello');
    expect(result.profileName).toBe('custom');
  });

  it('throws on unknown profile name', () => {
    expect(() => createShellAdapter({ profile: 'nonexistent' })).toThrow(
      /Unknown shell privilege profile/
    );
  });

  it('does not enforce profile when not configured', async () => {
    vi.mocked(exec).mockImplementation((_cmd, _opts, cb) => {
      (cb as (...args: unknown[]) => void)(null, '', '');
      return {} as ReturnType<typeof exec>;
    });

    const adapter = createShellAdapter();
    const result = await adapter(makeAction({ command: 'rm -rf /tmp/test' }));
    expect(result.profileName).toBeUndefined();
  });

  it('merges profile envRestrictions into credential stripping', async () => {
    vi.mocked(exec).mockImplementation((_cmd, _opts, cb) => {
      (cb as (...args: unknown[]) => void)(null, '', '');
      return {} as ReturnType<typeof exec>;
    });

    const custom: ShellPrivilegeProfile = {
      name: 'restricted',
      allow: [],
      deny: [],
      envRestrictions: ['MY_SECRET_VAR'],
    };

    // Set the env var so stripping actually strips it
    const origVal = process.env.MY_SECRET_VAR;
    process.env.MY_SECRET_VAR = 'secret-value';
    try {
      const adapter = createShellAdapter({ profile: custom });
      const result = await adapter(makeAction({ command: 'echo test' }));
      // The env passed to exec should not contain MY_SECRET_VAR
      const callArgs = vi.mocked(exec).mock.calls[0];
      const opts = callArgs[1] as { env: Record<string, unknown> };
      expect(opts.env).not.toHaveProperty('MY_SECRET_VAR');
      expect(result.profileName).toBe('restricted');
    } finally {
      if (origVal === undefined) {
        delete process.env.MY_SECRET_VAR;
      } else {
        process.env.MY_SECRET_VAR = origVal;
      }
    }
  });
});
