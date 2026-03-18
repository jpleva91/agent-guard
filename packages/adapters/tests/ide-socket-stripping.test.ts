// Tests for IDE socket environment variable stripping in the shell adapter
import { describe, it, expect } from 'vitest';
import {
  sanitizeEnvironment,
  DEFAULT_STRIPPED_CREDENTIALS,
  DEFAULT_STRIPPED_IDE_SOCKETS,
} from '@red-codes/adapters';

describe('DEFAULT_STRIPPED_IDE_SOCKETS', () => {
  it('includes VS Code IPC variables', () => {
    expect(DEFAULT_STRIPPED_IDE_SOCKETS).toContain('VSCODE_IPC_HOOK');
    expect(DEFAULT_STRIPPED_IDE_SOCKETS).toContain('VSCODE_IPC_HOOK_CLI');
    expect(DEFAULT_STRIPPED_IDE_SOCKETS).toContain('VSCODE_IPC_HOOK_EXTHOST');
  });

  it('includes Cursor IPC variables', () => {
    expect(DEFAULT_STRIPPED_IDE_SOCKETS).toContain('CURSOR_IPC_HOOK');
  });

  it('is a non-empty array', () => {
    expect(Array.isArray(DEFAULT_STRIPPED_IDE_SOCKETS)).toBe(true);
    expect(DEFAULT_STRIPPED_IDE_SOCKETS.length).toBeGreaterThan(0);
  });
});

describe('DEFAULT_STRIPPED_CREDENTIALS includes IDE socket vars', () => {
  it('contains VSCODE_IPC_HOOK', () => {
    expect(DEFAULT_STRIPPED_CREDENTIALS).toContain('VSCODE_IPC_HOOK');
  });

  it('contains CURSOR_IPC_HOOK', () => {
    expect(DEFAULT_STRIPPED_CREDENTIALS).toContain('CURSOR_IPC_HOOK');
  });
});

describe('sanitizeEnvironment IDE socket categorization', () => {
  it('categorizes IDE socket vars in strippedIdeSockets', () => {
    const env: Record<string, string | undefined> = {
      PATH: '/usr/bin',
      VSCODE_IPC_HOOK: '/tmp/vscode-ipc-abc.sock',
      VSCODE_IPC_HOOK_CLI: '/tmp/vscode-cli-ipc.sock',
    };

    const { env: sanitized, stripped, strippedIdeSockets } = sanitizeEnvironment(env);

    expect(sanitized.PATH).toBe('/usr/bin');
    expect('VSCODE_IPC_HOOK' in sanitized).toBe(false);
    expect('VSCODE_IPC_HOOK_CLI' in sanitized).toBe(false);
    expect(stripped).toEqual([]);
    expect(strippedIdeSockets).toContain('VSCODE_IPC_HOOK');
    expect(strippedIdeSockets).toContain('VSCODE_IPC_HOOK_CLI');
  });

  it('separates credential and IDE socket stripping', () => {
    const env: Record<string, string | undefined> = {
      PATH: '/usr/bin',
      GITHUB_TOKEN: 'ghp_xxxx',
      VSCODE_IPC_HOOK: '/tmp/vscode-ipc-abc.sock',
      SSH_AUTH_SOCK: '/tmp/ssh-agent.sock',
      CURSOR_IPC_HOOK: '/tmp/cursor-ipc.sock',
    };

    const { stripped, strippedIdeSockets } = sanitizeEnvironment(env);

    expect(stripped).toContain('GITHUB_TOKEN');
    expect(stripped).toContain('SSH_AUTH_SOCK');
    expect(stripped).not.toContain('VSCODE_IPC_HOOK');
    expect(stripped).not.toContain('CURSOR_IPC_HOOK');

    expect(strippedIdeSockets).toContain('VSCODE_IPC_HOOK');
    expect(strippedIdeSockets).toContain('CURSOR_IPC_HOOK');
    expect(strippedIdeSockets).not.toContain('GITHUB_TOKEN');
  });

  it('returns empty strippedIdeSockets when no IDE vars present', () => {
    const env: Record<string, string | undefined> = {
      PATH: '/usr/bin',
      HOME: '/home/user',
    };

    const { strippedIdeSockets } = sanitizeEnvironment(env);

    expect(strippedIdeSockets).toEqual([]);
  });

  it('returns empty strippedIdeSockets when stripping is disabled', () => {
    const env: Record<string, string | undefined> = {
      VSCODE_IPC_HOOK: '/tmp/vscode-ipc-abc.sock',
    };

    const { strippedIdeSockets } = sanitizeEnvironment(env, { enabled: false });

    expect(strippedIdeSockets).toEqual([]);
  });

  it('preserves IDE socket vars when in preserve list', () => {
    const env: Record<string, string | undefined> = {
      VSCODE_IPC_HOOK: '/tmp/vscode-ipc-abc.sock',
    };

    const { env: sanitized, strippedIdeSockets } = sanitizeEnvironment(env, {
      preserve: ['VSCODE_IPC_HOOK'],
    });

    expect(sanitized.VSCODE_IPC_HOOK).toBe('/tmp/vscode-ipc-abc.sock');
    expect(strippedIdeSockets).toEqual([]);
  });

  it('returns sorted strippedIdeSockets', () => {
    const env: Record<string, string | undefined> = {
      VSCODE_SERVER_IPC: '/tmp/server',
      CURSOR_IPC_HOOK: '/tmp/cursor',
      VSCODE_IPC_HOOK: '/tmp/vscode',
    };

    const { strippedIdeSockets } = sanitizeEnvironment(env);

    for (let i = 1; i < strippedIdeSockets.length; i++) {
      expect(strippedIdeSockets[i]! >= strippedIdeSockets[i - 1]!).toBe(true);
    }
  });
});
