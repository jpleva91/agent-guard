import { describe, it, expect } from 'vitest';
import { createKernel } from '@red-codes/kernel';
import type {
  RunManifest,
  CapabilityGrant,
  ScopeRestriction,
  PermissionLevel,
} from '@red-codes/core';

describe('RunManifest', () => {
  describe('type structure', () => {
    it('constructs a valid RunManifest with all required fields', () => {
      const manifest: RunManifest = {
        sessionId: 'session_001',
        role: 'builder',
        grants: [
          {
            permissions: ['read', 'write'],
            actions: ['file.read', 'file.write'],
            filePatterns: ['src/**/*.ts'],
          },
        ],
        scope: {
          allowedPaths: ['src/**', 'tests/**'],
        },
      };

      expect(manifest.sessionId).toBe('session_001');
      expect(manifest.role).toBe('builder');
      expect(manifest.grants).toHaveLength(1);
      expect(manifest.scope.allowedPaths).toEqual(['src/**', 'tests/**']);
    });

    it('supports all permission levels', () => {
      const levels: PermissionLevel[] = ['read', 'write', 'execute', 'deploy'];
      const grant: CapabilityGrant = {
        permissions: levels,
        actions: ['*'],
      };

      expect(grant.permissions).toHaveLength(4);
      expect(grant.permissions).toContain('read');
      expect(grant.permissions).toContain('deploy');
    });

    it('supports all agent roles', () => {
      const roles = ['architect', 'builder', 'tester', 'optimizer', 'auditor'] as const;
      for (const role of roles) {
        const manifest: RunManifest = {
          sessionId: `session_${role}`,
          role,
          grants: [],
          scope: { allowedPaths: [] },
        };
        expect(manifest.role).toBe(role);
      }
    });

    it('supports optional fields', () => {
      const manifest: RunManifest = {
        sessionId: 'session_full',
        role: 'tester',
        grants: [],
        scope: { allowedPaths: ['tests/**'] },
        description: 'Test-only session for unit tests',
        maxDurationMs: 300_000,
        metadata: { triggeredBy: 'ci', prNumber: 42 },
      };

      expect(manifest.description).toBe('Test-only session for unit tests');
      expect(manifest.maxDurationMs).toBe(300_000);
      expect(manifest.metadata).toEqual({ triggeredBy: 'ci', prNumber: 42 });
    });
  });

  describe('CapabilityGrant', () => {
    it('supports glob patterns in actions', () => {
      const grant: CapabilityGrant = {
        permissions: ['read'],
        actions: ['file.*', 'git.diff'],
      };

      expect(grant.actions).toContain('file.*');
      expect(grant.actions).toContain('git.diff');
    });

    it('supports optional scope restrictions on grants', () => {
      const grant: CapabilityGrant = {
        permissions: ['read', 'write'],
        actions: ['file.write'],
        filePatterns: ['src/**/*.ts', '!src/kernel/**'],
        branchPatterns: ['feature/*', 'agent/*'],
        commandAllowlist: ['pnpm test', 'pnpm build'],
      };

      expect(grant.filePatterns).toHaveLength(2);
      expect(grant.branchPatterns).toHaveLength(2);
      expect(grant.commandAllowlist).toHaveLength(2);
    });

    it('works without optional fields', () => {
      const grant: CapabilityGrant = {
        permissions: ['read'],
        actions: ['file.read'],
      };

      expect(grant.filePatterns).toBeUndefined();
      expect(grant.branchPatterns).toBeUndefined();
      expect(grant.commandAllowlist).toBeUndefined();
    });
  });

  describe('ScopeRestriction', () => {
    it('supports deny-override pattern', () => {
      const scope: ScopeRestriction = {
        allowedPaths: ['src/**'],
        deniedPaths: ['src/kernel/**', 'src/policy/**'],
        allowedBranches: ['feature/*'],
        deniedBranches: ['main', 'release/*'],
        allowedCommands: ['pnpm test', 'pnpm build'],
        maxBlastRadius: 10,
      };

      expect(scope.allowedPaths).toContain('src/**');
      expect(scope.deniedPaths).toContain('src/kernel/**');
      expect(scope.maxBlastRadius).toBe(10);
    });

    it('defaults to empty grants when minimal', () => {
      const scope: ScopeRestriction = {
        allowedPaths: [],
      };

      expect(scope.allowedPaths).toHaveLength(0);
      expect(scope.deniedPaths).toBeUndefined();
      expect(scope.allowedBranches).toBeUndefined();
    });
  });

  describe('kernel integration', () => {
    it('kernel accepts manifest in config', () => {
      const manifest: RunManifest = {
        sessionId: 'test_session',
        role: 'builder',
        grants: [
          {
            permissions: ['read', 'write'],
            actions: ['file.*'],
            filePatterns: ['src/**'],
          },
        ],
        scope: {
          allowedPaths: ['src/**', 'tests/**'],
          deniedPaths: ['src/kernel/**'],
          maxBlastRadius: 15,
        },
        description: 'Builder session for feature implementation',
      };

      const kernel = createKernel({ manifest, dryRun: true });
      expect(kernel.getManifest()).toEqual(manifest);
      kernel.shutdown();
    });

    it('kernel returns null manifest when none provided', () => {
      const kernel = createKernel({ dryRun: true });
      expect(kernel.getManifest()).toBeNull();
      kernel.shutdown();
    });

    it('manifest is accessible after kernel creation', () => {
      const manifest: RunManifest = {
        sessionId: 'persist_test',
        role: 'auditor',
        grants: [],
        scope: { allowedPaths: ['**'] },
      };

      const kernel = createKernel({ manifest, dryRun: true });
      const retrieved = kernel.getManifest();
      expect(retrieved).not.toBeNull();
      expect(retrieved!.sessionId).toBe('persist_test');
      expect(retrieved!.role).toBe('auditor');
      kernel.shutdown();
    });
  });
});
