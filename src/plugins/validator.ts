// Plugin manifest validator — validates plugin manifests at load time.
//
// Validates structure, required fields, capability declarations, version
// format, and API version compatibility. This runs before a plugin is
// registered in any registry to ensure only well-formed plugins are loaded.

import type {
  PluginManifest,
  PluginType,
  PluginCapability,
  PluginValidationResult,
  PluginValidationError,
} from './types.js';
import { VALID_CAPABILITIES } from './types.js';

/** Valid plugin types */
const VALID_PLUGIN_TYPES: readonly PluginType[] = ['renderer', 'replay-processor', 'policy-pack'];

/** Semver pattern: major.minor.patch with optional pre-release */
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(-[\w.]+)?$/;

/** Semver range patterns we accept for apiVersion */
const SEMVER_RANGE_PATTERN = /^([~^]|>=?|<=?|)?\d+\.\d+\.\d+(-[\w.]+)?$/;

/**
 * Validate a plugin manifest for structural correctness.
 *
 * Checks:
 * - Required fields: id, name, version, type, apiVersion
 * - String format: non-empty strings, valid semver
 * - Plugin type: must be a known PluginType
 * - Capabilities: all entries must be known PluginCapability values
 * - Dependencies: must be non-empty strings if provided
 */
export function validateManifest(manifest: unknown): PluginValidationResult {
  const errors: PluginValidationError[] = [];

  if (!manifest || typeof manifest !== 'object') {
    return {
      valid: false,
      pluginId: undefined,
      errors: [{ field: 'manifest', message: 'Manifest must be a non-null object' }],
    };
  }

  const m = manifest as Record<string, unknown>;

  // --- Required string fields ---
  const requiredStrings = ['id', 'name', 'version', 'type', 'apiVersion'] as const;
  for (const field of requiredStrings) {
    if (m[field] === undefined || m[field] === null) {
      errors.push({ field, message: `"${field}" is required` });
    } else if (typeof m[field] !== 'string' || (m[field] as string).trim() === '') {
      errors.push({ field, message: `"${field}" must be a non-empty string` });
    }
  }

  const pluginId = typeof m.id === 'string' ? m.id : undefined;

  // --- Version format ---
  if (typeof m.version === 'string' && m.version.trim() !== '') {
    if (!SEMVER_PATTERN.test(m.version)) {
      errors.push({
        field: 'version',
        message: `"${m.version}" is not valid semver (expected major.minor.patch)`,
      });
    }
  }

  // --- API version format ---
  if (typeof m.apiVersion === 'string' && m.apiVersion.trim() !== '') {
    if (!SEMVER_RANGE_PATTERN.test(m.apiVersion)) {
      errors.push({
        field: 'apiVersion',
        message: `"${m.apiVersion}" is not a valid semver range`,
      });
    }
  }

  // --- Plugin type ---
  if (typeof m.type === 'string' && !VALID_PLUGIN_TYPES.includes(m.type as PluginType)) {
    errors.push({
      field: 'type',
      message: `"${m.type}" is not a valid plugin type (expected: ${VALID_PLUGIN_TYPES.join(', ')})`,
    });
  }

  // --- Optional description ---
  if (m.description !== undefined && typeof m.description !== 'string') {
    errors.push({ field: 'description', message: '"description" must be a string if provided' });
  }

  // --- Capabilities ---
  if (m.capabilities !== undefined) {
    if (!Array.isArray(m.capabilities)) {
      errors.push({
        field: 'capabilities',
        message: '"capabilities" must be an array if provided',
      });
    } else {
      for (let i = 0; i < m.capabilities.length; i++) {
        const cap = m.capabilities[i];
        if (typeof cap !== 'string') {
          errors.push({
            field: `capabilities[${i}]`,
            message: 'Each capability must be a string',
          });
        } else if (!VALID_CAPABILITIES.includes(cap as PluginCapability)) {
          errors.push({
            field: `capabilities[${i}]`,
            message: `"${cap}" is not a valid capability (expected: ${VALID_CAPABILITIES.join(', ')})`,
          });
        }
      }
    }
  }

  // --- Dependencies ---
  if (m.dependencies !== undefined) {
    if (!Array.isArray(m.dependencies)) {
      errors.push({
        field: 'dependencies',
        message: '"dependencies" must be an array if provided',
      });
    } else {
      for (let i = 0; i < m.dependencies.length; i++) {
        const dep = m.dependencies[i];
        if (typeof dep !== 'string' || dep.trim() === '') {
          errors.push({
            field: `dependencies[${i}]`,
            message: 'Each dependency must be a non-empty string',
          });
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    pluginId,
    errors,
  };
}

/**
 * Parse semver string into components.
 * Returns null if the string is not valid semver.
 */
function parseSemver(version: string): { major: number; minor: number; patch: number } | null {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
  };
}

/**
 * Check if a plugin's declared apiVersion is compatible with the host API version.
 *
 * Supports simple semver range operators:
 * - `^1.0.0` — compatible with 1.x.x (major must match, minor/patch >= specified)
 * - `~1.2.0` — compatible with 1.2.x (major+minor must match, patch >= specified)
 * - `>=1.0.0` — any version >= 1.0.0
 * - `1.0.0` — exact match (treated as ^1.0.0 for convenience)
 */
export function checkApiVersionCompatibility(
  pluginApiVersion: string,
  hostVersion: string
): { compatible: boolean; reason?: string } {
  const host = parseSemver(hostVersion);
  if (!host) {
    return { compatible: false, reason: `Invalid host version: "${hostVersion}"` };
  }

  // Extract operator and version
  const rangeMatch = pluginApiVersion.match(/^([~^]|>=?|<=?|)?(\d+\.\d+\.\d+.*)$/);
  if (!rangeMatch) {
    return { compatible: false, reason: `Invalid apiVersion format: "${pluginApiVersion}"` };
  }

  const operator = rangeMatch[1] || '^'; // Default to caret if no operator
  const required = parseSemver(rangeMatch[2]);
  if (!required) {
    return { compatible: false, reason: `Cannot parse version: "${rangeMatch[2]}"` };
  }

  switch (operator) {
    case '^': {
      // Major must match, host >= required
      if (host.major !== required.major) {
        return {
          compatible: false,
          reason: `Major version mismatch: host ${hostVersion} vs required ^${rangeMatch[2]}`,
        };
      }
      if (
        host.minor < required.minor ||
        (host.minor === required.minor && host.patch < required.patch)
      ) {
        return {
          compatible: false,
          reason: `Host version ${hostVersion} is older than required ^${rangeMatch[2]}`,
        };
      }
      return { compatible: true };
    }

    case '~': {
      // Major+minor must match, patch >= required
      if (host.major !== required.major || host.minor !== required.minor) {
        return {
          compatible: false,
          reason: `Version mismatch: host ${hostVersion} vs required ~${rangeMatch[2]}`,
        };
      }
      if (host.patch < required.patch) {
        return {
          compatible: false,
          reason: `Host patch ${hostVersion} is older than required ~${rangeMatch[2]}`,
        };
      }
      return { compatible: true };
    }

    case '>=': {
      const hostVal = host.major * 10000 + host.minor * 100 + host.patch;
      const reqVal = required.major * 10000 + required.minor * 100 + required.patch;
      if (hostVal < reqVal) {
        return {
          compatible: false,
          reason: `Host version ${hostVersion} is older than required >=${rangeMatch[2]}`,
        };
      }
      return { compatible: true };
    }

    case '>': {
      const hostVal = host.major * 10000 + host.minor * 100 + host.patch;
      const reqVal = required.major * 10000 + required.minor * 100 + required.patch;
      if (hostVal <= reqVal) {
        return {
          compatible: false,
          reason: `Host version ${hostVersion} is not greater than ${rangeMatch[2]}`,
        };
      }
      return { compatible: true };
    }

    case '<=': {
      const hostVal = host.major * 10000 + host.minor * 100 + host.patch;
      const reqVal = required.major * 10000 + required.minor * 100 + required.patch;
      if (hostVal > reqVal) {
        return {
          compatible: false,
          reason: `Host version ${hostVersion} is newer than required <=${rangeMatch[2]}`,
        };
      }
      return { compatible: true };
    }

    case '<': {
      const hostVal = host.major * 10000 + host.minor * 100 + host.patch;
      const reqVal = required.major * 10000 + required.minor * 100 + required.patch;
      if (hostVal >= reqVal) {
        return {
          compatible: false,
          reason: `Host version ${hostVersion} is not less than ${rangeMatch[2]}`,
        };
      }
      return { compatible: true };
    }

    default:
      return { compatible: false, reason: `Unknown operator: "${operator}"` };
  }
}

/**
 * Fully validate a plugin manifest including API version compatibility.
 *
 * This is the main entry point for plugin validation. It runs:
 * 1. Structural validation (validateManifest)
 * 2. API version compatibility check (checkApiVersionCompatibility)
 *
 * Returns a combined result with all errors.
 */
export function validatePlugin(manifest: unknown, hostVersion: string): PluginValidationResult {
  const structuralResult = validateManifest(manifest);

  // If structural validation failed, return early — can't check compatibility
  if (!structuralResult.valid) {
    return structuralResult;
  }

  const m = manifest as PluginManifest;
  const errors = [...structuralResult.errors];

  // Check API version compatibility
  const compat = checkApiVersionCompatibility(m.apiVersion, hostVersion);
  if (!compat.compatible) {
    errors.push({
      field: 'apiVersion',
      message: compat.reason || 'Incompatible API version',
    });
  }

  return {
    valid: errors.length === 0,
    pluginId: m.id,
    errors,
  };
}
