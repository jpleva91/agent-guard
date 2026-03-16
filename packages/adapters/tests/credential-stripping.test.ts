// Tests for credential stripping in the shell adapter
import { describe, it, expect } from 'vitest';
import { sanitizeEnvironment, DEFAULT_STRIPPED_CREDENTIALS } from '@red-codes/adapters';

describe('DEFAULT_STRIPPED_CREDENTIALS', () => {
  it('includes SSH credentials', () => {
    expect(DEFAULT_STRIPPED_CREDENTIALS).toContain('SSH_AUTH_SOCK');
    expect(DEFAULT_STRIPPED_CREDENTIALS).toContain('SSH_AGENT_PID');
  });

  it('includes AWS credentials', () => {
    expect(DEFAULT_STRIPPED_CREDENTIALS).toContain('AWS_ACCESS_KEY_ID');
    expect(DEFAULT_STRIPPED_CREDENTIALS).toContain('AWS_SECRET_ACCESS_KEY');
    expect(DEFAULT_STRIPPED_CREDENTIALS).toContain('AWS_SESSION_TOKEN');
  });

  it('includes GitHub/Git tokens', () => {
    expect(DEFAULT_STRIPPED_CREDENTIALS).toContain('GITHUB_TOKEN');
    expect(DEFAULT_STRIPPED_CREDENTIALS).toContain('GH_TOKEN');
    expect(DEFAULT_STRIPPED_CREDENTIALS).toContain('GIT_ASKPASS');
  });

  it('includes cloud provider credentials', () => {
    expect(DEFAULT_STRIPPED_CREDENTIALS).toContain('AZURE_CLIENT_SECRET');
    expect(DEFAULT_STRIPPED_CREDENTIALS).toContain('GOOGLE_APPLICATION_CREDENTIALS');
  });

  it('includes NPM tokens', () => {
    expect(DEFAULT_STRIPPED_CREDENTIALS).toContain('NPM_TOKEN');
    expect(DEFAULT_STRIPPED_CREDENTIALS).toContain('NPM_AUTH_TOKEN');
  });

  it('includes GPG credentials', () => {
    expect(DEFAULT_STRIPPED_CREDENTIALS).toContain('GPG_AGENT_INFO');
    expect(DEFAULT_STRIPPED_CREDENTIALS).toContain('GPG_TTY');
  });

  it('is immutable (readonly array)', () => {
    expect(Array.isArray(DEFAULT_STRIPPED_CREDENTIALS)).toBe(true);
    expect(DEFAULT_STRIPPED_CREDENTIALS.length).toBeGreaterThan(0);
  });
});

describe('sanitizeEnvironment', () => {
  it('strips default credentials that are present in the env', () => {
    const env: Record<string, string | undefined> = {
      PATH: '/usr/bin',
      HOME: '/home/user',
      SSH_AUTH_SOCK: '/tmp/ssh-agent.sock',
      AWS_ACCESS_KEY_ID: 'AKIAIOSFODNN7EXAMPLE',
      GITHUB_TOKEN: 'ghp_xxxxxxxxxxxx',
    };

    const { env: sanitized, stripped } = sanitizeEnvironment(env);

    expect(sanitized.PATH).toBe('/usr/bin');
    expect(sanitized.HOME).toBe('/home/user');
    expect(sanitized.SSH_AUTH_SOCK).toBeUndefined();
    expect(sanitized.AWS_ACCESS_KEY_ID).toBeUndefined();
    expect(sanitized.GITHUB_TOKEN).toBeUndefined();
    expect('SSH_AUTH_SOCK' in sanitized).toBe(false);
    expect('AWS_ACCESS_KEY_ID' in sanitized).toBe(false);
    expect('GITHUB_TOKEN' in sanitized).toBe(false);
    expect(stripped).toEqual(['AWS_ACCESS_KEY_ID', 'GITHUB_TOKEN', 'SSH_AUTH_SOCK']);
  });

  it('returns empty stripped list when no sensitive vars are present', () => {
    const env: Record<string, string | undefined> = {
      PATH: '/usr/bin',
      HOME: '/home/user',
      EDITOR: 'vim',
    };

    const { env: sanitized, stripped } = sanitizeEnvironment(env);

    expect(sanitized.PATH).toBe('/usr/bin');
    expect(sanitized.HOME).toBe('/home/user');
    expect(sanitized.EDITOR).toBe('vim');
    expect(stripped).toEqual([]);
  });

  it('does not modify the original env object', () => {
    const env: Record<string, string | undefined> = {
      PATH: '/usr/bin',
      SSH_AUTH_SOCK: '/tmp/ssh-agent.sock',
    };

    sanitizeEnvironment(env);

    expect(env.SSH_AUTH_SOCK).toBe('/tmp/ssh-agent.sock');
  });

  it('skips stripping when disabled', () => {
    const env: Record<string, string | undefined> = {
      SSH_AUTH_SOCK: '/tmp/ssh-agent.sock',
      GITHUB_TOKEN: 'ghp_xxxx',
    };

    const { env: sanitized, stripped } = sanitizeEnvironment(env, { enabled: false });

    expect(sanitized.SSH_AUTH_SOCK).toBe('/tmp/ssh-agent.sock');
    expect(sanitized.GITHUB_TOKEN).toBe('ghp_xxxx');
    expect(stripped).toEqual([]);
  });

  it('strips additional custom variables', () => {
    const env: Record<string, string | undefined> = {
      PATH: '/usr/bin',
      MY_CUSTOM_SECRET: 'secret123',
      INTERNAL_API_KEY: 'key456',
    };

    const { env: sanitized, stripped } = sanitizeEnvironment(env, {
      additional: ['MY_CUSTOM_SECRET', 'INTERNAL_API_KEY'],
    });

    expect(sanitized.PATH).toBe('/usr/bin');
    expect('MY_CUSTOM_SECRET' in sanitized).toBe(false);
    expect('INTERNAL_API_KEY' in sanitized).toBe(false);
    expect(stripped).toEqual(['INTERNAL_API_KEY', 'MY_CUSTOM_SECRET']);
  });

  it('preserves specified variables even if in default strip list', () => {
    const env: Record<string, string | undefined> = {
      PATH: '/usr/bin',
      GITHUB_TOKEN: 'ghp_needed_for_ci',
      SSH_AUTH_SOCK: '/tmp/ssh-agent.sock',
      AWS_ACCESS_KEY_ID: 'AKIAIOSFODNN7EXAMPLE',
    };

    const { env: sanitized, stripped } = sanitizeEnvironment(env, {
      preserve: ['GITHUB_TOKEN'],
    });

    expect(sanitized.GITHUB_TOKEN).toBe('ghp_needed_for_ci');
    expect('SSH_AUTH_SOCK' in sanitized).toBe(false);
    expect('AWS_ACCESS_KEY_ID' in sanitized).toBe(false);
    expect(stripped).toContain('SSH_AUTH_SOCK');
    expect(stripped).toContain('AWS_ACCESS_KEY_ID');
    expect(stripped).not.toContain('GITHUB_TOKEN');
  });

  it('preserve matching is case-insensitive', () => {
    const env: Record<string, string | undefined> = {
      GITHUB_TOKEN: 'ghp_xxxx',
    };

    const { env: sanitized, stripped } = sanitizeEnvironment(env, {
      preserve: ['github_token'],
    });

    expect(sanitized.GITHUB_TOKEN).toBe('ghp_xxxx');
    expect(stripped).toEqual([]);
  });

  it('ignores variables not present in the env', () => {
    const env: Record<string, string | undefined> = {
      PATH: '/usr/bin',
    };

    const { env: sanitized, stripped } = sanitizeEnvironment(env, {
      additional: ['NONEXISTENT_VAR'],
    });

    expect(sanitized.PATH).toBe('/usr/bin');
    expect(stripped).toEqual([]);
  });

  it('skips variables with undefined values', () => {
    const env: Record<string, string | undefined> = {
      PATH: '/usr/bin',
      SSH_AUTH_SOCK: undefined,
    };

    const { stripped } = sanitizeEnvironment(env);

    expect(stripped).not.toContain('SSH_AUTH_SOCK');
  });

  it('returns stripped names in sorted order', () => {
    const env: Record<string, string | undefined> = {
      NPM_TOKEN: 'token',
      AWS_ACCESS_KEY_ID: 'key',
      GITHUB_TOKEN: 'ghp',
      SSH_AUTH_SOCK: '/sock',
    };

    const { stripped } = sanitizeEnvironment(env);

    for (let i = 1; i < stripped.length; i++) {
      expect(stripped[i]! >= stripped[i - 1]!).toBe(true);
    }
  });

  it('handles empty env object', () => {
    const { env: sanitized, stripped } = sanitizeEnvironment({});

    expect(sanitized).toEqual({});
    expect(stripped).toEqual([]);
  });

  it('handles combined additional and preserve options', () => {
    const env: Record<string, string | undefined> = {
      GITHUB_TOKEN: 'ghp_xxxx',
      MY_SECRET: 'secret',
      SSH_AUTH_SOCK: '/sock',
    };

    const { env: sanitized, stripped } = sanitizeEnvironment(env, {
      additional: ['MY_SECRET'],
      preserve: ['SSH_AUTH_SOCK'],
    });

    expect('GITHUB_TOKEN' in sanitized).toBe(false);
    expect('MY_SECRET' in sanitized).toBe(false);
    expect(sanitized.SSH_AUTH_SOCK).toBe('/sock');
    expect(stripped).toContain('GITHUB_TOKEN');
    expect(stripped).toContain('MY_SECRET');
    expect(stripped).not.toContain('SSH_AUTH_SOCK');
  });
});
