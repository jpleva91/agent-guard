// Tests for capability grant resolver
import { describe, it, expect } from 'vitest';
import { resolveCapabilityGrant } from '@red-codes/core';
import type { RunManifest, CapabilityGrant } from '@red-codes/core';

function makeGrant(overrides: Partial<CapabilityGrant> = {}): CapabilityGrant {
  return {
    permissions: ['read', 'write'],
    actions: ['file.*'],
    ...overrides,
  };
}

function makeManifest(grants: CapabilityGrant[]): RunManifest {
  return {
    sessionId: 'session_test',
    role: 'builder',
    grants,
    scope: { allowedPaths: ['**'] },
  };
}

describe('resolveCapabilityGrant', () => {
  it('returns null when manifest is null', () => {
    expect(resolveCapabilityGrant(null, 'file.read')).toBeNull();
  });

  it('returns null when manifest is undefined', () => {
    expect(resolveCapabilityGrant(undefined, 'file.read')).toBeNull();
  });

  it('returns null when manifest has no grants', () => {
    const manifest = makeManifest([]);
    expect(resolveCapabilityGrant(manifest, 'file.read')).toBeNull();
  });

  it('matches exact action type', () => {
    const grant = makeGrant({ actions: ['file.read'] });
    const manifest = makeManifest([grant]);

    const result = resolveCapabilityGrant(manifest, 'file.read');
    expect(result).not.toBeNull();
    expect(result!.grantIndex).toBe(0);
    expect(result!.grant).toBe(grant);
  });

  it('does not match different action type with exact pattern', () => {
    const grant = makeGrant({ actions: ['file.read'] });
    const manifest = makeManifest([grant]);

    expect(resolveCapabilityGrant(manifest, 'file.write')).toBeNull();
  });

  it('matches wildcard action pattern', () => {
    const grant = makeGrant({ actions: ['*'] });
    const manifest = makeManifest([grant]);

    expect(resolveCapabilityGrant(manifest, 'file.read')).not.toBeNull();
    expect(resolveCapabilityGrant(manifest, 'git.push')).not.toBeNull();
    expect(resolveCapabilityGrant(manifest, 'shell.exec')).not.toBeNull();
  });

  it('matches prefix glob action pattern (file.*)', () => {
    const grant = makeGrant({ actions: ['file.*'] });
    const manifest = makeManifest([grant]);

    expect(resolveCapabilityGrant(manifest, 'file.read')).not.toBeNull();
    expect(resolveCapabilityGrant(manifest, 'file.write')).not.toBeNull();
    expect(resolveCapabilityGrant(manifest, 'file.delete')).not.toBeNull();
    expect(resolveCapabilityGrant(manifest, 'git.push')).toBeNull();
  });

  it('matches git.* pattern', () => {
    const grant = makeGrant({ actions: ['git.*'] });
    const manifest = makeManifest([grant]);

    expect(resolveCapabilityGrant(manifest, 'git.commit')).not.toBeNull();
    expect(resolveCapabilityGrant(manifest, 'git.push')).not.toBeNull();
    expect(resolveCapabilityGrant(manifest, 'file.read')).toBeNull();
  });

  it('returns first matching grant (declaration order)', () => {
    const grant0 = makeGrant({ actions: ['file.read'], permissions: ['read'] });
    const grant1 = makeGrant({ actions: ['file.*'], permissions: ['read', 'write'] });
    const manifest = makeManifest([grant0, grant1]);

    const result = resolveCapabilityGrant(manifest, 'file.read');
    expect(result!.grantIndex).toBe(0);
    expect(result!.grant).toBe(grant0);
  });

  it('falls through to second grant when first does not match', () => {
    const grant0 = makeGrant({ actions: ['git.*'] });
    const grant1 = makeGrant({ actions: ['file.*'] });
    const manifest = makeManifest([grant0, grant1]);

    const result = resolveCapabilityGrant(manifest, 'file.read');
    expect(result!.grantIndex).toBe(1);
    expect(result!.grant).toBe(grant1);
  });

  describe('file pattern matching', () => {
    it('matches when no file patterns specified (action-only grant)', () => {
      const grant = makeGrant({ actions: ['file.*'] });
      const manifest = makeManifest([grant]);

      const result = resolveCapabilityGrant(manifest, 'file.write', 'src/kernel/kernel.ts');
      expect(result).not.toBeNull();
    });

    it('matches directory glob pattern (src/**)', () => {
      const grant = makeGrant({ actions: ['file.*'], filePatterns: ['src/**'] });
      const manifest = makeManifest([grant]);

      expect(resolveCapabilityGrant(manifest, 'file.write', 'src/index.ts')).not.toBeNull();
      expect(resolveCapabilityGrant(manifest, 'file.write', 'src/deep/nested.ts')).not.toBeNull();
      expect(resolveCapabilityGrant(manifest, 'file.write', 'tests/foo.ts')).toBeNull();
    });

    it('matches exact directory (src/**) includes directory itself', () => {
      const grant = makeGrant({ actions: ['file.*'], filePatterns: ['src/**'] });
      const manifest = makeManifest([grant]);

      expect(resolveCapabilityGrant(manifest, 'file.write', 'src')).not.toBeNull();
    });

    it('matches wildcard file pattern (*)', () => {
      const grant = makeGrant({ actions: ['file.*'], filePatterns: ['*'] });
      const manifest = makeManifest([grant]);

      expect(resolveCapabilityGrant(manifest, 'file.write', 'anything.ts')).not.toBeNull();
    });

    it('matches double-wildcard file pattern (**)', () => {
      const grant = makeGrant({ actions: ['file.*'], filePatterns: ['**'] });
      const manifest = makeManifest([grant]);

      expect(resolveCapabilityGrant(manifest, 'file.write', 'any/deep/path.ts')).not.toBeNull();
    });

    it('matches **/* pattern', () => {
      const grant = makeGrant({ actions: ['file.*'], filePatterns: ['**/*'] });
      const manifest = makeManifest([grant]);

      expect(resolveCapabilityGrant(manifest, 'file.write', 'any/path.ts')).not.toBeNull();
    });

    it('rejects target not matching file patterns', () => {
      const grant = makeGrant({ actions: ['file.*'], filePatterns: ['src/**'] });
      const manifest = makeManifest([grant]);

      expect(resolveCapabilityGrant(manifest, 'file.write', 'dist/output.js')).toBeNull();
    });

    it('skips file pattern check when no target provided', () => {
      const grant = makeGrant({ actions: ['file.*'], filePatterns: ['src/**'] });
      const manifest = makeManifest([grant]);

      // No target means file patterns are not checked (action-only matching)
      expect(resolveCapabilityGrant(manifest, 'file.write')).not.toBeNull();
    });

    it('does not match file-scoped grant when target is empty string', () => {
      const manifest = makeManifest([
        makeGrant({ actions: ['file.write'], filePatterns: ['src/**'] }),
      ]);
      const result = resolveCapabilityGrant(manifest, 'file.write', '');
      expect(result).toBeNull();
    });
  });

  describe('multiple action patterns in a single grant', () => {
    it('matches any pattern in the grant', () => {
      const grant = makeGrant({ actions: ['file.read', 'git.diff', 'test.*'] });
      const manifest = makeManifest([grant]);

      expect(resolveCapabilityGrant(manifest, 'file.read')).not.toBeNull();
      expect(resolveCapabilityGrant(manifest, 'git.diff')).not.toBeNull();
      expect(resolveCapabilityGrant(manifest, 'test.run')).not.toBeNull();
      expect(resolveCapabilityGrant(manifest, 'file.write')).toBeNull();
    });
  });
});
