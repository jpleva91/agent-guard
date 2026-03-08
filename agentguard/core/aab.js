// Action Authorization Boundary (AAB)
// The central gatekeeper in the Runtime Assurance Architecture.
// Normalizes agent intents, evaluates them against policies,
// and produces canonical governance events.
//
// Pure domain logic. No DOM, no Node.js-specific APIs.
//
// TODO(roadmap/phase-2): Add blast radius computation to authorization decisions
// TODO(roadmap/ts-migration): Migrate to TypeScript (src/agentguard/)

import { evaluate } from '../policies/evaluator.js';
import {
  createEvent,
  POLICY_DENIED,
  UNAUTHORIZED_ACTION,
  BLAST_RADIUS_EXCEEDED,
} from '../../domain/events.js';

/**
 * Raw agent action shape (before normalization):
 * {
 *   tool?: string,           // e.g. 'Bash', 'Write', 'Edit'
 *   command?: string,        // e.g. 'rm -rf src/'
 *   file?: string,           // target file path
 *   content?: string,        // file content (for writes)
 *   branch?: string,         // git branch
 *   agent?: string,          // agent identifier
 * }
 */

/**
 * Map tool names to action types for intent normalization.
 */
const TOOL_ACTION_MAP = {
  Write: 'file.write',
  Edit: 'file.write',
  Read: 'file.read',
  Bash: 'shell.exec',
  Glob: 'file.read',
  Grep: 'file.read',
};

/**
 * Detect git operations from shell commands.
 * @param {string} command
 * @returns {string|null} - git action type or null
 */
function detectGitAction(command) {
  if (!command || typeof command !== 'string') return null;

  const trimmed = command.trim();

  if (/\bgit\s+push\s+--force\b/.test(trimmed) || /\bgit\s+push\s+-f\b/.test(trimmed)) {
    return 'git.force-push';
  }
  if (/\bgit\s+push\b/.test(trimmed)) return 'git.push';
  if (/\bgit\s+branch\s+-[dD]\b/.test(trimmed)) return 'git.branch.delete';
  if (/\bgit\s+merge\b/.test(trimmed)) return 'git.merge';
  if (/\bgit\s+commit\b/.test(trimmed)) return 'git.commit';

  return null;
}

/**
 * Detect destructive shell patterns.
 * @param {string} command
 * @returns {boolean}
 */
function isDestructiveCommand(command) {
  if (!command || typeof command !== 'string') return false;

  const patterns = [
    /\brm\s+-rf\b/,
    /\brm\s+-r\b/,
    /\brm\s+--recursive\b/,
    /\bchmod\s+777\b/,
    /\bdd\s+if=/,
    /\bmkfs\b/,
    />\s*\/dev\/sd[a-z]/,
    /\bsudo\s+rm\b/,
    /\bdropdb\b/,
    /\bDROP\s+DATABASE\b/i,
    /\bDROP\s+TABLE\b/i,
  ];

  return patterns.some((p) => p.test(command));
}

/**
 * Extract target branch from a git push command.
 * @param {string} command
 * @returns {string|null}
 */
function extractBranch(command) {
  if (!command) return null;
  const match = command.match(/\bgit\s+push\s+\S+\s+(\S+)/);
  return match ? match[1] : null;
}

/**
 * Normalize a raw agent action into a structured intent.
 * @param {object} rawAction
 * @returns {object} Normalized intent
 */
export function normalizeIntent(rawAction) {
  if (!rawAction || typeof rawAction !== 'object') {
    return { action: 'unknown', target: '', agent: 'unknown' };
  }

  const tool = rawAction.tool || '';
  let action = TOOL_ACTION_MAP[tool] || 'unknown';
  let target = rawAction.file || rawAction.target || '';

  // Refine shell commands
  if (action === 'shell.exec' && rawAction.command) {
    const gitAction = detectGitAction(rawAction.command);
    if (gitAction) {
      action = gitAction;
      target = extractBranch(rawAction.command) || target;
    }
  }

  return {
    action,
    target,
    agent: rawAction.agent || 'unknown',
    branch: rawAction.branch || extractBranch(rawAction.command) || undefined,
    command: rawAction.command || undefined,
    filesAffected: rawAction.filesAffected || undefined,
    metadata: rawAction.metadata || undefined,
    destructive: action === 'shell.exec' && isDestructiveCommand(rawAction.command),
  };
}

/**
 * The Action Authorization Boundary.
 *
 * Evaluates a raw agent action through the full authorization pipeline:
 * 1. Normalize intent
 * 2. Check for destructive commands
 * 3. Evaluate against policies
 * 4. Generate governance events for denials
 *
 * @param {object} rawAction - Raw action from the agent
 * @param {object[]} policies - Loaded policies
 * @returns {{ intent: object, result: object, events: object[] }}
 */
export function authorize(rawAction, policies) {
  const intent = normalizeIntent(rawAction);
  const events = [];

  // Destructive command escalation
  if (intent.destructive) {
    const result = {
      allowed: false,
      decision: 'deny',
      matchedRule: null,
      matchedPolicy: null,
      reason: `Destructive command detected: ${intent.command}`,
      severity: 5,
    };

    events.push(
      createEvent(UNAUTHORIZED_ACTION, {
        action: intent.action,
        reason: result.reason,
        agentId: intent.agent,
        scope: intent.target,
      })
    );

    return { intent, result, events };
  }

  // Policy evaluation
  const result = evaluate(intent, policies);

  // Generate governance events for denials
  if (!result.allowed) {
    if (result.matchedPolicy) {
      events.push(
        createEvent(POLICY_DENIED, {
          policy: result.matchedPolicy.id,
          action: intent.action,
          reason: result.reason,
          agentId: intent.agent,
          file: intent.target,
        })
      );
    } else {
      events.push(
        createEvent(UNAUTHORIZED_ACTION, {
          action: intent.action,
          reason: result.reason,
          agentId: intent.agent,
          scope: intent.target,
        })
      );
    }
  }

  // Blast radius check (even for allowed actions)
  if (intent.filesAffected !== undefined) {
    // Find the tightest blast radius limit from policies
    let tightestLimit = Infinity;
    for (const policy of policies) {
      for (const rule of policy.rules) {
        if (rule.conditions?.limit !== undefined) {
          tightestLimit = Math.min(tightestLimit, rule.conditions.limit);
        }
      }
    }

    if (intent.filesAffected > tightestLimit) {
      events.push(
        createEvent(BLAST_RADIUS_EXCEEDED, {
          filesAffected: intent.filesAffected,
          limit: tightestLimit,
          action: intent.action,
        })
      );
    }
  }

  return { intent, result, events };
}

export { detectGitAction, isDestructiveCommand };
