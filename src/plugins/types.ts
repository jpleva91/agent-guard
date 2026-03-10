// Plugin system type definitions — manifest schema, capabilities, and validation results.
//
// All third-party plugins (renderers, replay processors, policy packs) must provide
// a PluginManifest describing their metadata, required capabilities, and API version
// compatibility. The validation and sandboxing layer uses these declarations to
// enforce security boundaries at load time and runtime.

/** Supported plugin types in the AgentGuard ecosystem */
export type PluginType = 'renderer' | 'replay-processor' | 'policy-pack';

/**
 * Capabilities a plugin may request.
 *
 * Plugins declare required capabilities in their manifest. The sandbox
 * grants only declared capabilities — any undeclared access is denied.
 */
export type PluginCapability =
  | 'filesystem:read'
  | 'filesystem:write'
  | 'network'
  | 'process:spawn'
  | 'events:emit'
  | 'events:subscribe';

/** All known capabilities for validation */
export const VALID_CAPABILITIES: readonly PluginCapability[] = [
  'filesystem:read',
  'filesystem:write',
  'network',
  'process:spawn',
  'events:emit',
  'events:subscribe',
];

/**
 * Plugin manifest — the metadata every plugin must provide.
 *
 * This is validated at load time before the plugin is registered.
 * Think of it as the plugin's "package.json" for AgentGuard.
 */
export interface PluginManifest {
  /** Unique identifier (e.g., "agentguard-renderer-json") */
  readonly id: string;
  /** Human-readable display name */
  readonly name: string;
  /** Plugin version (semver, e.g., "1.2.0") */
  readonly version: string;
  /** Brief description of what the plugin does */
  readonly description?: string;
  /** The type of plugin */
  readonly type: PluginType;
  /** Required AgentGuard API version (semver range, e.g., "^1.0.0" or ">=1.0.0") */
  readonly apiVersion: string;
  /** Capabilities this plugin requires at runtime */
  readonly capabilities?: readonly PluginCapability[];
  /** Other plugin IDs this plugin depends on */
  readonly dependencies?: readonly string[];
}

/** Individual validation error with a field path and message */
export interface PluginValidationError {
  readonly field: string;
  readonly message: string;
}

/** Result of validating a plugin manifest */
export interface PluginValidationResult {
  readonly valid: boolean;
  readonly pluginId: string | undefined;
  readonly errors: readonly PluginValidationError[];
}

/** Result of a sandbox capability check */
export interface SandboxViolation {
  readonly pluginId: string;
  readonly capability: string;
  readonly message: string;
  readonly timestamp: number;
}

/** Configuration for the plugin sandbox */
export interface SandboxConfig {
  /** Maximum execution time per callback in milliseconds (default: 5000) */
  readonly timeoutMs?: number;
  /** Whether to throw on violation or silently deny (default: false = silent) */
  readonly strict?: boolean;
}
