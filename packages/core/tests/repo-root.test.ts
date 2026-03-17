import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isAbsolute } from 'node:path';
import { resolveMainRepoRoot, isWorktree, _resetRepoRootCache } from '../src/repo-root.js';

beforeEach(() => {
  _resetRepoRootCache();
});

describe('resolveMainRepoRoot', () => {
  it('returns a non-empty string', () => {
    const result = resolveMainRepoRoot();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns the same value on subsequent calls (caching)', () => {
    const first = resolveMainRepoRoot();
    const second = resolveMainRepoRoot();
    expect(first).toBe(second);
  });

  it('returns an absolute path', () => {
    const result = resolveMainRepoRoot();
    expect(isAbsolute(result)).toBe(true);
  });

  it('cache can be reset', () => {
    const first = resolveMainRepoRoot();
    _resetRepoRootCache();
    const second = resolveMainRepoRoot();
    // Should still be the same value (same repo), but cache was cleared
    expect(first).toBe(second);
  });
});

describe('isWorktree', () => {
  it('returns a boolean', () => {
    const result = isWorktree();
    expect(typeof result).toBe('boolean');
  });

  it('returns false in the main repo checkout', () => {
    // This test runs in the main repo, so it should return false
    expect(isWorktree()).toBe(false);
  });
});
