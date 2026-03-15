// Agent persona resolver — merges persona from multiple sources (policy, env, per-action).
// Layered: policy defaults < environment overrides < per-action overrides.

import type {
  AgentPersona,
  AgentModelMeta,
  TrustTier,
  AutonomyLevel,
  RiskTolerance,
  PersonaRole,
} from './types.js';

const TRUST_TIERS: readonly string[] = ['untrusted', 'limited', 'standard', 'elevated', 'admin'];
const AUTONOMY_LEVELS: readonly string[] = ['supervised', 'semi-autonomous', 'autonomous'];
const RISK_TOLERANCES: readonly string[] = ['conservative', 'moderate', 'aggressive'];
const PERSONA_ROLES: readonly string[] = ['developer', 'reviewer', 'ops', 'security', 'ci'];

function isValidTrustTier(v: string): v is TrustTier {
  return TRUST_TIERS.includes(v);
}

function isValidAutonomy(v: string): v is AutonomyLevel {
  return AUTONOMY_LEVELS.includes(v);
}

function isValidRiskTolerance(v: string): v is RiskTolerance {
  return RISK_TOLERANCES.includes(v);
}

function isValidRole(v: string): v is PersonaRole {
  return PERSONA_ROLES.includes(v);
}

function mergeTags(
  ...sources: (readonly string[] | undefined)[]
): readonly string[] | undefined {
  const merged = new Set<string>();
  for (const tags of sources) {
    if (tags) {
      for (const t of tags) merged.add(t);
    }
  }
  return merged.size > 0 ? [...merged] : undefined;
}

function mergeModelMeta(
  ...sources: (AgentModelMeta | undefined)[]
): AgentModelMeta | undefined {
  const result: Record<string, string> = {};
  for (const meta of sources) {
    if (!meta) continue;
    if (meta.model) result.model = meta.model;
    if (meta.provider) result.provider = meta.provider;
    if (meta.runtime) result.runtime = meta.runtime;
    if (meta.version) result.version = meta.version;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Merge persona from multiple sources. Later sources override earlier ones.
 * Order: policy defaults < environment overrides < per-action overrides.
 */
export function resolvePersona(
  policyPersona?: Partial<AgentPersona>,
  envPersona?: Partial<AgentPersona>,
  actionPersona?: Partial<AgentPersona>,
): AgentPersona {
  const result: AgentPersona = {
    modelMeta: mergeModelMeta(
      policyPersona?.modelMeta,
      envPersona?.modelMeta,
      actionPersona?.modelMeta,
    ),
    trustTier:
      actionPersona?.trustTier ?? envPersona?.trustTier ?? policyPersona?.trustTier,
    autonomy:
      actionPersona?.autonomy ?? envPersona?.autonomy ?? policyPersona?.autonomy,
    riskTolerance:
      actionPersona?.riskTolerance ?? envPersona?.riskTolerance ?? policyPersona?.riskTolerance,
    role: actionPersona?.role ?? envPersona?.role ?? policyPersona?.role,
    tags: mergeTags(policyPersona?.tags, envPersona?.tags, actionPersona?.tags),
  };

  return result;
}

/**
 * Read persona fields from environment variables.
 * Returns undefined if no persona env vars are set.
 *
 * Supported variables:
 * - AGENTGUARD_PERSONA_MODEL
 * - AGENTGUARD_PERSONA_PROVIDER
 * - AGENTGUARD_PERSONA_RUNTIME
 * - AGENTGUARD_PERSONA_VERSION
 * - AGENTGUARD_PERSONA_TRUST_TIER
 * - AGENTGUARD_PERSONA_AUTONOMY
 * - AGENTGUARD_PERSONA_RISK_TOLERANCE
 * - AGENTGUARD_PERSONA_ROLE
 * - AGENTGUARD_PERSONA_TAGS (comma-separated)
 */
export function personaFromEnv(
  env: Record<string, string | undefined> = process.env,
): Partial<AgentPersona> | undefined {
  const model = env.AGENTGUARD_PERSONA_MODEL;
  const provider = env.AGENTGUARD_PERSONA_PROVIDER;
  const runtime = env.AGENTGUARD_PERSONA_RUNTIME;
  const version = env.AGENTGUARD_PERSONA_VERSION;
  const trustTier = env.AGENTGUARD_PERSONA_TRUST_TIER;
  const autonomy = env.AGENTGUARD_PERSONA_AUTONOMY;
  const riskTolerance = env.AGENTGUARD_PERSONA_RISK_TOLERANCE;
  const role = env.AGENTGUARD_PERSONA_ROLE;
  const tagsRaw = env.AGENTGUARD_PERSONA_TAGS;

  let hasAny = false;
  const result: Record<string, unknown> = {};

  // Model metadata
  const modelMeta: Record<string, string> = {};
  if (model) { modelMeta.model = model; hasAny = true; }
  if (provider) { modelMeta.provider = provider; hasAny = true; }
  if (runtime) { modelMeta.runtime = runtime; hasAny = true; }
  if (version) { modelMeta.version = version; hasAny = true; }
  if (Object.keys(modelMeta).length > 0) {
    result.modelMeta = modelMeta;
  }

  // Behavioral traits
  if (trustTier && isValidTrustTier(trustTier)) {
    result.trustTier = trustTier;
    hasAny = true;
  }
  if (autonomy && isValidAutonomy(autonomy)) {
    result.autonomy = autonomy;
    hasAny = true;
  }
  if (riskTolerance && isValidRiskTolerance(riskTolerance)) {
    result.riskTolerance = riskTolerance;
    hasAny = true;
  }
  if (role && isValidRole(role)) {
    result.role = role;
    hasAny = true;
  }
  if (tagsRaw) {
    const tags = tagsRaw.split(',').map((t) => t.trim()).filter((t) => t.length > 0);
    if (tags.length > 0) {
      result.tags = tags;
      hasAny = true;
    }
  }

  return hasAny ? (result as Partial<AgentPersona>) : undefined;
}

export {
  TRUST_TIERS,
  AUTONOMY_LEVELS,
  RISK_TOLERANCES,
  PERSONA_ROLES,
  isValidTrustTier,
  isValidAutonomy,
  isValidRiskTolerance,
  isValidRole,
};
