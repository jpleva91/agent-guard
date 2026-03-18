// Tests for policy pack versioning — semver parsing, range checking, compatibility
import { describe, it, expect } from 'vitest';
import {
  parseSemver,
  compareSemver,
  satisfiesRange,
  checkCompatibility,
  parsePackReference,
} from '@red-codes/policy';

// ---------------------------------------------------------------------------
// parseSemver
// ---------------------------------------------------------------------------

describe('parseSemver', () => {
  it('parses valid semver string', () => {
    expect(parseSemver('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
  });

  it('parses zero version', () => {
    expect(parseSemver('0.0.0')).toEqual({ major: 0, minor: 0, patch: 0 });
  });

  it('parses large version numbers', () => {
    expect(parseSemver('10.20.30')).toEqual({ major: 10, minor: 20, patch: 30 });
  });

  it('returns null for invalid semver', () => {
    expect(parseSemver('1.2')).toBeNull();
    expect(parseSemver('abc')).toBeNull();
    expect(parseSemver('')).toBeNull();
    expect(parseSemver('1.2.3.4')).toBeNull();
    expect(parseSemver('v1.2.3')).toBeNull();
  });

  it('trims whitespace', () => {
    expect(parseSemver('  1.2.3  ')).toEqual({ major: 1, minor: 2, patch: 3 });
  });
});

// ---------------------------------------------------------------------------
// compareSemver
// ---------------------------------------------------------------------------

describe('compareSemver', () => {
  it('returns 0 for equal versions', () => {
    expect(compareSemver({ major: 1, minor: 2, patch: 3 }, { major: 1, minor: 2, patch: 3 })).toBe(
      0,
    );
  });

  it('compares by major version', () => {
    expect(compareSemver({ major: 2, minor: 0, patch: 0 }, { major: 1, minor: 9, patch: 9 })).toBe(
      1,
    );
    expect(compareSemver({ major: 1, minor: 0, patch: 0 }, { major: 2, minor: 0, patch: 0 })).toBe(
      -1,
    );
  });

  it('compares by minor version when major is equal', () => {
    expect(compareSemver({ major: 1, minor: 3, patch: 0 }, { major: 1, minor: 2, patch: 9 })).toBe(
      1,
    );
  });

  it('compares by patch when major and minor are equal', () => {
    expect(compareSemver({ major: 1, minor: 2, patch: 4 }, { major: 1, minor: 2, patch: 3 })).toBe(
      1,
    );
  });
});

// ---------------------------------------------------------------------------
// satisfiesRange
// ---------------------------------------------------------------------------

describe('satisfiesRange', () => {
  describe('exact match', () => {
    it('matches exact version', () => {
      expect(satisfiesRange('1.2.3', '1.2.3')).toBe(true);
    });

    it('rejects different version', () => {
      expect(satisfiesRange('1.2.4', '1.2.3')).toBe(false);
    });
  });

  describe('>= range', () => {
    it('matches equal version', () => {
      expect(satisfiesRange('2.0.0', '>=2.0.0')).toBe(true);
    });

    it('matches higher version', () => {
      expect(satisfiesRange('2.1.0', '>=2.0.0')).toBe(true);
      expect(satisfiesRange('3.0.0', '>=2.0.0')).toBe(true);
    });

    it('rejects lower version', () => {
      expect(satisfiesRange('1.9.9', '>=2.0.0')).toBe(false);
    });
  });

  describe('^ caret range', () => {
    it('matches same major with higher minor', () => {
      expect(satisfiesRange('1.3.0', '^1.2.0')).toBe(true);
    });

    it('matches same major.minor with higher patch', () => {
      expect(satisfiesRange('1.2.5', '^1.2.3')).toBe(true);
    });

    it('matches exact', () => {
      expect(satisfiesRange('1.2.3', '^1.2.3')).toBe(true);
    });

    it('rejects different major', () => {
      expect(satisfiesRange('2.0.0', '^1.2.3')).toBe(false);
    });

    it('rejects lower minor', () => {
      expect(satisfiesRange('1.1.9', '^1.2.0')).toBe(false);
    });

    it('rejects lower patch in same minor', () => {
      expect(satisfiesRange('1.2.2', '^1.2.3')).toBe(false);
    });
  });

  describe('~ tilde range', () => {
    it('matches same major.minor with higher patch', () => {
      expect(satisfiesRange('1.2.5', '~1.2.3')).toBe(true);
    });

    it('matches exact', () => {
      expect(satisfiesRange('1.2.3', '~1.2.3')).toBe(true);
    });

    it('rejects different minor', () => {
      expect(satisfiesRange('1.3.0', '~1.2.3')).toBe(false);
    });

    it('rejects lower patch', () => {
      expect(satisfiesRange('1.2.2', '~1.2.3')).toBe(false);
    });
  });

  describe('invalid inputs', () => {
    it('returns false for unparseable version', () => {
      expect(satisfiesRange('abc', '1.2.3')).toBe(false);
    });

    it('returns false for unparseable range', () => {
      expect(satisfiesRange('1.2.3', 'abc')).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// checkCompatibility
// ---------------------------------------------------------------------------

describe('checkCompatibility', () => {
  it('returns compatible when version satisfies range', () => {
    const result = checkCompatibility('>=2.0.0', '2.2.0');
    expect(result.compatible).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('returns incompatible when version is too low', () => {
    const result = checkCompatibility('>=3.0.0', '2.2.0');
    expect(result.compatible).toBe(false);
    expect(result.reason).toContain('requires AgentGuard >=3.0.0');
    expect(result.reason).toContain('current version is 2.2.0');
  });

  it('returns compatible with graceful fallback for unparseable current version', () => {
    const result = checkCompatibility('>=2.0.0', 'dev-build');
    expect(result.compatible).toBe(true);
  });

  it('checks caret compatibility', () => {
    expect(checkCompatibility('^2.0.0', '2.2.0').compatible).toBe(true);
    expect(checkCompatibility('^2.0.0', '3.0.0').compatible).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parsePackReference
// ---------------------------------------------------------------------------

describe('parsePackReference', () => {
  it('returns ref only for plain reference', () => {
    expect(parsePackReference('./my-pack')).toEqual({ ref: './my-pack' });
  });

  it('parses version constraint with caret', () => {
    expect(parsePackReference('./my-pack@^1.2.0')).toEqual({
      ref: './my-pack',
      versionConstraint: '^1.2.0',
    });
  });

  it('parses version constraint with tilde', () => {
    expect(parsePackReference('./pack@~2.0.0')).toEqual({
      ref: './pack',
      versionConstraint: '~2.0.0',
    });
  });

  it('parses exact version constraint', () => {
    expect(parsePackReference('./pack@1.0.0')).toEqual({
      ref: './pack',
      versionConstraint: '1.0.0',
    });
  });

  it('parses >= version constraint', () => {
    expect(parsePackReference('./pack@>=2.0.0')).toEqual({
      ref: './pack',
      versionConstraint: '>=2.0.0',
    });
  });

  it('handles scoped npm packages without version', () => {
    expect(parsePackReference('@agentguard/security-pack')).toEqual({
      ref: '@agentguard/security-pack',
    });
  });

  it('handles scoped npm packages with version constraint', () => {
    expect(parsePackReference('@agentguard/security-pack@^1.0.0')).toEqual({
      ref: '@agentguard/security-pack',
      versionConstraint: '^1.0.0',
    });
  });
});
