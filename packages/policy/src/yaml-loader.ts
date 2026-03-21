// YAML policy loader — parses simple YAML policy files into LoadedPolicy format.
// Supports the subset of YAML needed for AgentGuard policy definitions.
// No external dependencies — minimal line-based parser for constrained format.

import type { PolicyRule, LoadedPolicy, PersonaCondition, ForecastCondition } from './evaluator.js';
import type { AgentPersona } from '@red-codes/core';

export interface YamlPersonaDef {
  model?: string;
  provider?: string;
  runtime?: string;
  version?: string;
  trustTier?: string;
  autonomy?: string;
  riskTolerance?: string;
  role?: string;
  tags?: string[];
}

export interface YamlPolicyDef {
  id?: string;
  name?: string;
  description?: string;
  severity?: number;
  version?: string;
  agentguardVersion?: string;
  extends?: string[];
  persona?: YamlPersonaDef;
  rules?: YamlRule[];
  /** Kernel invariant IDs to disable (human-operator override) */
  disabledInvariants?: string[];
  /** Top-level enforcement mode: 'monitor' (warn) or 'enforce' (block) */
  mode?: 'monitor' | 'enforce';
  /** Named policy pack to apply (e.g., 'essentials', 'strict') */
  pack?: string;
  /** Per-invariant mode overrides: invariant ID → 'monitor' | 'enforce' */
  invariantModes?: Record<string, 'monitor' | 'enforce'>;
}

interface YamlRule {
  action?: string | string[];
  effect?: string;
  target?: string;
  branches?: string[];
  reason?: string;
  limit?: number;
  requireTests?: boolean;
  requireFormat?: boolean;
  persona?: PersonaCondition;
  intervention?: string;
  forecast?: ForecastCondition;
}

function trimQuotes(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

function parseValue(raw: string): string | number | boolean {
  const s = raw.trim();
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s === 'null' || s === '~') return '';
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  if (/^-?\d+\.\d+$/.test(s)) return parseFloat(s);
  return trimQuotes(s);
}

function parseInlineArray(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return [];
  const inner = trimmed.slice(1, -1);
  return inner
    .split(',')
    .map((s) => trimQuotes(s.trim()))
    .filter((s) => s.length > 0);
}

function indentLevel(line: string): number {
  const match = line.match(/^(\s*)/);
  return match ? match[1].length : 0;
}

function applyPersonaField(persona: PersonaCondition, key: string, val: string): void {
  switch (key) {
    case 'trustTier': {
      const arr = parseInlineArray(val);
      if (arr.length > 0) persona.trustTier = arr;
      else if (val) persona.trustTier = [trimQuotes(val)];
      break;
    }
    case 'role': {
      const arr = parseInlineArray(val);
      if (arr.length > 0) persona.role = arr;
      else if (val) persona.role = [trimQuotes(val)];
      break;
    }
    case 'autonomy': {
      const arr = parseInlineArray(val);
      if (arr.length > 0) persona.autonomy = arr;
      else if (val) persona.autonomy = [trimQuotes(val)];
      break;
    }
    case 'riskTolerance': {
      const arr = parseInlineArray(val);
      if (arr.length > 0) persona.riskTolerance = arr;
      else if (val) persona.riskTolerance = [trimQuotes(val)];
      break;
    }
    case 'tags': {
      const arr = parseInlineArray(val);
      if (arr.length > 0) persona.tags = arr;
      else if (val) persona.tags = [trimQuotes(val)];
      break;
    }
  }
}

function applyForecastField(forecast: ForecastCondition, key: string, val: string): void {
  switch (key) {
    case 'testRiskScore': {
      const n = parseValue(val);
      if (typeof n === 'number') forecast.testRiskScore = n;
      break;
    }
    case 'blastRadiusScore': {
      const n = parseValue(val);
      if (typeof n === 'number') forecast.blastRadiusScore = n;
      break;
    }
    case 'predictedFileCount': {
      const n = parseValue(val);
      if (typeof n === 'number') forecast.predictedFileCount = n;
      break;
    }
    case 'dependencyCount': {
      const n = parseValue(val);
      if (typeof n === 'number') forecast.dependencyCount = n;
      break;
    }
    case 'riskLevel': {
      const VALID_RISK_LEVELS: Array<'low' | 'medium' | 'high'> = ['low', 'medium', 'high'];
      const arr = parseInlineArray(val);
      if (arr.length > 0) {
        const filtered = arr.filter((v) =>
          VALID_RISK_LEVELS.includes(v as 'low' | 'medium' | 'high')
        ) as Array<'low' | 'medium' | 'high'>;
        if (filtered.length > 0) forecast.riskLevel = filtered;
      } else if (val) {
        const trimmed = trimQuotes(val);
        if (VALID_RISK_LEVELS.includes(trimmed as 'low' | 'medium' | 'high')) {
          forecast.riskLevel = [trimmed as 'low' | 'medium' | 'high'];
        }
      }
      break;
    }
  }
}

function applyTopLevelPersonaField(persona: YamlPersonaDef, key: string, val: string): void {
  switch (key) {
    case 'model':
      persona.model = trimQuotes(val);
      break;
    case 'provider':
      persona.provider = trimQuotes(val);
      break;
    case 'runtime':
      persona.runtime = trimQuotes(val);
      break;
    case 'version':
      persona.version = trimQuotes(val);
      break;
    case 'trustTier':
      persona.trustTier = trimQuotes(val);
      break;
    case 'autonomy':
      persona.autonomy = trimQuotes(val);
      break;
    case 'riskTolerance':
      persona.riskTolerance = trimQuotes(val);
      break;
    case 'role':
      persona.role = trimQuotes(val);
      break;
    case 'tags': {
      const arr = parseInlineArray(val);
      if (arr.length > 0) persona.tags = arr;
      else if (val) persona.tags = [trimQuotes(val)];
      break;
    }
  }
}

export function parseYamlPolicy(yaml: string): YamlPolicyDef {
  const lines = yaml.split('\n');
  const result: YamlPolicyDef = {};
  const rules: YamlRule[] = [];
  let currentRule: YamlRule | null = null;
  let inRules = false;
  let inBranches = false;
  let inActionArray = false;
  let inExtends = false;
  let inDisabledInvariants = false;
  let inTopLevelPersona = false;
  let inInvariants = false;
  let inRulePersona = false;
  let inRuleForecast = false;
  let ruleStartIndent = 0;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, '');

    // Skip blank lines and comments
    if (!line.trim() || line.trim().startsWith('#')) continue;

    const indent = indentLevel(line);
    const trimmed = line.trim();

    // Top-level keys (indent 0)
    if (indent === 0) {
      inRules = false;
      inBranches = false;
      inExtends = false;
      inDisabledInvariants = false;
      inTopLevelPersona = false;
      inInvariants = false;
      inRulePersona = false;
      if (currentRule) {
        rules.push(currentRule);
        currentRule = null;
      }

      const colonIdx = trimmed.indexOf(':');
      if (colonIdx === -1) continue;

      const key = trimmed.slice(0, colonIdx).trim();
      const val = trimmed.slice(colonIdx + 1).trim();

      switch (key) {
        case 'id':
          result.id = trimQuotes(val);
          break;
        case 'name':
          result.name = trimQuotes(val);
          break;
        case 'description':
          result.description = trimQuotes(val);
          break;
        case 'severity':
          result.severity = parseInt(val, 10);
          break;
        case 'version':
          result.version = trimQuotes(val);
          break;
        case 'agentguardVersion':
          result.agentguardVersion = trimQuotes(val);
          break;
        case 'extends':
          if (val) {
            // Inline array: extends: ["@agentguard/security-pack", "./custom"]
            const arr = parseInlineArray(val);
            if (arr.length > 0) {
              result.extends = arr;
            }
          } else {
            // Multi-line array follows
            inExtends = true;
            result.extends = [];
          }
          break;
        case 'disabledInvariants':
          if (val) {
            // Inline array: disabledInvariants: [no-cicd-config-modification]
            const diArr = parseInlineArray(val);
            if (diArr.length > 0) {
              result.disabledInvariants = diArr;
            }
          } else {
            // Multi-line array follows
            inDisabledInvariants = true;
            result.disabledInvariants = [];
          }
          break;
        case 'persona':
          inTopLevelPersona = true;
          result.persona = result.persona || {};
          break;
        case 'rules':
          inRules = true;
          break;
        case 'mode':
          if (val === 'monitor' || val === 'enforce') {
            result.mode = val;
          }
          break;
        case 'pack':
          result.pack = trimQuotes(val);
          break;
        case 'invariants':
          if (!val) {
            inInvariants = true;
            result.invariantModes = {};
          }
          break;
      }
      continue;
    }

    // Inside top-level persona block
    if (inTopLevelPersona && !inRules) {
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx !== -1) {
        const key = trimmed.slice(0, colonIdx).trim();
        const val = trimmed.slice(colonIdx + 1).trim();
        result.persona = result.persona || {};
        applyTopLevelPersonaField(result.persona, key, val);
      }
      continue;
    }

    // Inside invariants block (per-invariant mode overrides)
    if (inInvariants && !inRules) {
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx !== -1) {
        const invId = trimmed.slice(0, colonIdx).trim();
        const invMode = trimQuotes(trimmed.slice(colonIdx + 1).trim());
        if (invMode === 'monitor' || invMode === 'enforce') {
          result.invariantModes = result.invariantModes || {};
          result.invariantModes[invId] = invMode;
        }
      }
      continue;
    }

    // Inside extends array (multi-line)
    if (inExtends && trimmed.startsWith('- ')) {
      result.extends = result.extends || [];
      result.extends.push(trimQuotes(trimmed.slice(2).trim()));
      continue;
    }

    // Inside disabledInvariants array (multi-line)
    if (inDisabledInvariants && trimmed.startsWith('- ')) {
      result.disabledInvariants = result.disabledInvariants || [];
      result.disabledInvariants.push(trimQuotes(trimmed.slice(2).trim()));
      continue;
    }

    // Inside rules array
    if (inRules) {
      // Continuation of action array (must check before new-rule detection)
      if (inActionArray && trimmed.startsWith('- ') && currentRule && indent > ruleStartIndent) {
        if (!Array.isArray(currentRule.action)) {
          currentRule.action = [];
        }
        (currentRule.action as string[]).push(trimQuotes(trimmed.slice(2).trim()));
        continue;
      }

      // New rule entry (- action: ...)
      if (trimmed.startsWith('- ')) {
        inActionArray = false;
        if (currentRule) rules.push(currentRule);
        currentRule = {};
        inBranches = false;
        inRulePersona = false;
        inRuleForecast = false;
        ruleStartIndent = indent;

        const rest = trimmed.slice(2).trim();
        const colonIdx = rest.indexOf(':');
        if (colonIdx !== -1) {
          const key = rest.slice(0, colonIdx).trim();
          const val = rest.slice(colonIdx + 1).trim();

          if (key === 'action' && !val) {
            inActionArray = true;
            currentRule.action = [];
            continue;
          }

          applyRuleField(currentRule, key, val);
        }
        continue;
      }

      // Inside rule-level persona block
      if (inRulePersona && currentRule) {
        const colonIdx = trimmed.indexOf(':');
        if (colonIdx !== -1) {
          const key = trimmed.slice(0, colonIdx).trim();
          const val = trimmed.slice(colonIdx + 1).trim();
          currentRule.persona = currentRule.persona || {};
          applyPersonaField(currentRule.persona, key, val);
        }
        continue;
      }

      // Inside rule-level forecast block
      if (inRuleForecast && currentRule) {
        const colonIdx = trimmed.indexOf(':');
        if (colonIdx !== -1) {
          const key = trimmed.slice(0, colonIdx).trim();
          const val = trimmed.slice(colonIdx + 1).trim();
          currentRule.forecast = currentRule.forecast || {};
          applyForecastField(currentRule.forecast, key, val);
        }
        continue;
      }

      // Continuation of branches array
      if (inBranches && trimmed.startsWith('- ') && currentRule) {
        currentRule.branches = currentRule.branches || [];
        currentRule.branches.push(trimQuotes(trimmed.slice(2).trim()));
        continue;
      }

      // Rule property
      if (currentRule) {
        inBranches = false;
        inActionArray = false;
        inRuleForecast = false;
        const colonIdx = trimmed.indexOf(':');
        if (colonIdx !== -1) {
          const key = trimmed.slice(0, colonIdx).trim();
          const val = trimmed.slice(colonIdx + 1).trim();

          if (key === 'action' && !val) {
            inActionArray = true;
            currentRule.action = [];
            continue;
          }

          if (key === 'branches' && !val) {
            inBranches = true;
            currentRule.branches = [];
            continue;
          }

          if (key === 'persona' && !val) {
            inRulePersona = true;
            currentRule.persona = {};
            continue;
          }

          if (key === 'forecast' && !val) {
            inRuleForecast = true;
            inRulePersona = false;
            currentRule.forecast = {};
            continue;
          }

          applyRuleField(currentRule, key, val);
        }
      }
    }
  }

  if (currentRule) rules.push(currentRule);
  if (rules.length > 0) result.rules = rules;

  return result;
}

function applyRuleField(rule: YamlRule, key: string, val: string): void {
  switch (key) {
    case 'action': {
      const arr = parseInlineArray(val);
      if (arr.length > 0) {
        rule.action = arr;
      } else {
        rule.action = trimQuotes(val);
      }
      break;
    }
    case 'effect':
      rule.effect = trimQuotes(val);
      break;
    case 'target':
      rule.target = trimQuotes(val);
      break;
    case 'reason':
      rule.reason = trimQuotes(val);
      break;
    case 'limit': {
      const n = parseValue(val);
      if (typeof n === 'number') rule.limit = n;
      break;
    }
    case 'requireTests':
      rule.requireTests = val === 'true';
      break;
    case 'requireFormat':
      rule.requireFormat = val === 'true';
      break;
    case 'branches': {
      const arr = parseInlineArray(val);
      if (arr.length > 0) rule.branches = arr;
      break;
    }
    case 'intervention':
      rule.intervention = trimQuotes(val);
      break;
  }
}

function convertRule(yamlRule: YamlRule): PolicyRule {
  const conditions: PolicyRule['conditions'] = {};
  let hasConditions = false;

  if (yamlRule.target) {
    conditions.scope = [yamlRule.target];
    hasConditions = true;
  }

  if (yamlRule.branches) {
    conditions.branches = yamlRule.branches;
    hasConditions = true;
  }

  if (yamlRule.limit !== undefined) {
    conditions.limit = yamlRule.limit;
    hasConditions = true;
  }

  if (yamlRule.requireTests !== undefined) {
    conditions.requireTests = yamlRule.requireTests;
    hasConditions = true;
  }

  if (yamlRule.requireFormat !== undefined) {
    conditions.requireFormat = yamlRule.requireFormat;
    hasConditions = true;
  }

  if (yamlRule.persona) {
    conditions.persona = yamlRule.persona;
    hasConditions = true;
  }

  if (yamlRule.forecast) {
    conditions.forecast = yamlRule.forecast;
    hasConditions = true;
  }

  let action: string | string[];
  if (Array.isArray(yamlRule.action)) {
    action = yamlRule.action.length > 0 ? yamlRule.action : '*';
  } else {
    action = yamlRule.action || '*';
  }

  const rule: PolicyRule = {
    action,
    effect: (yamlRule.effect as 'allow' | 'deny') || 'deny',
    conditions: hasConditions ? conditions : undefined,
    reason: yamlRule.reason,
  };

  if (yamlRule.intervention) {
    rule.intervention = yamlRule.intervention as PolicyRule['intervention'];
  }

  return rule;
}

/** Convert a YamlPersonaDef to an AgentPersona (for policy defaults). */
export function yamlPersonaToAgentPersona(def: YamlPersonaDef): AgentPersona {
  const persona: Record<string, unknown> = {};
  const modelMeta: Record<string, string> = {};

  if (def.model) modelMeta.model = def.model;
  if (def.provider) modelMeta.provider = def.provider;
  if (def.runtime) modelMeta.runtime = def.runtime;
  if (def.version) modelMeta.version = def.version;
  if (Object.keys(modelMeta).length > 0) persona.modelMeta = modelMeta;

  if (def.trustTier) persona.trustTier = def.trustTier;
  if (def.autonomy) persona.autonomy = def.autonomy;
  if (def.riskTolerance) persona.riskTolerance = def.riskTolerance;
  if (def.role) persona.role = def.role;
  if (def.tags) persona.tags = def.tags;

  return persona as AgentPersona;
}

export function loadYamlPolicy(yaml: string, defaultId?: string): LoadedPolicy {
  const def = parseYamlPolicy(yaml);

  const policy: LoadedPolicy = {
    id: def.id || defaultId || 'yaml-policy',
    name: def.name || 'YAML Policy',
    description: def.description,
    rules: (def.rules || []).map(convertRule),
    severity: def.severity ?? 3,
  };

  if (def.version) {
    policy.version = def.version;
  }

  if (def.agentguardVersion) {
    policy.agentguardVersion = def.agentguardVersion;
  }

  if (def.persona) {
    (policy as LoadedPolicy & { persona?: AgentPersona }).persona = yamlPersonaToAgentPersona(
      def.persona
    );
  }

  if (def.disabledInvariants && def.disabledInvariants.length > 0) {
    policy.disabledInvariants = def.disabledInvariants;
  }

  if (def.mode) {
    policy.mode = def.mode;
  }

  if (def.pack) {
    policy.pack = def.pack;
  }

  if (def.invariantModes && Object.keys(def.invariantModes).length > 0) {
    policy.invariantModes = def.invariantModes;
  }

  return policy;
}

export function loadYamlPolicies(yaml: string): LoadedPolicy[] {
  return [loadYamlPolicy(yaml)];
}
