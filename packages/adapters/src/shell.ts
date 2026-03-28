// Shell execution adapter — executes shell.exec actions.
// Node.js adapter. Uses child_process.
// Includes credential stripping to prevent ambient credential leakage
// and privilege profiles for command-level access control.

import { exec } from 'node:child_process';
import type { CanonicalAction } from '@red-codes/core';
import { INVARIANT_IDE_CONTEXT_ENV_VARS } from '@red-codes/core';

const DEFAULT_TIMEOUT = 30_000;
const MAX_BUFFER = 1024 * 1024; // 1MB

// ---------------------------------------------------------------------------
// Privilege Profiles — command-level access control
// ---------------------------------------------------------------------------

/** Named privilege profile for shell command restrictions. */
export interface ShellPrivilegeProfile {
  /** Profile name (e.g., 'readonly', 'developer', 'ci', 'admin'). */
  readonly name: string;
  /** Command patterns allowed by this profile. If empty, all commands are allowed. */
  readonly allow: readonly string[];
  /** Command patterns denied by this profile. Deny takes precedence over allow. */
  readonly deny: readonly string[];
  /** Additional environment variables to strip (beyond credential defaults). */
  readonly envRestrictions?: readonly string[];
}

/**
 * Check whether a command matches a shell privilege pattern.
 *
 * Patterns use a simple glob syntax:
 * - `*` matches any sequence of characters
 * - A pattern without `*` matches the command prefix at a word boundary
 *   (e.g., `ls` matches `ls -la` but not `lsof`)
 */
export function commandMatchesPattern(command: string, pattern: string): boolean {
  const cmd = command.trim();
  const pat = pattern.trim();

  if (pat === '*') return true;
  if (!cmd || !pat) return false;

  // Escape regex special chars then replace glob * with .*
  const escaped = pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');

  // If pattern ends with *, match prefix freely; otherwise require word boundary
  const suffix = pat.endsWith('*') ? '' : '(?:\\s|$)';
  const regex = new RegExp(`^${escaped}${suffix}`, 'i');

  return regex.test(cmd);
}

/**
 * Error thrown when a command is blocked by a privilege profile.
 * The kernel will catch this and emit the appropriate governance event.
 */
export class ShellProfileViolationError extends Error {
  readonly profileName: string;
  readonly command: string;

  constructor(profileName: string, command: string) {
    super(`Shell privilege profile '${profileName}' denied command: ${command}`);
    this.name = 'ShellProfileViolationError';
    this.profileName = profileName;
    this.command = command;
  }
}

/**
 * Check a command against a privilege profile.
 * Returns null if the command is allowed, or a reason string if denied.
 */
export function checkProfile(command: string, profile: ShellPrivilegeProfile): string | null {
  // Deny patterns take precedence
  for (const pattern of profile.deny) {
    if (commandMatchesPattern(command, pattern)) {
      return `denied by pattern '${pattern}' in profile '${profile.name}'`;
    }
  }

  // If allow list is empty, all non-denied commands are allowed
  if (profile.allow.length === 0) {
    return null;
  }

  // Check if command matches any allow pattern
  for (const pattern of profile.allow) {
    if (commandMatchesPattern(command, pattern)) {
      return null;
    }
  }

  return `not in allowlist for profile '${profile.name}'`;
}

// ---------------------------------------------------------------------------
// Built-in privilege profiles
// ---------------------------------------------------------------------------

/** Read-only profile: allows only observation commands, no mutations. */
export const READONLY_PROFILE: ShellPrivilegeProfile = {
  name: 'readonly',
  allow: [
    // File inspection
    'ls',
    'cat',
    'head',
    'tail',
    'wc',
    'file',
    'stat',
    'du',
    'df',
    // Output / info
    'echo',
    'printf',
    'pwd',
    'which',
    'whoami',
    'hostname',
    'date',
    'uname',
    // Environment inspection
    'env',
    'printenv',
    // Search
    'grep',
    'rg',
    'find',
    'tree',
    'less',
    'more',
    // Git read-only
    'git status*',
    'git log*',
    'git diff*',
    'git show*',
    'git branch*',
    'git tag*',
    'git remote*',
    'git rev-parse*',
    'git worktree list*',
    // Runtime version checks
    'node --version',
    'node -v',
    'npm --version',
    'npm -v',
    'pnpm --version',
    'pnpm -v',
  ],
  deny: [],
};

/** Developer profile: allows build/test/dev work, denies destructive system operations. */
export const DEVELOPER_PROFILE: ShellPrivilegeProfile = {
  name: 'developer',
  allow: [], // empty = allow all except denied
  deny: [
    // Destructive git operations
    'git push --force*',
    'git push -f*',
    'git reset --hard*',
    'git clean -f*',
    // Dangerous system commands
    'rm -rf /',
    'rm -rf ~',
    'mkfs*',
    'dd if=*',
    'shutdown*',
    'reboot*',
    'halt*',
    'poweroff*',
    'chmod 777*',
    'fdisk*',
    'parted*',
    'format*',
  ],
};

/** CI profile: allows build and test commands, denies pushes and installs. */
export const CI_PROFILE: ShellPrivilegeProfile = {
  name: 'ci',
  allow: [
    // Build tooling
    'pnpm build*',
    'pnpm test*',
    'pnpm lint*',
    'pnpm format*',
    'pnpm ts:check*',
    'npm run*',
    'npm test*',
    'npx *',
    'node *',
    'tsc*',
    'esbuild*',
    'vitest*',
    'eslint*',
    'prettier*',
    // Git read operations
    'git status*',
    'git log*',
    'git diff*',
    'git show*',
    'git branch*',
    'git rev-parse*',
    // File inspection
    'ls',
    'cat',
    'head',
    'tail',
    'echo',
    'pwd',
    'grep',
    'rg',
    'find',
  ],
  deny: [
    // No pushing in CI profile (CI pushes are handled by the CI system itself)
    'git push*',
    // No package installation (frozen lockfile only)
    'pnpm install*',
    'npm install*',
    'yarn install*',
    'yarn add*',
    'pnpm add*',
    'npm i *',
  ],
};

/** Admin profile: unrestricted access with no command filtering. */
export const ADMIN_PROFILE: ShellPrivilegeProfile = {
  name: 'admin',
  allow: [],
  deny: [],
};

/** Map of built-in profile names to their definitions. */
export const SHELL_PROFILES: Readonly<Record<string, ShellPrivilegeProfile>> = {
  readonly: READONLY_PROFILE,
  developer: DEVELOPER_PROFILE,
  ci: CI_PROFILE,
  admin: ADMIN_PROFILE,
};

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
  'GOOGLE_API_KEY',
  'GCLOUD_SERVICE_KEY',
  'CLOUDSDK_AUTH_ACCESS_TOKEN',
  // AI provider keys
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'OPENAI_ORG_ID',
  // Kubernetes / infrastructure
  'KUBECONFIG',
  'KUBERNETES_SERVICE_TOKEN',
  'VAULT_TOKEN',
  'VAULT_ADDR',
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
  // Data platforms
  'DATABRICKS_TOKEN',
  // IDE IPC sockets — prevent governance escape via host IDE manipulation
  ...INVARIANT_IDE_CONTEXT_ENV_VARS,
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

/**
 * Wildcard suffix patterns for stripping credential-like environment variables.
 * Any env var whose name ends with one of these suffixes (case-insensitive) will
 * be stripped, catching custom or less-common credential names automatically.
 * Note: HTTP_PROXY / HTTPS_PROXY are intentionally covered here via '*_PROXY' suffix
 * only when they contain embedded credentials (user:pass@host), but we strip them
 * unconditionally because agents should not route traffic through ambient proxies.
 */
export const DEFAULT_STRIPPED_CREDENTIAL_PATTERNS: readonly string[] = [
  '*_API_KEY',
  '*_SECRET',
  '*_TOKEN',
  '*_PASSWORD',
  '*_PROXY',
];

/**
 * IDE socket environment variables stripped before spawning child processes.
 * These represent IPC paths that agents should not have access to in governed sessions.
 * Sourced from @red-codes/core governance data (invariant-patterns.json).
 */
export const DEFAULT_STRIPPED_IDE_SOCKETS: readonly string[] = INVARIANT_IDE_CONTEXT_ENV_VARS;

/** Configuration for the shell adapter. */
export interface ShellAdapterOptions {
  /** Credential stripping configuration. */
  credentials?: CredentialStrippingOptions;
  /** When true, route commands through rtk for token-optimized output. */
  rtkEnabled?: boolean;
  /** Privilege profile for command-level access control. String selects a built-in profile by name. */
  profile?: ShellPrivilegeProfile | string;
}

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
  /** Names of IDE socket environment variables that were stripped before execution. */
  strippedIdeSockets?: string[];
  /** The original command before rtk rewrite (present only when rtk rewrote the command). */
  originalCommand?: string;
  /** Active privilege profile name, if one was applied. */
  profileName?: string;
}

/**
 * Resolve a profile option to a ShellPrivilegeProfile.
 * Accepts a profile object directly or a built-in profile name string.
 */
function resolveProfile(
  profile: ShellPrivilegeProfile | string | undefined
): ShellPrivilegeProfile | undefined {
  if (!profile) return undefined;
  if (typeof profile === 'string') {
    const resolved = SHELL_PROFILES[profile];
    if (!resolved) {
      throw new Error(
        `Unknown shell privilege profile '${profile}'. Available: ${Object.keys(SHELL_PROFILES).join(', ')}`
      );
    }
    return resolved;
  }
  return profile;
}

/**
 * Check whether an environment variable name matches a wildcard credential suffix pattern.
 * Patterns use a simple `*` prefix glob (e.g. `*_API_KEY` matches `OPENAI_API_KEY`).
 */
function matchesCredentialPattern(varName: string, patterns: readonly string[]): boolean {
  const upper = varName.toUpperCase();
  for (const pattern of patterns) {
    if (pattern.startsWith('*')) {
      const suffix = pattern.slice(1).toUpperCase();
      if (upper.endsWith(suffix)) return true;
    } else if (upper === pattern.toUpperCase()) {
      return true;
    }
  }
  return false;
}

/**
 * Build a sanitized copy of the environment with credential variables removed.
 * Strips variables from the explicit DEFAULT_STRIPPED_CREDENTIALS list as well as
 * any env var whose name matches a DEFAULT_STRIPPED_CREDENTIAL_PATTERNS suffix glob.
 * Returns the sanitized env and the list of variable names that were actually present and stripped.
 */
export function sanitizeEnvironment(
  env: Record<string, string | undefined>,
  options: CredentialStrippingOptions = {}
): { env: Record<string, string | undefined>; stripped: string[]; strippedIdeSockets: string[] } {
  const { enabled = true, additional = [], preserve = [] } = options;

  if (!enabled) {
    return { env, stripped: [], strippedIdeSockets: [] };
  }

  const preserveSet = new Set(preserve.map((v) => v.toUpperCase()));
  const ideSocketSet = new Set(INVARIANT_IDE_CONTEXT_ENV_VARS.map((v) => v.toUpperCase()));
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
  const strippedIdeSockets: string[] = [];

  // Strip explicitly listed credentials
  for (const name of toStrip) {
    if (name in sanitized && sanitized[name] !== undefined) {
      delete sanitized[name];
      if (ideSocketSet.has(name.toUpperCase())) {
        strippedIdeSockets.push(name);
      } else {
        stripped.push(name);
      }
    }
  }

  // Strip any remaining env vars matching wildcard suffix patterns
  for (const varName of Object.keys(sanitized)) {
    if (preserveSet.has(varName.toUpperCase())) continue;
    if (sanitized[varName] === undefined) continue;
    if (matchesCredentialPattern(varName, DEFAULT_STRIPPED_CREDENTIAL_PATTERNS)) {
      delete sanitized[varName];
      if (ideSocketSet.has(varName.toUpperCase())) {
        strippedIdeSockets.push(varName);
      } else {
        stripped.push(varName);
      }
    }
  }

  stripped.sort();
  strippedIdeSockets.sort();
  return { env: sanitized, stripped, strippedIdeSockets };
}

/**
 * Create a shell adapter with configurable credential stripping and optional rtk integration.
 * The returned adapter strips sensitive env vars before spawning child processes.
 * When rtkEnabled is true, commands are routed through rtk for token-optimized output.
 */
export function createShellAdapter(
  optionsOrCredentials?: ShellAdapterOptions | CredentialStrippingOptions
): (action: CanonicalAction) => Promise<ShellResult> {
  // Support both old (CredentialStrippingOptions) and new (ShellAdapterOptions) signatures
  const isNewOptions =
    optionsOrCredentials &&
    ('credentials' in optionsOrCredentials ||
      'rtkEnabled' in optionsOrCredentials ||
      'profile' in optionsOrCredentials);
  const credentialOptions = isNewOptions
    ? ((optionsOrCredentials as ShellAdapterOptions).credentials ?? {})
    : ((optionsOrCredentials as CredentialStrippingOptions) ?? {});
  // RTK defaults to ON via AGENTGUARD_RTK_ENABLED env var (set 'false' to disable)
  const envRtk = process.env.AGENTGUARD_RTK_ENABLED !== 'false';
  const rtkEnabled = isNewOptions
    ? ((optionsOrCredentials as ShellAdapterOptions).rtkEnabled ?? envRtk)
    : envRtk;
  // Resolve privilege profile (string name or object)
  const resolvedProfile = isNewOptions
    ? resolveProfile((optionsOrCredentials as ShellAdapterOptions).profile)
    : undefined;

  return async (action: CanonicalAction): Promise<ShellResult> => {
    let command = (action as Record<string, unknown>).command as string | undefined;
    if (!command) {
      throw new Error('shell.exec requires a command');
    }

    // Enforce privilege profile before any execution
    if (resolvedProfile) {
      const violation = checkProfile(command, resolvedProfile);
      if (violation) {
        throw new ShellProfileViolationError(resolvedProfile.name, command);
      }
    }

    const timeout =
      ((action as Record<string, unknown>).timeout as number | undefined) || DEFAULT_TIMEOUT;
    const cwd = (action as Record<string, unknown>).cwd as string | undefined;

    // Optionally rewrite the command through rtk for token-optimized output.
    // This happens AFTER governance approval — the kernel evaluated the original command.
    let originalCommand: string | undefined;
    if (rtkEnabled) {
      try {
        const { rtkRewrite } = await import('@red-codes/core');
        const result = rtkRewrite(command);
        if (result.rewritten) {
          originalCommand = command;
          command = result.command;
        }
      } catch {
        // rtk rewrite failure is non-fatal — execute original command
      }
    }

    // Merge profile env restrictions into credential stripping options
    const effectiveCredentialOptions = resolvedProfile?.envRestrictions
      ? {
          ...credentialOptions,
          additional: [...(credentialOptions.additional ?? []), ...resolvedProfile.envRestrictions],
        }
      : credentialOptions;

    const {
      env: sanitizedEnv,
      stripped,
      strippedIdeSockets,
    } = sanitizeEnvironment(
      process.env as Record<string, string | undefined>,
      effectiveCredentialOptions
    );

    // Capture as const so TypeScript can narrow the type inside the Promise closure.
    // TypeScript doesn't narrow `let` variables captured in closures since they're mutable.
    const execCommand: string = command;
    return new Promise((resolve, reject) => {
      exec(
        execCommand,
        { timeout, maxBuffer: MAX_BUFFER, cwd, env: sanitizedEnv },
        (error, stdout, stderr) => {
          if (error && error.killed) {
            reject(new Error(`Command timed out after ${timeout}ms: ${execCommand}`));
            return;
          }

          resolve({
            stdout: stdout.toString(),
            stderr: stderr.toString(),
            exitCode: error ? (error.code ?? 1) : 0,
            strippedCredentials: stripped.length > 0 ? stripped : undefined,
            strippedIdeSockets: strippedIdeSockets.length > 0 ? strippedIdeSockets : undefined,
            originalCommand,
            profileName: resolvedProfile?.name,
          });
        }
      );
    });
  };
}

/**
 * Default shell adapter with credential stripping and RTK token optimization enabled.
 * RTK is on by default (set AGENTGUARD_RTK_ENABLED=false to disable).
 * Strips all DEFAULT_STRIPPED_CREDENTIALS from the child process environment.
 */
export const shellAdapter = createShellAdapter();
