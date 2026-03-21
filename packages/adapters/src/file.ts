// File operation adapter — executes file.read, file.write, file.delete actions.
// Node.js adapter. Uses fs APIs.
// Security: all paths are validated against the project root boundary (#636).

import { readFile, writeFile, unlink, rename } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { realpathSync } from 'node:fs';
import type { CanonicalAction } from '@red-codes/core';

const PROJECT_ROOT = resolve(process.cwd());

/**
 * Fully decodes URL-encoded characters, handling double/triple encoding.
 * Loops until the string is stable (no more encoded sequences).
 */
function fullyDecode(input: string): string {
  let prev = input;
  for (let i = 0; i < 10; i++) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(prev);
    } catch {
      break; // malformed encoding — stop decoding
    }
    if (decoded === prev) break;
    prev = decoded;
  }
  return prev;
}

/**
 * Validates that a path resolves within the project root boundary.
 * Prevents path traversal, null byte injection, URL-encoded escapes,
 * and symlink-based escapes.
 *
 * Returns the resolved absolute path on success.
 * Throws on any escape attempt.
 */
function assertWithinBoundary(target: string): string {
  // 1. Reject null bytes — can truncate paths on some systems
  if (target.includes('\0')) {
    throw new Error(`Path traversal blocked: null byte in path "${target}"`);
  }

  // 2. Fully decode URL-encoded characters (%2e%2e → .., %252e → %2e → .)
  const decoded = fullyDecode(target);

  // 2a. Re-check for null bytes after decoding (%00 / %2500 can decode to \0)
  if (decoded.includes('\0')) {
    throw new Error('Path traversal blocked: null byte in decoded path');
  }

  // 3. Resolve to absolute path relative to project root
  const resolved = resolve(PROJECT_ROOT, decoded);

  // 4. Check lexical boundary (catches ../ and absolute paths)
  const rel = relative(PROJECT_ROOT, resolved);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`Path traversal blocked: "${target}" resolves outside project boundary`);
  }

  // 5. Follow symlinks and re-check boundary
  try {
    const real = realpathSync(resolved);
    const realRel = relative(PROJECT_ROOT, real);
    if (realRel.startsWith('..') || isAbsolute(realRel)) {
      throw new Error(
        `Path traversal blocked: "${target}" resolves outside project boundary (symlink escape)`
      );
    }
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    // Re-throw our own traversal errors immediately
    if (err instanceof Error && /path traversal/i.test(err.message)) {
      throw err;
    }
    // ENOENT is fine — file doesn't exist yet (e.g., file.write to new path).
    // All other errors (EACCES, ELOOP, etc.) mean we cannot verify the path — deny access.
    if (code !== 'ENOENT') {
      throw new Error(`Path traversal blocked: cannot verify "${target}" (${code})`);
    }
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
