// Worktree-aware repository root resolution.
// In a git worktree, process.cwd() returns the worktree path, not the main repo root.
// This utility resolves the main repo root so governance paths (policy, storage, hooks)
// are consistent across all worktrees.

import { execSync } from 'node:child_process';

let _cachedMainRoot: string | null | undefined; // undefined = not yet computed

/**
 * Returns the main git repository root, resolving through worktrees.
 * In a worktree, this returns the main repo root (not the worktree root).
 * Falls back to process.cwd() if not in a git repo or git is unavailable.
 * Result is cached per-process.
 */
export function resolveMainRepoRoot(): string {
  if (_cachedMainRoot !== undefined) return _cachedMainRoot ?? process.cwd();

  try {
    // `git worktree list --porcelain` always lists the main worktree first
    const output = execSync('git worktree list --porcelain', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 3000,
    });
    const firstLine = output.split('\n')[0];
    if (firstLine?.startsWith('worktree ')) {
      _cachedMainRoot = firstLine.slice('worktree '.length).trim();
      return _cachedMainRoot;
    }
  } catch {
    // Not in a git repo, or git not available
  }

  _cachedMainRoot = null;
  return process.cwd();
}

/**
 * Returns true if the current working directory is a git worktree
 * (not the main repository checkout).
 */
export function isWorktree(): boolean {
  try {
    const toplevel = execSync('git rev-parse --show-toplevel', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 3000,
    }).trim();
    return toplevel !== resolveMainRepoRoot();
  } catch {
    return false;
  }
}

/** Reset the cached root (for testing). */
export function _resetRepoRootCache(): void {
  _cachedMainRoot = undefined;
}
