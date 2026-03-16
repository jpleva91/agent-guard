// Shell execution adapter — executes shell.exec actions.
// Node.js adapter. Uses child_process.
// Includes credential stripping to prevent ambient credential leakage.

import { exec } from 'node:child_process';
import type { CanonicalAction } from '@red-codes/core';

const DEFAULT_TIMEOUT = 30_000;
const MAX_BUFFER = 1024 * 1024; // 1MB

/**
 * Default environment variables stripped before spawning child processes.
 * These represent well-known credential and authentication variables that
 * agents should not have ambient access to in governed sessions.
 */
export const DEFAULT_STRIPPED_CREDENTIALS: readonly string[] = [
  // SSH & GPG
  'SSH_AUTH_SOCK',
  'SSH_AGENT_PID',
  'GPG_AGENT_INFO',
  'GPG_TTY',
  // AWS
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'AWS_SECURITY_TOKEN',
  // GitHub / Git
  'GITHUB_TOKEN',
  'GH_TOKEN',
  'GITHUB_PAT',
  'GIT_ASKPASS',
  'GIT_TOKEN',
  // Cloud providers
  'AZURE_CLIENT_SECRET',
  'AZURE_TENANT_ID',
  'AZURE_CLIENT_ID',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'GCLOUD_SERVICE_KEY',
  'CLOUDSDK_AUTH_ACCESS_TOKEN',
  // CI / CD
  'CI_JOB_TOKEN',
  'GITLAB_TOKEN',
  'BITBUCKET_TOKEN',
  'CIRCLECI_TOKEN',
  // Docker
  'DOCKER_AUTH_CONFIG',
  'DOCKER_PASSWORD',
  // NPM
  'NPM_TOKEN',
  'NPM_AUTH_TOKEN',
  // Generic secrets
  'API_KEY',
  'SECRET_KEY',
  'PRIVATE_KEY',
  'ENCRYPTION_KEY',
  'DATABASE_URL',
  'DATABASE_PASSWORD',
  'REDIS_URL',
  'REDIS_PASSWORD',
];

/** Configuration for credential stripping behavior. */
export interface CredentialStrippingOptions {
  /** Whether credential stripping is enabled. Defaults to true. */
  enabled?: boolean;
  /** Additional variable names to strip beyond the defaults. */
  additional?: readonly string[];
  /** Variable names to preserve (override defaults). */
  preserve?: readonly string[];
}

export interface ShellResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  /** Names of environment variables that were stripped before execution. */
  strippedCredentials?: string[];
}

/**
 * Build a sanitized copy of the environment with credential variables removed.
 * Returns the sanitized env and the list of variable names that were actually present and stripped.
 */
export function sanitizeEnvironment(
  env: Record<string, string | undefined>,
  options: CredentialStrippingOptions = {}
): { env: Record<string, string | undefined>; stripped: string[] } {
  const { enabled = true, additional = [], preserve = [] } = options;

  if (!enabled) {
    return { env, stripped: [] };
  }

  const preserveSet = new Set(preserve.map((v) => v.toUpperCase()));
  const toStrip = new Set<string>();

  for (const name of DEFAULT_STRIPPED_CREDENTIALS) {
    if (!preserveSet.has(name.toUpperCase())) {
      toStrip.add(name);
    }
  }
  for (const name of additional) {
    if (!preserveSet.has(name.toUpperCase())) {
      toStrip.add(name);
    }
  }

  const sanitized = { ...env };
  const stripped: string[] = [];

  for (const name of toStrip) {
    if (name in sanitized && sanitized[name] !== undefined) {
      delete sanitized[name];
      stripped.push(name);
    }
  }

  stripped.sort();
  return { env: sanitized, stripped };
}

/**
 * Create a shell adapter with configurable credential stripping.
 * The returned adapter strips sensitive env vars before spawning child processes.
 */
export function createShellAdapter(
  credentialOptions?: CredentialStrippingOptions
): (action: CanonicalAction) => Promise<ShellResult> {
  const options = credentialOptions ?? {};

  return async (action: CanonicalAction): Promise<ShellResult> => {
    const command = (action as Record<string, unknown>).command as string | undefined;
    if (!command) {
      throw new Error('shell.exec requires a command');
    }

    const timeout =
      ((action as Record<string, unknown>).timeout as number | undefined) || DEFAULT_TIMEOUT;
    const cwd = (action as Record<string, unknown>).cwd as string | undefined;

    const { env: sanitizedEnv, stripped } = sanitizeEnvironment(
      process.env as Record<string, string | undefined>,
      options
    );

    return new Promise((resolve, reject) => {
      exec(
        command,
        { timeout, maxBuffer: MAX_BUFFER, cwd, env: sanitizedEnv },
        (error, stdout, stderr) => {
          if (error && error.killed) {
            reject(new Error(`Command timed out after ${timeout}ms: ${command}`));
            return;
          }

          resolve({
            stdout: stdout.toString(),
            stderr: stderr.toString(),
            exitCode: error ? (error.code ?? 1) : 0,
            strippedCredentials: stripped.length > 0 ? stripped : undefined,
          });
        }
      );
    });
  };
}

/**
 * Default shell adapter with credential stripping enabled.
 * Strips all DEFAULT_STRIPPED_CREDENTIALS from the child process environment.
 */
export const shellAdapter = createShellAdapter();
