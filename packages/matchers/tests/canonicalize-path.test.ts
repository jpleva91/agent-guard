import { describe, it, expect } from 'vitest';
import { canonicalizePath } from '../src/canonicalize-path.js';

describe('canonicalizePath', () => {
  it('passes through simple relative paths unchanged', () => {
    expect(canonicalizePath('src/foo.ts')).toBe('src/foo.ts');
    expect(canonicalizePath('README.md')).toBe('README.md');
  });

  it('normalizes backslashes to forward slashes', () => {
    expect(canonicalizePath('src\\foo\\bar.ts')).toBe('src/foo/bar.ts');
  });

  it('collapses multiple consecutive slashes', () => {
    expect(canonicalizePath('src//foo///bar.ts')).toBe('src/foo/bar.ts');
  });

  it('resolves . segments', () => {
    expect(canonicalizePath('src/./foo.ts')).toBe('src/foo.ts');
    expect(canonicalizePath('./src/foo.ts')).toBe('src/foo.ts');
  });

  it('resolves .. segments within project boundary', () => {
    expect(canonicalizePath('src/nested/../foo.ts')).toBe('src/foo.ts');
    expect(canonicalizePath('a/b/c/../../d.ts')).toBe('a/d.ts');
  });

  it('returns empty string for traversal that escapes project root', () => {
    expect(canonicalizePath('../etc/passwd')).toBe('');
    expect(canonicalizePath('../../etc/shadow')).toBe('');
    expect(canonicalizePath('src/../../etc/passwd')).toBe('');
    expect(canonicalizePath('..')).toBe('');
  });

  it('decodes URL-encoded characters', () => {
    expect(canonicalizePath('src/%66oo.ts')).toBe('src/foo.ts');
    expect(canonicalizePath('config%2Eenv')).toBe('config.env');
  });

  it('decodes and blocks URL-encoded traversal that escapes root', () => {
    // %2e%2e = ..  — decodes then resolves
    expect(canonicalizePath('%2e%2e/etc/passwd')).toBe('');
    // src/../etc/passwd resolves to etc/passwd (still within root)
    expect(canonicalizePath('src/%2e%2e/etc/passwd')).toBe('etc/passwd');
    // src/../../etc/passwd escapes root
    expect(canonicalizePath('src/%2e%2e/%2e%2e/etc/passwd')).toBe('');
  });

  it('rejects paths with null bytes', () => {
    expect(canonicalizePath('src/foo.ts\0')).toBe('');
    expect(canonicalizePath('src/\0../etc/passwd')).toBe('');
    expect(canonicalizePath('\0')).toBe('');
  });

  it('rejects URL-encoded null bytes (%00)', () => {
    // %00 decodes to \0 — must be caught after URL decoding
    expect(canonicalizePath('src/%00')).toBe('');
    expect(canonicalizePath('src/%00../etc/passwd')).toBe('');
    expect(canonicalizePath('%00')).toBe('');
    expect(canonicalizePath('a/b/%00/c')).toBe('');
  });

  it('strips leading / for consistent relative paths', () => {
    expect(canonicalizePath('/src/foo.ts')).toBe('src/foo.ts');
  });

  it('handles invalid percent-encoding gracefully', () => {
    // Invalid %XX sequences — should use raw string
    expect(canonicalizePath('src/%ZZfoo.ts')).toBe('src/%ZZfoo.ts');
  });

  it('handles empty string', () => {
    expect(canonicalizePath('')).toBe('');
  });

  it('handles dotfiles correctly', () => {
    expect(canonicalizePath('.env')).toBe('.env');
    expect(canonicalizePath('.gitignore')).toBe('.gitignore');
    expect(canonicalizePath('src/.hidden/file')).toBe('src/.hidden/file');
  });
});
