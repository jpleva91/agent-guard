// ─── Types ───────────────────────────────────────────────────────────────────

export type {
  MatchType,
  MatchResult,
  PatternMeta,
  DestructivePatternInput,
  GitActionPatternInput,
  GithubActionPatternInput,
} from './types.js';

// ─── Reason codes ────────────────────────────────────────────────────────────

export {
  // Destructive commands (1000-1999)
  RC_DESTRUCTIVE_FILESYSTEM,
  RC_DESTRUCTIVE_SYSTEM,
  RC_DESTRUCTIVE_CONTAINER,
  RC_DESTRUCTIVE_INFRASTRUCTURE,
  RC_DESTRUCTIVE_DATABASE,
  RC_DESTRUCTIVE_CODE_EXECUTION,
  RC_DESTRUCTIVE_PACKAGE_MANAGER,
  RC_DESTRUCTIVE_GIT,
  RC_DESTRUCTIVE_NETWORK,
  // Git operations (2000-2999)
  RC_GIT_FORCE_PUSH,
  RC_GIT_BRANCH_DELETE,
  RC_GIT_RESET_HARD,
  RC_GIT_CHECKOUT_FORCE,
  RC_GIT_REBASE,
  RC_GIT_MERGE,
  RC_GIT_TAG_DELETE,
  RC_GIT_PROTECTED_BRANCH,
  // File sensitivity (3000-3999)
  RC_FILE_CREDENTIAL,
  RC_FILE_ENV,
  RC_FILE_SSH_KEY,
  RC_FILE_CONFIG,
  RC_FILE_LOCKFILE,
  RC_FILE_CI_CONFIG,
  RC_FILE_GOVERNANCE,
  // Policy violation (4000-4999)
  RC_POLICY_DENY,
  RC_POLICY_SCOPE_VIOLATION,
  RC_POLICY_BRANCH_VIOLATION,
  RC_POLICY_LIMIT_EXCEEDED,
  // Invariant trigger (5000-5999)
  RC_INVARIANT_SECRET_EXPOSURE,
  RC_INVARIANT_BLAST_RADIUS,
  RC_INVARIANT_TEST_BEFORE_PUSH,
  RC_INVARIANT_NO_FORCE_PUSH,
  RC_INVARIANT_RECURSIVE_GUARD,
  RC_INVARIANT_LARGE_FILE,
  RC_INVARIANT_PACKAGE_INJECTION,
  RC_INVARIANT_LOCKFILE_INTEGRITY,
  // Network / egress (6000-6999)
  RC_NETWORK_EGRESS,
  RC_NETWORK_EXFILTRATION,
  RC_NETWORK_UNKNOWN_HOST,
  // Permission escalation (7000-7999)
  RC_PERMISSION_ESCALATION,
  RC_PERMISSION_SUDO,
  RC_PERMISSION_CHMOD,
  RC_PERMISSION_CHOWN,
  // Transitive effect (8000-8999)
  RC_TRANSITIVE_FILE,
  RC_TRANSITIVE_PROCESS,
  RC_TRANSITIVE_NETWORK,
  // GitHub operations (8500)
  RC_GITHUB_OPERATION,
  // Infrastructure (9000-9999)
  RC_INFRA_CONTAINER,
  RC_INFRA_ORCHESTRATION,
  RC_INFRA_CLOUD,
  RC_INFRA_IAC,
  // Utility
  categoryToReasonCode,
} from './reason-codes.js';

// ─── Matchers ────────────────────────────────────────────────────────────────

export { CommandScanner } from './command-scanner.js';
export { PathMatcher } from './path-matcher.js';
export type { PathPatternInput } from './path-matcher.js';
export { PolicyMatcher } from './policy-matcher.js';
