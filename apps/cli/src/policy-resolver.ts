// Shared policy discovery and loading — used by guard and claude-hook commands.
// Supports policy composition: multiple --policy flags + hierarchical discovery.

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join, normalize } from 'node:path';
import { homedir } from 'node:os';
import { loadYamlPolicy, parseYamlPolicy } from '@red-codes/policy';
import { resolveExtends, mergePolicies } from '@red-codes/policy';
import type { LoadedPolicy } from '@red-codes/policy';
import type { CompositionSource, CompositionResult } from '@red-codes/policy';
import { composePolicies, describeComposition } from '@red-codes/policy';
import { resolveMainRepoRoot } from '@red-codes/core';

const DEFAULT_POLICY_CANDIDATES = [
  'agentguard.yaml',
  'agentguard.yml',
  'agentguard.json',
  '.agentguard.yaml',
  '.agentguard.yml',
];

const USER_POLICY_CANDIDATES = [
  join('.agentguard', 'policy.yaml'),
  join('.agentguard', 'policy.yml'),
];

/**
 * Walk up from a target file path looking for the nearest policy file.
 * Returns both the policy path and the project root directory.
 * This enables governance enforcement even when cwd differs from the project root
 * (e.g., when Claude Code runs from a parent directory).
 */
export function findPolicyForPath(
  targetPath: string
): { policyPath: string; projectRoot: string } | null {
  const absPath = normalize(resolve(targetPath));
  // Start from the file's directory (dirname handles both files and trailing-slash dirs)
  let dir = dirname(absPath);

  const seen = new Set<string>();
  while (!seen.has(dir)) {
    seen.add(dir);
    for (const name of DEFAULT_POLICY_CANDIDATES) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) {
        return { policyPath: candidate, projectRoot: dir };
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break; // Filesystem root
    dir = parent;
  }
  return null;
}

export function findDefaultPolicy(targetPath?: string): string | null {
  // Path-aware resolution: walk up from the target file to find the nearest policy.
  // This fixes the governance bypass when cwd is a parent directory of the project.
  if (targetPath) {
    const result = findPolicyForPath(targetPath);
    if (result) return result.policyPath;
  }

  // Check cwd first (worktree-local policies take precedence)
  for (const name of DEFAULT_POLICY_CANDIDATES) {
    if (existsSync(name)) return name;
  }

  // Fall back to main repo root (shared policy, if we're in a worktree)
  const mainRoot = resolveMainRepoRoot();
  const cwd = process.cwd();
  if (mainRoot !== cwd) {
    for (const name of DEFAULT_POLICY_CANDIDATES) {
      const mainRootPath = join(mainRoot, name);
      if (existsSync(mainRootPath)) return mainRootPath;
    }
  }

  return null;
}

/**
 * Find the user-level policy file in ~/.agentguard/.
 * Returns null if no user policy exists.
 */
export function findUserPolicy(): string | null {
  const home = homedir();
  for (const candidate of USER_POLICY_CANDIDATES) {
    const fullPath = join(home, candidate);
    if (existsSync(fullPath)) return fullPath;
  }
  return null;
}

/**
 * Load a single policy file and resolve its extends chain.
 * Returns a flat array of LoadedPolicy objects.
 */
export function loadPolicyFile(policyPath: string): unknown[] {
  const absPath = resolve(policyPath);
  if (!existsSync(absPath)) {
    process.stderr.write(`  \x1b[31mError:\x1b[0m Policy file not found: ${absPath}\n`);
    process.exit(1);
  }

  const content = readFileSync(absPath, 'utf8');

  if (absPath.endsWith('.yaml') || absPath.endsWith('.yml')) {
    const localPolicy = loadYamlPolicy(content, policyPath);

    // Check for extends (policy packs)
    const def = parseYamlPolicy(content);
    if (def.extends && def.extends.length > 0) {
      const baseDir = dirname(absPath);
      const { policies: packPolicies, errors, warnings } = resolveExtends(def.extends, baseDir);

      for (const err of errors) {
        process.stderr.write(`  \x1b[33mWarning:\x1b[0m ${err}\n`);
      }
      for (const warn of warnings) {
        process.stderr.write(`  \x1b[33mWarning:\x1b[0m ${warn}\n`);
      }

      const merged = mergePolicies(localPolicy, packPolicies);
      return merged.map((p) => ({ id: p.id, name: p.name, rules: p.rules, severity: p.severity }));
    }

    return [
      {
        id: localPolicy.id,
        name: localPolicy.name,
        rules: localPolicy.rules,
        severity: localPolicy.severity,
      },
    ];
  }

  try {
    const parsed = JSON.parse(content) as unknown;
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    process.stderr.write(`  \x1b[31mError:\x1b[0m Failed to parse policy file: ${absPath}\n`);
    process.exit(1);
  }
}

/**
 * Load a single policy file and return typed LoadedPolicy objects.
 */
function loadPolicyFileTyped(policyPath: string): LoadedPolicy[] {
  return loadPolicyFile(policyPath) as LoadedPolicy[];
}

/**
 * Load policy definitions from a single path (backwards compatible).
 * When targetPath is provided, walks up from that file to find the nearest policy —
 * fixing the governance bypass when cwd differs from the project root.
 */
export function loadPolicyDefs(policyPath?: string, targetPath?: string): unknown[] {
  const resolved = policyPath || findDefaultPolicy(targetPath);
  return resolved ? loadPolicyFile(resolved) : [];
}

/**
 * Load and compose policies from multiple sources with hierarchical discovery.
 *
 * Discovery order (lowest to highest precedence):
 * 1. User-level: ~/.agentguard/policy.yaml
 * 2. Project-level: ./agentguard.yaml (auto-discovered)
 * 3. Explicit: --policy flags (in order provided)
 *
 * @param policyPaths - Explicit policy file paths (from --policy flags)
 * @returns CompositionResult with ordered policies and source metadata
 */
export function loadComposedPolicies(policyPaths?: string[]): CompositionResult {
  const sources: CompositionSource[] = [];

  // Layer 1: User-level policy (~/.agentguard/policy.yaml)
  const userPolicyPath = findUserPolicy();
  if (userPolicyPath) {
    try {
      const policies = loadPolicyFileTyped(userPolicyPath);
      for (const policy of policies) {
        sources.push({ path: userPolicyPath, layer: 'user', policy });
      }
    } catch {
      process.stderr.write(
        `  \x1b[33mWarning:\x1b[0m Failed to load user policy: ${userPolicyPath}\n`
      );
    }
  }

  // Layer 2: Project-level policy (auto-discovered agentguard.yaml)
  // Only auto-discover if no explicit paths are provided, OR if explicit paths
  // don't include the default policy (to avoid loading it twice)
  const hasExplicitPaths = policyPaths && policyPaths.length > 0;
  const defaultPolicyPath = findDefaultPolicy();

  if (defaultPolicyPath) {
    const absDefault = resolve(defaultPolicyPath);
    const explicitAbsPaths = (policyPaths || []).map((p) => resolve(p));
    const isExplicitlyListed = explicitAbsPaths.includes(absDefault);

    if (!isExplicitlyListed) {
      try {
        const policies = loadPolicyFileTyped(defaultPolicyPath);
        for (const policy of policies) {
          sources.push({ path: defaultPolicyPath, layer: 'project', policy });
        }
      } catch {
        process.stderr.write(
          `  \x1b[33mWarning:\x1b[0m Failed to load project policy: ${defaultPolicyPath}\n`
        );
      }
    }
  }

  // Layer 3: Explicit policy files (--policy flags, in order)
  if (hasExplicitPaths) {
    for (const policyPath of policyPaths) {
      try {
        const policies = loadPolicyFileTyped(policyPath);
        for (const policy of policies) {
          sources.push({ path: policyPath, layer: 'explicit', policy });
        }
      } catch {
        // loadPolicyFile already prints errors and exits for missing files
      }
    }
  }

  return composePolicies(sources);
}

export { describeComposition };
export type { CompositionResult };
