// Shell execution adapter — executes shell.exec actions.
// Node.js adapter. Uses child_process.

import { exec } from 'node:child_process';
import type { CanonicalAction } from '@red-codes/core';

const DEFAULT_TIMEOUT = 30_000;
const MAX_BUFFER = 1024 * 1024; // 1MB

export interface ShellResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function shellAdapter(action: CanonicalAction): Promise<ShellResult> {
  const command = (action as Record<string, unknown>).command as string | undefined;
  if (!command) {
    throw new Error('shell.exec requires a command');
  }

  const timeout =
    ((action as Record<string, unknown>).timeout as number | undefined) || DEFAULT_TIMEOUT;
  const cwd = (action as Record<string, unknown>).cwd as string | undefined;

  return new Promise((resolve, reject) => {
    exec(command, { timeout, maxBuffer: MAX_BUFFER, cwd }, (error, stdout, stderr) => {
      if (error && error.killed) {
        reject(new Error(`Command timed out after ${timeout}ms: ${command}`));
        return;
      }

      resolve({
        stdout: stdout.toString(),
        stderr: stderr.toString(),
        exitCode: error ? (error.code ?? 1) : 0,
      });
    });
  });
}
