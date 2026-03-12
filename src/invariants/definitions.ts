// Default system invariant definitions.
// Pure domain logic. No DOM, no Node.js-specific APIs.

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
}

/** Patterns matched as substrings (case-insensitive) against file paths. */
export const SENSITIVE_FILE_PATTERNS = [
  '.env',
  'credentials',
  '.pem',
  '.key',
  'secret',
  'token',
  '.npmrc',
  '.netrc',
  '.pgpass',
  '.htpasswd',
  'id_rsa',
  'id_ed25519',
  'id_ecdsa',
  'id_dsa',
  '.p12',
  '.pfx',
  '.jks',
  'keystore',
  'secrets.yaml',
  'secrets.yml',
  'vault.json',
];

/** Well-known credential file paths and directory prefixes.
 * Checked as case-insensitive substring matches against currentTarget. */
export const CREDENTIAL_PATH_PATTERNS = [
  // SSH
  '/.ssh/',
  '\\.ssh\\',
  // AWS
  '/.aws/credentials',
  '/.aws/config',
  '\\.aws\\credentials',
  '\\.aws\\config',
  // Google Cloud
  '/.config/gcloud/',
  '\\.config\\gcloud\\',
  // Azure
  '/.azure/',
  '\\.azure\\',
  // Docker
  '/.docker/config.json',
  '\\.docker\\config.json',
];

/** Exact basenames (case-insensitive) that are credential files at any depth. */
export const CREDENTIAL_BASENAME_PATTERNS = ['.npmrc', '.pypirc', '.netrc', '.curlrc'];

/** Matches .env files: .env, .env.local, .env.production, etc. */
const ENV_FILE_REGEX = /(?:^|[\\/])\.env(?:\.\w+)?$/i;

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
];
