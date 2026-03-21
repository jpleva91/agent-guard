// File operation adapter — executes file.read, file.write, file.delete actions.
// Node.js adapter. Uses fs APIs.

import { readFile, writeFile, unlink, rename } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import type { CanonicalAction } from '@red-codes/core';

const PROJECT_ROOT = process.cwd();

/**
 * Validates that a path resolves within the project root boundary.
 * Decodes URL-encoded characters first to prevent encoded traversal attacks.
 * Throws if the resolved path escapes the project root.
 * Returns the resolved absolute path on success.
 */
function assertWithinBoundary(target: string): string {
  // Decode any URL-encoded characters (e.g. %2e%2e → ..)
  const decoded = decodeURIComponent(target);
  // Resolve to absolute path relative to project root (handles .., symlinks, etc.)
  const resolved = resolve(PROJECT_ROOT, decoded);
  // Compute relative path from project root to the resolved path
  const rel = relative(PROJECT_ROOT, resolved);
  // If rel starts with '..' or is absolute, the path escapes the boundary
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(
      `Path traversal blocked: "${target}" resolves outside project boundary`
    );
  }
  return resolved;
}

export async function fileAdapter(action: CanonicalAction): Promise<unknown> {
  const target = action.target;

  switch (action.type) {
    case 'file.read': {
      const safePath = assertWithinBoundary(target);
      const content = await readFile(safePath, 'utf8');
      return { path: target, size: content.length };
    }

    case 'file.write': {
      const content = (action as Record<string, unknown>).content as string | undefined;
      if (content === undefined) {
        throw new Error('file.write requires content');
      }
      const safePath = assertWithinBoundary(target);
      await writeFile(safePath, content, 'utf8');
      return { path: target, written: content.length };
    }

    case 'file.delete': {
      const safePath = assertWithinBoundary(target);
      await unlink(safePath);
      return { path: target, deleted: true };
    }

    case 'file.move': {
      const destination = (action as Record<string, unknown>).destination as string | undefined;
      if (!destination) {
        throw new Error('file.move requires destination');
      }
      const safeSrc = assertWithinBoundary(target);
      const safeDst = assertWithinBoundary(destination);
      await rename(safeSrc, safeDst);
      return { from: target, to: destination };
    }

    default:
      throw new Error(`Unsupported file action: ${action.type}`);
  }
}
