import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'ag-trust-'));
  vi.stubEnv('AGENTGUARD_HOME', tempDir);
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(tempDir, { recursive: true, force: true });
});

describe('trust-store', () => {
  async function load() {
    return await import('../src/trust-store.js');
  }

  describe('loadTrustStore', () => {
    it('returns empty store when file does not exist', async () => {
      const { loadTrustStore } = await load();
      const store = loadTrustStore();
      expect(store.version).toBe(1);
      expect(store.entries).toEqual({});
    });

    it('loads existing store from disk', async () => {
      writeFileSync(
        join(tempDir, 'trust.json'),
        JSON.stringify({
          version: 1,
          entries: {
            '/p': { path: '/p', hash: 'abc', trustedAt: '2026-01-01T00:00:00Z', trustedBy: 'user' },
          },
        })
      );
      const { loadTrustStore } = await load();
      expect(loadTrustStore().entries['/p'].hash).toBe('abc');
    });

    it('returns empty store for unrecognized version (fail-closed)', async () => {
      writeFileSync(join(tempDir, 'trust.json'), JSON.stringify({ version: 99, entries: {} }));
      const { loadTrustStore } = await load();
      expect(loadTrustStore().entries).toEqual({});
    });
  });

  describe('saveTrustStore', () => {
    it('persists store to disk', async () => {
      const { saveTrustStore, loadTrustStore } = await load();
      saveTrustStore({
        version: 1,
        entries: {
          '/t': { path: '/t', hash: 'xyz', trustedAt: '2026-01-01T00:00:00Z', trustedBy: 'user' },
        },
      });
      expect(loadTrustStore().entries['/t'].hash).toBe('xyz');
    });
  });

  describe('computeFileHash', () => {
    it('returns SHA-256 hex digest of file contents', async () => {
      const { computeFileHash } = await load();
      const fp = join(tempDir, 'test.txt');
      writeFileSync(fp, 'hello world');
      const hash = await computeFileHash(fp);
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('trustFile / verifyTrust / revokeTrust', () => {
    it('trusts then verifies as trusted', async () => {
      const { trustFile, verifyTrust } = await load();
      const fp = join(tempDir, 'p.yaml');
      writeFileSync(fp, 'rules: []');
      await trustFile(fp);
      expect(await verifyTrust(fp)).toBe('trusted');
    });

    it('detects content change', async () => {
      const { trustFile, verifyTrust } = await load();
      const fp = join(tempDir, 'p.yaml');
      writeFileSync(fp, 'rules: []');
      await trustFile(fp);
      writeFileSync(fp, 'rules: [allow: "*"]');
      expect(await verifyTrust(fp)).toBe('content_changed');
    });

    it('returns untrusted for unknown file', async () => {
      const { verifyTrust } = await load();
      const fp = join(tempDir, 'unknown.yaml');
      writeFileSync(fp, 'data');
      expect(await verifyTrust(fp)).toBe('untrusted');
    });

    it('revokes trust', async () => {
      const { trustFile, revokeTrust, verifyTrust } = await load();
      const fp = join(tempDir, 'p.yaml');
      writeFileSync(fp, 'rules: []');
      await trustFile(fp);
      revokeTrust(fp);
      expect(await verifyTrust(fp)).toBe('untrusted');
    });
  });

  describe('detectCiPlatform', () => {
    it('detects GitHub Actions', async () => {
      vi.stubEnv('GITHUB_ACTIONS', 'true');
      const { detectCiPlatform } = await load();
      expect(detectCiPlatform()).toBe('github-actions');
    });

    it('returns null when not in CI', async () => {
      vi.stubEnv('GITHUB_ACTIONS', '');
      vi.stubEnv('GITLAB_CI', '');
      vi.stubEnv('JENKINS_URL', '');
      vi.stubEnv('CIRCLECI', '');
      vi.stubEnv('TRAVIS', '');
      vi.stubEnv('BUILDKITE', '');
      vi.stubEnv('CODEBUILD_BUILD_ID', '');
      vi.stubEnv('TF_BUILD', '');
      const { detectCiPlatform } = await load();
      expect(detectCiPlatform()).toBeNull();
    });
  });

  describe('isCiTrustOverride', () => {
    it('returns true when env var is set and a CI platform is detected', async () => {
      vi.stubEnv('AGENTGUARD_TRUST_PROJECT_POLICY', '1');
      vi.stubEnv('GITHUB_ACTIONS', 'true');
      const { isCiTrustOverride } = await load();
      expect(isCiTrustOverride()).toBe(true);
    });

    it('returns false when env var is set but no CI platform is detected', async () => {
      vi.stubEnv('AGENTGUARD_TRUST_PROJECT_POLICY', '1');
      vi.stubEnv('GITHUB_ACTIONS', '');
      vi.stubEnv('GITLAB_CI', '');
      vi.stubEnv('JENKINS_URL', '');
      vi.stubEnv('CIRCLECI', '');
      vi.stubEnv('TRAVIS', '');
      vi.stubEnv('BUILDKITE', '');
      vi.stubEnv('CODEBUILD_BUILD_ID', '');
      vi.stubEnv('TF_BUILD', '');
      const { isCiTrustOverride } = await load();
      expect(isCiTrustOverride()).toBe(false);
    });

    it('returns false when CI platform is detected but env var is not set', async () => {
      vi.stubEnv('GITHUB_ACTIONS', 'true');
      const { isCiTrustOverride } = await load();
      expect(isCiTrustOverride()).toBe(false);
    });

    it('returns false when neither env var nor CI platform is present', async () => {
      vi.stubEnv('GITHUB_ACTIONS', '');
      vi.stubEnv('GITLAB_CI', '');
      vi.stubEnv('JENKINS_URL', '');
      vi.stubEnv('CIRCLECI', '');
      vi.stubEnv('TRAVIS', '');
      vi.stubEnv('BUILDKITE', '');
      vi.stubEnv('CODEBUILD_BUILD_ID', '');
      vi.stubEnv('TF_BUILD', '');
      const { isCiTrustOverride } = await load();
      expect(isCiTrustOverride()).toBe(false);
    });
  });
});
