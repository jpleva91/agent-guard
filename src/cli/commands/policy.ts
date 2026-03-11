// CLI command: agentguard policy — policy management tools.
//
// Subcommands:
//   validate <file>   Validate a policy file without starting the runtime

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from '../args.js';
import { bold, color, dim } from '../colors.js';
import { validatePolicy, VALID_ACTIONS } from '../../policy/loader.js';
import { parseYamlPolicy } from '../../policy/yaml-loader.js';
import { ACTION_TYPES } from '../../core/actions.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ValidationIssue {
  readonly level: 'error' | 'warning' | 'info';
  readonly message: string;
  readonly rule?: number;
}

export interface PolicyValidationResult {
  readonly file: string;
  readonly valid: boolean;
  readonly errors: readonly ValidationIssue[];
  readonly warnings: readonly ValidationIssue[];
  readonly info: readonly ValidationIssue[];
  readonly ruleCount: number;
}

// ---------------------------------------------------------------------------
// Validation Logic
// ---------------------------------------------------------------------------

/**
 * Parse a policy file (YAML or JSON) and return the raw parsed object.
 * Returns null and an error message if parsing fails.
 */
function parseFile(
  filePath: string,
  content: string
): { parsed: Record<string, unknown>; error: string | null } {
  if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
    try {
      const def = parseYamlPolicy(content);
      // Convert YamlPolicyDef to a generic record for validatePolicy
      const record: Record<string, unknown> = {};
      if (def.id) record.id = def.id;
      if (def.name) record.name = def.name;
      if (def.description) record.description = def.description;
      if (def.severity !== undefined) record.severity = def.severity;
      if (def.extends) record.extends = def.extends;
      if (def.rules) {
        record.rules = def.rules.map((r) => {
          const rule: Record<string, unknown> = {};
          if (r.action) rule.action = r.action;
          if (r.effect) rule.effect = r.effect;
          if (r.target) rule.conditions = { scope: [r.target] };
          if (r.branches) {
            rule.conditions = { ...(rule.conditions as object), branches: r.branches };
          }
          if (r.limit !== undefined) {
            rule.conditions = { ...(rule.conditions as object), limit: r.limit };
          }
          if (r.requireTests !== undefined) {
            rule.conditions = { ...(rule.conditions as object), requireTests: r.requireTests };
          }
          if (r.reason) rule.reason = r.reason;
          return rule;
        });
      }
      return { parsed: record, error: null };
    } catch (e) {
      return {
        parsed: {},
        error: `YAML parse error: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    if (typeof parsed !== 'object' || parsed === null) {
      return { parsed: {}, error: 'JSON root must be an object' };
    }
    return { parsed, error: null };
  } catch (e) {
    return {
      parsed: {},
      error: `JSON parse error: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/**
 * Run strict-mode checks — best practice recommendations that go beyond
 * basic structural validation.
 */
function strictChecks(parsed: Record<string, unknown>): {
  warnings: ValidationIssue[];
  info: ValidationIssue[];
} {
  const warnings: ValidationIssue[] = [];
  const info: ValidationIssue[] = [];
  const rules = parsed.rules as Array<Record<string, unknown>> | undefined;

  if (!Array.isArray(rules)) return { warnings, info };

  // Check for unrecognized action patterns against both policy VALID_ACTIONS
  // and the canonical ACTION_TYPES registry from src/core/actions.ts
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    const actions = Array.isArray(rule.action) ? rule.action : [rule.action];
    for (const action of actions) {
      if (typeof action === 'string' && action !== '*' && !action.endsWith('.*')) {
        if (!VALID_ACTIONS.has(action) && !ACTION_TYPES[action]) {
          warnings.push({
            level: 'warning',
            message: `Unrecognized action "${action}" — not found in canonical action registry or policy actions`,
            rule: i,
          });
        }
      }
    }
  }

  // Check for rule conflicts: same action pattern with both allow and deny rules
  const actionEffects = new Map<string, { allow: number[]; deny: number[] }>();
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    const actions = Array.isArray(rule.action) ? rule.action : [rule.action];
    const effect = rule.effect as string;
    if (effect !== 'allow' && effect !== 'deny') continue;
    for (const action of actions) {
      if (typeof action !== 'string') continue;
      let entry = actionEffects.get(action);
      if (!entry) {
        entry = { allow: [], deny: [] };
        actionEffects.set(action, entry);
      }
      entry[effect].push(i);
    }
  }

  for (const [action, effects] of actionEffects) {
    if (effects.allow.length > 0 && effects.deny.length > 0) {
      warnings.push({
        level: 'warning',
        message: `Conflicting rules for "${action}": deny in rules [${effects.deny.join(', ')}] and allow in rules [${effects.allow.join(', ')}] — deny rules take precedence`,
      });
    }
  }

  // Check for missing description
  if (!parsed.description) {
    info.push({
      level: 'info',
      message: 'Policy has no description — consider adding one for documentation',
    });
  }

  // Check if there are no deny rules
  const hasDenyRule = rules.some((r) => r.effect === 'deny');
  if (!hasDenyRule) {
    warnings.push({
      level: 'warning',
      message: 'Policy has no deny rules — all actions will be allowed',
    });
  }

  // Check for overlapping rules (same action + effect appearing multiple times)
  const ruleSignatures = new Map<string, number[]>();
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    const actions = Array.isArray(rule.action) ? rule.action : [rule.action];
    for (const action of actions) {
      const sig = `${action}:${rule.effect}`;
      const existing = ruleSignatures.get(sig);
      if (existing) {
        existing.push(i);
      } else {
        ruleSignatures.set(sig, [i]);
      }
    }
  }

  for (const [sig, indices] of ruleSignatures) {
    if (indices.length > 1) {
      const [action, effect] = sig.split(':');
      info.push({
        level: 'info',
        message: `Multiple ${effect} rules for "${action}" (rules ${indices.join(', ')}) — later rules may be unreachable`,
      });
    }
  }

  // Check for deny-then-allow on the same action (potential shadow)
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    if (rule.effect !== 'allow') continue;

    const allowActions = Array.isArray(rule.action) ? rule.action : [rule.action];
    for (const action of allowActions) {
      // Check if a broader deny rule exists (e.g., deny on * or on action.*)
      for (let j = 0; j < rules.length; j++) {
        if (j === i) continue;
        const other = rules[j];
        if (other.effect !== 'deny') continue;

        const denyActions = Array.isArray(other.action) ? other.action : [other.action];
        for (const denyAction of denyActions) {
          if (denyAction === '*' && typeof action === 'string') {
            // Wildcard deny blocks everything — allow rule creates an exception
            info.push({
              level: 'info',
              message: `Rule ${i} (allow "${action}") creates an exception to rule ${j} (deny "*")`,
              rule: i,
            });
          }
        }
      }
    }
  }

  return { warnings, info };
}

/**
 * Validate a policy file and return structured results.
 */
export function validatePolicyFile(filePath: string): PolicyValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const info: ValidationIssue[] = [];

  const absPath = resolve(filePath);

  if (!existsSync(absPath)) {
    return {
      file: filePath,
      valid: false,
      errors: [{ level: 'error', message: `File not found: ${absPath}` }],
      warnings: [],
      info: [],
      ruleCount: 0,
    };
  }

  let content: string;
  try {
    content = readFileSync(absPath, 'utf8');
  } catch (e) {
    return {
      file: filePath,
      valid: false,
      errors: [
        {
          level: 'error',
          message: `Cannot read file: ${e instanceof Error ? e.message : String(e)}`,
        },
      ],
      warnings: [],
      info: [],
      ruleCount: 0,
    };
  }

  if (!content.trim()) {
    return {
      file: filePath,
      valid: false,
      errors: [{ level: 'error', message: 'File is empty' }],
      warnings: [],
      info: [],
      ruleCount: 0,
    };
  }

  // Step 1: Parse
  const { parsed, error: parseError } = parseFile(absPath, content);
  if (parseError) {
    return {
      file: filePath,
      valid: false,
      errors: [{ level: 'error', message: parseError }],
      warnings: [],
      info: [],
      ruleCount: 0,
    };
  }

  // Step 2: Structural validation using existing validatePolicy
  const result = validatePolicy(parsed);
  if (!result.valid) {
    for (const err of result.errors) {
      errors.push({ level: 'error', message: err });
    }
  }

  const ruleCount = Array.isArray(parsed.rules) ? parsed.rules.length : 0;

  return {
    file: filePath,
    valid: errors.length === 0,
    errors,
    warnings,
    info,
    ruleCount,
  };
}

/**
 * Validate a policy file with optional strict checks.
 */
export function validatePolicyFileStrict(
  filePath: string,
  strict: boolean
): PolicyValidationResult {
  const result = validatePolicyFile(filePath);

  if (!result.valid || !strict) return result;

  // Run strict checks on the parsed content
  const absPath = resolve(filePath);
  const content = readFileSync(absPath, 'utf8');
  const { parsed } = parseFile(absPath, content);
  const { warnings, info } = strictChecks(parsed);

  return {
    ...result,
    warnings: [...result.warnings, ...warnings],
    info: [...result.info, ...info],
  };
}

// ---------------------------------------------------------------------------
// Output Formatting
// ---------------------------------------------------------------------------

function formatTerminalResult(result: PolicyValidationResult): string {
  const lines: string[] = [];
  const icon = result.valid ? color('\u2713', 'green') : color('\u2717', 'red');
  const verdict = result.valid ? color('VALID', 'green') : color('INVALID', 'red');

  lines.push('');
  lines.push(`  ${icon} Policy Validation — ${verdict}`);
  lines.push(`  File: ${dim(result.file)}`);
  lines.push(`  Rules: ${result.ruleCount}`);

  if (result.errors.length > 0) {
    lines.push('');
    lines.push(`  ${color('Errors:', 'red')}`);
    for (const issue of result.errors) {
      const ruleRef = issue.rule !== undefined ? ` ${dim(`(rule ${issue.rule})`)}` : '';
      lines.push(`    ${color('\u2717', 'red')} ${issue.message}${ruleRef}`);
    }
  }

  if (result.warnings.length > 0) {
    lines.push('');
    lines.push(`  ${color('Warnings:', 'yellow')}`);
    for (const issue of result.warnings) {
      const ruleRef = issue.rule !== undefined ? ` ${dim(`(rule ${issue.rule})`)}` : '';
      lines.push(`    ${color('!', 'yellow')} ${issue.message}${ruleRef}`);
    }
  }

  if (result.info.length > 0) {
    lines.push('');
    lines.push(`  ${color('Info:', 'cyan')}`);
    for (const issue of result.info) {
      const ruleRef = issue.rule !== undefined ? ` ${dim(`(rule ${issue.rule})`)}` : '';
      lines.push(`    ${color('\u2139', 'cyan')} ${issue.message}${ruleRef}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Subcommand: validate
// ---------------------------------------------------------------------------

async function policyValidate(args: string[]): Promise<number> {
  const parsed = parseArgs(args, {
    boolean: ['--json', '--strict'],
  });

  const jsonOutput = !!parsed.flags.json;
  const strict = !!parsed.flags.strict;
  const filePath = parsed.positional[0];

  if (!filePath) {
    process.stderr.write('\n  Usage: agentguard policy validate <file> [flags]\n');
    process.stderr.write('\n  Flags:\n');
    process.stderr.write('    --json      Output as JSON\n');
    process.stderr.write('    --strict    Include best-practice recommendations\n\n');
    return 1;
  }

  const result = validatePolicyFileStrict(filePath, strict);

  if (jsonOutput) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    process.stderr.write(formatTerminalResult(result));
  }

  // Exit codes: 0 = valid, 1 = errors, 2 = warnings-only
  if (!result.valid) return 1;
  if (result.warnings.length > 0) return 2;
  return 0;
}

// ---------------------------------------------------------------------------
// Main Command Router
// ---------------------------------------------------------------------------

/**
 * Main policy command handler.
 * Routes to the appropriate subcommand based on the first argument.
 */
export async function policy(args: string[]): Promise<number> {
  const subcommand = args[0];

  switch (subcommand) {
    case 'validate':
      return policyValidate(args.slice(1));

    case undefined:
    case 'help':
    case '--help':
    case '-h':
      printPolicyHelp();
      return 0;

    default:
      console.error(`  Unknown policy subcommand: ${subcommand}`);
      console.error('  Run "agentguard policy help" for usage info.');
      return 1;
  }
}

function printPolicyHelp(): void {
  console.log(`
  ${bold('agentguard policy')} — Policy management tools

  ${bold('Usage:')}
    agentguard policy <command> [options]

  ${bold('Commands:')}
    validate <file>   Validate a policy file (YAML or JSON)

  ${bold('Flags (validate):')}
    --json            Output validation result as JSON
    --strict          Include best-practice recommendations

  ${bold('Exit codes:')}
    0                 Policy is valid
    1                 Policy has errors
    2                 Policy is valid but has warnings (--strict mode)

  ${bold('Examples:')}
    agentguard policy validate agentguard.yaml
    agentguard policy validate my-policy.json --json
    agentguard policy validate agentguard.yaml --strict
`);
}
