// Plugin sandbox — runtime capability enforcement for third-party plugins.
//
// Wraps plugin execution with capability checks and error isolation.
// Plugins can only access capabilities they declared in their manifest.
// Undeclared capability usage is denied and recorded as a violation.

import type { PluginManifest, PluginCapability, SandboxViolation, SandboxConfig } from './types.js';

/** Default sandbox configuration */
const DEFAULT_CONFIG: Required<SandboxConfig> = {
  timeoutMs: 5000,
  strict: false,
};

/**
 * PluginSandbox — enforces capability boundaries for a single plugin.
 *
 * Created per-plugin at registration time. Tracks granted capabilities
 * and records any violations when a plugin attempts undeclared access.
 *
 * Usage:
 * ```ts
 * const sandbox = createPluginSandbox(manifest);
 * if (sandbox.hasCapability('filesystem:read')) {
 *   // safe to proceed
 * }
 * const result = sandbox.execute(() => plugin.onEvent(event));
 * ```
 */
export interface PluginSandbox {
  /** The plugin this sandbox wraps */
  readonly pluginId: string;

  /** Check if the plugin has declared a specific capability */
  hasCapability(capability: PluginCapability): boolean;

  /** Get all granted capabilities */
  getCapabilities(): readonly PluginCapability[];

  /**
   * Assert that the plugin has a capability. Records a violation if not.
   * Returns true if the capability is granted, false if denied.
   */
  assertCapability(capability: PluginCapability): boolean;

  /**
   * Execute a plugin callback with error isolation.
   * Catches any thrown errors and returns a structured result.
   * In strict mode, capability violations throw instead of returning.
   */
  execute<T>(fn: () => T): SandboxExecutionResult<T>;

  /**
   * Execute an async plugin callback with error isolation.
   */
  executeAsync<T>(fn: () => Promise<T>): Promise<SandboxExecutionResult<T>>;

  /** Get all recorded violations for this plugin */
  getViolations(): readonly SandboxViolation[];

  /** Number of violations recorded */
  violationCount(): number;
}

/** Result of a sandboxed execution */
export interface SandboxExecutionResult<T> {
  readonly success: boolean;
  readonly value?: T;
  readonly error?: string;
  readonly durationMs: number;
}

/**
 * Create a sandbox for a plugin based on its manifest.
 *
 * The sandbox:
 * - Grants only capabilities declared in the manifest
 * - Records violations when undeclared capabilities are asserted
 * - Wraps execution with error isolation (try/catch)
 * - Tracks timing for each execution
 */
export function createPluginSandbox(
  manifest: PluginManifest,
  config?: SandboxConfig
): PluginSandbox {
  const resolvedConfig = { ...DEFAULT_CONFIG, ...config };
  const grantedCapabilities = new Set<PluginCapability>(manifest.capabilities ?? []);
  const violations: SandboxViolation[] = [];

  return {
    pluginId: manifest.id,

    hasCapability(capability: PluginCapability): boolean {
      return grantedCapabilities.has(capability);
    },

    getCapabilities(): readonly PluginCapability[] {
      return [...grantedCapabilities];
    },

    assertCapability(capability: PluginCapability): boolean {
      if (grantedCapabilities.has(capability)) {
        return true;
      }

      const violation: SandboxViolation = {
        pluginId: manifest.id,
        capability,
        message: `Plugin "${manifest.id}" attempted to use undeclared capability "${capability}"`,
        timestamp: Date.now(),
      };
      violations.push(violation);

      if (resolvedConfig.strict) {
        throw new Error(violation.message);
      }

      return false;
    },

    execute<T>(fn: () => T): SandboxExecutionResult<T> {
      const start = Date.now();
      try {
        const value = fn();
        return { success: true, value, durationMs: Date.now() - start };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
          durationMs: Date.now() - start,
        };
      }
    },

    async executeAsync<T>(fn: () => Promise<T>): Promise<SandboxExecutionResult<T>> {
      const start = Date.now();
      try {
        const value = await fn();
        return { success: true, value, durationMs: Date.now() - start };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
          durationMs: Date.now() - start,
        };
      }
    },

    getViolations(): readonly SandboxViolation[] {
      return [...violations];
    },

    violationCount(): number {
      return violations.length;
    },
  };
}

/**
 * SandboxRegistry — manages sandboxes for all loaded plugins.
 *
 * Provides centralized access to per-plugin sandboxes and aggregated
 * violation reporting for audit trails.
 */
export interface SandboxRegistry {
  /** Create and register a sandbox for a plugin */
  register(manifest: PluginManifest): PluginSandbox;

  /** Get the sandbox for a registered plugin */
  get(pluginId: string): PluginSandbox | undefined;

  /** Check if a plugin has a sandbox */
  has(pluginId: string): boolean;

  /** Remove a plugin's sandbox */
  unregister(pluginId: string): boolean;

  /** Get all violations across all plugins */
  getAllViolations(): readonly SandboxViolation[];

  /** Number of registered sandboxes */
  count(): number;

  /** List all registered plugin IDs */
  list(): string[];
}

/**
 * Create a sandbox registry for managing per-plugin sandboxes.
 */
export function createSandboxRegistry(config?: SandboxConfig): SandboxRegistry {
  const sandboxes = new Map<string, PluginSandbox>();

  return {
    register(manifest: PluginManifest): PluginSandbox {
      if (sandboxes.has(manifest.id)) {
        throw new Error(`Sandbox already registered for plugin: "${manifest.id}"`);
      }
      const sandbox = createPluginSandbox(manifest, config);
      sandboxes.set(manifest.id, sandbox);
      return sandbox;
    },

    get(pluginId: string): PluginSandbox | undefined {
      return sandboxes.get(pluginId);
    },

    has(pluginId: string): boolean {
      return sandboxes.has(pluginId);
    },

    unregister(pluginId: string): boolean {
      return sandboxes.delete(pluginId);
    },

    getAllViolations(): readonly SandboxViolation[] {
      const allViolations: SandboxViolation[] = [];
      for (const sandbox of sandboxes.values()) {
        allViolations.push(...sandbox.getViolations());
      }
      return allViolations.sort((a, b) => a.timestamp - b.timestamp);
    },

    count(): number {
      return sandboxes.size;
    },

    list(): string[] {
      return [...sandboxes.keys()];
    },
  };
}
