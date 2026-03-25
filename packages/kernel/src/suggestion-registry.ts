/**
 * SuggestionRegistry — resolves corrective suggestions for governance decisions.
 *
 * When enforcement mode is 'educate' or 'guide', the kernel attaches a Suggestion
 * to the decision record. The registry resolves the suggestion from three sources
 * (in priority order):
 *
 * 1. Policy-authored suggestion + correctedCommand from the matched rule
 * 2. A registered built-in generator keyed by action type
 * 3. null (no suggestion available)
 *
 * Template variables in policy suggestions use {{variable}} syntax and are
 * interpolated from the NormalizedIntent. All injected values are shell-escaped
 * to prevent command injection.
 */

import type { Suggestion } from '@red-codes/core';
import type { NormalizedIntent } from '@red-codes/policy';

// ---------------------------------------------------------------------------
// ResolveInput — the data the registry needs to produce a Suggestion
// ---------------------------------------------------------------------------

export interface ResolveInput {
  policySuggestion?: string;
  policyCorrectedCommand?: string;
  intent: NormalizedIntent;
}

// ---------------------------------------------------------------------------
// Generator function type
// ---------------------------------------------------------------------------

export type SuggestionGenerator = (intent: NormalizedIntent) => Suggestion | null;

// ---------------------------------------------------------------------------
// Shell-escaping
// ---------------------------------------------------------------------------

/**
 * Escape a string for safe interpolation into a shell command template.
 * Wraps the value in single quotes and escapes any embedded single quotes
 * using the standard `'\''` technique.
 */
export function shellEscape(value: string): string {
  // Replace each single quote with the sequence: end-quote, escaped-quote, start-quote
  return "'" + value.replace(/'/g, "'\\''") + "'";
}

// ---------------------------------------------------------------------------
// Template rendering
// ---------------------------------------------------------------------------

/**
 * Render {{variable}} placeholders in a template string using values from intent.
 * Unknown variables are left as-is. All interpolated values are shell-escaped.
 */
export function renderTemplate(template: string, intent: NormalizedIntent): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = intentValue(intent, key);
    if (value === undefined || value === null) return _match;
    return shellEscape(String(value));
  });
}

function intentValue(intent: NormalizedIntent, key: string): unknown {
  switch (key) {
    case 'action':
      return intent.action;
    case 'target':
      return intent.target;
    case 'agent':
      return intent.agent;
    case 'branch':
      return intent.branch;
    case 'command':
      return intent.command;
    case 'filesAffected':
      return intent.filesAffected;
    default:
      return intent.metadata?.[key];
  }
}

// ---------------------------------------------------------------------------
// Command scope validation
// ---------------------------------------------------------------------------

/**
 * Map from action class prefix to allowed command prefixes.
 * If an action class is listed here, the correctedCommand must start with
 * one of the listed prefixes (after trimming). An empty array means any
 * command is allowed; absence means no restriction.
 */
const ACTION_COMMAND_PREFIX: Record<string, string[]> = {
  'shell.exec': ['rm ', 'ls ', 'find '],
  'git.push': ['git push '],
  'git.force-push': ['git push '],
  'git.reset-hard': ['git reset ', 'git stash'],
  'git.commit': ['git commit '],
  'git.merge': ['git merge '],
  'git.checkout': ['git checkout '],
  'git.branch.create': ['git branch ', 'git checkout -b ', 'git switch -c '],
  'git.branch.delete': ['git branch '],
  'file.write': [],
  'file.delete': ['rm '],
};

/**
 * Validate that a correctedCommand is plausible for the given action class.
 * Returns the command unchanged if valid, or undefined if the command does
 * not match the expected prefix for the action class.
 */
export function validateCommandScope(
  correctedCommand: string | undefined,
  action: string
): string | undefined {
  if (!correctedCommand) return undefined;

  const prefixes = ACTION_COMMAND_PREFIX[action];
  // No entry in the map → no restriction, allow anything
  if (prefixes === undefined) return correctedCommand;
  // Empty array → any command is allowed for this action class
  if (prefixes.length === 0) return correctedCommand;

  const trimmed = correctedCommand.trim();
  for (const prefix of prefixes) {
    if (trimmed.startsWith(prefix)) return correctedCommand;
  }

  // Command does not match any allowed prefix — strip it
  return undefined;
}

// ---------------------------------------------------------------------------
// Built-in generators
// ---------------------------------------------------------------------------

const BUILTIN_GENERATORS: Record<string, SuggestionGenerator> = {
  'git.push': (intent) => ({
    message: `Push to branch "${intent.branch || intent.target}" was denied by policy.`,
    correctedCommand: intent.branch ? `git push origin ${shellEscape(intent.branch)}` : undefined,
  }),

  'git.force-push': (intent) => ({
    message:
      'Force-push is destructive and can overwrite remote history. ' +
      'Use a non-destructive alternative instead.',
    correctedCommand: intent.branch
      ? `git push --force-with-lease origin ${shellEscape(intent.branch)}`
      : 'git push --force-with-lease',
  }),

  'git.reset-hard': () => ({
    message:
      'Hard reset discards uncommitted changes permanently. ' +
      'Consider using git stash or a soft reset instead.',
    correctedCommand: 'git stash',
  }),

  'file.write': (intent) => {
    // Only fires for secrets-related targets
    const target = intent.target || '';
    const secretsPattern = /\.(env|pem|key|secret|credentials|token)/i;
    if (!secretsPattern.test(target)) return null;
    return {
      message: `Writing to "${target}" may expose secrets. Use environment variables or a secrets manager instead.`,
    };
  },

  'shell.exec': (intent) => {
    const cmd = intent.command || '';
    if (/\brm\s+(-[a-zA-Z]*r[a-zA-Z]*\s+|--recursive\s+)/i.test(cmd)) {
      return {
        message:
          'Recursive deletion is dangerous. Consider moving files to a staging directory ' +
          'or using trash-cli instead.',
        correctedCommand: cmd
          .replace(/\brm\s+(-[a-zA-Z]*)r/, 'rm $1')
          .replace(/\brm\s+--recursive/, 'rm'),
      };
    }
    return null;
  },
};

// ---------------------------------------------------------------------------
// SuggestionRegistry
// ---------------------------------------------------------------------------

export class SuggestionRegistry {
  private generators: Map<string, SuggestionGenerator>;

  constructor() {
    this.generators = new Map();
    // Seed with built-in generators
    for (const [key, gen] of Object.entries(BUILTIN_GENERATORS)) {
      this.generators.set(key, gen);
    }
  }

  /**
   * Register a custom suggestion generator for an action type.
   * Overwrites any existing generator (including built-ins).
   */
  register(action: string, generator: SuggestionGenerator): void {
    this.generators.set(action, generator);
  }

  /**
   * Resolve a Suggestion for a governance decision.
   *
   * Priority:
   * 1. Policy-authored suggestion (rendered through template engine)
   * 2. Built-in / registered generator
   * 3. null
   */
  resolve(input: ResolveInput): Suggestion | null {
    const { policySuggestion, policyCorrectedCommand, intent } = input;

    // Priority 1: policy-authored suggestion
    if (policySuggestion) {
      const message = renderTemplate(policySuggestion, intent);
      const corrected = policyCorrectedCommand
        ? validateCommandScope(renderTemplate(policyCorrectedCommand, intent), intent.action)
        : undefined;
      return corrected ? { message, correctedCommand: corrected } : { message };
    }

    // Priority 2: registered generator
    const generator = this.generators.get(intent.action);
    if (generator) {
      const suggestion = generator(intent);
      if (suggestion) {
        // Validate the correctedCommand from the generator too
        const validatedCmd = validateCommandScope(suggestion.correctedCommand, intent.action);
        return validatedCmd
          ? { message: suggestion.message, correctedCommand: validatedCmd }
          : { message: suggestion.message };
      }
    }

    // Priority 3: nothing available
    return null;
  }
}
