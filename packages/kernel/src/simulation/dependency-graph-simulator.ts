// Dependency graph simulator — predicts transitive impact of package.json changes.
// Builds a workspace dependency graph and identifies downstream dependents
// affected by modifications to a package's dependency declarations.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import type { NormalizedIntent } from '@red-codes/policy';
import type { ActionSimulator, SimulationResult } from './types.js';

/** Minimal shape of a package.json for dependency parsing */
interface PackageManifest {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  workspaces?: string[] | { packages: string[] };
}

/** A node in the workspace dependency graph */
export interface WorkspaceNode {
  /** Package name from package.json */
  name: string;
  /** Relative directory path within the monorepo */
  dir: string;
  /** Direct workspace dependencies (package names) */
  workspaceDeps: string[];
}

/** Result of the dependency graph analysis */
export interface DependencyGraphAnalysis {
  /** The package being modified */
  targetPackage: string;
  /** Total declared dependencies (deps + devDeps + peerDeps) */
  totalDeclaredDeps: number;
  /** Workspace packages that directly depend on the target */
  directDependents: string[];
  /** Workspace packages that transitively depend on the target */
  transitiveDependents: string[];
  /** Total workspace packages in the monorepo */
  totalWorkspacePackages: number;
  /** Whether the target is the monorepo root */
  isRoot: boolean;
}

/** Check if the intent is a write to a package.json file */
function isPackageJsonWrite(intent: NormalizedIntent): boolean {
  if (intent.action !== 'file.write') return false;
  const target = intent.target || '';
  return basename(target) === 'package.json';
}

/** Safely read and parse a JSON file, returning null on any error */
function readJsonSafe<T>(filePath: string): T | null {
  try {
    if (!existsSync(filePath)) return null;
    const content = readFileSync(filePath, 'utf8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

/** Find the monorepo root by searching up from the target path for pnpm-workspace.yaml or root package.json with workspaces */
export function findMonorepoRoot(startPath: string): string | null {
  let dir = dirname(startPath);
  const maxDepth = 10;
  for (let i = 0; i < maxDepth; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const pkg = readJsonSafe<PackageManifest>(join(dir, 'package.json'));
    if (pkg?.workspaces) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/** Resolve workspace glob patterns into actual package directories */
function resolveWorkspaceGlobs(root: string): string[] {
  // Read pnpm-workspace.yaml or package.json workspaces
  const pnpmWsPath = join(root, 'pnpm-workspace.yaml');
  let patterns: string[] = [];

  if (existsSync(pnpmWsPath)) {
    try {
      const content = readFileSync(pnpmWsPath, 'utf8');
      // Simple YAML parsing for packages list (avoids dependency on YAML parser)
      const lines = content.split('\n');
      let inPackages = false;
      for (const line of lines) {
        if (/^packages\s*:/.test(line)) {
          inPackages = true;
          continue;
        }
        if (inPackages) {
          const match = line.match(/^\s+-\s+['"]?([^'"]+)['"]?$/);
          if (match) {
            patterns.push(match[1].trim());
          } else if (/^\S/.test(line)) {
            inPackages = false;
          }
        }
      }
    } catch {
      // Fall through to package.json workspaces
    }
  }

  if (patterns.length === 0) {
    const rootPkg = readJsonSafe<PackageManifest>(join(root, 'package.json'));
    if (rootPkg?.workspaces) {
      patterns = Array.isArray(rootPkg.workspaces)
        ? rootPkg.workspaces
        : rootPkg.workspaces.packages || [];
    }
  }

  // Expand simple glob patterns (dir/*) into actual directories
  // We avoid complex glob libraries; instead walk one level for each pattern
  const dirs: string[] = [];
  for (const pattern of patterns) {
    const globStar = pattern.replace(/\/\*$/, '').replace(/\*$/, '');
    const parentDir = join(root, globStar);
    if (!existsSync(parentDir)) continue;

    try {
      const entries = readdirSync(parentDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const pkgJsonPath = join(parentDir, entry.name, 'package.json');
          if (existsSync(pkgJsonPath)) {
            dirs.push(join(globStar, entry.name));
          }
        }
      }
    } catch {
      // Skip unreadable directories
    }
  }

  return dirs;
}

/** Build the workspace dependency graph */
export function buildWorkspaceGraph(root: string): WorkspaceNode[] {
  const workspaceDirs = resolveWorkspaceGlobs(root);
  const nodes: WorkspaceNode[] = [];
  const workspaceNames = new Set<string>();

  // First pass: collect all workspace package names, caching parsed manifests
  const manifests = new Map<string, PackageManifest | null>();
  for (const dir of workspaceDirs) {
    const pkg = readJsonSafe<PackageManifest>(join(root, dir, 'package.json'));
    manifests.set(dir, pkg);
    if (pkg?.name) {
      workspaceNames.add(pkg.name);
    }
  }

  // Second pass: build nodes with workspace-internal dependencies (uses cached manifests)
  for (const dir of workspaceDirs) {
    const pkg = manifests.get(dir);
    if (!pkg?.name) continue;

    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
      ...pkg.peerDependencies,
    };

    const workspaceDeps = Object.keys(allDeps).filter((dep) => workspaceNames.has(dep));

    nodes.push({
      name: pkg.name,
      dir,
      workspaceDeps,
    });
  }

  return nodes;
}

/** Find all workspace packages that transitively depend on the given package */
export function findTransitiveDependents(
  graph: WorkspaceNode[],
  targetPackage: string
): { direct: string[]; transitive: string[] } {
  // Build a reverse dependency map: package -> packages that depend on it
  const reverseDeps = new Map<string, Set<string>>();
  for (const node of graph) {
    for (const dep of node.workspaceDeps) {
      if (!reverseDeps.has(dep)) reverseDeps.set(dep, new Set());
      reverseDeps.get(dep)!.add(node.name);
    }
  }

  const direct = [...(reverseDeps.get(targetPackage) ?? [])];

  // BFS to find all transitive dependents
  const visited = new Set<string>();
  const queue = [targetPackage];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    const dependents = reverseDeps.get(current);
    if (dependents) {
      for (const dep of dependents) {
        if (!visited.has(dep)) queue.push(dep);
      }
    }
  }

  // Remove the target itself from the result
  visited.delete(targetPackage);
  const transitive = [...visited];

  return { direct, transitive };
}

/** Count total declared dependencies from a package manifest */
function countDeclaredDeps(pkg: PackageManifest): number {
  return (
    Object.keys(pkg.dependencies ?? {}).length +
    Object.keys(pkg.devDependencies ?? {}).length +
    Object.keys(pkg.peerDependencies ?? {}).length
  );
}

/** Analyze the dependency graph for a package.json write */
export function analyzeDependencyGraph(
  targetPath: string,
  root: string | null
): DependencyGraphAnalysis | null {
  const pkg = readJsonSafe<PackageManifest>(targetPath);
  const targetName = pkg?.name ?? basename(dirname(targetPath));

  if (!root) {
    // Not a monorepo — provide basic analysis from the package.json alone
    return {
      targetPackage: targetName,
      totalDeclaredDeps: pkg ? countDeclaredDeps(pkg) : 0,
      directDependents: [],
      transitiveDependents: [],
      totalWorkspacePackages: 0,
      isRoot: true,
    };
  }

  const isRoot = targetPath === join(root, 'package.json');

  const graph = buildWorkspaceGraph(root);
  const { direct, transitive } = findTransitiveDependents(graph, targetName);

  return {
    targetPackage: targetName,
    totalDeclaredDeps: pkg ? countDeclaredDeps(pkg) : 0,
    directDependents: direct.sort(),
    transitiveDependents: transitive.sort(),
    totalWorkspacePackages: graph.length,
    isRoot,
  };
}

export function createDependencyGraphSimulator(): ActionSimulator {
  return {
    id: 'dependency-graph-simulator',

    supports(intent: NormalizedIntent): boolean {
      return isPackageJsonWrite(intent);
    },

    async simulate(
      intent: NormalizedIntent,
      _context: Record<string, unknown>
    ): Promise<SimulationResult> {
      const start = Date.now();
      const target = intent.target || '';
      const predictedChanges: string[] = [];
      const details: Record<string, unknown> = {};
      let blastRadius = 0;
      let riskLevel: 'low' | 'medium' | 'high' = 'low';

      predictedChanges.push(`Write: ${target}`);

      const root = findMonorepoRoot(target);
      const analysis = analyzeDependencyGraph(target, root);

      if (analysis) {
        details.dependencyGraph = analysis;

        // Root package.json changes affect everything
        if (analysis.isRoot && analysis.totalWorkspacePackages > 0) {
          blastRadius = analysis.totalWorkspacePackages;
          predictedChanges.push(
            `Root package.json — all ${analysis.totalWorkspacePackages} workspace packages potentially affected`
          );
          riskLevel = 'high';
        } else {
          // Blast radius = direct + transitive dependents + the package itself
          blastRadius = 1 + analysis.transitiveDependents.length;

          if (analysis.directDependents.length > 0) {
            predictedChanges.push(
              `${analysis.directDependents.length} direct dependent(s): ${analysis.directDependents.join(', ')}`
            );
          }

          if (analysis.transitiveDependents.length > analysis.directDependents.length) {
            const transitiveOnly = analysis.transitiveDependents.filter(
              (t) => !analysis.directDependents.includes(t)
            );
            if (transitiveOnly.length > 0) {
              predictedChanges.push(
                `${transitiveOnly.length} transitive dependent(s): ${transitiveOnly.join(', ')}`
              );
            }
          }

          if (analysis.totalDeclaredDeps > 0) {
            predictedChanges.push(`${analysis.totalDeclaredDeps} declared dependencies in package`);
          }
        }

        // Risk assessment based on downstream impact
        if (blastRadius > 10) {
          riskLevel = 'high';
        } else if (blastRadius > 3) {
          riskLevel = 'medium';
        }
      }

      return {
        predictedChanges,
        blastRadius,
        riskLevel,
        details,
        simulatorId: 'dependency-graph-simulator',
        durationMs: Date.now() - start,
      };
    },
  };
}
