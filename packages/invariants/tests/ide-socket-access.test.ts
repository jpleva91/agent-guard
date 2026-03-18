// Tests for the no-ide-socket-access invariant
import { describe, it, expect, beforeEach } from 'vitest';
import { DEFAULT_INVARIANTS } from '@red-codes/invariants';
import type { SystemState } from '@red-codes/invariants';
import { resetEventCounter } from '@red-codes/events';

beforeEach(() => {
  resetEventCounter();
});

function findInvariant(id: string) {
  const inv = DEFAULT_INVARIANTS.find((i) => i.id === id);
  if (!inv) throw new Error(`Invariant ${id} not found`);
  return inv;
}

describe('no-ide-socket-access invariant', () => {
  const inv = findInvariant('no-ide-socket-access');

  it('holds for normal file targets', () => {
    const state: SystemState = {
      currentTarget: 'src/index.ts',
      currentCommand: '',
    };
    const result = inv.check(state);
    expect(result.holds).toBe(true);
  });

  it('holds when no target or command', () => {
    const state: SystemState = {};
    const result = inv.check(state);
    expect(result.holds).toBe(true);
    expect(result.actual).toBe('No target or command to check');
  });

  // VS Code socket patterns
  it('denies access to vscode-ipc socket file targets', () => {
    const state: SystemState = {
      currentTarget: '/tmp/vscode-ipc-abc123.sock',
    };
    const result = inv.check(state);
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('vscode-ipc-');
    expect(result.actual).toContain('VS Code');
  });

  it('denies access to .vscode-server IPC paths', () => {
    const state: SystemState = {
      currentTarget: '/home/user/.vscode-server/ipc-12345',
    };
    const result = inv.check(state);
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('VS Code');
  });

  it('denies shell commands referencing vscode-ipc sockets', () => {
    const state: SystemState = {
      currentCommand: 'socat - UNIX-CONNECT:/tmp/vscode-ipc-xyz.sock',
    };
    const result = inv.check(state);
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('command');
  });

  // JetBrains socket patterns
  it('denies access to JetBrains IPC sockets', () => {
    const state: SystemState = {
      currentTarget: '/tmp/jetbrains_12345_ipc.sock',
    };
    const result = inv.check(state);
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('JetBrains');
  });

  it('denies access to IntelliJ IPC sockets', () => {
    const state: SystemState = {
      currentTarget: '/tmp/intellij_idea_ipc.sock',
    };
    const result = inv.check(state);
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('JetBrains');
  });

  it('denies access to IDEA IPC sockets', () => {
    const state: SystemState = {
      currentTarget: '/tmp/idea_token_file',
    };
    const result = inv.check(state);
    expect(result.holds).toBe(false);
  });

  it('denies access to PyCharm sockets', () => {
    const state: SystemState = {
      currentTarget: '/tmp/pycharm_helpers_pid',
    };
    const result = inv.check(state);
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('PyCharm');
  });

  it('denies access to WebStorm sockets', () => {
    const state: SystemState = {
      currentTarget: '/tmp/webstorm_debugging.sock',
    };
    const result = inv.check(state);
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('WebStorm');
  });

  it('denies access to GoLand sockets', () => {
    const state: SystemState = {
      currentTarget: '/tmp/goland_ipc_channel',
    };
    const result = inv.check(state);
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('GoLand');
  });

  it('denies access to CLion sockets', () => {
    const state: SystemState = {
      currentTarget: '/tmp/clion_debug_socket',
    };
    const result = inv.check(state);
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('CLion');
  });

  it('denies access to Rider sockets', () => {
    const state: SystemState = {
      currentTarget: '/tmp/rider_ipc_channel',
    };
    const result = inv.check(state);
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('Rider');
  });

  // Cursor socket patterns
  it('denies access to Cursor IPC sockets', () => {
    const state: SystemState = {
      currentTarget: '/tmp/cursor-ipc-abc123.sock',
    };
    const result = inv.check(state);
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('Cursor');
  });

  // Generic .sock files are allowed — only IDE-specific patterns are blocked
  it('allows access to generic non-IDE .sock files', () => {
    const state: SystemState = {
      currentTarget: '/tmp/some-editor.sock',
    };
    const result = inv.check(state);
    expect(result.holds).toBe(true);
  });

  // Case insensitivity
  it('is case-insensitive for socket path patterns', () => {
    const state: SystemState = {
      currentTarget: '/tmp/VSCODE-IPC-ABC123.SOCK',
    };
    const result = inv.check(state);
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('VS Code');
  });

  // Safe paths that should pass
  it('allows normal git commands', () => {
    const state: SystemState = {
      currentCommand: 'git push origin main',
    };
    const result = inv.check(state);
    expect(result.holds).toBe(true);
  });

  it('allows normal file operations', () => {
    const state: SystemState = {
      currentTarget: 'packages/kernel/src/kernel.ts',
    };
    const result = inv.check(state);
    expect(result.holds).toBe(true);
  });

  it('allows commands without socket references', () => {
    const state: SystemState = {
      currentCommand: 'npm install express',
    };
    const result = inv.check(state);
    expect(result.holds).toBe(true);
  });

  // Priority: target checked first, command as fallback
  it('checks target before command', () => {
    const state: SystemState = {
      currentTarget: '/tmp/vscode-ipc-123.sock',
      currentCommand: 'ls -la',
    };
    const result = inv.check(state);
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('target');
  });

  it('falls back to command when target is empty', () => {
    const state: SystemState = {
      currentTarget: '',
      currentCommand: 'cat /tmp/vscode-ipc-123.sock',
    };
    const result = inv.check(state);
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('command');
  });
});
