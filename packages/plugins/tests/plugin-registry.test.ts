// Tests for plugin registry — lifecycle management of installed plugins.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createPluginRegistry } from '@red-codes/plugins';
import type { PluginManifest } from '@red-codes/plugins';

function makeManifest(overrides?: Partial<PluginManifest>): PluginManifest {
  return {
    id: 'test-plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    type: 'renderer',
    apiVersion: '^1.0.0',
    ...overrides,
  };
}

describe('PluginRegistry', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'agentguard-registry-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('install', () => {
    it('should install a valid plugin', () => {
      const registry = createPluginRegistry({ storageDir: tempDir });
      const manifest = makeManifest();

      const result = registry.install(manifest, './test-plugin');

      expect(result.valid).toBe(true);
      expect(registry.has('test-plugin')).toBe(true);
      expect(registry.count()).toBe(1);
    });

    it('should reject an invalid manifest', () => {
      const registry = createPluginRegistry({ storageDir: tempDir });

      const result = registry.install({} as PluginManifest, './bad-plugin');

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(registry.count()).toBe(0);
    });

    it('should reject duplicate plugin IDs', () => {
      const registry = createPluginRegistry({ storageDir: tempDir });
      const manifest = makeManifest();

      registry.install(manifest, './test-plugin');
      const result = registry.install(manifest, './test-plugin-2');

      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('already installed');
    });

    it('should reject plugins with unsatisfied dependencies', () => {
      const registry = createPluginRegistry({ storageDir: tempDir });
      const manifest = makeManifest({
        id: 'dependent-plugin',
        dependencies: ['missing-dep'],
      });

      const result = registry.install(manifest, './dependent');

      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('missing-dep');
    });

    it('should accept plugins with satisfied dependencies', () => {
      const registry = createPluginRegistry({ storageDir: tempDir });

      // Install dependency first
      registry.install(makeManifest({ id: 'base-plugin' }), './base');

      // Install dependent plugin
      const result = registry.install(
        makeManifest({ id: 'dependent-plugin', dependencies: ['base-plugin'] }),
        './dependent'
      );

      expect(result.valid).toBe(true);
      expect(registry.count()).toBe(2);
    });

    it('should persist to disk on install', () => {
      const registry = createPluginRegistry({ storageDir: tempDir });
      registry.install(makeManifest(), './test');

      const filePath = join(tempDir, 'plugins.json');
      expect(existsSync(filePath)).toBe(true);

      const data = JSON.parse(readFileSync(filePath, 'utf8'));
      expect(data.version).toBe(1);
      expect(data.plugins['test-plugin']).toBeDefined();
      expect(data.plugins['test-plugin'].manifest.id).toBe('test-plugin');
    });

    it('should check API version compatibility', () => {
      const registry = createPluginRegistry({
        storageDir: tempDir,
        hostVersion: '1.0.0',
      });

      const result = registry.install(makeManifest({ apiVersion: '^2.0.0' }), './incompatible');

      expect(result.valid).toBe(false);
      expect(result.errors[0].field).toBe('apiVersion');
    });
  });

  describe('remove', () => {
    it('should remove an installed plugin', () => {
      const registry = createPluginRegistry({ storageDir: tempDir });
      registry.install(makeManifest(), './test');

      const removed = registry.remove('test-plugin');

      expect(removed).toBe(true);
      expect(registry.has('test-plugin')).toBe(false);
      expect(registry.count()).toBe(0);
    });

    it('should return false for unknown plugin ID', () => {
      const registry = createPluginRegistry({ storageDir: tempDir });

      expect(registry.remove('nonexistent')).toBe(false);
    });

    it('should prevent removing a plugin that others depend on', () => {
      const registry = createPluginRegistry({ storageDir: tempDir });
      registry.install(makeManifest({ id: 'base' }), './base');
      registry.install(makeManifest({ id: 'dependent', dependencies: ['base'] }), './dependent');

      const removed = registry.remove('base');

      expect(removed).toBe(false);
      expect(registry.has('base')).toBe(true);
    });

    it('should persist removal to disk', () => {
      const registry = createPluginRegistry({ storageDir: tempDir });
      registry.install(makeManifest(), './test');
      registry.remove('test-plugin');

      const data = JSON.parse(readFileSync(join(tempDir, 'plugins.json'), 'utf8'));
      expect(data.plugins['test-plugin']).toBeUndefined();
    });
  });

  describe('get and list', () => {
    it('should return installed plugin by ID', () => {
      const registry = createPluginRegistry({ storageDir: tempDir });
      registry.install(makeManifest(), './test');

      const entry = registry.get('test-plugin');

      expect(entry).toBeDefined();
      expect(entry!.manifest.id).toBe('test-plugin');
      expect(entry!.source).toBe('./test');
      expect(entry!.enabled).toBe(true);
      expect(entry!.installedAt).toBeTruthy();
    });

    it('should return undefined for unknown plugin', () => {
      const registry = createPluginRegistry({ storageDir: tempDir });

      expect(registry.get('nonexistent')).toBeUndefined();
    });

    it('should list all installed plugins', () => {
      const registry = createPluginRegistry({ storageDir: tempDir });
      registry.install(makeManifest({ id: 'p1', name: 'Plugin 1' }), './p1');
      registry.install(makeManifest({ id: 'p2', name: 'Plugin 2', type: 'policy-pack' }), './p2');

      const list = registry.list();

      expect(list).toHaveLength(2);
    });

    it('should filter plugins by type', () => {
      const registry = createPluginRegistry({ storageDir: tempDir });
      registry.install(makeManifest({ id: 'r1', type: 'renderer' }), './r1');
      registry.install(makeManifest({ id: 'pp1', type: 'policy-pack' }), './pp1');
      registry.install(makeManifest({ id: 'r2', type: 'renderer' }), './r2');

      const renderers = registry.listByType('renderer');
      const policyPacks = registry.listByType('policy-pack');

      expect(renderers).toHaveLength(2);
      expect(policyPacks).toHaveLength(1);
    });
  });

  describe('enable and disable', () => {
    it('should disable an enabled plugin', () => {
      const registry = createPluginRegistry({ storageDir: tempDir });
      registry.install(makeManifest(), './test');

      expect(registry.disable('test-plugin')).toBe(true);
      expect(registry.get('test-plugin')!.enabled).toBe(false);
    });

    it('should enable a disabled plugin', () => {
      const registry = createPluginRegistry({ storageDir: tempDir });
      registry.install(makeManifest(), './test');
      registry.disable('test-plugin');

      expect(registry.enable('test-plugin')).toBe(true);
      expect(registry.get('test-plugin')!.enabled).toBe(true);
    });

    it('should return false for unknown plugin', () => {
      const registry = createPluginRegistry({ storageDir: tempDir });

      expect(registry.enable('nonexistent')).toBe(false);
      expect(registry.disable('nonexistent')).toBe(false);
    });
  });

  describe('persistence', () => {
    it('should reload from disk', () => {
      const registry1 = createPluginRegistry({ storageDir: tempDir });
      registry1.install(makeManifest({ id: 'persisted' }), './persisted');

      // Create a new registry instance pointing to the same dir
      const registry2 = createPluginRegistry({ storageDir: tempDir });

      expect(registry2.has('persisted')).toBe(true);
      expect(registry2.count()).toBe(1);
    });

    it('should handle missing registry file gracefully', () => {
      const registry = createPluginRegistry({ storageDir: join(tempDir, 'nonexistent') });

      expect(registry.count()).toBe(0);
      expect(registry.list()).toHaveLength(0);
    });

    it('should handle corrupt registry file gracefully', () => {
      const corruptDir = join(tempDir, 'corrupt');
      mkdirSync(corruptDir, { recursive: true });
      writeFileSync(join(corruptDir, 'plugins.json'), 'NOT JSON', 'utf8');

      const registry = createPluginRegistry({ storageDir: corruptDir });

      expect(registry.count()).toBe(0);
    });
  });
});
