// Tests for git operation adapter
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:child_process', () => ({
  exec: vi.fn(),
}));

import { gitAdapter } from '../../src/adapters/git.js';
import { exec } from 'node:child_process';
import type { CanonicalAction } from '../../src/core/types.js';

function makeAction(overrides: Record<string, unknown>): CanonicalAction {
  return {
    id: 'act_1',
    target: '',
    class: 'git',
    justification: 'test',
    timestamp: Date.now(),
    fingerprint: 'fp_1',
    ...overrides,
  } as CanonicalAction;
}

function mockExecSuccess(stdout = '', stderr = '') {
  vi.mocked(exec).mockImplementation((_cmd, _opts, cb) => {
    (cb as (...args: unknown[]) => void)(null, stdout, stderr);
    return {} as ReturnType<typeof exec>;
  });
}

function mockExecFailure(stderr: string) {
  vi.mocked(exec).mockImplementation((_cmd, _opts, cb) => {
    (cb as (...args: unknown[]) => void)(new Error(stderr), '', stderr);
    return {} as ReturnType<typeof exec>;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('gitAdapter', () => {
  describe('git.commit', () => {
    it('commits with message', async () => {
      mockExecSuccess('1 file changed');
      const result = await gitAdapter(
        makeAction({ type: 'git.commit', message: 'fix: resolve bug' })
      );
      expect(result).toEqual({ committed: true, output: '1 file changed' });
      expect(exec).toHaveBeenCalledWith(
        'git commit -m "fix: resolve bug"',
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('throws when message is missing', async () => {
      await expect(
        gitAdapter(makeAction({ type: 'git.commit' }))
      ).rejects.toThrow('git.commit requires a message');
    });

    it('escapes double quotes in commit message', async () => {
      mockExecSuccess('ok');
      await gitAdapter(
        makeAction({ type: 'git.commit', message: 'fix "quotes" issue' })
      );
      expect(exec).toHaveBeenCalledWith(
        expect.stringContaining('\\"quotes\\"'),
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('propagates git errors', async () => {
      mockExecFailure('nothing to commit');
      await expect(
        gitAdapter(makeAction({ type: 'git.commit', message: 'test' }))
      ).rejects.toThrow('Git command failed: nothing to commit');
    });
  });

  describe('git.push', () => {
    it('pushes to origin by default', async () => {
      mockExecSuccess('pushed');
      const result = await gitAdapter(
        makeAction({ type: 'git.push', target: 'main' })
      );
      expect(result).toEqual({
        pushed: true,
        branch: 'main',
        remote: 'origin',
        output: 'pushed',
      });
      expect(exec).toHaveBeenCalledWith(
        'git push origin main',
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('uses custom remote when provided', async () => {
      mockExecSuccess('');
      await gitAdapter(
        makeAction({ type: 'git.push', target: 'dev', remote: 'upstream' })
      );
      expect(exec).toHaveBeenCalledWith(
        'git push upstream dev',
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('defaults target to HEAD when not set', async () => {
      mockExecSuccess('');
      await gitAdapter(makeAction({ type: 'git.push', target: '' }));
      expect(exec).toHaveBeenCalledWith(
        'git push origin HEAD',
        expect.any(Object),
        expect.any(Function)
      );
    });
  });

  describe('git.diff', () => {
    it('returns diff output', async () => {
      mockExecSuccess('diff --git a/file.ts b/file.ts');
      const result = await gitAdapter(makeAction({ type: 'git.diff' }));
      expect(result).toEqual({ diff: 'diff --git a/file.ts b/file.ts' });
    });
  });

  describe('git.branch.create', () => {
    it('creates and checks out a new branch', async () => {
      mockExecSuccess("Switched to new branch 'feature'");
      const result = await gitAdapter(
        makeAction({ type: 'git.branch.create', target: 'feature' })
      );
      expect(result).toEqual({
        created: true,
        branch: 'feature',
        output: "Switched to new branch 'feature'",
      });
      expect(exec).toHaveBeenCalledWith(
        'git checkout -b feature',
        expect.any(Object),
        expect.any(Function)
      );
    });
  });

  describe('git.branch.delete', () => {
    it('deletes a branch', async () => {
      mockExecSuccess('Deleted branch old');
      const result = await gitAdapter(
        makeAction({ type: 'git.branch.delete', target: 'old' })
      );
      expect(result).toEqual({ deleted: true, branch: 'old', output: 'Deleted branch old' });
    });
  });

  describe('git.checkout', () => {
    it('checks out a branch', async () => {
      mockExecSuccess("Switched to branch 'main'");
      const result = await gitAdapter(
        makeAction({ type: 'git.checkout', target: 'main' })
      );
      expect(result).toEqual({
        checkedOut: true,
        branch: 'main',
        output: "Switched to branch 'main'",
      });
    });
  });

  describe('git.merge', () => {
    it('merges a branch', async () => {
      mockExecSuccess('Merge made by recursive');
      const result = await gitAdapter(
        makeAction({ type: 'git.merge', target: 'feature' })
      );
      expect(result).toEqual({
        merged: true,
        branch: 'feature',
        output: 'Merge made by recursive',
      });
    });
  });

  describe('unsupported action', () => {
    it('throws for unknown git action type', async () => {
      await expect(
        gitAdapter(makeAction({ type: 'git.rebase' }))
      ).rejects.toThrow('Unsupported git action: git.rebase');
    });
  });
});
