// ─── Reason Code Ranges ───────────────────────────────────────────────────────
//
// 1000-1999  Destructive commands
// 2000-2999  Git operations
// 3000-3999  File sensitivity
// 4000-4999  Policy violation
// 5000-5999  Invariant trigger
// 6000-6999  Network / egress
// 7000-7999  Permission escalation
// 8000-8499  Transitive effect
// 8500-8999  GitHub operations
// 9000-9999  Infrastructure
// ──────────────────────────────────────────────────────────────────────────────

// ─── 1000: Destructive commands ──────────────────────────────────────────────

export const RC_DESTRUCTIVE_FILESYSTEM = 1000;
export const RC_DESTRUCTIVE_SYSTEM = 1100;
export const RC_DESTRUCTIVE_CONTAINER = 1200;
export const RC_DESTRUCTIVE_INFRASTRUCTURE = 1300;
export const RC_DESTRUCTIVE_DATABASE = 1400;
export const RC_DESTRUCTIVE_CODE_EXECUTION = 1500;
export const RC_DESTRUCTIVE_PACKAGE_MANAGER = 1600;
export const RC_DESTRUCTIVE_GIT = 1700;
export const RC_DESTRUCTIVE_NETWORK = 1800;

// ─── 2000: Git operations ────────────────────────────────────────────────────

export const RC_GIT_FORCE_PUSH = 2000;
export const RC_GIT_BRANCH_DELETE = 2010;
export const RC_GIT_RESET_HARD = 2020;
export const RC_GIT_CHECKOUT_FORCE = 2030;
export const RC_GIT_REBASE = 2040;
export const RC_GIT_MERGE = 2050;
export const RC_GIT_TAG_DELETE = 2060;
export const RC_GIT_PROTECTED_BRANCH = 2100;

// ─── 3000: File sensitivity ──────────────────────────────────────────────────

export const RC_FILE_CREDENTIAL = 3000;
export const RC_FILE_ENV = 3010;
export const RC_FILE_SSH_KEY = 3020;
export const RC_FILE_CONFIG = 3030;
export const RC_FILE_LOCKFILE = 3040;
export const RC_FILE_CI_CONFIG = 3050;
export const RC_FILE_GOVERNANCE = 3060;

// ─── 4000: Policy violation ──────────────────────────────────────────────────

export const RC_POLICY_DENY = 4000;
export const RC_POLICY_SCOPE_VIOLATION = 4010;
export const RC_POLICY_BRANCH_VIOLATION = 4020;
export const RC_POLICY_LIMIT_EXCEEDED = 4030;

// ─── 5000: Invariant trigger ─────────────────────────────────────────────────

export const RC_INVARIANT_SECRET_EXPOSURE = 5000;
export const RC_INVARIANT_BLAST_RADIUS = 5010;
export const RC_INVARIANT_TEST_BEFORE_PUSH = 5020;
export const RC_INVARIANT_NO_FORCE_PUSH = 5030;
export const RC_INVARIANT_RECURSIVE_GUARD = 5040;
export const RC_INVARIANT_LARGE_FILE = 5050;
export const RC_INVARIANT_PACKAGE_INJECTION = 5060;
export const RC_INVARIANT_LOCKFILE_INTEGRITY = 5070;

// ─── 6000: Network / egress ──────────────────────────────────────────────────

export const RC_NETWORK_EGRESS = 6000;
export const RC_NETWORK_EXFILTRATION = 6010;
export const RC_NETWORK_UNKNOWN_HOST = 6020;

// ─── 7000: Permission escalation ─────────────────────────────────────────────

export const RC_PERMISSION_ESCALATION = 7000;
export const RC_PERMISSION_SUDO = 7010;
export const RC_PERMISSION_CHMOD = 7020;
export const RC_PERMISSION_CHOWN = 7030;

// ─── 8000: Transitive effect ─────────────────────────────────────────────────

export const RC_TRANSITIVE_FILE = 8000;
export const RC_TRANSITIVE_PROCESS = 8010;
export const RC_TRANSITIVE_NETWORK = 8020;

// ─── 8500: GitHub operations ────────────────────────────────────────────────

export const RC_GITHUB_OPERATION = 8500;

// ─── 9000: Infrastructure ────────────────────────────────────────────────────

export const RC_INFRA_CONTAINER = 9000;
export const RC_INFRA_ORCHESTRATION = 9010;
export const RC_INFRA_CLOUD = 9020;
export const RC_INFRA_IAC = 9030;

// ─── Category → reason code mapping ─────────────────────────────────────────

const CATEGORY_BASE_CODES: Record<string, number> = {
  filesystem: RC_DESTRUCTIVE_FILESYSTEM,
  system: RC_DESTRUCTIVE_SYSTEM,
  container: RC_DESTRUCTIVE_CONTAINER,
  infrastructure: RC_DESTRUCTIVE_INFRASTRUCTURE,
  database: RC_DESTRUCTIVE_DATABASE,
  'code-execution': RC_DESTRUCTIVE_CODE_EXECUTION,
  'package-manager': RC_DESTRUCTIVE_PACKAGE_MANAGER,
  git: RC_DESTRUCTIVE_GIT,
  network: RC_DESTRUCTIVE_NETWORK,
  'git-operation': RC_GIT_FORCE_PUSH,
  'file-sensitivity': RC_FILE_CREDENTIAL,
  policy: RC_POLICY_DENY,
  invariant: RC_INVARIANT_SECRET_EXPOSURE,
  egress: RC_NETWORK_EGRESS,
  permission: RC_PERMISSION_ESCALATION,
  transitive: RC_TRANSITIVE_FILE,
  'github-operation': RC_GITHUB_OPERATION,
  infra: RC_INFRA_CONTAINER,
};

/**
 * Map a category string to its numeric reason code.
 *
 * @param category - The pattern category (e.g. "filesystem", "git", "database")
 * @param index - An offset within the category (0-99)
 * @returns The computed reason code, or the index alone if the category is unknown
 */
export const categoryToReasonCode = (category: string, index: number): number => {
  const base = CATEGORY_BASE_CODES[category.toLowerCase()];
  return base !== undefined ? base + index : index;
};
