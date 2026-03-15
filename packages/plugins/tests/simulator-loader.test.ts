// Tests for the simulator plugin loader — validates discovery, loading,
// validation, and error handling for community-contributed simulators.

import { describe, it, expect, vi } from 'vitest';
import { loadSimulatorPlugins, isValidSimulator } from '../src/simulator-loader.js';
import type { SimulatorPluginInstance } from '../src/simulator-loader.js';
import type { PluginRegistry, InstalledPlugin } from '../src/registry.js';
import type { PluginManifest } from '../src/types.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeSimulatorManifest(id: string): PluginManifest {
  return {
    id,
    name: `Test Simulator ${id}`,
    version: '1.0.0',
    type: 'simulator',
    apiVersion: '^1.0.0',
  };
}

function makeInstalledPlugin(id: string, source: string, enabled = true): InstalledPlugin {
  return {
    manifest: makeSimulatorManifest(id),
    source,
    installedAt: new Date().toISOString(),
    enabled,
  };
}

function makeStubSimulator(id: string): SimulatorPluginInstance {
  return {
    id,
    supports: (intent: { action: string }) => intent.action === 'test.action',
    simulate: async () => ({
      predictedChanges: ['test change'],
      blastRadius: 1,
      riskLevel: 'low' as const,
      details: {},
      simulatorId: id,
      durationMs: 0,
    }),
  };
}

function createMockPluginRegistry(plugins: InstalledPlugin[]): PluginRegistry {
  return {
    install: vi.fn(),
    remove: vi.fn().mockReturnValue(false),
    get: vi.fn(),
    has: vi.fn().mockReturnValue(false),
    enable: vi.fn().mockReturnValue(false),
    disable: vi.fn().mockReturnValue(false),
    list: vi.fn().mockReturnValue(plugins),
    listByType: vi.fn().mockImplementation((type: string) =>
      plugins.filter((p) => p.manifest.type === type)
    ),
    count: vi.fn().mockReturnValue(plugins.length),
    save: vi.fn(),
    reload: vi.fn(),
  } as unknown as PluginRegistry;
}

// ===========================================================================
// isValidSimulator
// ===========================================================================

describe('isValidSimulator', () => {
  it('returns true for a valid simulator instance', () => {
    const sim = makeStubSimulator('test-sim');
    expect(isValidSimulator(sim)).toBe(true);
  });

  it('returns false for null', () => {
    expect(isValidSimulator(null)).toBe(false);
  });

  it('returns false for non-object', () => {
    expect(isValidSimulator('string')).toBe(false);
  });

  it('returns false for missing id', () => {
    expect(isValidSimulator({ supports: () => false, simulate: async () => ({}) })).toBe(false);
  });

  it('returns false for empty id', () => {
    expect(
      isValidSimulator({ id: '', supports: () => false, simulate: async () => ({}) })
    ).toBe(false);
  });

  it('returns false for missing supports function', () => {
    expect(isValidSimulator({ id: 'test', simulate: async () => ({}) })).toBe(false);
  });

  it('returns false for missing simulate function', () => {
    expect(isValidSimulator({ id: 'test', supports: () => false })).toBe(false);
  });
});

// ===========================================================================
// loadSimulatorPlugins
// ===========================================================================

describe('loadSimulatorPlugins', () => {
  it('returns empty array when no simulator plugins are installed', async () => {
    const registry = createMockPluginRegistry([]);
    const register = vi.fn();
    const results = await loadSimulatorPlugins(registry, register);
    expect(results).toHaveLength(0);
    expect(register).not.toHaveBeenCalled();
  });

  it('skips disabled plugins', async () => {
    const disabled = makeInstalledPlugin('disabled-sim', './disabled', false);
    const registry = createMockPluginRegistry([disabled]);
    const register = vi.fn();
    const results = await loadSimulatorPlugins(registry, register);
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].error).toContain('disabled');
    expect(register).not.toHaveBeenCalled();
  });

  it('reports error when module does not export createSimulator', async () => {
    // Module that exports something else
    const plugin = makeInstalledPlugin('bad-sim', 'node:path');
    const registry = createMockPluginRegistry([plugin]);
    const register = vi.fn();
    const results = await loadSimulatorPlugins(registry, register);
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].error).toContain('createSimulator');
    expect(register).not.toHaveBeenCalled();
  });

  it('reports error when module cannot be imported', async () => {
    const plugin = makeInstalledPlugin('missing-sim', './nonexistent-module-path-12345');
    const registry = createMockPluginRegistry([plugin]);
    const register = vi.fn();
    const results = await loadSimulatorPlugins(registry, register);
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].error).toContain('Failed to load');
    expect(register).not.toHaveBeenCalled();
  });

  it('only queries simulator plugins from registry', async () => {
    const nonSimulator = {
      manifest: { ...makeSimulatorManifest('renderer-plugin'), type: 'renderer' as const },
      source: './renderer',
      installedAt: new Date().toISOString(),
      enabled: true,
    };
    const registry = createMockPluginRegistry([nonSimulator]);
    const register = vi.fn();
    await loadSimulatorPlugins(registry, register);
    expect(registry.listByType).toHaveBeenCalledWith('simulator');
  });
});
