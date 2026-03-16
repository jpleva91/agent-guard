// Policy trust verification with risk analysis.
// Non-interactive — no stdin/stdout prompts.
// Interactive prompting lives in the CLI trust command.

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { verifyTrust, isCiTrustOverride } from '@red-codes/core';

export type RiskLevel = 'danger' | 'warning' | 'info';

export interface RiskFlag {
  level: RiskLevel;
  message: string;
  pattern: string;
}

export type TrustClass = 'implicitly_trusted' | 'trust_gated';

export interface PolicyTrustResult {
  trustClass: TrustClass;
  status: 'trusted' | 'untrusted' | 'content_changed';
  riskFlags: RiskFlag[];
}

// ---------------------------------------------------------------------------
// Risk patterns
// ---------------------------------------------------------------------------

interface RiskPattern {
  level: RiskLevel;
  regex: RegExp;
  message: string;
  patternStr: string;
  customCheck?: (content: string) => boolean;
}

const RISK_PATTERNS: RiskPattern[] = [
  {
    level: 'danger',
    regex: /allow\s*:\s*["']?\*["']?/,
    message: 'Wildcard allow detected — all actions will be permitted',
    patternStr: 'allow: "*"',
  },
  {
    level: 'danger',
    regex:
      /(?:secret_exposure|protected_branches|blast_radius|test_before_push|no_force_push)\s*:\s*false/,
    message: 'Disabled security invariant detected',
    patternStr: '<invariant>: false',
  },
  {
    level: 'danger',
    regex: /enabled\s*:\s*false/,
    message: 'Invariant explicitly disabled via enabled: false',
    patternStr: 'enabled: false',
  },
  {
    level: 'warning',
    regex: /scope\s*:\s*["']?\*\*["']?/,
    message: 'Broad scope pattern "**" matches all paths',
    patternStr: 'scope: "**"',
  },
  {
    level: 'warning',
    regex: /files\s*:\s*\[["']?\*\*["']?\]/,
    message: 'Broad files pattern ["**"] matches all files',
    patternStr: 'files: ["**"]',
  },
  {
    level: 'warning',
    regex: /lockdownThreshold\s*:\s*(\d+)/,
    message: 'High lockdown threshold — escalation to LOCKDOWN will be delayed',
    patternStr: 'lockdownThreshold: >20',
    customCheck: (content: string): boolean => {
      const match = /lockdownThreshold\s*:\s*(\d+)/.exec(content);
      if (!match) return false;
      return parseInt(match[1], 10) > 20;
    },
  },
];

// ---------------------------------------------------------------------------
// analyzePolicyRisk
// ---------------------------------------------------------------------------

/**
 * Pure function. Regex-based pattern matching on policy YAML content to detect
 * risky configurations. Returns an array of risk flags (empty for safe policies).
 */
export function analyzePolicyRisk(content: string): RiskFlag[] {
  const flags: RiskFlag[] = [];

  for (const rp of RISK_PATTERNS) {
    const matched = rp.customCheck ? rp.customCheck(content) : rp.regex.test(content);
    if (matched) {
      flags.push({ level: rp.level, message: rp.message, pattern: rp.patternStr });
    }
  }

  return flags;
}

// ---------------------------------------------------------------------------
// classifyPolicyLocation
// ---------------------------------------------------------------------------

/**
 * Pure function. Determines trust classification based on path location.
 * - Home dir paths → implicitly_trusted
 * - Explicit CLI flag (--policy) → implicitly_trusted
 * - Project-local files → trust_gated
 */
export function classifyPolicyLocation(
  policyPath: string,
  options?: { isExplicitCliFlag?: boolean }
): TrustClass {
  if (options?.isExplicitCliFlag) return 'implicitly_trusted';

  const home = homedir();

  if (policyPath.startsWith('~') || policyPath.startsWith('$HOME') || policyPath.startsWith(home)) {
    return 'implicitly_trusted';
  }

  return 'trust_gated';
}

// ---------------------------------------------------------------------------
// verifyPolicyTrust
// ---------------------------------------------------------------------------

/**
 * Non-interactive trust gate. Reads trust store + file hash.
 * No stdin/stdout prompts — interactive prompting lives in the CLI trust command.
 *
 * 1. Classify location → if implicitly_trusted, return early with status: 'trusted'
 * 2. If trust_gated, check trust store via verifyTrust() from @red-codes/core
 * 3. CI override: if isCiTrustOverride() returns true, treat as 'trusted'
 */
export async function verifyPolicyTrust(
  policyPath: string,
  options?: { isExplicitCliFlag?: boolean }
): Promise<PolicyTrustResult> {
  const trustClass = classifyPolicyLocation(policyPath, options);

  // Read file content for risk analysis
  let content = '';
  try {
    content = readFileSync(policyPath, 'utf8');
  } catch {
    // If file can't be read, proceed without risk analysis
  }

  const riskFlags = analyzePolicyRisk(content);

  if (trustClass === 'implicitly_trusted') {
    return { trustClass, status: 'trusted', riskFlags };
  }

  // CI override: treat project-local policy as trusted in CI environments
  if (isCiTrustOverride()) {
    return { trustClass, status: 'trusted', riskFlags };
  }

  // Delegate to trust store for trust-gated locations
  const storeStatus = await verifyTrust(policyPath);
  return { trustClass, status: storeStatus, riskFlags };
}
