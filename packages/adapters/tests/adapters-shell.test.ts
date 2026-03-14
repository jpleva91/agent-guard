// Tests for shell execution adapter
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:child_process', () => ({
  exec: vi.fn(),
}));

import { shellAdapter } from '@red-codes/adapters';
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

describe('shellAdapter', () => {
  it('executes a command and returns stdout/stderr/exitCode', async () => {
    vi.mocked(exec).mockImplementation((_cmd, _opts, cb) => {
      (cb as (...args: unknown[]) => void)(null, 'output', '');
      return {} as ReturnType<typeof exec>;
    });

    const result = await shellAdapter(makeAction({ command: 'echo hello' }));
    expect(result).toEqual({ stdout: 'output', stderr: '', exitCode: 0 });
    expect(exec).toHaveBeenCalledWith(
      'echo hello',
      expect.objectContaining({ timeout: 30_000, maxBuffer: 1024 * 1024 }),
      expect.any(Function)
    );
  });

  it('throws when command is missing', async () => {
    await expect(shellAdapter(makeAction({}))).rejects.toThrow('shell.exec requires a command');
  });

  it('returns non-zero exit code on command failure', async () => {
    const error = Object.assign(new Error('fail'), { code: 127, killed: false });
    vi.mocked(exec).mockImplementation((_cmd, _opts, cb) => {
      (cb as (...args: unknown[]) => void)(error, '', 'not found');
      return {} as ReturnType<typeof exec>;
    });

    const result = await shellAdapter(makeAction({ command: 'badcmd' }));
    expect(result.exitCode).toBe(127);
    expect(result.stderr).toBe('not found');
  });

  it('rejects with timeout error when command is killed', async () => {
    const error = Object.assign(new Error('killed'), { killed: true });
    vi.mocked(exec).mockImplementation((_cmd, _opts, cb) => {
      (cb as (...args: unknown[]) => void)(error, '', '');
      return {} as ReturnType<typeof exec>;
    });

    await expect(shellAdapter(makeAction({ command: 'sleep 999' }))).rejects.toThrow(
      'Command timed out'
    );
  });

  it('uses custom timeout when provided', async () => {
    vi.mocked(exec).mockImplementation((_cmd, _opts, cb) => {
      (cb as (...args: unknown[]) => void)(null, '', '');
      return {} as ReturnType<typeof exec>;
    });

    await shellAdapter(makeAction({ command: 'ls', timeout: 5000 }));
    expect(exec).toHaveBeenCalledWith(
      'ls',
      expect.objectContaining({ timeout: 5000 }),
      expect.any(Function)
    );
  });

  it('passes cwd option when provided', async () => {
    vi.mocked(exec).mockImplementation((_cmd, _opts, cb) => {
      (cb as (...args: unknown[]) => void)(null, '', '');
      return {} as ReturnType<typeof exec>;
    });

    await shellAdapter(makeAction({ command: 'ls', cwd: '/tmp' }));
    expect(exec).toHaveBeenCalledWith(
      'ls',
      expect.objectContaining({ cwd: '/tmp' }),
      expect.any(Function)
    );
  });
});
