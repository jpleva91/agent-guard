// Git operation adapter — executes git.commit, git.push, etc.
// Node.js adapter. Wraps shell execution with git-specific validation.

import { execFile } from 'node:child_process';
import type { CanonicalAction } from '@red-codes/core';

const GIT_TIMEOUT = 30_000;

function execGit(args: string[], cwd?: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { timeout: GIT_TIMEOUT, cwd }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`Git command failed: ${stderr || error.message}`));
        return;
      }
      resolve({ stdout: stdout.toString(), stderr: stderr.toString() });
    });
  });
}

export async function gitAdapter(action: CanonicalAction): Promise<unknown> {
  const cwd = (action as Record<string, unknown>).cwd as string | undefined;

  switch (action.type) {
    case 'git.commit': {
      const message = (action as Record<string, unknown>).message as string | undefined;
      if (!message) {
        throw new Error('git.commit requires a message');
      }
      const result = await execGit(['commit', '-m', message], cwd);
      return { committed: true, output: result.stdout.trim() };
    }

    case 'git.push': {
      const branch = action.target || 'HEAD';
      const remote = ((action as Record<string, unknown>).remote as string | undefined) || 'origin';
      const result = await execGit(['push', remote, branch], cwd);
      return { pushed: true, branch, remote, output: result.stdout.trim() };
    }

    case 'git.diff': {
      const result = await execGit(['diff'], cwd);
      return { diff: result.stdout };
    }

    case 'git.branch.create': {
      const branch = action.target;
      const result = await execGit(['checkout', '-b', branch], cwd);
      return { created: true, branch, output: result.stdout.trim() };
    }

    case 'git.branch.delete': {
      const branch = action.target;
      const result = await execGit(['branch', '-d', branch], cwd);
      return { deleted: true, branch, output: result.stdout.trim() };
    }

    case 'git.checkout': {
      const branch = action.target;
      const result = await execGit(['checkout', branch], cwd);
      return { checkedOut: true, branch, output: result.stdout.trim() };
    }

    case 'git.merge': {
      const branch = action.target;
      const result = await execGit(['merge', branch], cwd);
      return { merged: true, branch, output: result.stdout.trim() };
    }

    default:
      throw new Error(`Unsupported git action: ${action.type}`);
  }
}
