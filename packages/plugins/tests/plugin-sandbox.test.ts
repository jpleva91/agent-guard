import { describe, it, expect } from 'vitest';
import {
  createPluginSandbox,
  createSandboxRegistry,
} from '@red-codes/plugins';
import type { PluginManifest } from '@red-codes/plugins';

function makeManifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return {
    id: 'test-plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    type: 'renderer',
    capabilities: ['filesystem:read', 'events:subscribe'],
    ...overrides,
  };
}

describe('PluginSandbox', () => {
  describe('capability checks', () => {
    it('hasCapability returns true for declared capabilities', () => {
      const sandbox = createPluginSandbox(makeManifest());
      expect(sandbox.hasCapability('filesystem:read')).toBe(true);
      expect(sandbox.hasCapability('events:subscribe')).toBe(true);
    });

    it('hasCapability returns false for undeclared capabilities', () => {
      const sandbox = createPluginSandbox(makeManifest());
      expect(sandbox.hasCapability('network')).toBe(false);
      expect(sandbox.hasCapability('process:spawn')).toBe(false);
    });

    it('getCapabilities returns all granted capabilities', () => {
      const sandbox = createPluginSandbox(makeManifest());
      const caps = sandbox.getCapabilities();
      expect(caps).toContain('filesystem:read');
      expect(caps).toContain('events:subscribe');
      expect(caps).toHaveLength(2);
    });

    it('handles manifest with no capabilities', () => {
      const sandbox = createPluginSandbox(makeManifest({ capabilities: undefined }));
      expect(sandbox.getCapabilities()).toHaveLength(0);
      expect(sandbox.hasCapability('filesystem:read')).toBe(false);
    });
  });

  describe('assertCapability', () => {
    it('returns true for granted capability', () => {
      const sandbox = createPluginSandbox(makeManifest());
      expect(sandbox.assertCapability('filesystem:read')).toBe(true);
      expect(sandbox.violationCount()).toBe(0);
    });

    it('returns false and records violation for undeclared capability', () => {
      const sandbox = createPluginSandbox(makeManifest());
      expect(sandbox.assertCapability('network')).toBe(false);
      expect(sandbox.violationCount()).toBe(1);

      const violations = sandbox.getViolations();
      expect(violations[0].pluginId).toBe('test-plugin');
      expect(violations[0].capability).toBe('network');
      expect(violations[0].message).toContain('undeclared capability');
      expect(violations[0].timestamp).toBeGreaterThan(0);
    });

    it('throws in strict mode for undeclared capability', () => {
      const sandbox = createPluginSandbox(makeManifest(), { strict: true });
      expect(() => sandbox.assertCapability('network')).toThrow('undeclared capability');
    });

    it('does not throw in strict mode for granted capability', () => {
      const sandbox = createPluginSandbox(makeManifest(), { strict: true });
      expect(sandbox.assertCapability('filesystem:read')).toBe(true);
    });
  });

  describe('execute', () => {
    it('wraps successful execution', () => {
      const sandbox = createPluginSandbox(makeManifest());
      const result = sandbox.execute(() => 42);
      expect(result.success).toBe(true);
      expect(result.value).toBe(42);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('catches thrown errors', () => {
      const sandbox = createPluginSandbox(makeManifest());
      const result = sandbox.execute(() => {
        throw new Error('plugin crashed');
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('plugin crashed');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('handles non-Error throws', () => {
      const sandbox = createPluginSandbox(makeManifest());
      const result = sandbox.execute(() => {
        throw 'string error';
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('string error');
    });
  });

  describe('executeAsync', () => {
    it('wraps successful async execution', async () => {
      const sandbox = createPluginSandbox(makeManifest());
      const result = await sandbox.executeAsync(async () => 'hello');
      expect(result.success).toBe(true);
      expect(result.value).toBe('hello');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('catches rejected promises', async () => {
      const sandbox = createPluginSandbox(makeManifest());
      const result = await sandbox.executeAsync(async () => {
        throw new Error('async failure');
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('async failure');
    });
  });

  describe('pluginId', () => {
    it('exposes the plugin ID', () => {
      const sandbox = createPluginSandbox(makeManifest({ id: 'my-plugin' }));
      expect(sandbox.pluginId).toBe('my-plugin');
    });
  });
});

describe('SandboxRegistry', () => {
  it('registers and retrieves a sandbox', () => {
    const registry = createSandboxRegistry();
    const sandbox = registry.register(makeManifest());
    expect(sandbox.pluginId).toBe('test-plugin');
    expect(registry.get('test-plugin')).toBe(sandbox);
    expect(registry.has('test-plugin')).toBe(true);
  });

  it('throws on duplicate registration', () => {
    const registry = createSandboxRegistry();
    registry.register(makeManifest());
    expect(() => registry.register(makeManifest())).toThrow('already registered');
  });

  it('returns undefined for unregistered plugin', () => {
    const registry = createSandboxRegistry();
    expect(registry.get('unknown')).toBeUndefined();
    expect(registry.has('unknown')).toBe(false);
  });

  it('unregisters a plugin', () => {
    const registry = createSandboxRegistry();
    registry.register(makeManifest());
    expect(registry.unregister('test-plugin')).toBe(true);
    expect(registry.has('test-plugin')).toBe(false);
  });

  it('returns false when unregistering unknown plugin', () => {
    const registry = createSandboxRegistry();
    expect(registry.unregister('unknown')).toBe(false);
  });

  it('aggregates violations across plugins', () => {
    const registry = createSandboxRegistry();
    const s1 = registry.register(makeManifest({ id: 'p1', name: 'P1', version: '1.0.0' }));
    const s2 = registry.register(makeManifest({ id: 'p2', name: 'P2', version: '1.0.0' }));

    s1.assertCapability('network');
    s2.assertCapability('process:spawn');

    const allViolations = registry.getAllViolations();
    expect(allViolations).toHaveLength(2);
    // Sorted by timestamp
    expect(allViolations[0].timestamp).toBeLessThanOrEqual(allViolations[1].timestamp);
  });

  it('tracks count and list', () => {
    const registry = createSandboxRegistry();
    registry.register(makeManifest({ id: 'a', name: 'A', version: '1.0.0' }));
    registry.register(makeManifest({ id: 'b', name: 'B', version: '1.0.0' }));
    expect(registry.count()).toBe(2);
    expect(registry.list()).toEqual(expect.arrayContaining(['a', 'b']));
  });
});
