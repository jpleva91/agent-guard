// YAML policy loader — parses simple YAML policy files into LoadedPolicy format.
// Supports the subset of YAML needed for AgentGuard policy definitions.
// No external dependencies — minimal line-based parser for constrained format.

import type { PolicyRule, LoadedPolicy } from './evaluator.js';

export interface YamlPolicyDef {
  id?: string;
  name?: string;
  description?: string;
  severity?: number;
  extends?: string[];
  rules?: YamlRule[];
}

interface YamlRule {
  action?: string;
  effect?: string;
  target?: string;
  branches?: string[];
  reason?: string;
  limit?: number;
  requireTests?: boolean;
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

export function parseYamlPolicy(yaml: string): YamlPolicyDef {
  const lines = yaml.split('\n');
  const result: YamlPolicyDef = {};
  const rules: YamlRule[] = [];
  let currentRule: YamlRule | null = null;
  let inRules = false;
  let inBranches = false;
  let inExtends = false;

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
        case 'rules':
          inRules = true;
          break;
      }
      continue;
    }

    // Inside extends array (multi-line)
    if (inExtends && trimmed.startsWith('- ')) {
      result.extends = result.extends || [];
      result.extends.push(trimQuotes(trimmed.slice(2).trim()));
      continue;
    }

    // Inside rules array
    if (inRules) {
      // New rule entry (- action: ...)
      if (trimmed.startsWith('- ')) {
        if (currentRule) rules.push(currentRule);
        currentRule = {};
        inBranches = false;

        const rest = trimmed.slice(2).trim();
        const colonIdx = rest.indexOf(':');
        if (colonIdx !== -1) {
          const key = rest.slice(0, colonIdx).trim();
          const val = rest.slice(colonIdx + 1).trim();
          applyRuleField(currentRule, key, val);
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
        const colonIdx = trimmed.indexOf(':');
        if (colonIdx !== -1) {
          const key = trimmed.slice(0, colonIdx).trim();
          const val = trimmed.slice(colonIdx + 1).trim();

          if (key === 'branches' && !val) {
            inBranches = true;
            currentRule.branches = [];
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
    case 'action':
      rule.action = trimQuotes(val);
      break;
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
    case 'branches': {
      const arr = parseInlineArray(val);
      if (arr.length > 0) rule.branches = arr;
      break;
    }
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

  return {
    action: yamlRule.action || '*',
    effect: (yamlRule.effect as 'allow' | 'deny') || 'deny',
    conditions: hasConditions ? conditions : undefined,
    reason: yamlRule.reason,
  };
}

export function loadYamlPolicy(yaml: string, defaultId?: string): LoadedPolicy {
  const def = parseYamlPolicy(yaml);

  return {
    id: def.id || defaultId || 'yaml-policy',
    name: def.name || 'YAML Policy',
    description: def.description,
    rules: (def.rules || []).map(convertRule),
    severity: def.severity ?? 3,
  };
}

export function loadYamlPolicies(yaml: string): LoadedPolicy[] {
  return [loadYamlPolicy(yaml)];
}
