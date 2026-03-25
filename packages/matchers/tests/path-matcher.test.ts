import { describe, it, expect } from 'vitest';
import { PathMatcher } from '../src/path-matcher.js';
import type { PathPatternInput } from '../src/path-matcher.js';

// ─── Sample pattern sets ─────────────────────────────────────────────────────

const ENV_PATTERNS: PathPatternInput[] = [
  { glob: '**/.env', id: 'env-file', description: 'Environment file', severity: 8 },
  { glob: '**/.env.*', id: 'env-variant', description: 'Environment variant file', severity: 8 },
];

const CREDENTIAL_PATTERNS: PathPatternInput[] = [
  {
    glob: '**/credentials.json',
    id: 'credentials-json',
    description: 'Credentials JSON file',
    severity: 9,
  },
  { glob: '**/*.key', id: 'key-file', description: 'Private key file', severity: 10 },
  { glob: '**/.ssh/**', id: 'ssh-dir', description: 'SSH directory file', severity: 10 },
];

const CI_PATTERNS: PathPatternInput[] = [
  {
    glob: '**/.github/workflows/*.yml',
    id: 'github-workflow',
    description: 'GitHub Actions workflow',
    severity: 7,
  },
  {
    glob: '**/.gitlab-ci.yml',
    id: 'gitlab-ci',
    description: 'GitLab CI configuration',
    severity: 7,
  },
];

const ALL_PATTERNS: PathPatternInput[] = [
  ...ENV_PATTERNS,
  ...CREDENTIAL_PATTERNS,
  ...CI_PATTERNS,
];

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('PathMatcher', () => {
  describe('env file matching', () => {
    const matcher = PathMatcher.create(ENV_PATTERNS);

    it('.env at root matches', () => {
      const result = matcher.match('.env');
      expect(result).not.toBeNull();
      expect(result!.patternId).toBe('env-file');
      expect(result!.matchType).toBe('GLOB');
      expect(result!.matched).toBe(true);
    });

    it('.env.local in subdirectory matches', () => {
      const result = matcher.match('config/.env.local');
      expect(result).not.toBeNull();
      expect(result!.patternId).toBe('env-variant');
    });

    it('environment.ts does NOT match env pattern', () => {
      const result = matcher.match('src/environment.ts');
      expect(result).toBeNull();
    });
  });

  describe('credential file matching', () => {
    const matcher = PathMatcher.create(CREDENTIAL_PATTERNS);

    it('credentials.json in subdir matches', () => {
      const result = matcher.match('config/credentials.json');
      expect(result).not.toBeNull();
      expect(result!.patternId).toBe('credentials-json');
      expect(result!.severity).toBe(9);
    });

    it('.key files match', () => {
      const result = matcher.match('certs/server.key');
      expect(result).not.toBeNull();
      expect(result!.patternId).toBe('key-file');
      expect(result!.severity).toBe(10);
    });

    it('.ssh/ directory files match', () => {
      const result = matcher.match('.ssh/id_rsa');
      expect(result).not.toBeNull();
      expect(result!.patternId).toBe('ssh-dir');
    });

    it('normal files do not match', () => {
      expect(matcher.match('src/index.ts')).toBeNull();
      expect(matcher.match('README.md')).toBeNull();
      expect(matcher.match('package.json')).toBeNull();
    });
  });

  describe('CI/CD config matching', () => {
    const matcher = PathMatcher.create(CI_PATTERNS);

    it('.github/workflows/ci.yml matches', () => {
      const result = matcher.match('.github/workflows/ci.yml');
      expect(result).not.toBeNull();
      expect(result!.patternId).toBe('github-workflow');
    });

    it('.gitlab-ci.yml matches', () => {
      const result = matcher.match('.gitlab-ci.yml');
      expect(result).not.toBeNull();
      expect(result!.patternId).toBe('gitlab-ci');
    });

    it('random yaml does not match', () => {
      expect(matcher.match('config/app.yml')).toBeNull();
      expect(matcher.match('docs/guide.yaml')).toBeNull();
    });
  });

  describe('Windows backslash normalization', () => {
    const matcher = PathMatcher.create(ALL_PATTERNS);

    it('backslash paths get normalized and match', () => {
      const result = matcher.match('config\\.env.local');
      expect(result).not.toBeNull();
      expect(result!.patternId).toBe('env-variant');
    });

    it('deep backslash paths get normalized', () => {
      const result = matcher.match('.github\\workflows\\ci.yml');
      expect(result).not.toBeNull();
      expect(result!.patternId).toBe('github-workflow');
    });

    it('.ssh backslash paths get normalized', () => {
      const result = matcher.match('.ssh\\id_rsa');
      expect(result).not.toBeNull();
      expect(result!.patternId).toBe('ssh-dir');
    });
  });

  describe('matchAny', () => {
    const matcher = PathMatcher.create(ALL_PATTERNS);

    it('returns true for matching paths', () => {
      expect(matcher.matchAny('.env')).toBe(true);
      expect(matcher.matchAny('certs/server.key')).toBe(true);
    });

    it('returns false for non-matching paths', () => {
      expect(matcher.matchAny('src/index.ts')).toBe(false);
      expect(matcher.matchAny('README.md')).toBe(false);
    });
  });

  describe('matchAll', () => {
    it('returns multiple results when multiple globs match', () => {
      // A file that matches both env-file AND env-variant won't happen
      // with our patterns, so create overlapping patterns explicitly
      const overlapping: PathPatternInput[] = [
        { glob: '**/.env*', id: 'env-broad', description: 'Broad env match' },
        { glob: '**/.env', id: 'env-exact', description: 'Exact env match' },
      ];
      const matcher = PathMatcher.create(overlapping);

      const results = matcher.matchAll('.env');
      expect(results).toHaveLength(2);
      expect(results.map((r) => r.patternId)).toContain('env-broad');
      expect(results.map((r) => r.patternId)).toContain('env-exact');
    });

    it('returns empty array for non-matching paths', () => {
      const matcher = PathMatcher.create(ALL_PATTERNS);
      expect(matcher.matchAll('src/index.ts')).toEqual([]);
    });

    it('all results have matched: true and matchType: GLOB', () => {
      const matcher = PathMatcher.create(ALL_PATTERNS);
      const results = matcher.matchAll('.env');
      for (const r of results) {
        expect(r.matched).toBe(true);
        expect(r.matchType).toBe('GLOB');
      }
    });
  });

  describe('URL-encoded evasion resistance', () => {
    const matcher = PathMatcher.create(ALL_PATTERNS);

    it('URL-encoded .env path still matches env pattern', () => {
      // %2e = '.' — attacker tries to evade .env detection
      expect(matcher.matchAny('%2eenv')).toBe(true);
      expect(matcher.matchAny('config/%2eenv')).toBe(true);
    });

    it('URL-encoded .key path still matches key pattern', () => {
      // %2e = '.' — attacker tries to evade .key detection
      expect(matcher.matchAny('certs/server%2ekey')).toBe(true);
    });

    it('URL-encoded null byte (%00) does NOT match any pattern', () => {
      // %00 decodes to null byte — canonicalizePath must reject and PathMatcher returns null
      expect(matcher.match('src/%00')).toBeNull();
      expect(matcher.match('src/%00../etc/passwd')).toBeNull();
      expect(matcher.match('%00')).toBeNull();
    });

    it('URL-encoded traversal does not match after resolution', () => {
      // %2e%2e = '..' — traversal attempt, should either resolve within root or be rejected
      expect(matcher.match('src/%2e%2e/%2e%2e/etc/passwd')).toBeNull();
    });
  });

  describe('default severity', () => {
    it('defaults severity to 5 when not specified', () => {
      const matcher = PathMatcher.create([
        { glob: '**/*.log', id: 'log-file', description: 'Log file' },
      ]);
      const result = matcher.match('app.log');
      expect(result).not.toBeNull();
      expect(result!.severity).toBe(5);
    });
  });

  describe('MatchResult structure', () => {
    it('returns well-formed MatchResult', () => {
      const matcher = PathMatcher.create(ENV_PATTERNS);
      const result = matcher.match('.env');
      expect(result).not.toBeNull();
      expect(result).toMatchObject({
        matched: true,
        matchType: 'GLOB',
        patternId: 'env-file',
        description: 'Environment file',
        severity: 8,
      });
      expect(typeof result!.code).toBe('number');
    });
  });
});
