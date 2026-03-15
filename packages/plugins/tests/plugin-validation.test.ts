// Tests for the plugin validation and sandboxing system — verifies manifest
// validation, API version compatibility, capability enforcement, error
// isolation, and sandbox registry management.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  validateManifest,
  validatePlugin,
  checkApiVersionCompatibility,
} from '@red-codes/plugins';
import { createPluginSandbox, createSandboxRegistry } from '@red-codes/plugins';
import type { PluginManifest } from '@red-codes/plugins';
import { VALID_CAPABILITIES } from '@red-codes/plugins';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Create a valid plugin manifest for testing */
function validManifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return {
    id: 'test-plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    type: 'renderer',
    apiVersion: '1.0.0',
    ...overrides,
  };
}

// ===========================================================================
// Manifest Validation
// ===========================================================================

describe('validateManifest', () => {
  it('accepts a valid manifest with all required fields', () => {
    const result = validateManifest(validManifest());
    expect(result.valid).toBe(true);
    expect(result.pluginId).toBe('test-plugin');
    expect(result.errors).toHaveLength(0);
  });

  it('accepts a manifest with optional fields', () => {
    const result = validateManifest(
      validManifest({
        description: 'A test plugin',
        capabilities: ['filesystem:read', 'events:emit'],
        dependencies: ['other-plugin'],
      })
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects null manifest', () => {
    const result = validateManifest(null);
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain('non-null object');
  });

  it('rejects non-object manifest', () => {
    const result = validateManifest('not an object');
    expect(result.valid).toBe(false);
    expect(result.errors[0].field).toBe('manifest');
  });

  describe('required fields', () => {
    it('rejects missing id', () => {
      const m = { ...validManifest() } as Record<string, unknown>;
      delete m.id;
      const result = validateManifest(m);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'id')).toBe(true);
    });

    it('rejects missing name', () => {
      const m = { ...validManifest() } as Record<string, unknown>;
      delete m.name;
      const result = validateManifest(m);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'name')).toBe(true);
    });

    it('rejects missing version', () => {
      const m = { ...validManifest() } as Record<string, unknown>;
      delete m.version;
      const result = validateManifest(m);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'version')).toBe(true);
    });

    it('rejects missing type', () => {
      const m = { ...validManifest() } as Record<string, unknown>;
      delete m.type;
      const result = validateManifest(m);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'type')).toBe(true);
    });

    it('rejects missing apiVersion', () => {
      const m = { ...validManifest() } as Record<string, unknown>;
      delete m.apiVersion;
      const result = validateManifest(m);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'apiVersion')).toBe(true);
    });

    it('rejects empty string fields', () => {
      const result = validateManifest({
        id: '',
        name: '   ',
        version: '',
        type: '',
        apiVersion: '',
      });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(5);
    });

    it('collects all errors at once', () => {
      const result = validateManifest({});
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(5);
    });
  });

  describe('version format', () => {
    it('accepts valid semver versions', () => {
      expect(validateManifest(validManifest({ version: '0.1.0' })).valid).toBe(true);
      expect(validateManifest(validManifest({ version: '2.10.3' })).valid).toBe(true);
      expect(validateManifest(validManifest({ version: '1.0.0-beta.1' })).valid).toBe(true);
    });

    it('rejects invalid semver', () => {
      const result = validateManifest(validManifest({ version: '1.0' }));
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'version')).toBe(true);
    });
  });

  describe('plugin type', () => {
    it('accepts all valid plugin types', () => {
      expect(validateManifest(validManifest({ type: 'renderer' })).valid).toBe(true);
      expect(validateManifest(validManifest({ type: 'replay-processor' })).valid).toBe(true);
      expect(validateManifest(validManifest({ type: 'policy-pack' })).valid).toBe(true);
      expect(validateManifest(validManifest({ type: 'invariant' })).valid).toBe(true);
      expect(validateManifest(validManifest({ type: 'adapter' })).valid).toBe(true);
      expect(validateManifest(validManifest({ type: 'simulator' })).valid).toBe(true);
    });

    it('rejects unknown plugin types', () => {
      const result = validateManifest(validManifest({ type: 'unknown' as never }));
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'type')).toBe(true);
    });
  });

  describe('capabilities', () => {
    it('accepts all valid capabilities', () => {
      const result = validateManifest(validManifest({ capabilities: [...VALID_CAPABILITIES] }));
      expect(result.valid).toBe(true);
    });

    it('rejects unknown capabilities', () => {
      const result = validateManifest(
        validManifest({ capabilities: ['filesystem:read', 'teleport' as never] })
      );
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'capabilities[1]')).toBe(true);
    });

    it('rejects non-array capabilities', () => {
      const result = validateManifest(validManifest({ capabilities: 'filesystem:read' as never }));
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'capabilities')).toBe(true);
    });

    it('rejects non-string capability entries', () => {
      const result = validateManifest(validManifest({ capabilities: [42 as never] }));
      expect(result.valid).toBe(false);
    });
  });

  describe('dependencies', () => {
    it('accepts valid dependency arrays', () => {
      const result = validateManifest(validManifest({ dependencies: ['plugin-a', 'plugin-b'] }));
      expect(result.valid).toBe(true);
    });

    it('rejects non-array dependencies', () => {
      const result = validateManifest(validManifest({ dependencies: 'plugin-a' as never }));
      expect(result.valid).toBe(false);
    });

    it('rejects empty string dependencies', () => {
      const result = validateManifest(validManifest({ dependencies: [''] }));
      expect(result.valid).toBe(false);
    });
  });
});

// ===========================================================================
// API Version Compatibility
// ===========================================================================

describe('checkApiVersionCompatibility', () => {
  describe('caret range (^)', () => {
    it('allows same major, higher minor', () => {
      const result = checkApiVersionCompatibility('^1.0.0', '1.2.3');
      expect(result.compatible).toBe(true);
    });

    it('allows exact match', () => {
      const result = checkApiVersionCompatibility('^1.0.0', '1.0.0');
      expect(result.compatible).toBe(true);
    });

    it('rejects different major', () => {
      const result = checkApiVersionCompatibility('^1.0.0', '2.0.0');
      expect(result.compatible).toBe(false);
      expect(result.reason).toContain('Major version mismatch');
    });

    it('rejects older minor version', () => {
      const result = checkApiVersionCompatibility('^1.5.0', '1.3.0');
      expect(result.compatible).toBe(false);
    });
  });

  describe('tilde range (~)', () => {
    it('allows same minor, higher patch', () => {
      const result = checkApiVersionCompatibility('~1.2.0', '1.2.5');
      expect(result.compatible).toBe(true);
    });

    it('rejects different minor', () => {
      const result = checkApiVersionCompatibility('~1.2.0', '1.3.0');
      expect(result.compatible).toBe(false);
    });

    it('rejects lower patch', () => {
      const result = checkApiVersionCompatibility('~1.2.3', '1.2.1');
      expect(result.compatible).toBe(false);
    });
  });

  describe('comparison operators', () => {
    it('>= allows equal version', () => {
      const result = checkApiVersionCompatibility('>=1.0.0', '1.0.0');
      expect(result.compatible).toBe(true);
    });

    it('>= allows higher version', () => {
      const result = checkApiVersionCompatibility('>=1.0.0', '2.5.0');
      expect(result.compatible).toBe(true);
    });

    it('>= rejects lower version', () => {
      const result = checkApiVersionCompatibility('>=2.0.0', '1.9.9');
      expect(result.compatible).toBe(false);
    });

    it('> rejects equal version', () => {
      const result = checkApiVersionCompatibility('>1.0.0', '1.0.0');
      expect(result.compatible).toBe(false);
    });

    it('<= allows equal version', () => {
      const result = checkApiVersionCompatibility('<=2.0.0', '2.0.0');
      expect(result.compatible).toBe(true);
    });

    it('< rejects equal version', () => {
      const result = checkApiVersionCompatibility('<2.0.0', '2.0.0');
      expect(result.compatible).toBe(false);
    });
  });

  describe('bare version (defaults to ^)', () => {
    it('treats bare version as caret range', () => {
      const result = checkApiVersionCompatibility('1.0.0', '1.5.0');
      expect(result.compatible).toBe(true);
    });

    it('rejects major mismatch for bare version', () => {
      const result = checkApiVersionCompatibility('1.0.0', '2.0.0');
      expect(result.compatible).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('returns incompatible for invalid host version', () => {
      const result = checkApiVersionCompatibility('^1.0.0', 'invalid');
      expect(result.compatible).toBe(false);
    });

    it('returns incompatible for invalid apiVersion format', () => {
      const result = checkApiVersionCompatibility('not-semver', '1.0.0');
      expect(result.compatible).toBe(false);
    });
  });
});

// ===========================================================================
// validatePlugin (combined validation)
// ===========================================================================

describe('validatePlugin', () => {
  it('passes when manifest is valid and API version compatible', () => {
    const result = validatePlugin(validManifest({ apiVersion: '^1.0.0' }), '1.0.0');
    expect(result.valid).toBe(true);
  });

  it('fails when manifest is structurally invalid', () => {
    const result = validatePlugin({}, '1.0.0');
    expect(result.valid).toBe(false);
  });

  it('fails when API version is incompatible', () => {
    const result = validatePlugin(validManifest({ apiVersion: '^2.0.0' }), '1.0.0');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'apiVersion')).toBe(true);
  });
});

// ===========================================================================
// Plugin Sandbox
// ===========================================================================

describe('createPluginSandbox', () => {
  it('grants declared capabilities', () => {
    const sandbox = createPluginSandbox(
      validManifest({ capabilities: ['filesystem:read', 'events:emit'] })
    );
    expect(sandbox.hasCapability('filesystem:read')).toBe(true);
    expect(sandbox.hasCapability('events:emit')).toBe(true);
    expect(sandbox.hasCapability('network')).toBe(false);
  });

  it('grants no capabilities when none declared', () => {
    const sandbox = createPluginSandbox(validManifest());
    expect(sandbox.getCapabilities()).toHaveLength(0);
    expect(sandbox.hasCapability('filesystem:read')).toBe(false);
  });

  it('returns pluginId from manifest', () => {
    const sandbox = createPluginSandbox(validManifest({ id: 'my-plugin' }));
    expect(sandbox.pluginId).toBe('my-plugin');
  });

  describe('assertCapability', () => {
    it('returns true for granted capabilities', () => {
      const sandbox = createPluginSandbox(validManifest({ capabilities: ['filesystem:read'] }));
      expect(sandbox.assertCapability('filesystem:read')).toBe(true);
      expect(sandbox.violationCount()).toBe(0);
    });

    it('returns false and records violation for undeclared capabilities', () => {
      const sandbox = createPluginSandbox(validManifest());
      expect(sandbox.assertCapability('network')).toBe(false);
      expect(sandbox.violationCount()).toBe(1);

      const violations = sandbox.getViolations();
      expect(violations[0].capability).toBe('network');
      expect(violations[0].pluginId).toBe('test-plugin');
    });

    it('throws in strict mode for undeclared capabilities', () => {
      const sandbox = createPluginSandbox(validManifest(), { strict: true });
      expect(() => sandbox.assertCapability('network')).toThrow('undeclared capability');
    });

    it('accumulates multiple violations', () => {
      const sandbox = createPluginSandbox(validManifest());
      sandbox.assertCapability('network');
      sandbox.assertCapability('process:spawn');
      sandbox.assertCapability('filesystem:write');
      expect(sandbox.violationCount()).toBe(3);
    });
  });

  describe('execute (sync)', () => {
    it('returns success for normal execution', () => {
      const sandbox = createPluginSandbox(validManifest());
      const result = sandbox.execute(() => 42);
      expect(result.success).toBe(true);
      expect(result.value).toBe(42);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('catches and isolates errors', () => {
      const sandbox = createPluginSandbox(validManifest());
      const result = sandbox.execute(() => {
        throw new Error('plugin crashed');
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('plugin crashed');
    });

    it('catches non-Error throws', () => {
      const sandbox = createPluginSandbox(validManifest());
      const result = sandbox.execute(() => {
        throw 'string error';
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('string error');
    });

    it('tracks duration', () => {
      const sandbox = createPluginSandbox(validManifest());
      const result = sandbox.execute(() => {
        // Synchronous work
        let sum = 0;
        for (let i = 0; i < 1000; i++) sum += i;
        return sum;
      });
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('executeAsync', () => {
    it('returns success for resolved promises', async () => {
      const sandbox = createPluginSandbox(validManifest());
      const result = await sandbox.executeAsync(async () => 'hello');
      expect(result.success).toBe(true);
      expect(result.value).toBe('hello');
    });

    it('catches and isolates async errors', async () => {
      const sandbox = createPluginSandbox(validManifest());
      const result = await sandbox.executeAsync(async () => {
        throw new Error('async crash');
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('async crash');
    });
  });
});

// ===========================================================================
// Sandbox Registry
// ===========================================================================

describe('createSandboxRegistry', () => {
  let registry: ReturnType<typeof createSandboxRegistry>;

  beforeEach(() => {
    registry = createSandboxRegistry();
  });

  it('registers a sandbox for a plugin', () => {
    const sandbox = registry.register(validManifest());
    expect(sandbox.pluginId).toBe('test-plugin');
    expect(registry.has('test-plugin')).toBe(true);
    expect(registry.count()).toBe(1);
  });

  it('retrieves a registered sandbox', () => {
    registry.register(validManifest());
    const sandbox = registry.get('test-plugin');
    expect(sandbox).toBeDefined();
    expect(sandbox!.pluginId).toBe('test-plugin');
  });

  it('returns undefined for unregistered plugins', () => {
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  it('throws on duplicate registration', () => {
    registry.register(validManifest());
    expect(() => registry.register(validManifest())).toThrow('already registered');
  });

  it('unregisters a sandbox', () => {
    registry.register(validManifest());
    expect(registry.unregister('test-plugin')).toBe(true);
    expect(registry.has('test-plugin')).toBe(false);
    expect(registry.count()).toBe(0);
  });

  it('returns false when unregistering unknown plugin', () => {
    expect(registry.unregister('nonexistent')).toBe(false);
  });

  it('lists all registered plugin IDs', () => {
    registry.register(validManifest({ id: 'plugin-a' }));
    registry.register(validManifest({ id: 'plugin-b' }));
    expect(registry.list()).toEqual(['plugin-a', 'plugin-b']);
  });

  it('aggregates violations across all plugins', () => {
    const a = registry.register(validManifest({ id: 'plugin-a' }));
    const b = registry.register(validManifest({ id: 'plugin-b' }));

    a.assertCapability('network');
    b.assertCapability('filesystem:write');

    const violations = registry.getAllViolations();
    expect(violations).toHaveLength(2);
    expect(violations.map((v) => v.pluginId)).toContain('plugin-a');
    expect(violations.map((v) => v.pluginId)).toContain('plugin-b');
  });

  it('passes sandbox config to all created sandboxes', () => {
    const strictRegistry = createSandboxRegistry({ strict: true });
    const sandbox = strictRegistry.register(validManifest());
    expect(() => sandbox.assertCapability('network')).toThrow();
  });
});
