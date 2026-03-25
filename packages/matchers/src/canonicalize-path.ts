import { posix } from 'node:path';

/**
 * Canonicalize a file path for secure scope matching.
 *
 * Applies the following transformations in order:
 * 1. Reject null bytes (path injection)
 * 2. Decode URL-encoded characters (%2e, %2f, etc.)
 * 3. Normalize path separators (backslash → forward slash)
 * 4. Collapse multiple consecutive slashes
 * 5. Resolve `.` and `..` segments via POSIX normalize
 * 6. Strip leading `./`
 * 7. Reject paths that escape the project root (leading `..`)
 *
 * This function is pure (no I/O) and does not resolve symlinks.
 * Symlink resolution is an execution-time concern handled by adapters.
 */
export function canonicalizePath(filePath: string): string {
  // Guard: empty input has no canonical form
  if (filePath === '') {
    return '';
  }

  // 1. Reject null bytes — these can truncate paths in C-level APIs
  if (filePath.includes('\0')) {
    return '';
  }

  // 2. Decode URL-encoded characters (e.g. %2e%2e → .., %2f → /)
  let p: string;
  try {
    p = decodeURIComponent(filePath);
  } catch {
    // Invalid percent-encoding — use the raw string
    p = filePath;
  }

  // 2a. Re-check for null bytes introduced by URL decoding (e.g. %00)
  if (p.includes('\0')) {
    return '';
  }

  // 3. Normalize path separators (Windows backslash → forward slash)
  p = p.replace(/\\/g, '/');

  // 4. Collapse multiple consecutive slashes (e.g. src//foo → src/foo)
  p = p.replace(/\/{2,}/g, '/');

  // 5. Resolve `.` and `..` segments via POSIX path normalization
  p = posix.normalize(p);

  // 6. Strip leading `./` (POSIX normalize may produce it)
  if (p.startsWith('./')) {
    p = p.slice(2);
  }

  // 7. Reject paths that escape the project root (start with `..`)
  //    These would bypass any scope constraint.
  if (p === '..' || p.startsWith('../')) {
    return '';
  }

  // Strip leading `/` for consistent relative paths
  if (p.startsWith('/')) {
    p = p.slice(1);
  }

  return p;
}
