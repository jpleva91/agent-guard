// Default system invariant definitions.
// Pure domain logic. No DOM, no Node.js-specific APIs.
// Pattern data sourced from @red-codes/core governance data files.

import {
  INVARIANT_SENSITIVE_FILE_PATTERNS,
  INVARIANT_CREDENTIAL_PATH_PATTERNS,
  INVARIANT_CREDENTIAL_BASENAME_PATTERNS,
  INVARIANT_LIFECYCLE_SCRIPTS,
  INVARIANT_IDE_SOCKET_PATH_PATTERNS,
} from '@red-codes/core';
import type { Suggestion } from '@red-codes/core';
import { PathMatcher } from '@red-codes/matchers';

export interface InvariantCheckResult {
  holds: boolean;
  expected: string;
  actual: string;
}

export interface AgentGuardInvariant {
  id: string;
  name: string;
  description: string;
  severity: number;
  check: (state: SystemState) => InvariantCheckResult;
  suggest?: (state: SystemState) => Suggestion | null;
}

export interface SystemState {
  modifiedFiles?: string[];
  targetBranch?: string;
  directPush?: boolean;
  forcePush?: boolean;
  isPush?: boolean;
  testsPass?: boolean;
  formatPass?: boolean;
  filesAffected?: number;
  blastRadiusLimit?: number;
  protectedBranches?: string[];
  /** Blast radius from pre-execution simulation (overrides filesAffected in blast-radius check) */
  simulatedBlastRadius?: number;
  /** Risk level from pre-execution simulation */
  simulatedRiskLevel?: string;
  /** File path targeted by the current action */
  currentTarget?: string;
  /** Shell command of the current action (for shell.exec detection) */
  currentCommand?: string;
  /** Canonical action type of the current action (e.g. 'file.write', 'git.push') */
  currentActionType?: string;
  /** Content diff or new content for the current file action (for content-aware invariants) */
  fileContentDiff?: string;
  /** Byte size of the content being written (for file.write actions) */
  writeSizeBytes?: number;
  /** Maximum allowed single-file write size in bytes (default: 102400 = 100KB) */
  writeSizeBytesLimit?: number;
  /** Whether the current action is a network request (http.request or shell with network tools) */
  isNetworkRequest?: boolean;
  /** Full URL of the network request (if available) */
  requestUrl?: string;
  /** Domain/hostname of the network request (extracted from URL) */
  requestDomain?: string;
  /** Allowlisted domains for network egress (default: empty = deny all) */
  networkEgressAllowlist?: string[];
  /** Files staged for the current git.commit, from `git diff --cached --name-only` */
  stagedFiles?: string[];
  /** All file paths written/modified by this session, accumulated by the kernel */
  sessionWrittenFiles?: string[];
}

/** Patterns matched as substrings (case-insensitive) against file paths. */
export const SENSITIVE_FILE_PATTERNS: string[] = INVARIANT_SENSITIVE_FILE_PATTERNS;

/** Well-known credential file paths and directory prefixes.
 * Checked as case-insensitive substring matches against currentTarget. */
export const CREDENTIAL_PATH_PATTERNS: string[] = INVARIANT_CREDENTIAL_PATH_PATTERNS;

/** Exact basenames (case-insensitive) that are credential files at any depth. */
export const CREDENTIAL_BASENAME_PATTERNS: string[] = INVARIANT_CREDENTIAL_BASENAME_PATTERNS;

// ─── Precompiled PathMatcher instances ────────────────────────────────────────
// These replace ad-hoc `.includes()`/`.endsWith()` chains with compiled
// picomatch globs that are both faster and more expressive.

/** Matches .env files at any depth: .env, .env.local, .env.production, etc. */
const envFileMatcher = PathMatcher.create([
  { glob: '**/.env', id: 'env-file', description: '.env file', severity: 5 },
  { glob: '.env', id: 'env-root', description: '.env at root', severity: 5 },
  { glob: '**/.env.*', id: 'env-variant', description: '.env variant', severity: 5 },
  { glob: '.env.*', id: 'env-variant-root', description: '.env variant at root', severity: 5 },
]);

/** Matches well-known credential directory structures and specific files.
 * All globs are lowercase — callers must lowercase the input path first. */
const credentialPathMatcher = PathMatcher.create([
  // SSH directory patterns
  { glob: '**/.ssh/**', id: 'ssh-dir', description: 'SSH config directory', severity: 5 },
  // AWS credential files
  {
    glob: '**/.aws/credentials',
    id: 'aws-creds',
    description: 'AWS credentials file',
    severity: 5,
  },
  { glob: '**/.aws/config', id: 'aws-config', description: 'AWS config file', severity: 5 },
  // Google Cloud
  {
    glob: '**/.config/gcloud/**',
    id: 'gcloud-dir',
    description: 'Google Cloud config directory',
    severity: 5,
  },
  // Azure
  { glob: '**/.azure/**', id: 'azure-dir', description: 'Azure config directory', severity: 5 },
  // Docker auth
  {
    glob: '**/.docker/config.json',
    id: 'docker-auth',
    description: 'Docker auth config',
    severity: 5,
  },
]);

/** Matches credential file basenames at any depth (case-insensitive via caller lowercasing). */
const credentialBasenameMatcher = PathMatcher.create([
  { glob: '**/.npmrc', id: 'npmrc', description: 'npm credentials file', severity: 5 },
  { glob: '.npmrc', id: 'npmrc-root', description: 'npm credentials file at root', severity: 5 },
  { glob: '**/.pypirc', id: 'pypirc', description: 'PyPI credentials file', severity: 5 },
  { glob: '.pypirc', id: 'pypirc-root', description: 'PyPI credentials file at root', severity: 5 },
  { glob: '**/.netrc', id: 'netrc', description: 'netrc credentials file', severity: 5 },
  { glob: '.netrc', id: 'netrc-root', description: 'netrc credentials file at root', severity: 5 },
  { glob: '**/.curlrc', id: 'curlrc', description: 'curlrc credentials file', severity: 5 },
  {
    glob: '.curlrc',
    id: 'curlrc-root',
    description: 'curlrc credentials file at root',
    severity: 5,
  },
]);

/** Matches container configuration file basenames at any depth.
 * All globs are lowercase — callers must lowercase the input path first. */
const containerConfigMatcher = PathMatcher.create([
  { glob: '**/dockerfile', id: 'dockerfile', description: 'Dockerfile', severity: 3 },
  { glob: 'dockerfile', id: 'dockerfile-root', description: 'Dockerfile at root', severity: 3 },
  {
    glob: '**/docker-compose.yml',
    id: 'compose-yml',
    description: 'docker-compose.yml',
    severity: 3,
  },
  {
    glob: 'docker-compose.yml',
    id: 'compose-yml-root',
    description: 'docker-compose.yml at root',
    severity: 3,
  },
  {
    glob: '**/docker-compose.yaml',
    id: 'compose-yaml',
    description: 'docker-compose.yaml',
    severity: 3,
  },
  {
    glob: 'docker-compose.yaml',
    id: 'compose-yaml-root',
    description: 'docker-compose.yaml at root',
    severity: 3,
  },
  { glob: '**/compose.yml', id: 'compose-short-yml', description: 'compose.yml', severity: 3 },
  {
    glob: 'compose.yml',
    id: 'compose-short-yml-root',
    description: 'compose.yml at root',
    severity: 3,
  },
  { glob: '**/compose.yaml', id: 'compose-short-yaml', description: 'compose.yaml', severity: 3 },
  {
    glob: 'compose.yaml',
    id: 'compose-short-yaml-root',
    description: 'compose.yaml at root',
    severity: 3,
  },
  { glob: '**/.dockerignore', id: 'dockerignore', description: '.dockerignore', severity: 3 },
  {
    glob: '.dockerignore',
    id: 'dockerignore-root',
    description: '.dockerignore at root',
    severity: 3,
  },
  {
    glob: '**/containerfile',
    id: 'containerfile',
    description: 'Containerfile (Podman)',
    severity: 3,
  },
  {
    glob: 'containerfile',
    id: 'containerfile-root',
    description: 'Containerfile at root',
    severity: 3,
  },
  // *.dockerfile suffix pattern (e.g. app.dockerfile, prod.dockerfile)
  {
    glob: '**/*.dockerfile',
    id: 'dockerfile-suffix',
    description: '*.dockerfile variant',
    severity: 3,
  },
  {
    glob: '*.dockerfile',
    id: 'dockerfile-suffix-root',
    description: '*.dockerfile variant at root',
    severity: 3,
  },
]);

/** IDE socket path patterns (lowercased for case-insensitive matching).
 * Sourced from @red-codes/core governance data. */
const IDE_SOCKET_PATH_PATTERNS: string[] = INVARIANT_IDE_SOCKET_PATH_PATTERNS.map((p) =>
  p.toLowerCase()
);

/** Identify the IDE from a matched socket pattern. */
function identifyIde(pattern: string): string {
  if (pattern.includes('vscode') || pattern.includes('.vscode-server')) return 'VS Code';
  if (pattern.includes('cursor')) return 'Cursor';
  if (pattern.includes('jetbrains') || pattern.includes('intellij') || pattern.includes('idea'))
    return 'JetBrains';
  if (pattern.includes('clion')) return 'CLion';
  if (pattern.includes('pycharm')) return 'PyCharm';
  if (pattern.includes('webstorm')) return 'WebStorm';
  if (pattern.includes('goland')) return 'GoLand';
  if (pattern.includes('rider')) return 'Rider';
  return 'Unknown';
}

/** Returns true if the shell command contains a stdout file redirect (>, >>).
 * Ignores safe patterns: stderr redirects (2>/dev/null, 2>&1) and pipes.
 *
 * Known edge case: quoted strings containing `>` may produce false positives
 * (e.g., `echo "hello > world"` is flagged as a redirect). This is intentional —
 * for a security check, false positives are safer than false negatives. */
export function hasFileRedirect(command: string): boolean {
  // Strip safe stderr patterns before checking for output redirects
  // Shell FDs are single digits (0=stdin, 1=stdout, 2=stderr).
  // Using [0-9] instead of \d+ avoids ReDoS on long digit strings (CodeQL CWE-1333).
  const stripped = command
    .replace(/[0-9]>\/dev\/null/g, '')
    .replace(/[0-9]>&[0-9]/g, '')
    .replace(/&>\/dev\/null/g, '');
  // Check for remaining > or >> (stdout file redirect)
  return /(?:^|[^&\d])>/.test(stripped);
}

/** Action types that are always read-only — exempt from write-guard invariants.
 * Read, Glob, and Grep tools all map to file.read; git.diff is structural comparison only. */
const READ_ONLY_ACTIONS: string[] = ['file.read', 'git.diff'];

/** Shell command basenames that perform read-only operations.
 * Used by write-guard invariants to skip commands that cannot modify protected paths. */
const READ_ONLY_CMDS: string[] = [
  'ls',
  'cat',
  'head',
  'tail',
  'find',
  'grep',
  'rg',
  'tree',
  'stat',
  'file',
  'wc',
  'diff',
];

/** Strip known command wrappers (rtk, npx, env, sudo) to find the actual base command. */
export function extractBaseCommand(command: string): string {
  const tokens = command.split(/\s+/);
  const WRAPPER_CMDS = ['rtk', 'npx', 'env', 'sudo', 'time', 'nice'];
  let idx = 0;
  while (idx < tokens.length && WRAPPER_CMDS.includes(tokens[idx]?.replace(/^.*\//, '') || '')) {
    idx++;
  }
  return tokens[idx]?.replace(/^.*\//, '') || '';
}

/** Shell profile file basenames (case-insensitive) that establish persistent environment changes. */
const SHELL_PROFILE_BASENAMES = [
  '.bashrc',
  '.bash_profile',
  '.bash_login',
  '.profile',
  '.zshrc',
  '.zshenv',
  '.zprofile',
  '.zlogin',
  '.cshrc',
  '.tcshrc',
  '.login',
];

/** System-wide profile paths (substring match, case-insensitive). */
const SYSTEM_PROFILE_PATTERNS = [
  '/etc/profile',
  '/etc/environment',
  '/etc/profile.d/',
  '\\etc\\profile',
  '\\etc\\environment',
  '\\etc\\profile.d\\',
];

/** Returns true if the given path targets a shell profile file. */
export function isShellProfilePath(filePath: string): boolean {
  const lower = filePath.toLowerCase();

  // Check system-wide profile paths (substring)
  if (SYSTEM_PROFILE_PATTERNS.some((p) => lower.includes(p.toLowerCase()))) {
    return true;
  }

  // Check user-level shell profile basenames
  const basename = filePath.split(/[\\/]/).pop() || '';
  const lowerBase = basename.toLowerCase();
  if (SHELL_PROFILE_BASENAMES.some((p) => lowerBase === p)) {
    return true;
  }

  return false;
}

/** Sensitive environment variable name patterns (case-insensitive substrings).
 * Variables whose names contain these patterns are flagged when exported. */
const SENSITIVE_ENV_VAR_PATTERNS = [
  'secret',
  'password',
  'passwd',
  'token',
  'api_key',
  'apikey',
  'private_key',
  'access_key',
  'auth',
  'credential',
  'connection_string',
  'database_url',
  'db_pass',
];

/** Returns true if the given path targets a container configuration file. */
export function isContainerConfigPath(filePath: string): boolean {
  // Lowercase the path for case-insensitive matching (PathMatcher globs are lowercase).
  return containerConfigMatcher.matchAny(filePath.toLowerCase());
}

/** npm lifecycle scripts that auto-execute during install/publish/pack operations. */
const LIFECYCLE_SCRIPTS: string[] = INVARIANT_LIFECYCLE_SCRIPTS;

/** Returns true if the given path targets a well-known credential file location. */
/** File extensions commonly used for executable scripts. */
const SCRIPT_EXTENSIONS = [
  '.sh',
  '.bash',
  '.zsh',
  '.fish',
  '.py',
  '.rb',
  '.pl',
  '.pm',
  '.js',
  '.mjs',
  '.ts',
  '.ps1',
  '.bat',
  '.cmd',
];

/** Returns true if the file path has a known script extension. */
export function isScriptFilePath(filePath: string): boolean {
  if (filePath === '') return false;
  const lower = filePath.toLowerCase();
  return SCRIPT_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** Returns true if the content starts with a shebang line. */
export function hasShebang(content: string): boolean {
  return content.startsWith('#!');
}

/** Config file basenames that can define lifecycle hooks with auto-execution. */
const LIFECYCLE_CONFIG_BASENAMES = ['package.json', 'makefile'];

/** Config file extensions that can define lifecycle hooks. */
const LIFECYCLE_CONFIG_EXTENSIONS = ['.mk'];

/** Returns true if the file path targets a config file that can define lifecycle hooks. */
export function isLifecycleConfigPath(filePath: string): boolean {
  if (filePath === '') return false;
  const basename = filePath.split(/[\\/]/).pop() || '';
  const lowerBase = basename.toLowerCase();
  if (LIFECYCLE_CONFIG_BASENAMES.includes(lowerBase)) return true;
  const lower = filePath.toLowerCase();
  return LIFECYCLE_CONFIG_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Patterns that detect transitive policy violations in written file content.
 * Each entry has a regex pattern and a label for the violation message.
 */
const TRANSITIVE_SCRIPT_PATTERNS: { pattern: RegExp; label: string }[] = [
  {
    pattern: /\brm\s+(-[a-zA-Z]*[rf][a-zA-Z]*\s+|.*--recursive|.*--force)/,
    label: 'destructive deletion (rm -rf/rm -r)',
  },
  { pattern: /\bcurl\b/, label: 'network access (curl)' },
  { pattern: /\bwget\b/, label: 'network access (wget)' },
  { pattern: /\b(?:nc|netcat|ncat)\b/, label: 'raw network socket (netcat)' },
  { pattern: /\/dev\/tcp\//, label: 'network exfiltration (/dev/tcp)' },
  { pattern: /(?:cat|source|\.)\s+[^\n]*\.env\b/, label: 'secret file read (.env)' },
  {
    pattern: /open\s*\(\s*['"][^'"]*(?:\.env|credentials|secret|\.key|\.pem|id_rsa)[^'"]*['"]\s*\)/,
    label: 'secret file read via open()',
  },
  {
    pattern: /\bsubprocess\s*\.(?:call|run|Popen|check_output|check_call)\b/,
    label: 'subprocess execution (Python)',
  },
  {
    pattern: /\bos\s*\.(?:system|popen)\b/,
    label: 'os command execution (Python)',
  },
  { pattern: /\bshutil\s*\.rmtree\b/, label: 'recursive deletion (shutil.rmtree)' },
  { pattern: /\bchild_process\b/, label: 'child process spawning (Node.js)' },
  { pattern: /\bexecSync\s*\(/, label: 'synchronous command execution (execSync)' },
  { pattern: /\beval\s*\(/, label: 'dynamic code execution (eval)' },
  // --- Node.js fs module — file system write bypass vectors (closes #862) ---
  {
    pattern: /\bfs\s*\.(?:writeFileSync|writeFile)\s*\(/,
    label: 'file system write (Node.js fs.writeFile)',
  },
  {
    pattern: /\bfs\s*\.(?:copyFileSync|copyFile)\s*\(/,
    label: 'file system copy (Node.js fs.copyFile)',
  },
  {
    pattern: /\bfs\s*\.(?:renameSync|rename)\s*\(/,
    label: 'file system rename (Node.js fs.rename)',
  },
  {
    pattern: /\bfs\s*\.(?:unlinkSync|unlink)\s*\(/,
    label: 'file system delete (Node.js fs.unlink)',
  },
  {
    pattern: /\bfs\s*\.(?:appendFileSync|appendFile)\s*\(/,
    label: 'file system append (Node.js fs.appendFile)',
  },
  {
    pattern: /\bfs\s*\.(?:chmodSync|chmod|chownSync|chown)\s*\(/,
    label: 'file permission change (Node.js fs.chmod/chown)',
  },
  // --- Node.js fs/promises — async write operations ---
  {
    pattern: /\bfsPromises\s*\.(?:writeFile|copyFile|rename|unlink|appendFile|chmod|chown)\s*\(/,
    label: 'async file system write (Node.js fs/promises)',
  },
  // --- Python pathlib — file write bypass vectors ---
  {
    pattern: /\.write_text\s*\(|\.write_bytes\s*\(/,
    label: 'file system write (Python pathlib)',
  },
  {
    pattern: /\bos\s*\.(?:remove|unlink|rename|chmod)\s*\(/,
    label: 'file system modification (Python os)',
  },
  {
    pattern: /\bshutil\s*\.(?:copy2?|move|copytree)\s*\(/,
    label: 'file system copy/move (Python shutil)',
  },
];

export function isCredentialPath(filePath: string): boolean {
  // Lowercase the path for case-insensitive matching (all matchers use lowercase globs).
  const lower = filePath.toLowerCase();

  // Check directory-based credential patterns via PathMatcher
  if (credentialPathMatcher.matchAny(lower)) {
    return true;
  }

  // Check exact credential basenames via PathMatcher
  if (credentialBasenameMatcher.matchAny(lower)) {
    return true;
  }

  // Check .env file pattern via PathMatcher
  if (envFileMatcher.matchAny(lower)) {
    return true;
  }

  return false;
}

/** Checks whether a shell command references a well-known credential file path.
 * Splits the command into tokens and checks each against `isCredentialPath`. */
export function shellCommandReferencesCredentialFile(command: string): boolean {
  if (!command) return false;
  // Split on whitespace, then strip surrounding quotes from each token
  const tokens = command.split(/\s+/).map((t) => t.replace(/^['"]|['"]$/g, ''));
  return tokens.some((token) => token !== '' && isCredentialPath(token));
}

/** Shell command patterns that indicate network egress (case-insensitive). */
const NETWORK_COMMAND_PATTERNS: RegExp[] = [
  /\bcurl\b/,
  /\bwget\b/,
  /\b(?:nc|netcat|ncat)\b/,
  /\bfetch\b/,
  /\bhttpie\b/,
  /\bhttp\s/,
];

/** Extracts a domain from a URL string. Returns null if parsing fails. */
export function extractDomainFromUrl(url: string): string | null {
  if (!url || typeof url !== 'string') return null;

  const trimmed = url.trim();

  // Try URL constructor for well-formed URLs
  try {
    const parsed = new URL(trimmed);
    return parsed.hostname || null;
  } catch {
    // Fall through to regex extraction
  }

  // Regex fallback: match protocol://hostname or bare hostname:port patterns
  const match = trimmed.match(/^(?:https?:\/\/)?([^/:?\s#]+)/i);
  return match ? match[1].toLowerCase() : null;
}

/** Extracts a URL from a shell command containing curl/wget/etc. */
export function extractUrlFromCommand(command: string): string | null {
  if (!command) return null;

  // Match URLs in the command (http:// or https://)
  const urlMatch = command.match(/\bhttps?:\/\/[^\s"'<>|;)]+/i);
  return urlMatch ? urlMatch[0] : null;
}

/** Returns true if the command contains a network tool (curl, wget, nc, etc.) */
export function isNetworkCommand(command: string): boolean {
  if (!command || typeof command !== 'string') return false;
  const lower = command.toLowerCase();
  return NETWORK_COMMAND_PATTERNS.some((p) => p.test(lower));
}

export const DEFAULT_INVARIANTS: AgentGuardInvariant[] = [
  {
    id: 'no-secret-exposure',
    name: 'No Secret Exposure',
    description: 'Sensitive files (.env, credentials, keys) must not be committed or exposed',
    severity: 5,
    check(state) {
      const sensitivePatterns = SENSITIVE_FILE_PATTERNS;
      const exposedFiles = (state.modifiedFiles || []).filter((f) => {
        const lower = f.toLowerCase();
        return sensitivePatterns.some((p) => lower.includes(p));
      });
      return {
        holds: exposedFiles.length === 0,
        expected: 'No sensitive files modified',
        actual:
          exposedFiles.length > 0
            ? `Sensitive files detected: ${exposedFiles.join(', ')}`
            : 'No sensitive files modified',
      };
    },
  },

  {
    id: 'protected-branch',
    name: 'Protected Branch Safety',
    description: 'Direct pushes to main/master are forbidden',
    severity: 4,
    check(state) {
      const protectedBranches = state.protectedBranches || ['main', 'master'];
      const targetBranch = state.targetBranch || '';
      const isProtected = protectedBranches.includes(targetBranch);
      return {
        holds: !isProtected || !state.directPush,
        expected: 'No direct push to protected branch',
        actual: isProtected && state.directPush ? `Direct push to ${targetBranch}` : 'Safe',
      };
    },
  },

  {
    id: 'blast-radius-limit',
    name: 'Blast Radius Limit',
    description: 'A single operation must not modify too many files at once',
    severity: 3,
    check(state) {
      const limit = state.blastRadiusLimit || 20;
      // Prefer simulated blast radius over static file count when available
      const count = state.simulatedBlastRadius ?? state.filesAffected ?? 0;
      const source = state.simulatedBlastRadius !== undefined ? 'simulated' : 'static';
      return {
        holds: count <= limit,
        expected: `At most ${limit} files modified`,
        actual: `${count} files modified (${source})`,
      };
    },
  },

  {
    id: 'test-before-push',
    name: 'Tests Before Push',
    description: 'Tests must pass before pushing to protected branches',
    severity: 3,
    check(state) {
      if (!state.isPush) {
        return { holds: true, expected: 'N/A', actual: 'Not a push operation' };
      }

      // Only enforce on protected branches — feature branch pushes don't need test gating
      const protectedBranches = (state.protectedBranches as string[] | undefined) || [
        'main',
        'master',
      ];
      const targetBranch = (state.targetBranch as string) || '';
      if (targetBranch && !protectedBranches.includes(targetBranch)) {
        return { holds: true, expected: 'N/A', actual: `Feature branch: ${targetBranch}` };
      }

      return {
        holds: state.testsPass === true,
        expected: 'Tests passing',
        actual: state.testsPass === true ? 'Tests passing' : 'Tests not verified',
      };
    },
  },

  {
    id: 'no-force-push',
    name: 'No Force Push',
    description: 'Force pushes are forbidden unless explicitly authorized',
    severity: 4,
    check(state) {
      return {
        holds: !state.forcePush,
        expected: 'No force push',
        actual: state.forcePush ? 'Force push detected' : 'Normal push',
      };
    },
  },

  {
    id: 'no-skill-modification',
    name: 'No Skill Modification',
    description: 'Agent skill files (.claude/skills/) must not be modified by governed actions',
    severity: 4,
    check(state) {
      const actionType = state.currentActionType || '';

      // Skip read-only action types (Read, Glob, Grep tools all map to file.read)
      if (READ_ONLY_ACTIONS.includes(actionType)) {
        return { holds: true, expected: 'N/A', actual: `Action type ${actionType} is read-only` };
      }

      // For shell.exec, skip read-only commands (ls, cat, find, etc.)
      if (actionType === 'shell.exec') {
        const command = (state.currentCommand || '').trim();
        const baseCmd = extractBaseCommand(command);
        if (READ_ONLY_CMDS.includes(baseCmd) && !hasFileRedirect(command)) {
          return { holds: true, expected: 'N/A', actual: 'Read-only shell command' };
        }
      }

      const SKILL_PATTERNS = ['.claude/skills/', '.claude\\skills\\'];
      const matchesSkillPath = (path: string) => SKILL_PATTERNS.some((p) => path.includes(p));

      const target = state.currentTarget || '';
      const targetViolation = target !== '' && matchesSkillPath(target);

      const command = state.currentCommand || '';
      const commandViolation = command !== '' && matchesSkillPath(command);

      const skillFiles = (state.modifiedFiles || []).filter((f) => matchesSkillPath(f));

      const holds = !targetViolation && !commandViolation && skillFiles.length === 0;

      const violations: string[] = [];
      if (targetViolation) violations.push(`target: ${target}`);
      if (commandViolation) violations.push(`command references skills`);
      if (skillFiles.length > 0) violations.push(`modified: ${skillFiles.join(', ')}`);

      return {
        holds,
        expected: 'No modifications to .claude/skills/',
        actual: holds
          ? 'No skill files affected'
          : `Skill modification detected (${violations.join('; ')})`,
      };
    },
  },

  {
    id: 'no-scheduled-task-modification',
    name: 'No Scheduled Task Modification',
    description:
      'Agents must not modify scheduled task definitions (.claude/scheduled-tasks/) directly',
    severity: 5,
    check(state) {
      const actionType = state.currentActionType || '';

      // Skip read-only action types (Read, Glob, Grep tools all map to file.read)
      if (READ_ONLY_ACTIONS.includes(actionType)) {
        return { holds: true, expected: 'N/A', actual: `Action type ${actionType} is read-only` };
      }

      // For shell.exec, skip read-only commands (ls, cat, find, etc.)
      if (actionType === 'shell.exec') {
        const command = (state.currentCommand || '').trim();
        const baseCmd = extractBaseCommand(command);
        if (READ_ONLY_CMDS.includes(baseCmd) && !hasFileRedirect(command)) {
          return { holds: true, expected: 'N/A', actual: 'Read-only shell command' };
        }
      }

      const SCHEDULED_TASK_PATTERNS = ['.claude/scheduled-tasks/', '.claude\\scheduled-tasks\\'];
      const matchesScheduledPath = (path: string) =>
        SCHEDULED_TASK_PATTERNS.some((p) => path.includes(p));

      const target = state.currentTarget || '';
      const targetViolation = target !== '' && matchesScheduledPath(target);

      const command = state.currentCommand || '';
      const commandViolation = command !== '' && matchesScheduledPath(command);

      const scheduledFiles = (state.modifiedFiles || []).filter((f) => matchesScheduledPath(f));

      const holds = !targetViolation && !commandViolation && scheduledFiles.length === 0;

      const violations: string[] = [];
      if (targetViolation) violations.push(`target: ${target}`);
      if (commandViolation) violations.push(`command references scheduled tasks`);
      if (scheduledFiles.length > 0) violations.push(`modified: ${scheduledFiles.join(', ')}`);

      return {
        holds,
        expected: 'No modifications to .claude/scheduled-tasks/',
        actual: holds
          ? 'No scheduled task files affected'
          : `Scheduled task modification detected (${violations.join('; ')})`,
      };
    },
  },

  {
    id: 'no-credential-file-creation',
    name: 'No Credential File Creation',
    description:
      'Agents must not create or overwrite well-known credential files (SSH keys, cloud configs, auth tokens)',
    severity: 5,
    check(state) {
      const actionType = state.currentActionType || '';

      // Read-only action types are always allowed
      if (READ_ONLY_ACTIONS.includes(actionType)) {
        return { holds: true, expected: 'N/A', actual: `Action type ${actionType} is read-only` };
      }

      // For shell.exec, skip read-only commands (cat, grep, ls, etc.)
      if (actionType === 'shell.exec') {
        const command = (state.currentCommand || '').trim();
        const baseCmd = extractBaseCommand(command);
        if (READ_ONLY_CMDS.includes(baseCmd) && !hasFileRedirect(command)) {
          return { holds: true, expected: 'N/A', actual: 'Read-only shell command' };
        }
      }

      // Actions that can modify credential files
      const writingActions = ['file.write', 'file.move', 'shell.exec'];

      // Non-writing actions are allowed (e.g. file.read, file.delete)
      if (actionType !== '' && !writingActions.includes(actionType)) {
        return {
          holds: true,
          expected: 'N/A',
          actual: `Action type ${actionType} is not a write operation`,
        };
      }

      const target = state.currentTarget || '';
      const command = state.currentCommand || '';

      // Check target path against credential patterns
      const targetViolation = target !== '' && isCredentialPath(target);

      // For shell.exec, also check if command arguments reference credential files
      const commandViolation =
        actionType === 'shell.exec' &&
        command !== '' &&
        shellCommandReferencesCredentialFile(command);

      const holds = !targetViolation && !commandViolation;

      if (holds) {
        return {
          holds: true,
          expected: 'No creation or modification of credential files',
          actual: 'No credential files affected',
        };
      }

      const violations: string[] = [];
      if (targetViolation) violations.push(`target: ${target}`);
      if (commandViolation) violations.push('command references credential files');

      return {
        holds: false,
        expected: 'No creation or modification of credential files',
        actual: `Credential file targeted (${violations.join('; ')})`,
      };
    },
  },

  {
    id: 'no-package-script-injection',
    name: 'No Package Script Injection',
    description:
      'Modifications to package.json scripts are flagged as potential supply chain attack vectors',
    severity: 4,
    check(state) {
      const target = state.currentTarget || '';
      const actionType = state.currentActionType || '';
      const writingActions = ['file.write', 'file.move'];

      // Only applies to write/move actions targeting package.json
      if (actionType !== '' && !writingActions.includes(actionType)) {
        return { holds: true, expected: 'N/A', actual: `Action type ${actionType} is not a write` };
      }

      const isPackageJson =
        target === 'package.json' ||
        target.endsWith('/package.json') ||
        target.endsWith('\\package.json');

      if (!isPackageJson) {
        return { holds: true, expected: 'N/A', actual: 'Target is not package.json' };
      }

      const diff = state.fileContentDiff || '';

      // If no diff provided, we can't determine if scripts changed — allow conservatively
      // (the lockfile-integrity invariant covers manifest-without-lockfile cases)
      if (diff === '') {
        return {
          holds: true,
          expected: 'N/A',
          actual: 'No content diff available for package.json write',
        };
      }

      // Check if the diff touches the "scripts" section
      const scriptsPattern = /["']scripts["']\s*:/;
      if (!scriptsPattern.test(diff)) {
        return {
          holds: true,
          expected: 'No script modifications in package.json',
          actual: 'package.json modified without script changes',
        };
      }

      // Lifecycle scripts are especially dangerous — they auto-execute
      const detectedLifecycle = LIFECYCLE_SCRIPTS.filter((script) => {
        const keyPattern = new RegExp(`["']${script}["']\\s*:`);
        return keyPattern.test(diff);
      });

      if (detectedLifecycle.length > 0) {
        return {
          holds: false,
          expected: 'No lifecycle script injection in package.json',
          actual: `Lifecycle script modification detected: ${detectedLifecycle.join(', ')}`,
        };
      }

      // Non-lifecycle script changes are still flagged
      return {
        holds: false,
        expected: 'No script modifications in package.json',
        actual: 'package.json scripts section modified',
      };
    },
  },

  {
    id: 'recursive-operation-guard',
    name: 'Recursive Operation Guard',
    description:
      'Flags recursive operations (find -exec, xargs) combined with write/delete operations that could cause widespread damage',
    severity: 2,
    check(state) {
      const command = state.currentCommand || '';
      if (command === '') {
        return { holds: true, expected: 'N/A', actual: 'No command specified' };
      }

      const actionType = state.currentActionType || '';
      if (actionType !== '' && actionType !== 'shell.exec') {
        return {
          holds: true,
          expected: 'N/A',
          actual: `Action type ${actionType} is not a shell command`,
        };
      }

      const lower = command.toLowerCase();
      const violations: string[] = [];

      // find with -delete flag
      if (/\bfind\b/.test(lower) && /\s-delete\b/.test(lower)) {
        violations.push('find with -delete');
      }

      // find with -exec/-execdir combined with destructive commands
      if (/\bfind\b/.test(lower) && /\s-exec(?:dir)?\s/.test(lower)) {
        const destructiveExecCmds = ['rm', 'mv', 'cp', 'chmod', 'chown', 'shred'];
        for (const cmd of destructiveExecCmds) {
          if (new RegExp(`-exec(?:dir)?\\s+(?:\\S+/)?${cmd}\\b`).test(lower)) {
            violations.push(`find -exec ${cmd}`);
          }
        }
      }

      // Shell wrapper bypass: find -exec sh/bash -c 'destructive ...'
      const shcMatch = lower.match(
        /-exec(?:dir)?\s+(?:\S+\/)?(?:sh|bash)\b(?:\s+\S+)*\s+-c\s+(.*)/
      );
      if (/\bfind\b/.test(lower) && shcMatch) {
        const innerCmd = shcMatch[1];
        const destructiveInShell = ['rm', 'mv', 'chmod', 'chown', 'shred'];
        for (const cmd of destructiveInShell) {
          if (new RegExp(`\\b${cmd}\\b`).test(innerCmd)) {
            violations.push(`find -exec sh -c (${cmd})`);
          }
        }
      }

      // xargs combined with destructive commands
      if (/\bxargs\b/.test(lower)) {
        const destructiveXargsCmds = ['rm', 'mv', 'cp', 'chmod', 'chown', 'shred'];
        for (const cmd of destructiveXargsCmds) {
          if (new RegExp(`xargs\\s+(?:\\S+\\s+)*(?:\\S+/)?${cmd}\\b`).test(lower)) {
            violations.push(`xargs ${cmd}`);
          }
        }
      }

      // Recursive chmod/chown
      if (/\b(?:chmod|chown)\b/.test(lower) && /\s(?:-R\b|-r\b|--recursive\b)/.test(lower)) {
        const match = lower.match(/\b(chmod|chown)\b/);
        if (match) {
          violations.push(`recursive ${match[1]}`);
        }
      }

      const holds = violations.length === 0;
      return {
        holds,
        expected: 'No recursive destructive operations',
        actual: holds
          ? 'No recursive destructive operations detected'
          : `Recursive destructive operation detected: ${violations.join(', ')}`,
      };
    },
  },

  {
    id: 'large-file-write',
    name: 'Large File Write Limit',
    description:
      'Single file writes must not exceed a size threshold to prevent data dumps or runaway generation',
    severity: 3,
    check(state) {
      const actionType = state.currentActionType || '';

      // Only applies to file.write actions � other action types are not constrained.
      // When actionType is unset (''), apply the check conservatively rather than skipping.
      // This ensures writes from unknown action sources are still size-constrained.
      if (actionType !== '' && actionType !== 'file.write') {
        return {
          holds: true,
          expected: 'N/A',
          actual: `Action type ${actionType} is not file.write`,
        };
      }

      const sizeBytes = state.writeSizeBytes;
      if (sizeBytes === undefined || sizeBytes === null) {
        return { holds: true, expected: 'N/A', actual: 'No write size specified' };
      }

      const limit = state.writeSizeBytesLimit || 102400; // 100KB default

      return {
        holds: sizeBytes <= limit,
        expected: `Write size at most ${limit} bytes`,
        actual: `Write size: ${sizeBytes} bytes`,
      };
    },
  },

  {
    id: 'no-cicd-config-modification',
    name: 'No CI/CD Config Modification',
    description:
      'CI/CD pipeline configurations must not be modified by governed actions — prevents supply chain attacks via malicious build steps',
    severity: 5,
    check(state) {
      const actionType = state.currentActionType || '';

      // Skip read-only action types (Read, Glob, Grep tools all map to file.read)
      if (READ_ONLY_ACTIONS.includes(actionType)) {
        return { holds: true, expected: 'N/A', actual: `Action type ${actionType} is read-only` };
      }

      // For shell.exec, skip read-only commands (ls, cat, find, etc.)
      if (actionType === 'shell.exec') {
        const command = (state.currentCommand || '').trim();
        const baseCmd = extractBaseCommand(command);
        if (READ_ONLY_CMDS.includes(baseCmd) && !hasFileRedirect(command)) {
          return { holds: true, expected: 'N/A', actual: 'Read-only shell command' };
        }
      }

      const CICD_DIR_PATTERNS = [
        '.github/workflows/',
        '.github\\workflows\\',
        '.circleci/',
        '.circleci\\',
        '.buildkite/',
        '.buildkite\\',
      ];
      const CICD_FILE_PATTERNS = [
        '.gitlab-ci.yml',
        'Jenkinsfile',
        '.travis.yml',
        'azure-pipelines.yml',
      ];

      const matchesCicdPath = (str: string) => {
        const normalized = str.replace(/\\/g, '/');
        return (
          CICD_DIR_PATTERNS.some((p) => str.includes(p)) ||
          CICD_FILE_PATTERNS.some((p) => normalized.includes(p))
        );
      };

      const target = state.currentTarget || '';
      const targetViolation = target !== '' && matchesCicdPath(target);

      const command = state.currentCommand || '';
      const commandViolation = command !== '' && matchesCicdPath(command);

      const cicdFiles = (state.modifiedFiles || []).filter((f) => matchesCicdPath(f));

      const holds = !targetViolation && !commandViolation && cicdFiles.length === 0;

      const violations: string[] = [];
      if (targetViolation) violations.push(`target: ${target}`);
      if (commandViolation) violations.push(`command references CI/CD config`);
      if (cicdFiles.length > 0) violations.push(`modified: ${cicdFiles.join(', ')}`);

      return {
        holds,
        expected: 'No modifications to CI/CD configuration files',
        actual: holds
          ? 'No CI/CD config files affected'
          : `CI/CD config modification detected (${violations.join('; ')})`,
      };
    },
  },

  {
    id: 'no-permission-escalation',
    name: 'No Permission Escalation',
    description:
      'Agents must not escalate filesystem permissions (world-writable, setuid/setgid, ownership changes, sudoers)',
    severity: 4,
    check(state) {
      const command = state.currentCommand || '';
      const target = state.currentTarget || '';
      const violations: string[] = [];

      if (command !== '') {
        const lowerCmd = command.toLowerCase();

        // Detect chmod to world-writable or broad permissions
        if (/\bchmod\b/.test(lowerCmd)) {
          // Octal modes: any mode where the "others" digit has write bit set (bit 2)
          const octalMatch = command.match(/\bchmod\s+(?:-[a-zA-Z]+\s+)*([0-7]{3,4})\b/);
          if (octalMatch) {
            const mode = octalMatch[1];
            const othersDigit = parseInt(mode[mode.length - 1], 10);
            if ((othersDigit & 2) !== 0) {
              violations.push(`world-writable chmod: ${mode}`);
            }
          }

          // Symbolic modes: o+w, a+w, +w (implicit all), o=rwx, a=rwx
          if (
            /\bchmod\s+(?:-[a-zA-Z]+\s+)*(?:o\+[rwxXst]*w|a\+[rwxXst]*w|\+[rwxXst]*w|o=[rwxXst]*w[rwxXst]*|a=[rwxXst]*w[rwxXst]*)\b/.test(
              command
            )
          ) {
            violations.push('world-writable symbolic chmod');
          }

          // Setuid/setgid: u+s, g+s, +s, or octal modes with special bits 4/2/6
          if (
            /\bchmod\s+(?:-[a-zA-Z]+\s+)*(?:[ug]\+[rwxXt]*s|[ug]=[rwxXst]*s[rwxXst]*|\+[rwxXt]*s)\b/.test(
              command
            )
          ) {
            violations.push('setuid/setgid chmod');
          }
          if (octalMatch) {
            const mode = octalMatch[1];
            if (mode.length === 4) {
              const specialBits = parseInt(mode[0], 10);
              if ((specialBits & 6) !== 0) {
                violations.push(`setuid/setgid octal chmod: ${mode}`);
              }
            }
          }
        }

        // Detect chown/chgrp commands (word boundary to avoid false positives)
        if (/\bchown\b/.test(lowerCmd)) {
          violations.push('ownership change via chown');
        }
        if (/\bchgrp\b/.test(lowerCmd)) {
          violations.push('group change via chgrp');
        }
      }

      // Detect writes to sudoers files
      if (target !== '') {
        const normalizedTarget = target.toLowerCase().replace(/\\/g, '/');
        if (
          normalizedTarget.endsWith('/sudoers') ||
          normalizedTarget.includes('/sudoers.d/') ||
          normalizedTarget.includes('/etc/sudoers')
        ) {
          violations.push(`sudoers file targeted: ${target}`);
        }
      }

      const holds = violations.length === 0;

      return {
        holds,
        expected: 'No permission escalation operations',
        actual: holds
          ? 'No permission escalation detected'
          : `Permission escalation detected (${violations.join('; ')})`,
      };
    },
  },

  {
    id: 'no-governance-self-modification',
    name: 'No Governance Self-Modification',
    description:
      'Agents must not modify governance configuration (policy files, governance data, policy packs)',
    severity: 5,
    check(state) {
      const actionType = state.currentActionType || '';

      // Skip read-only action types (Read, Glob, Grep tools all map to file.read)
      if (READ_ONLY_ACTIONS.includes(actionType)) {
        return { holds: true, expected: 'N/A', actual: `Action type ${actionType} is read-only` };
      }

      // For shell.exec, skip read-only commands (ls, cat, find, etc.)
      if (actionType === 'shell.exec') {
        const command = (state.currentCommand || '').trim();
        const baseCmd = extractBaseCommand(command);
        if (READ_ONLY_CMDS.includes(baseCmd) && !hasFileRedirect(command)) {
          return { holds: true, expected: 'N/A', actual: 'Read-only shell command' };
        }
      }

      const GOVERNANCE_DIR_PATTERNS = ['.agentguard/', '.agentguard\\', 'policies/', 'policies\\'];
      // Operational state files are NOT governance config — allow writes to squads, director brief, etc.
      const OPERATIONAL_STATE_PATTERNS = [
        '.agentguard/squads/',
        '.agentguard/director-brief',
        '.agentguard/persona.env',
        '.agentguard/agent-reliability',
        '.agentguard/swarm-state',
        '.agentguard/budget-config',
        'em-report.json',
      ];
      const GOVERNANCE_FILE_BASENAMES = ['agentguard.yaml', 'agentguard.yml', '.agentguard.yaml'];

      const matchesGovernancePath = (path: string) => {
        const lower = path.toLowerCase();
        // Operational state files are writable — only actual governance config is protected
        if (OPERATIONAL_STATE_PATTERNS.some((p) => lower.includes(p.toLowerCase()))) {
          return false;
        }
        if (GOVERNANCE_DIR_PATTERNS.some((p) => lower.includes(p.toLowerCase()))) {
          return true;
        }
        const basename = path.split(/[\\/]/).pop() || '';
        if (GOVERNANCE_FILE_BASENAMES.some((f) => basename.toLowerCase() === f)) {
          return true;
        }
        return false;
      };

      const target = state.currentTarget || '';
      const targetViolation = target !== '' && matchesGovernancePath(target);

      const command = state.currentCommand || '';
      const commandViolation =
        command !== '' &&
        (matchesGovernancePath(command) ||
          GOVERNANCE_FILE_BASENAMES.some((f) => command.toLowerCase().includes(f)));

      const governanceFiles = (state.modifiedFiles || []).filter((f) => matchesGovernancePath(f));

      const holds = !targetViolation && !commandViolation && governanceFiles.length === 0;

      const violations: string[] = [];
      if (targetViolation) violations.push(`target: ${target}`);
      if (commandViolation) violations.push(`command references governance paths`);
      if (governanceFiles.length > 0) violations.push(`modified: ${governanceFiles.join(', ')}`);

      return {
        holds,
        expected: 'No modifications to governance configuration',
        actual: holds
          ? 'No governance files affected'
          : `Governance self-modification detected (${violations.join('; ')})`,
      };
    },
  },

  {
    id: 'lockfile-integrity',
    name: 'Lockfile Integrity',
    description: 'Package lockfiles must stay in sync with manifests',
    severity: 2,
    check(state) {
      const manifestChanged = (state.modifiedFiles || []).some(
        (f) => f === 'package.json' || f.endsWith('/package.json')
      );
      const lockfileChanged = (state.modifiedFiles || []).some(
        (f) =>
          f === 'package-lock.json' ||
          f === 'yarn.lock' ||
          f === 'pnpm-lock.yaml' ||
          f.endsWith('/package-lock.json')
      );

      if (!manifestChanged) {
        return { holds: true, expected: 'N/A', actual: 'No manifest changes' };
      }

      return {
        holds: lockfileChanged,
        expected: 'Lockfile updated with manifest',
        actual: lockfileChanged ? 'Lockfile updated' : 'Manifest changed without lockfile',
      };
    },
  },

  {
    id: 'no-container-config-modification',
    name: 'No Container Config Modification',
    description:
      'Container configuration files (Dockerfile, docker-compose, .dockerignore, Containerfile) must not be modified without authorization',
    severity: 3,
    check(state) {
      const actionType = state.currentActionType || '';
      const writingActions = ['file.write', 'file.move'];

      // Only applies to write/move actions — reading container configs is allowed
      if (actionType !== '' && !writingActions.includes(actionType)) {
        return {
          holds: true,
          expected: 'N/A',
          actual: `Action type ${actionType} is not a write operation`,
        };
      }

      const target = state.currentTarget || '';
      if (target !== '' && isContainerConfigPath(target)) {
        return {
          holds: false,
          expected: 'No modifications to container configuration files',
          actual: `Container config file targeted: ${target}`,
        };
      }

      // Also check modifiedFiles for bulk operations
      const containerFiles = (state.modifiedFiles || []).filter((f) => isContainerConfigPath(f));
      if (containerFiles.length > 0) {
        return {
          holds: false,
          expected: 'No modifications to container configuration files',
          actual: `Container config files modified: ${containerFiles.join(', ')}`,
        };
      }

      return {
        holds: true,
        expected: 'No modifications to container configuration files',
        actual: 'No container config files affected',
      };
    },
  },

  {
    id: 'no-env-var-modification',
    name: 'No Environment Variable Modification',
    description:
      'Detects attempts to modify environment variables or shell profile files — environment variables often contain secrets and profile modifications can establish persistent backdoors',
    severity: 3,
    check(state) {
      const violations: string[] = [];
      const actionType = state.currentActionType || '';

      // --- Shell command detection ---
      const command = state.currentCommand || '';
      if (command !== '') {
        // Only inspect shell.exec commands (or unset actionType for conservative checking)
        if (actionType === '' || actionType === 'shell.exec') {
          // Detect export of sensitive env vars
          const exportMatches = command.matchAll(/\bexport\s+([A-Za-z_][A-Za-z0-9_]*)=/gi);
          for (const match of exportMatches) {
            const varName = match[1].toLowerCase();
            if (SENSITIVE_ENV_VAR_PATTERNS.some((p) => varName.includes(p))) {
              violations.push(`sensitive export: ${match[1]}`);
            }
          }

          // Detect setenv (csh/tcsh style)
          const setenvMatches = command.matchAll(/\bsetenv\s+([A-Za-z_][A-Za-z0-9_]*)\s/gi);
          for (const match of setenvMatches) {
            const varName = match[1].toLowerCase();
            if (SENSITIVE_ENV_VAR_PATTERNS.some((p) => varName.includes(p))) {
              violations.push(`sensitive setenv: ${match[1]}`);
            }
          }
        }
      }

      // --- File write detection (shell profile files) ---
      const target = state.currentTarget || '';
      const writingActions = ['file.write', 'file.move'];

      if (target !== '') {
        // Only flag writes — reading profiles is fine
        if (actionType === '' || writingActions.includes(actionType)) {
          if (isShellProfilePath(target)) {
            violations.push(`shell profile write: ${target}`);
          }
        }
      }

      // Check modifiedFiles for bulk operations
      const profileFiles = (state.modifiedFiles || []).filter((f) => isShellProfilePath(f));
      for (const f of profileFiles) {
        const msg = `shell profile modified: ${f}`;
        if (!violations.includes(msg)) {
          violations.push(msg);
        }
      }

      const holds = violations.length === 0;

      return {
        holds,
        expected: 'No environment variable modification or shell profile writes',
        actual: holds
          ? 'No environment variable modifications detected'
          : `Environment variable modification detected (${violations.join('; ')})`,
      };
    },
  },

  {
    id: 'no-destructive-migration',
    name: 'No Destructive Migration',
    description:
      'Detects potentially destructive database migration files — flags writes to migration directories containing DROP, TRUNCATE, or other destructive DDL',
    severity: 3,
    check(state) {
      const actionType = state.currentActionType || '';

      // Only applies to file.write actions
      if (actionType !== '' && actionType !== 'file.write') {
        return {
          holds: true,
          expected: 'N/A',
          actual: `Action type ${actionType} is not file.write`,
        };
      }

      const target = state.currentTarget || '';
      if (target === '') {
        return { holds: true, expected: 'N/A', actual: 'No target specified' };
      }

      // Check if target is in a migration directory
      const normalizedTarget = target.replace(/\\/g, '/').toLowerCase();
      const MIGRATION_DIR_PATTERNS = [
        'migrations/',
        'db/migrate/',
        'prisma/migrations/',
        'drizzle/',
        'knex/migrations/',
        'sequelize/migrations/',
      ];

      const isMigrationFile = MIGRATION_DIR_PATTERNS.some((p) => normalizedTarget.includes(p));

      if (!isMigrationFile) {
        return { holds: true, expected: 'N/A', actual: 'Target is not in a migration directory' };
      }

      const content = state.fileContentDiff || '';
      if (content === '') {
        return {
          holds: true,
          expected: 'N/A',
          actual: 'No file content available for migration file',
        };
      }

      // Destructive DDL patterns (case-insensitive)
      const DESTRUCTIVE_DDL_PATTERNS: { pattern: RegExp; label: string }[] = [
        { pattern: /\bDROP\s+TABLE\b/i, label: 'DROP TABLE' },
        { pattern: /\bDROP\s+COLUMN\b/i, label: 'DROP COLUMN' },
        { pattern: /\bDROP\s+INDEX\b/i, label: 'DROP INDEX' },
        { pattern: /\bDROP\s+DATABASE\b/i, label: 'DROP DATABASE' },
        { pattern: /\bTRUNCATE\b/i, label: 'TRUNCATE' },
        { pattern: /\bALTER\s+TABLE\s+\S+\s+DROP\b/i, label: 'ALTER TABLE ... DROP' },
        { pattern: /\bDELETE\s+FROM\s+\S+\s*(?:;|\s*$)/im, label: 'DELETE FROM (without WHERE)' },
      ];

      const violations: string[] = [];
      for (const entry of DESTRUCTIVE_DDL_PATTERNS) {
        if (entry.pattern.test(content)) {
          violations.push(entry.label);
        }
      }

      const holds = violations.length === 0;
      return {
        holds,
        expected: 'No destructive DDL in migration files',
        actual: holds
          ? 'Migration file contains no destructive DDL'
          : `Destructive DDL detected: ${violations.join(', ')}`,
      };
    },
  },

  {
    id: 'transitive-effect-analysis',
    name: 'Transitive Effect Analysis',
    description:
      'Detects when an agent writes a script or config file whose contents would produce effects that would be denied if executed directly — closes the creative circumvention gap',
    severity: 4,
    check(state) {
      const actionType = state.currentActionType || '';

      // Only applies to file.write actions
      if (actionType !== '' && actionType !== 'file.write') {
        return {
          holds: true,
          expected: 'N/A',
          actual: `Action type ${actionType} is not file.write`,
        };
      }

      const content = state.fileContentDiff || '';
      if (content === '') {
        return { holds: true, expected: 'N/A', actual: 'No file content available' };
      }

      const target = state.currentTarget || '';
      const violations: string[] = [];

      // Determine if the target is a script file (by extension or shebang)
      const scriptFile = isScriptFilePath(target) || hasShebang(content);

      // Determine if the target is a config file with lifecycle potential
      const configFile = isLifecycleConfigPath(target);

      // --- Script content analysis ---
      if (scriptFile) {
        for (const entry of TRANSITIVE_SCRIPT_PATTERNS) {
          if (entry.pattern.test(content)) {
            violations.push(entry.label);
          }
        }
      }

      // --- Config lifecycle hook analysis ---
      if (configFile) {
        const basename = target.split(/[\\/]/).pop() || '';
        const lowerBase = basename.toLowerCase();
        const lowerTarget = target.toLowerCase();

        // package.json lifecycle scripts with dangerous commands
        if (lowerBase === 'package.json') {
          for (const script of LIFECYCLE_SCRIPTS) {
            const scriptPattern = new RegExp(`["']${script}["']\\s*:\\s*["']([^"']+)["']`);
            const match = content.match(scriptPattern);
            if (match) {
              const cmd = match[1];
              if (/\bcurl\b|\bwget\b|\bnc\b|\brm\s+-rf\b/.test(cmd)) {
                violations.push(`dangerous lifecycle hook: ${script} (${cmd})`);
              }
            }
          }
        }

        // Makefile with dangerous targets
        if (lowerBase === 'makefile' || lowerTarget.endsWith('.mk')) {
          if (/\bcurl\b/.test(content) || /\bwget\b/.test(content)) {
            violations.push('Makefile with network commands');
          }
          if (/\brm\s+-rf\s+\//.test(content)) {
            violations.push('Makefile with destructive root deletion');
          }
        }
      }

      const holds = violations.length === 0;

      return {
        holds,
        expected: 'Written file content must not contain transitive policy violations',
        actual: holds
          ? 'No transitive effects detected'
          : `Transitive policy violations detected: ${violations.join('; ')}`,
      };
    },
  },

  {
    id: 'no-network-egress',
    name: 'No Network Egress',
    description:
      'Denies HTTP requests to non-allowlisted domains — closes data exfiltration vectors via network access',
    severity: 4,
    check(state) {
      const actionType = state.currentActionType || '';
      const command = state.currentCommand || '';

      // Determine if this is a network action
      const isHttpAction = actionType === 'http.request';
      const isNetworkShell =
        (actionType === '' || actionType === 'shell.exec') && isNetworkCommand(command);
      const explicitFlag = state.isNetworkRequest === true;

      if (!isHttpAction && !isNetworkShell && !explicitFlag) {
        return { holds: true, expected: 'N/A', actual: 'Not a network request' };
      }

      // If no allowlist is configured (undefined), skip enforcement (fail-open).
      // This makes the invariant opt-in: users must explicitly set networkEgressAllowlist
      // to activate network egress governance. An empty array means "deny all".
      const allowlist = state.networkEgressAllowlist;
      if (allowlist === undefined) {
        return {
          holds: true,
          expected: 'N/A',
          actual: 'Network egress allowlist not configured (fail-open)',
        };
      }

      // Extract domain from state or from command
      let domain = state.requestDomain || '';
      if (domain === '' && state.requestUrl) {
        domain = extractDomainFromUrl(state.requestUrl) || '';
      }
      if (domain === '' && isNetworkShell) {
        const url = extractUrlFromCommand(command);
        if (url) {
          domain = extractDomainFromUrl(url) || '';
        }
      }
      if (domain === '' && isHttpAction && state.currentTarget) {
        domain = extractDomainFromUrl(state.currentTarget) || '';
      }

      // If no domain could be extracted, deny conservatively
      if (domain === '') {
        return {
          holds: false,
          expected: 'Network requests must target allowlisted domains',
          actual: 'Network request detected but domain could not be determined',
        };
      }

      // Empty allowlist = deny all network egress
      if (allowlist.length === 0) {
        return {
          holds: false,
          expected: 'Network requests must target allowlisted domains',
          actual: `Network egress to ${domain} denied (no allowlist configured)`,
        };
      }

      // Check domain against allowlist (case-insensitive, supports subdomain matching)
      const lowerDomain = domain.toLowerCase();
      const allowed = allowlist.some((entry) => {
        const lowerEntry = entry.toLowerCase();
        // Exact match or subdomain match (e.g., "api.github.com" matches "github.com")
        return lowerDomain === lowerEntry || lowerDomain.endsWith('.' + lowerEntry);
      });

      return {
        holds: allowed,
        expected: 'Network requests must target allowlisted domains',
        actual: allowed
          ? `Network egress to ${domain} allowed (matches allowlist)`
          : `Network egress to ${domain} denied (not in allowlist: ${allowlist.join(', ')})`,
      };
    },
  },

  {
    id: 'no-ide-socket-access',
    name: 'No IDE Socket Access',
    description:
      'Blocks agent access to IDE inter-process communication sockets (VS Code, JetBrains, Cursor) — prevents governance escape via host IDE manipulation',
    severity: 4,
    check(state) {
      const target = (state.currentTarget || '').toLowerCase();
      const command = (state.currentCommand || '').toLowerCase();

      // Check file targets and shell commands for IDE socket path patterns
      const textToCheck = target || command;
      if (!textToCheck) {
        return { holds: true, expected: 'N/A', actual: 'No target or command to check' };
      }

      for (const pattern of IDE_SOCKET_PATH_PATTERNS) {
        if (textToCheck.includes(pattern)) {
          const ide = identifyIde(pattern);
          return {
            holds: false,
            expected: 'Agent must not access IDE IPC sockets',
            actual: `IDE socket access detected: pattern "${pattern}" matched in ${target ? 'target' : 'command'} (IDE: ${ide})`,
          };
        }
      }

      return {
        holds: true,
        expected: 'Agent must not access IDE IPC sockets',
        actual: 'No IDE socket access detected',
      };
    },
  },

  // ---------------------------------------------------------------------------
  // 22 — Commit Scope Guard
  // Prevents agents from committing files they didn't modify in the current session.
  // Catches accidental inclusion of pre-staged files from prior operations.
  // ---------------------------------------------------------------------------
  {
    id: 'commit-scope-guard',
    name: 'Commit Scope Guard',
    description:
      'All files in a git commit must have been written or modified by the current session. ' +
      'Prevents accidental inclusion of pre-staged files from prior operations.',
    severity: 4,
    check(state: SystemState): InvariantCheckResult {
      // Only applies to git.commit actions
      if (state.currentActionType !== 'git.commit') {
        return {
          holds: true,
          expected: 'All staged files must have been written in this session',
          actual: 'Not a git.commit action — skipped',
        };
      }

      // Fail-open: no staged file data means the kernel couldn't fetch it (e.g. dry-run)
      if (!state.stagedFiles || state.stagedFiles.length === 0) {
        return {
          holds: true,
          expected: 'All staged files must have been written in this session',
          actual: 'No staged files detected',
        };
      }

      // Fail-open: staged files exist but no session write log — session tracking is
      // best-effort (depends on Write tool hooks persisting state across invocations).
      // Blocking commits when tracking is unavailable causes false positives,
      // especially in worktrees where session state may not propagate.
      if (!state.sessionWrittenFiles || state.sessionWrittenFiles.length === 0) {
        return {
          holds: true,
          expected: 'All staged files must have been written in this session',
          actual: `${state.stagedFiles.length} staged file(s) but no session write log — allowing (fail-open)`,
        };
      }

      const writtenSet = new Set(state.sessionWrittenFiles);
      const unexpected = state.stagedFiles.filter((f) => !writtenSet.has(f));

      if (unexpected.length > 0) {
        const listed = unexpected.slice(0, 5).join(', ');
        const suffix = unexpected.length > 5 ? ` (+${unexpected.length - 5} more)` : '';
        return {
          holds: false,
          expected: 'All staged files must have been written in this session',
          actual: `${unexpected.length} unexpected staged file(s) not modified in this session: ${listed}${suffix}`,
        };
      }

      return {
        holds: true,
        expected: 'All staged files must have been written in this session',
        actual: `All ${state.stagedFiles.length} staged file(s) match session write log`,
      };
    },
  },

  // ---------------------------------------------------------------------------
  // 23 — Script Execution Tracking
  // Detects when a shell.exec command executes a file that was written earlier
  // in the same session — the write-then-execute bypass vector described in #862.
  // ---------------------------------------------------------------------------
  {
    id: 'script-execution-tracking',
    name: 'Script Execution Tracking',
    description:
      'Detects when a shell command executes a file that was written in the current session — ' +
      'prevents governance bypass via write-then-execute indirection',
    severity: 4,
    check(state: SystemState): InvariantCheckResult {
      const actionType = state.currentActionType || '';

      // Only applies to shell.exec actions
      if (actionType !== '' && actionType !== 'shell.exec') {
        return {
          holds: true,
          expected: 'Shell commands must not execute session-written scripts',
          actual: `Action type ${actionType} is not shell.exec — skipped`,
        };
      }

      const command = state.currentCommand || '';
      if (command === '') {
        return {
          holds: true,
          expected: 'Shell commands must not execute session-written scripts',
          actual: 'No command available',
        };
      }

      // Fail-open when no session write log is available
      const writtenFiles = state.sessionWrittenFiles;
      if (!writtenFiles || writtenFiles.length === 0) {
        return {
          holds: true,
          expected: 'Shell commands must not execute session-written scripts',
          actual: 'No session write log available',
        };
      }

      // Check if any session-written file appears in the command
      const executedWrittenFiles: string[] = [];

      for (const filePath of writtenFiles) {
        // Only check script-like files to avoid false positives on data files
        if (
          !isScriptFilePath(filePath) &&
          !filePath.endsWith('.mjs') &&
          !filePath.endsWith('.cjs')
        ) {
          continue;
        }

        // Check if the file path (or its basename) appears in the command
        const basename = filePath.split(/[\\/]/).pop() || '';
        if (basename && command.includes(basename)) {
          executedWrittenFiles.push(filePath);
        } else if (filePath && command.includes(filePath)) {
          executedWrittenFiles.push(filePath);
        }
      }

      if (executedWrittenFiles.length > 0) {
        const listed = executedWrittenFiles.slice(0, 3).join(', ');
        const suffix =
          executedWrittenFiles.length > 3 ? ` (+${executedWrittenFiles.length - 3} more)` : '';
        return {
          holds: false,
          expected: 'Shell commands must not execute session-written scripts',
          actual: `Command executes session-written script(s): ${listed}${suffix}`,
        };
      }

      return {
        holds: true,
        expected: 'Shell commands must not execute session-written scripts',
        actual: 'Command does not reference any session-written scripts',
      };
    },
  },

  {
    id: 'no-verify-bypass',
    name: 'No Verify Bypass',
    description:
      '--no-verify flag on git push/commit is forbidden — prevents skipping pre-push/pre-commit hooks',
    severity: 4,
    check(state) {
      const command = (state.currentCommand || '').trim();
      if (!command) {
        return { holds: true, expected: 'No --no-verify flag', actual: 'No command' };
      }

      const isGitPushOrCommit = /\bgit\s+(?:push|commit)\b/.test(command);
      if (!isGitPushOrCommit) {
        return {
          holds: true,
          expected: 'No --no-verify flag',
          actual: 'Not a git push/commit command',
        };
      }

      const hasNoVerify = /(?:^|\s)--no-verify(?:\s|$)/.test(command);

      return {
        holds: !hasNoVerify,
        expected: 'No --no-verify flag on git push/commit',
        actual: hasNoVerify
          ? `--no-verify bypass detected in: ${command.slice(0, 100)}`
          : 'No --no-verify flag',
      };
    },
  },
];
