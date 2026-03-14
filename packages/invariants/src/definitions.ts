// Default system invariant definitions.
// Pure domain logic. No DOM, no Node.js-specific APIs.
// Pattern data sourced from @red-codes/core governance data files.

import {
  INVARIANT_SENSITIVE_FILE_PATTERNS,
  INVARIANT_CREDENTIAL_PATH_PATTERNS,
  INVARIANT_CREDENTIAL_BASENAME_PATTERNS,
  INVARIANT_CONTAINER_CONFIG_BASENAMES,
  INVARIANT_LIFECYCLE_SCRIPTS,
  INVARIANT_ENV_FILE_REGEX_SOURCE,
  INVARIANT_DOCKERFILE_SUFFIX_REGEX_SOURCE,
} from '@red-codes/core';

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
}

export interface SystemState {
  modifiedFiles?: string[];
  targetBranch?: string;
  directPush?: boolean;
  forcePush?: boolean;
  isPush?: boolean;
  testsPass?: boolean;
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
}

/** Patterns matched as substrings (case-insensitive) against file paths. */
export const SENSITIVE_FILE_PATTERNS: string[] = INVARIANT_SENSITIVE_FILE_PATTERNS;

/** Well-known credential file paths and directory prefixes.
 * Checked as case-insensitive substring matches against currentTarget. */
export const CREDENTIAL_PATH_PATTERNS: string[] = INVARIANT_CREDENTIAL_PATH_PATTERNS;

/** Exact basenames (case-insensitive) that are credential files at any depth. */
export const CREDENTIAL_BASENAME_PATTERNS: string[] = INVARIANT_CREDENTIAL_BASENAME_PATTERNS;

/** Matches .env files: .env, .env.local, .env.production, etc. */
const ENV_FILE_REGEX = new RegExp(INVARIANT_ENV_FILE_REGEX_SOURCE, 'i');

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

/** Container configuration file basenames (case-insensitive). */
const CONTAINER_CONFIG_BASENAMES: string[] = INVARIANT_CONTAINER_CONFIG_BASENAMES;

/** Matches *.dockerfile files (e.g., app.dockerfile, prod.dockerfile). */
const DOCKERFILE_SUFFIX_REGEX = new RegExp(INVARIANT_DOCKERFILE_SUFFIX_REGEX_SOURCE, 'i');

/** Returns true if the given path targets a container configuration file. */
export function isContainerConfigPath(filePath: string): boolean {
  const basename = filePath.split(/[\\/]/).pop() || '';
  const lowerBase = basename.toLowerCase();

  if (CONTAINER_CONFIG_BASENAMES.includes(lowerBase)) {
    return true;
  }

  if (DOCKERFILE_SUFFIX_REGEX.test(basename)) {
    return true;
  }

  return false;
}

/** npm lifecycle scripts that auto-execute during install/publish/pack operations. */
const LIFECYCLE_SCRIPTS: string[] = INVARIANT_LIFECYCLE_SCRIPTS;

/** Returns true if the given path targets a well-known credential file location. */
export function isCredentialPath(filePath: string): boolean {
  const lower = filePath.toLowerCase();

  // Check directory-based patterns (substring match)
  if (CREDENTIAL_PATH_PATTERNS.some((p) => lower.includes(p.toLowerCase()))) {
    return true;
  }

  // Check basename patterns
  const basename = filePath.split(/[\\/]/).pop() || '';
  const lowerBase = basename.toLowerCase();
  if (CREDENTIAL_BASENAME_PATTERNS.some((p) => lowerBase === p)) {
    return true;
  }

  // Check .env file pattern
  if (ENV_FILE_REGEX.test(filePath)) {
    return true;
  }

  return false;
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
    description: 'Tests must pass before pushing code',
    severity: 3,
    check(state) {
      if (!state.isPush) {
        return { holds: true, expected: 'N/A', actual: 'Not a push operation' };
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
      const writingActions = ['file.write', 'file.move'];

      // Only applies to write/move actions — reading credential files is allowed
      if (actionType !== '' && !writingActions.includes(actionType)) {
        return {
          holds: true,
          expected: 'N/A',
          actual: `Action type ${actionType} is not a write operation`,
        };
      }

      const target = state.currentTarget || '';
      if (target === '') {
        return { holds: true, expected: 'N/A', actual: 'No target specified' };
      }

      const violation = isCredentialPath(target);

      return {
        holds: !violation,
        expected: 'No creation or modification of credential files',
        actual: violation ? `Credential file targeted: ${target}` : 'No credential files affected',
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
      const GOVERNANCE_DIR_PATTERNS = ['.agentguard/', '.agentguard\\', 'policies/', 'policies\\'];
      const GOVERNANCE_FILE_BASENAMES = ['agentguard.yaml', 'agentguard.yml', '.agentguard.yaml'];

      const matchesGovernancePath = (path: string) => {
        const lower = path.toLowerCase();
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
];
