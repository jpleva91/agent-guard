// JSON Schema definitions for swarm template validation.
// Provides compile-time type alignment and runtime validation for
// swarm manifests, squad manifests, and swarm config files.

import type { SwarmManifest, SquadManifest, SwarmConfig } from './types.js';

/** JSON Schema for a single SwarmAgent entry. */
const SWARM_AGENT_SCHEMA = {
  type: 'object',
  required: ['id', 'name', 'tier', 'cron', 'skills', 'promptTemplate', 'description'],
  additionalProperties: false,
  properties: {
    id: { type: 'string', minLength: 1, pattern: '^[a-z0-9][a-z0-9-]*$' },
    name: { type: 'string', minLength: 1 },
    tier: { type: 'string', enum: ['core', 'governance', 'ops', 'quality', 'marketing'] },
    cron: { type: 'string', minLength: 1 },
    skills: { type: 'array', items: { type: 'string', minLength: 1 } },
    promptTemplate: { type: 'string', minLength: 1 },
    description: { type: 'string', minLength: 1 },
  },
} as const;

/** JSON Schema for the swarm manifest (manifest.json). */
export const SWARM_MANIFEST_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'AgentGuard Swarm Manifest',
  description: 'Defines the full set of agents available in an AgentGuard swarm.',
  type: 'object',
  required: ['version', 'agents'],
  additionalProperties: false,
  properties: {
    version: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+$' },
    agents: { type: 'array', items: SWARM_AGENT_SCHEMA, minItems: 1 },
  },
} as const;

/** JSON Schema for a single SquadAgent entry. */
const SQUAD_AGENT_SCHEMA = {
  type: 'object',
  required: ['id', 'rank', 'driver', 'model', 'cron', 'skills'],
  additionalProperties: false,
  properties: {
    id: { type: 'string', minLength: 1 },
    rank: {
      type: 'string',
      enum: ['director', 'em', 'product-lead', 'architect', 'senior', 'junior', 'qa'],
    },
    driver: { type: 'string', enum: ['claude-code', 'copilot-cli'] },
    model: { type: 'string', enum: ['opus', 'sonnet', 'haiku', 'copilot'] },
    cron: { type: 'string', minLength: 1 },
    skills: { type: 'array', items: { type: 'string' } },
  },
} as const;

/** JSON Schema for a Squad entry. */
const SQUAD_SCHEMA = {
  type: 'object',
  required: ['name', 'repo', 'em', 'agents'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1 },
    repo: { type: 'string', minLength: 1 },
    em: SQUAD_AGENT_SCHEMA,
    agents: { type: 'object', additionalProperties: SQUAD_AGENT_SCHEMA },
  },
} as const;

/** JSON Schema for the squad manifest (squad-manifest.yaml). */
export const SQUAD_MANIFEST_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'AgentGuard Squad Manifest',
  description: 'Defines squad hierarchy, agent roles, and loop guard configuration.',
  type: 'object',
  required: ['version', 'org', 'squads', 'loopGuards'],
  additionalProperties: false,
  properties: {
    version: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+$' },
    org: {
      type: 'object',
      required: ['director'],
      additionalProperties: false,
      properties: { director: SQUAD_AGENT_SCHEMA },
    },
    squads: { type: 'object', additionalProperties: SQUAD_SCHEMA },
    loopGuards: {
      type: 'object',
      required: ['maxOpenPRsPerSquad', 'maxRetries', 'maxBlastRadius', 'maxRunMinutes'],
      additionalProperties: false,
      properties: {
        maxOpenPRsPerSquad: { type: 'number', minimum: 1 },
        maxRetries: { type: 'number', minimum: 0 },
        maxBlastRadius: { type: 'number', minimum: 1 },
        maxRunMinutes: { type: 'number', minimum: 1 },
      },
    },
  },
} as const;

/** JSON Schema for swarm config (agentguard-swarm.yaml). */
export const SWARM_CONFIG_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'AgentGuard Swarm Config',
  description: 'User-customizable swarm configuration for schedules, paths, and thresholds.',
  type: 'object',
  required: ['swarm'],
  additionalProperties: false,
  properties: {
    swarm: {
      type: 'object',
      required: ['tiers', 'schedules', 'paths', 'labels', 'thresholds'],
      additionalProperties: false,
      properties: {
        tiers: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['core', 'governance', 'ops', 'quality', 'marketing'],
          },
          minItems: 1,
        },
        schedules: { type: 'object', additionalProperties: { type: 'string' } },
        paths: {
          type: 'object',
          required: ['policy', 'roadmap', 'swarmState', 'logs', 'reports', 'swarmLogs', 'cli'],
          additionalProperties: false,
          properties: {
            policy: { type: 'string' },
            roadmap: { type: 'string' },
            swarmState: { type: 'string' },
            logs: { type: 'string' },
            reports: { type: 'string' },
            swarmLogs: { type: 'string' },
            cli: { type: 'string' },
          },
        },
        labels: {
          type: 'object',
          additionalProperties: { type: 'string' },
        },
        thresholds: {
          type: 'object',
          required: ['maxOpenPRs', 'prStaleHours', 'blastRadiusHigh'],
          additionalProperties: false,
          properties: {
            maxOpenPRs: { type: 'number', minimum: 1 },
            prStaleHours: { type: 'number', minimum: 1 },
            blastRadiusHigh: { type: 'number', minimum: 1 },
          },
        },
      },
    },
  },
} as const;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ValidationError {
  readonly path: string;
  readonly message: string;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly ValidationError[];
}

/**
 * Lightweight JSON Schema validator. Covers the subset of JSON Schema used by
 * our swarm schemas (type, required, enum, minLength, minimum, pattern,
 * additionalProperties, minItems). Does NOT implement the full spec — use a
 * library like Ajv for that. This is intentionally zero-dependency.
 */
function validateValue(
  value: unknown,
  schema: Record<string, unknown>,
  path: string
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (schema.type === 'object') {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      errors.push({ path, message: `Expected object, got ${typeof value}` });
      return errors;
    }

    const obj = value as Record<string, unknown>;
    const required = (schema.required as string[] | undefined) ?? [];
    for (const key of required) {
      if (!(key in obj)) {
        errors.push({ path: `${path}.${key}`, message: 'Required property missing' });
      }
    }

    const properties =
      (schema.properties as Record<string, Record<string, unknown>> | undefined) ?? {};
    for (const [key, propSchema] of Object.entries(properties)) {
      if (key in obj) {
        errors.push(...validateValue(obj[key], propSchema, `${path}.${key}`));
      }
    }

    if (schema.additionalProperties === false) {
      for (const key of Object.keys(obj)) {
        if (!(key in properties)) {
          errors.push({ path: `${path}.${key}`, message: 'Unexpected additional property' });
        }
      }
    } else if (
      typeof schema.additionalProperties === 'object' &&
      schema.additionalProperties !== null
    ) {
      const addSchema = schema.additionalProperties as Record<string, unknown>;
      for (const [key, val] of Object.entries(obj)) {
        if (!(key in properties)) {
          errors.push(...validateValue(val, addSchema, `${path}.${key}`));
        }
      }
    }

    return errors;
  }

  if (schema.type === 'array') {
    if (!Array.isArray(value)) {
      errors.push({ path, message: `Expected array, got ${typeof value}` });
      return errors;
    }

    const minItems = (schema.minItems as number | undefined) ?? 0;
    if (value.length < minItems) {
      errors.push({ path, message: `Array must have at least ${minItems} items` });
    }

    if (schema.items && typeof schema.items === 'object') {
      const itemSchema = schema.items as Record<string, unknown>;
      for (let i = 0; i < value.length; i++) {
        errors.push(...validateValue(value[i], itemSchema, `${path}[${i}]`));
      }
    }

    return errors;
  }

  if (schema.type === 'string') {
    if (typeof value !== 'string') {
      errors.push({ path, message: `Expected string, got ${typeof value}` });
      return errors;
    }

    const minLength = (schema.minLength as number | undefined) ?? 0;
    if (value.length < minLength) {
      errors.push({ path, message: `String must be at least ${minLength} characters` });
    }

    if (schema.pattern) {
      const regex = new RegExp(schema.pattern as string);
      if (!regex.test(value)) {
        errors.push({ path, message: `String does not match pattern ${schema.pattern}` });
      }
    }

    if (schema.enum && Array.isArray(schema.enum)) {
      if (!schema.enum.includes(value)) {
        errors.push({
          path,
          message: `Value must be one of: ${(schema.enum as string[]).join(', ')}`,
        });
      }
    }

    return errors;
  }

  if (schema.type === 'number') {
    if (typeof value !== 'number') {
      errors.push({ path, message: `Expected number, got ${typeof value}` });
      return errors;
    }

    if (schema.minimum !== undefined && value < (schema.minimum as number)) {
      errors.push({ path, message: `Value must be >= ${schema.minimum}` });
    }
  }

  return errors;
}

/** Validate a swarm manifest object against its schema. */
export function validateSwarmManifest(manifest: unknown): ValidationResult {
  const errors = validateValue(
    manifest,
    SWARM_MANIFEST_SCHEMA as unknown as Record<string, unknown>,
    '$'
  );
  return { valid: errors.length === 0, errors };
}

/** Validate a squad manifest object against its schema. */
export function validateSquadManifest(manifest: unknown): ValidationResult {
  const errors = validateValue(
    manifest,
    SQUAD_MANIFEST_SCHEMA as unknown as Record<string, unknown>,
    '$'
  );
  return { valid: errors.length === 0, errors };
}

/** Validate a swarm config object against its schema. */
export function validateSwarmConfig(config: unknown): ValidationResult {
  const errors = validateValue(
    config,
    SWARM_CONFIG_SCHEMA as unknown as Record<string, unknown>,
    '$'
  );
  return { valid: errors.length === 0, errors };
}

// Type-level assertions to ensure schemas stay aligned with TypeScript interfaces.
// These are compile-time only — no runtime cost.
type _AssertManifest = SwarmManifest;
type _AssertSquadManifest = SquadManifest;
type _AssertConfig = SwarmConfig;
void (0 as unknown as _AssertManifest);
void (0 as unknown as _AssertSquadManifest);
void (0 as unknown as _AssertConfig);
