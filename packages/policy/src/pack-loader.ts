// Policy pack loader — resolves, loads, validates, and merges policy packs.
// Supports local directory packs and npm-style package references.
//
// A policy pack is a YAML or JSON policy file that can be referenced via the
// `extends` key in a policy definition. Packs are loaded and their rules are
// merged with the local policy, with local rules taking precedence.

import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import type { LoadedPolicy, PolicyRule } from './evaluator.js';
import { loadYamlPolicy } from './yaml-loader.js';
import { validatePolicy } from './loader.js';

/** Candidate filenames when resolving a pack directory */
const PACK_MANIFEST_CANDIDATES = [
  'agentguard-pack.yaml',
  'agentguard-pack.yml',
  'agentguard-pack.json',
  'agentguard.yaml',
  'agentguard.yml',
];

export interface PackResolutionResult {
  policies: LoadedPolicy[];
  errors: string[];
}

/**
 * Resolve a single pack reference to an absolute file path.
 *
 * Supports three reference styles:
 * 1. Relative path — `"./packs/strict"` or `"./packs/strict.yaml"`
 * 2. Absolute path — `"/home/user/packs/strict.yaml"`
 * 3. npm package — `"@agentguard/security-pack"` resolved from node_modules
 */
export function resolvePackPath(ref: string, baseDir: string): string | null {
  // 1. Direct file reference (relative or absolute)
  const directPath = resolve(baseDir, ref);
  if (existsSync(directPath)) {
    // If it's a file, use it directly
    if (
      directPath.endsWith('.yaml') ||
      directPath.endsWith('.yml') ||
      directPath.endsWith('.json')
    ) {
      return directPath;
    }
    // If it's a directory, look for manifest files
    for (const candidate of PACK_MANIFEST_CANDIDATES) {
      const candidatePath = join(directPath, candidate);
      if (existsSync(candidatePath)) {
        return candidatePath;
      }
    }
  }

  // Try with common extensions if the direct path didn't work
  for (const ext of ['.yaml', '.yml', '.json']) {
    const withExt = directPath + ext;
    if (existsSync(withExt)) {
      return withExt;
    }
  }

  // 2. npm package reference — search node_modules
  const nodeModulesPath = join(baseDir, 'node_modules', ref);
  if (existsSync(nodeModulesPath)) {
    for (const candidate of PACK_MANIFEST_CANDIDATES) {
      const candidatePath = join(nodeModulesPath, candidate);
      if (existsSync(candidatePath)) {
        return candidatePath;
      }
    }
  }

  return null;
}

/**
 * Load a single policy pack from a resolved file path.
 */
export function loadPackFile(filePath: string): LoadedPolicy | null {
  const content = readFileSync(filePath, 'utf8');

  if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
    return loadYamlPolicy(content, `pack:${filePath}`);
  }

  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const result = validatePolicy(parsed);
    if (!result.valid) {
      return null;
    }
    return {
      id: (parsed.id as string) || `pack:${filePath}`,
      name: (parsed.name as string) || 'JSON Pack',
      description: parsed.description as string | undefined,
      rules: parsed.rules as PolicyRule[],
      severity: (parsed.severity as number) ?? 3,
    };
  } catch {
    return null;
  }
}

/**
 * Resolve and load all policy packs from an `extends` list.
 *
 * @param extends_ - Array of pack references (paths or npm package names)
 * @param baseDir  - Directory to resolve relative paths from
 * @returns Loaded pack policies and any errors encountered
 */
export function resolveExtends(extends_: string[], baseDir: string): PackResolutionResult {
  const policies: LoadedPolicy[] = [];
  const errors: string[] = [];
  const seenIds = new Set<string>();

  for (const ref of extends_) {
    const resolvedPath = resolvePackPath(ref, baseDir);

    if (!resolvedPath) {
      errors.push(`Pack not found: "${ref}" (searched from ${baseDir})`);
      continue;
    }

    const pack = loadPackFile(resolvedPath);

    if (!pack) {
      errors.push(`Failed to load pack: "${ref}" (${resolvedPath})`);
      continue;
    }

    if (seenIds.has(pack.id)) {
      errors.push(`Duplicate pack ID: "${pack.id}" from "${ref}"`);
      continue;
    }

    seenIds.add(pack.id);
    policies.push(pack);
  }

  return { policies, errors };
}

/**
 * Merge pack policies with a local policy.
 *
 * Precedence: local rules override pack rules. Within packs, earlier entries
 * in the `extends` list take precedence over later entries.
 *
 * The merge strategy is:
 * 1. Collect all rules from packs (in extends order)
 * 2. Append local rules (which take precedence during evaluation since
 *    the evaluator checks deny rules first, then allow rules)
 * 3. Return a single merged policy array
 */
export function mergePolicies(
  localPolicy: LoadedPolicy,
  packPolicies: LoadedPolicy[]
): LoadedPolicy[] {
  // Pack policies come first (lower precedence in evaluation order)
  // Local policy comes last (highest precedence)
  return [...packPolicies, localPolicy];
}
