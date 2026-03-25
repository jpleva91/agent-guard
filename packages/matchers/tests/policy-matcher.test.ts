import { describe, it, expect } from 'vitest';
import { PolicyMatcher } from '../src/policy-matcher.js';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PolicyMatcher', () => {
  // ─── matchAction ──────────────────────────────────────────────────────────

  describe('matchAction', () => {
    it('matches exact action strings', () => {
      expect(PolicyMatcher.matchAction('git.push', 'git.push')).toBe(true);
      expect(PolicyMatcher.matchAction('file.write', 'file.write')).toBe(true);
    });

    it('wildcard * matches everything', () => {
      expect(PolicyMatcher.matchAction('*', 'git.push')).toBe(true);
      expect(PolicyMatcher.matchAction('*', 'file.write')).toBe(true);
      expect(PolicyMatcher.matchAction('*', 'shell.exec')).toBe(true);
    });

    it('namespace wildcard git.* matches git actions', () => {
      expect(PolicyMatcher.matchAction('git.*', 'git.push')).toBe(true);
      expect(PolicyMatcher.matchAction('git.*', 'git.commit')).toBe(true);
      expect(PolicyMatcher.matchAction('git.*', 'git.branch.create')).toBe(true);
    });

    it('namespace wildcard does not match other namespaces', () => {
      expect(PolicyMatcher.matchAction('git.*', 'file.write')).toBe(false);
      expect(PolicyMatcher.matchAction('git.*', 'shell.exec')).toBe(false);
    });

    it('does not match non-matching exact actions', () => {
      expect(PolicyMatcher.matchAction('git.push', 'git.commit')).toBe(false);
      expect(PolicyMatcher.matchAction('file.read', 'file.write')).toBe(false);
    });

    it('namespace wildcard file.* matches file actions', () => {
      expect(PolicyMatcher.matchAction('file.*', 'file.read')).toBe(true);
      expect(PolicyMatcher.matchAction('file.*', 'file.write')).toBe(true);
      expect(PolicyMatcher.matchAction('file.*', 'file.delete')).toBe(true);
    });
  });

  // ─── matchScope ──────────────────────────────────────────────────────────

  describe('matchScope', () => {
    it('empty scope returns true (no constraint)', () => {
      expect(PolicyMatcher.matchScope([], 'src/foo.ts')).toBe(true);
      expect(PolicyMatcher.matchScope([], 'anything')).toBe(true);
    });

    it('empty target returns false', () => {
      expect(PolicyMatcher.matchScope(['src/**'], '')).toBe(false);
    });

    it('exact path match', () => {
      expect(PolicyMatcher.matchScope(['src/foo.ts'], 'src/foo.ts')).toBe(true);
    });

    it('glob src/** matches files under src', () => {
      expect(PolicyMatcher.matchScope(['src/**'], 'src/foo.ts')).toBe(true);
      expect(PolicyMatcher.matchScope(['src/**'], 'src/nested/bar.ts')).toBe(true);
    });

    it('glob src/** does not match outside src', () => {
      expect(PolicyMatcher.matchScope(['src/**'], 'lib/foo.ts')).toBe(false);
    });

    it('extension glob *.md matches markdown files', () => {
      expect(PolicyMatcher.matchScope(['**/*.md'], 'docs/README.md')).toBe(true);
      expect(PolicyMatcher.matchScope(['**/*.md'], 'CHANGELOG.md')).toBe(true);
    });

    it('extension glob *.md does not match non-markdown', () => {
      expect(PolicyMatcher.matchScope(['**/*.md'], 'src/index.ts')).toBe(false);
    });

    it('directory prefix src/ matches files under src', () => {
      expect(PolicyMatcher.matchScope(['src/'], 'src/foo.ts')).toBe(true);
      expect(PolicyMatcher.matchScope(['src/'], 'src/nested/bar.ts')).toBe(true);
    });

    it('directory prefix does not match outside directory', () => {
      expect(PolicyMatcher.matchScope(['src/'], 'lib/foo.ts')).toBe(false);
    });

    it('wildcard * matches everything', () => {
      expect(PolicyMatcher.matchScope(['*'], 'anything.ts')).toBe(true);
      expect(PolicyMatcher.matchScope(['*'], 'deep/path/file.ts')).toBe(true);
    });

    it('returns false when no patterns match', () => {
      expect(PolicyMatcher.matchScope(['test/**'], 'src/foo.ts')).toBe(false);
    });

    it('normalizes backslashes in target', () => {
      expect(PolicyMatcher.matchScope(['src/**'], 'src\\foo.ts')).toBe(true);
      expect(PolicyMatcher.matchScope(['src/'], 'src\\nested\\bar.ts')).toBe(true);
    });

    it('normalizes backslashes in patterns', () => {
      expect(PolicyMatcher.matchScope(['src\\**'], 'src/foo.ts')).toBe(true);
    });

    it('matches dotfiles with dot option', () => {
      expect(PolicyMatcher.matchScope(['**'], '.env')).toBe(true);
      expect(PolicyMatcher.matchScope(['**/*'], '.gitignore')).toBe(true);
    });

    it('matches any of multiple scope patterns', () => {
      const patterns = ['src/**', 'test/**'];
      expect(PolicyMatcher.matchScope(patterns, 'src/foo.ts')).toBe(true);
      expect(PolicyMatcher.matchScope(patterns, 'test/bar.test.ts')).toBe(true);
      expect(PolicyMatcher.matchScope(patterns, 'lib/baz.ts')).toBe(false);
    });

    // ─── Path traversal hardening (issue #640) ──────────────────────────

    it('blocks path traversal via .. segments', () => {
      // src/../etc/passwd resolves to etc/passwd — does NOT match src/ scope
      expect(PolicyMatcher.matchScope(['src/'], 'src/../etc/passwd')).toBe(false);
      // Direct traversal out of project root — rejected entirely
      expect(PolicyMatcher.matchScope(['src/**'], '../../../etc/passwd')).toBe(false);
    });

    it('blocks URL-encoded traversal', () => {
      // src/%2e%2e/etc/passwd decodes to src/../etc/passwd → etc/passwd — not under src/
      expect(PolicyMatcher.matchScope(['src/'], 'src/%2e%2e/etc/passwd')).toBe(false);
      // Traversal that escapes project root — rejected entirely
      expect(PolicyMatcher.matchScope(['src/**'], '%2e%2e/%2e%2e/etc/passwd')).toBe(false);
    });

    it('blocks null bytes in paths', () => {
      expect(PolicyMatcher.matchScope(['src/**'], 'src/foo.ts\0.jpg')).toBe(false);
      expect(PolicyMatcher.matchScope(['src/'], 'src/\0../etc/passwd')).toBe(false);
    });

    it('collapses multiple slashes', () => {
      // src//foo.ts should match src/ scope after collapsing
      expect(PolicyMatcher.matchScope(['src/'], 'src//foo.ts')).toBe(true);
      expect(PolicyMatcher.matchScope(['src/**'], 'src///nested///bar.ts')).toBe(true);
    });

    it('resolves dot segments in paths', () => {
      // src/./foo.ts should match src/ scope
      expect(PolicyMatcher.matchScope(['src/'], 'src/./foo.ts')).toBe(true);
      // src/nested/../foo.ts resolves to src/foo.ts
      expect(PolicyMatcher.matchScope(['src/'], 'src/nested/../foo.ts')).toBe(true);
    });

    it('strips leading ./ from targets', () => {
      expect(PolicyMatcher.matchScope(['src/'], './src/foo.ts')).toBe(true);
    });

    it('handles URL-encoded extension bypass', () => {
      // *.env pattern should catch %2Eenv after decoding
      expect(PolicyMatcher.matchScope(['*.env'], 'config%2Eenv')).toBe(true);
    });

    it('rejects pure traversal paths', () => {
      expect(PolicyMatcher.matchScope(['*'], '..')).toBe(false);
      expect(PolicyMatcher.matchScope(['**'], '../..')).toBe(false);
    });
  });

  // ─── toSet ──────────────────────────────────────────────────────────────

  describe('toSet', () => {
    it('creates a Set from an array', () => {
      const set = PolicyMatcher.toSet(['a', 'b', 'c']);
      expect(set).toBeInstanceOf(Set);
      expect(set.size).toBe(3);
    });

    it('has() returns true for present items', () => {
      const set = PolicyMatcher.toSet(['git.push', 'file.write', 'shell.exec']);
      expect(set.has('git.push')).toBe(true);
      expect(set.has('file.write')).toBe(true);
      expect(set.has('shell.exec')).toBe(true);
    });

    it('has() returns false for missing items', () => {
      const set = PolicyMatcher.toSet(['git.push', 'file.write']);
      expect(set.has('git.commit')).toBe(false);
      expect(set.has('deploy.trigger')).toBe(false);
    });

    it('deduplicates items', () => {
      const set = PolicyMatcher.toSet(['a', 'b', 'a', 'c', 'b']);
      expect(set.size).toBe(3);
    });

    it('handles empty arrays', () => {
      const set = PolicyMatcher.toSet([]);
      expect(set.size).toBe(0);
      expect(set.has('anything')).toBe(false);
    });
  });
});
