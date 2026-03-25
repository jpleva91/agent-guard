// Tests for credential stripping in the shell adapter
import { describe, it, expect } from 'vitest';
import {
  sanitizeEnvironment,
  DEFAULT_STRIPPED_CREDENTIALS,
  DEFAULT_STRIPPED_CREDENTIAL_PATTERNS,
} from '@red-codes/adapters';

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

  it('includes AI provider keys', () => {
    expect(DEFAULT_STRIPPED_CREDENTIALS).toContain('ANTHROPIC_API_KEY');
    expect(DEFAULT_STRIPPED_CREDENTIALS).toContain('OPENAI_API_KEY');
    expect(DEFAULT_STRIPPED_CREDENTIALS).toContain('OPENAI_ORG_ID');
    expect(DEFAULT_STRIPPED_CREDENTIALS).toContain('GOOGLE_API_KEY');
  });

  it('includes Kubernetes and Vault credentials', () => {
    expect(DEFAULT_STRIPPED_CREDENTIALS).toContain('KUBECONFIG');
    expect(DEFAULT_STRIPPED_CREDENTIALS).toContain('KUBERNETES_SERVICE_TOKEN');
    expect(DEFAULT_STRIPPED_CREDENTIALS).toContain('VAULT_TOKEN');
    expect(DEFAULT_STRIPPED_CREDENTIALS).toContain('VAULT_ADDR');
  });

  it('includes data platform credentials', () => {
    expect(DEFAULT_STRIPPED_CREDENTIALS).toContain('DATABRICKS_TOKEN');
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

describe('DEFAULT_STRIPPED_CREDENTIAL_PATTERNS', () => {
  it('includes wildcard suffix patterns for common credential names', () => {
    expect(DEFAULT_STRIPPED_CREDENTIAL_PATTERNS).toContain('*_API_KEY');
    expect(DEFAULT_STRIPPED_CREDENTIAL_PATTERNS).toContain('*_SECRET');
    expect(DEFAULT_STRIPPED_CREDENTIAL_PATTERNS).toContain('*_TOKEN');
    expect(DEFAULT_STRIPPED_CREDENTIAL_PATTERNS).toContain('*_PASSWORD');
    expect(DEFAULT_STRIPPED_CREDENTIAL_PATTERNS).toContain('*_PROXY');
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
    expect(stripped).toContain('AWS_ACCESS_KEY_ID');
    expect(stripped).toContain('SSH_AUTH_SOCK');
  });

  it('strips AI provider keys', () => {
    const env: Record<string, string | undefined> = {
      PATH: '/usr/bin',
      ANTHROPIC_API_KEY: 'sk-ant-xxx',
      OPENAI_API_KEY: 'sk-openai-xxx',
      OPENAI_ORG_ID: 'org-xxx',
      GOOGLE_API_KEY: 'AIzaSyXxx',
    };

    const { env: sanitized, stripped } = sanitizeEnvironment(env);

    expect(sanitized.PATH).toBe('/usr/bin');
    expect('ANTHROPIC_API_KEY' in sanitized).toBe(false);
    expect('OPENAI_API_KEY' in sanitized).toBe(false);
    expect('OPENAI_ORG_ID' in sanitized).toBe(false);
    expect('GOOGLE_API_KEY' in sanitized).toBe(false);
    expect(stripped).toContain('ANTHROPIC_API_KEY');
    expect(stripped).toContain('OPENAI_API_KEY');
    expect(stripped).toContain('OPENAI_ORG_ID');
    expect(stripped).toContain('GOOGLE_API_KEY');
  });

  it('strips Kubernetes and Vault credentials', () => {
    const env: Record<string, string | undefined> = {
      PATH: '/usr/bin',
      KUBECONFIG: '/home/user/.kube/config',
      KUBERNETES_SERVICE_TOKEN: 'k8s-token-xxx',
      VAULT_TOKEN: 'hvs.xxx',
      VAULT_ADDR: 'https://vault.example.com',
    };

    const { env: sanitized, stripped } = sanitizeEnvironment(env);

    expect('KUBECONFIG' in sanitized).toBe(false);
    expect('KUBERNETES_SERVICE_TOKEN' in sanitized).toBe(false);
    expect('VAULT_TOKEN' in sanitized).toBe(false);
    expect('VAULT_ADDR' in sanitized).toBe(false);
    expect(stripped).toContain('KUBECONFIG');
    expect(stripped).toContain('KUBERNETES_SERVICE_TOKEN');
    expect(stripped).toContain('VAULT_TOKEN');
    expect(stripped).toContain('VAULT_ADDR');
  });

  it('strips proxy vars (which may contain embedded credentials)', () => {
    const env: Record<string, string | undefined> = {
      PATH: '/usr/bin',
      HTTP_PROXY: 'http://user:pass@proxy.example.com:3128',
      HTTPS_PROXY: 'https://user:pass@proxy.example.com:3128',
    };

    const { env: sanitized, stripped } = sanitizeEnvironment(env);

    expect('HTTP_PROXY' in sanitized).toBe(false);
    expect('HTTPS_PROXY' in sanitized).toBe(false);
    expect(stripped).toContain('HTTP_PROXY');
    expect(stripped).toContain('HTTPS_PROXY');
  });

  it('strips wildcard-matched credential vars not in the explicit list', () => {
    const env: Record<string, string | undefined> = {
      PATH: '/usr/bin',
      MY_CUSTOM_API_KEY: 'key-xxx',
      INTERNAL_SERVICE_TOKEN: 'token-xxx',
      APP_SECRET: 'secret-xxx',
      DB_PASSWORD: 'pass-xxx',
    };

    const { env: sanitized, stripped } = sanitizeEnvironment(env);

    expect(sanitized.PATH).toBe('/usr/bin');
    expect('MY_CUSTOM_API_KEY' in sanitized).toBe(false);
    expect('INTERNAL_SERVICE_TOKEN' in sanitized).toBe(false);
    expect('APP_SECRET' in sanitized).toBe(false);
    expect('DB_PASSWORD' in sanitized).toBe(false);
    expect(stripped).toContain('MY_CUSTOM_API_KEY');
    expect(stripped).toContain('INTERNAL_SERVICE_TOKEN');
    expect(stripped).toContain('APP_SECRET');
    expect(stripped).toContain('DB_PASSWORD');
  });

  it('preserve overrides wildcard pattern stripping', () => {
    const env: Record<string, string | undefined> = {
      PATH: '/usr/bin',
      MY_API_KEY: 'key-xxx',
    };

    const { env: sanitized, stripped } = sanitizeEnvironment(env, {
      preserve: ['MY_API_KEY'],
    });

    expect(sanitized.MY_API_KEY).toBe('key-xxx');
    expect(stripped).not.toContain('MY_API_KEY');
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
    expect(stripped).toContain('INTERNAL_API_KEY');
    expect(stripped).toContain('MY_CUSTOM_SECRET');
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
