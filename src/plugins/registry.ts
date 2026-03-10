// Plugin registry — tracks installed plugins with metadata and persistence.
//
// The registry is the lifecycle manager for plugins. It validates manifests
// at install time, persists the registry to disk (.agentguard/plugins.json),
// and provides lookup/listing for the CLI and kernel.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { PluginManifest, PluginType, PluginValidationResult } from './types.js';
import { validatePlugin } from './validator.js';

/** Metadata stored for each installed plugin */
export interface InstalledPlugin {
  /** The validated plugin manifest */
  readonly manifest: PluginManifest;
  /** Where the plugin was installed from (local path, npm package name) */
  readonly source: string;
  /** ISO timestamp of when the plugin was installed */
  readonly installedAt: string;
  /** Whether the plugin is currently enabled */
  readonly enabled: boolean;
}

/** Serialized registry format written to disk */
interface RegistryFile {
  readonly version: 1;
  readonly plugins: Record<string, InstalledPlugin>;
}

/** Options for creating a plugin registry */
export interface PluginRegistryOptions {
  /** Directory to store the registry file (default: .agentguard) */
  readonly storageDir?: string;
  /** Host API version for compatibility checks (default: "1.0.0") */
  readonly hostVersion?: string;
}

/** Plugin registry — manages installed plugin lifecycle */
export interface PluginRegistry {
  /** Install a plugin from a manifest and source. Validates before registering. */
  install(manifest: PluginManifest, source: string): PluginValidationResult;

  /** Remove a plugin by ID. Returns true if found and removed. */
  remove(pluginId: string): boolean;

  /** Get an installed plugin by ID */
  get(pluginId: string): InstalledPlugin | undefined;

  /** Check if a plugin is installed */
  has(pluginId: string): boolean;

  /** Enable a plugin. Returns false if not found. */
  enable(pluginId: string): boolean;

  /** Disable a plugin. Returns false if not found. */
  disable(pluginId: string): boolean;

  /** List all installed plugins */
  list(): readonly InstalledPlugin[];

  /** List plugins filtered by type */
  listByType(type: PluginType): readonly InstalledPlugin[];

  /** Number of installed plugins */
  count(): number;

  /** Persist the registry to disk */
  save(): void;

  /** Reload the registry from disk */
  reload(): void;
}

const DEFAULT_HOST_VERSION = '1.0.0';
const REGISTRY_FILENAME = 'plugins.json';

/**
 * Create a plugin registry backed by a JSON file.
 *
 * The registry validates manifests at install time using the existing
 * plugin validator and persists the installed plugin list to disk.
 */
export function createPluginRegistry(options?: PluginRegistryOptions): PluginRegistry {
  const storageDir = options?.storageDir ?? '.agentguard';
  const hostVersion = options?.hostVersion ?? DEFAULT_HOST_VERSION;
  const registryPath = join(storageDir, REGISTRY_FILENAME);

  const plugins = new Map<string, InstalledPlugin>();

  // Load existing registry from disk if present
  loadFromDisk();

  function loadFromDisk(): void {
    if (!existsSync(registryPath)) return;

    try {
      const raw = readFileSync(registryPath, 'utf8');
      const data = JSON.parse(raw) as RegistryFile;
      if (data.version === 1 && data.plugins) {
        plugins.clear();
        for (const [id, entry] of Object.entries(data.plugins)) {
          plugins.set(id, entry);
        }
      }
    } catch {
      // Corrupt or missing file — start fresh
    }
  }

  function saveToDisk(): void {
    const data: RegistryFile = {
      version: 1,
      plugins: Object.fromEntries(plugins),
    };

    mkdirSync(dirname(registryPath), { recursive: true });
    writeFileSync(registryPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  }

  return {
    install(manifest, source) {
      const result = validatePlugin(manifest, hostVersion);
      if (!result.valid) {
        return result;
      }

      if (plugins.has(manifest.id)) {
        return {
          valid: false,
          pluginId: manifest.id,
          errors: [
            {
              field: 'id',
              message: `Plugin "${manifest.id}" is already installed. Remove it first to reinstall.`,
            },
          ],
        };
      }

      // Check dependencies are satisfied
      if (manifest.dependencies) {
        for (const dep of manifest.dependencies) {
          if (!plugins.has(dep)) {
            return {
              valid: false,
              pluginId: manifest.id,
              errors: [
                {
                  field: 'dependencies',
                  message: `Missing dependency: "${dep}" must be installed first`,
                },
              ],
            };
          }
        }
      }

      const entry: InstalledPlugin = {
        manifest,
        source,
        installedAt: new Date().toISOString(),
        enabled: true,
      };

      plugins.set(manifest.id, entry);
      saveToDisk();

      return result;
    },

    remove(pluginId) {
      // Check if any other plugin depends on this one
      for (const [id, entry] of plugins) {
        if (id === pluginId) continue;
        if (entry.manifest.dependencies?.includes(pluginId)) {
          return false;
        }
      }

      const removed = plugins.delete(pluginId);
      if (removed) {
        saveToDisk();
      }
      return removed;
    },

    get(pluginId) {
      return plugins.get(pluginId);
    },

    has(pluginId) {
      return plugins.has(pluginId);
    },

    enable(pluginId) {
      const entry = plugins.get(pluginId);
      if (!entry) return false;
      plugins.set(pluginId, { ...entry, enabled: true });
      saveToDisk();
      return true;
    },

    disable(pluginId) {
      const entry = plugins.get(pluginId);
      if (!entry) return false;
      plugins.set(pluginId, { ...entry, enabled: false });
      saveToDisk();
      return true;
    },

    list() {
      return [...plugins.values()];
    },

    listByType(type) {
      return [...plugins.values()].filter((p) => p.manifest.type === type);
    },

    count() {
      return plugins.size;
    },

    save() {
      saveToDisk();
    },

    reload() {
      loadFromDisk();
    },
  };
}
