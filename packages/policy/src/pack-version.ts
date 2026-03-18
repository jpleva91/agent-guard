// Policy pack versioning — semver parsing, range checking, and compatibility validation.
// Zero external dependencies. Supports the subset of semver needed for policy packs.

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
}

export interface CompatibilityResult {
  compatible: boolean;
  reason?: string;
}

export interface ParsedPackReference {
  ref: string;
  versionConstraint?: string;
}

const SEMVER_REGEX = /^(\d+)\.(\d+)\.(\d+)$/;

/**
 * Parse a semver string into its components.
 * Returns null if the string is not a valid semver.
 */
export function parseSemver(version: string): SemVer | null {
  const match = version.trim().match(SEMVER_REGEX);
  if (!match) return null;
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
  };
}

/**
 * Compare two semver versions.
 * Returns -1 if a < b, 0 if a === b, 1 if a > b.
 */
export function compareSemver(a: SemVer, b: SemVer): -1 | 0 | 1 {
  if (a.major !== b.major) return a.major < b.major ? -1 : 1;
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;
  return 0;
}

/**
 * Check if a version satisfies a version range.
 *
 * Supported range formats:
 * - Exact: `"1.2.3"` — must match exactly
 * - Greater-or-equal: `">=1.2.3"` — version must be >= range
 * - Caret: `"^1.2.3"` — compatible with (same major, >= minor.patch)
 * - Tilde: `"~1.2.3"` — reasonably close (same major.minor, >= patch)
 */
export function satisfiesRange(version: string, range: string): boolean {
  const trimmed = range.trim();

  if (trimmed.startsWith('>=')) {
    const rangeVer = parseSemver(trimmed.slice(2));
    const ver = parseSemver(version);
    if (!rangeVer || !ver) return false;
    return compareSemver(ver, rangeVer) >= 0;
  }

  if (trimmed.startsWith('^')) {
    const rangeVer = parseSemver(trimmed.slice(1));
    const ver = parseSemver(version);
    if (!rangeVer || !ver) return false;
    // Same major, >= minor.patch
    if (ver.major !== rangeVer.major) return false;
    if (ver.minor > rangeVer.minor) return true;
    if (ver.minor === rangeVer.minor) return ver.patch >= rangeVer.patch;
    return false;
  }

  if (trimmed.startsWith('~')) {
    const rangeVer = parseSemver(trimmed.slice(1));
    const ver = parseSemver(version);
    if (!rangeVer || !ver) return false;
    // Same major.minor, >= patch
    if (ver.major !== rangeVer.major) return false;
    if (ver.minor !== rangeVer.minor) return false;
    return ver.patch >= rangeVer.patch;
  }

  // Exact match
  const rangeVer = parseSemver(trimmed);
  const ver = parseSemver(version);
  if (!rangeVer || !ver) return false;
  return compareSemver(ver, rangeVer) === 0;
}

/**
 * Check if a policy pack is compatible with the current AgentGuard version.
 *
 * @param packAgentguardVersion — the `agentguardVersion` range from the pack (e.g., ">=2.0.0")
 * @param currentVersion — the running AgentGuard version (e.g., "2.2.0")
 */
export function checkCompatibility(
  packAgentguardVersion: string,
  currentVersion: string,
): CompatibilityResult {
  const current = parseSemver(currentVersion);
  if (!current) {
    return { compatible: true, reason: `Cannot parse current version "${currentVersion}"` };
  }

  if (!satisfiesRange(currentVersion, packAgentguardVersion)) {
    return {
      compatible: false,
      reason:
        `Pack requires AgentGuard ${packAgentguardVersion} ` +
        `but current version is ${currentVersion}`,
    };
  }

  return { compatible: true };
}

/**
 * Parse a pack reference that may include a version constraint.
 *
 * Supports `"pack-name@^1.2.0"` syntax where the `@version` suffix
 * specifies a version pin for the pack's own version.
 *
 * Scoped npm packages (e.g., `@agentguard/security-pack@^1.0.0`) are
 * handled by splitting on the last `@`.
 */
export function parsePackReference(ref: string): ParsedPackReference {
  // Find the last '@' that is not at position 0 (scoped packages start with @)
  const lastAt = ref.lastIndexOf('@');

  if (lastAt <= 0) {
    // No version constraint, or the only @ is the scope prefix
    return { ref };
  }

  const possibleVersion = ref.slice(lastAt + 1);
  // Check if what follows the @ looks like a version constraint
  if (/^[~^>=]*\d/.test(possibleVersion)) {
    return {
      ref: ref.slice(0, lastAt),
      versionConstraint: possibleVersion,
    };
  }

  // Not a version constraint (e.g., just part of a package name)
  return { ref };
}
