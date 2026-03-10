// Plugin system — re-exports for public API.

export type {
  PluginType,
  PluginCapability,
  PluginManifest,
  PluginValidationError,
  PluginValidationResult,
  SandboxViolation,
  SandboxConfig,
} from './types.js';

export { VALID_CAPABILITIES } from './types.js';

export { validateManifest, validatePlugin, checkApiVersionCompatibility } from './validator.js';

export type { PluginSandbox, SandboxExecutionResult, SandboxRegistry } from './sandbox.js';

export { createPluginSandbox, createSandboxRegistry } from './sandbox.js';

export type { InstalledPlugin, PluginRegistry, PluginRegistryOptions } from './registry.js';

export { createPluginRegistry } from './registry.js';

export type { DiscoveredPlugin, NpmSearchOptions, LocalSearchOptions } from './discovery.js';

export { searchNpmPlugins, searchLocalPlugins } from './discovery.js';
