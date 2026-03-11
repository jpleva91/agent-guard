// Action Authorization Boundary (AAB)
// The central gatekeeper in the Runtime Assurance Architecture.
// Pure domain logic. No DOM, no Node.js-specific APIs.

import type { DomainEvent } from '../core/types.js';
import { evaluate } from '../policy/evaluator.js';
import type { NormalizedIntent, EvalResult, LoadedPolicy } from '../policy/evaluator.js';
import {
  createEvent,
  POLICY_DENIED,
  UNAUTHORIZED_ACTION,
  BLAST_RADIUS_EXCEEDED,
} from '../events/schema.js';
import { computeBlastRadius } from './blast-radius.js';
import type { BlastRadiusResult } from './blast-radius.js';

export interface RawAgentAction {
  tool?: string;
  command?: string;
  file?: string;
  target?: string;
  content?: string;
  branch?: string;
  agent?: string;
  filesAffected?: number;
  metadata?: Record<string, unknown>;
}

export interface AuthorizationResult {
  intent: NormalizedIntent;
  result: EvalResult;
  events: DomainEvent[];
  blastRadius?: BlastRadiusResult;
}

const TOOL_ACTION_MAP: Record<string, string> = {
  Write: 'file.write',
  Edit: 'file.write',
  Read: 'file.read',
  Bash: 'shell.exec',
  Glob: 'file.read',
  Grep: 'file.read',
};

function detectGitAction(command: string): string | null {
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

export type DestructiveRiskLevel = 'high' | 'critical';

export interface DestructivePattern {
  pattern: RegExp;
  description: string;
  riskLevel: DestructiveRiskLevel;
  category: string;
}

const DESTRUCTIVE_PATTERNS: DestructivePattern[] = [
  // Filesystem — critical
  {
    pattern: /\brm\s+-rf\b/,
    description: 'Recursive force delete',
    riskLevel: 'critical',
    category: 'filesystem',
  },
  {
    pattern: /\brm\s+-r\b/,
    description: 'Recursive delete',
    riskLevel: 'critical',
    category: 'filesystem',
  },
  {
    pattern: /\brm\s+--recursive\b/,
    description: 'Recursive delete (long flag)',
    riskLevel: 'critical',
    category: 'filesystem',
  },
  {
    pattern: /\bmkfs\b/,
    description: 'Create filesystem (erases partition)',
    riskLevel: 'critical',
    category: 'filesystem',
  },
  {
    pattern: />\s*\/dev\/sd[a-z]/,
    description: 'Direct write to block device',
    riskLevel: 'critical',
    category: 'filesystem',
  },
  {
    pattern: /\bdd\s+if=/,
    description: 'Low-level disk copy (can overwrite devices)',
    riskLevel: 'critical',
    category: 'filesystem',
  },
  {
    pattern: /\bshred\b/,
    description: 'Secure file deletion (irrecoverable)',
    riskLevel: 'critical',
    category: 'filesystem',
  },
  {
    pattern: /\bfdisk\b/,
    description: 'Partition table manipulation',
    riskLevel: 'critical',
    category: 'filesystem',
  },
  // System administration — critical/high
  {
    pattern: /\bsudo\s+rm\b/,
    description: 'Privileged file deletion',
    riskLevel: 'critical',
    category: 'system',
  },
  {
    pattern: /\bsudo\s+/,
    description: 'Privileged command execution',
    riskLevel: 'high',
    category: 'system',
  },
  {
    pattern: /\bsu\s+-?\s*\w*/,
    description: 'Switch user (privilege escalation)',
    riskLevel: 'high',
    category: 'system',
  },
  {
    pattern: /\bchmod\s+777\b/,
    description: 'World-writable permissions',
    riskLevel: 'high',
    category: 'system',
  },
  {
    pattern: /\bchown\s+/,
    description: 'Change file ownership',
    riskLevel: 'high',
    category: 'system',
  },
  // Process management — high
  {
    pattern: /\bkill\s+-9\b/,
    description: 'Force kill process (SIGKILL)',
    riskLevel: 'high',
    category: 'process',
  },
  {
    pattern: /\bpkill\b/,
    description: 'Kill processes by name',
    riskLevel: 'high',
    category: 'process',
  },
  {
    pattern: /\bkillall\b/,
    description: 'Kill all processes by name',
    riskLevel: 'high',
    category: 'process',
  },
  // Container operations — high/critical
  {
    pattern: /\bdocker\s+rm\b/,
    description: 'Remove Docker container',
    riskLevel: 'high',
    category: 'container',
  },
  {
    pattern: /\bdocker\s+rmi\b/,
    description: 'Remove Docker image',
    riskLevel: 'high',
    category: 'container',
  },
  {
    pattern: /\bdocker\s+system\s+prune\b/,
    description: 'Prune all unused Docker resources',
    riskLevel: 'critical',
    category: 'container',
  },
  // Service management — high
  {
    pattern: /\bsystemctl\s+stop\b/,
    description: 'Stop system service',
    riskLevel: 'high',
    category: 'service',
  },
  {
    pattern: /\bsystemctl\s+disable\b/,
    description: 'Disable system service',
    riskLevel: 'high',
    category: 'service',
  },
  {
    pattern: /\bservice\s+\S+\s+stop\b/,
    description: 'Stop system service (SysV)',
    riskLevel: 'high',
    category: 'service',
  },
  // Database — critical
  {
    pattern: /\bdropdb\b/,
    description: 'Drop PostgreSQL database',
    riskLevel: 'critical',
    category: 'database',
  },
  {
    pattern: /\bDROP\s+DATABASE\b/i,
    description: 'Drop database (SQL)',
    riskLevel: 'critical',
    category: 'database',
  },
  {
    pattern: /\bDROP\s+TABLE\b/i,
    description: 'Drop table (SQL)',
    riskLevel: 'critical',
    category: 'database',
  },
  {
    pattern: /\bTRUNCATE\b/i,
    description: 'Truncate table (delete all rows)',
    riskLevel: 'critical',
    category: 'database',
  },
  {
    pattern: /\bDELETE\s+FROM\s+\S+\s*(?:;|\s*$)/i,
    description: 'Delete all rows (no WHERE clause)',
    riskLevel: 'critical',
    category: 'database',
  },
  // Package management — high
  {
    pattern: /\bapt\s+(?:remove|purge)\b/,
    description: 'Remove system package (apt)',
    riskLevel: 'high',
    category: 'package',
  },
  {
    pattern: /\bnpm\s+uninstall\s+-g\b/,
    description: 'Uninstall global npm package',
    riskLevel: 'high',
    category: 'package',
  },
  {
    pattern: /\bpip\s+uninstall\b/,
    description: 'Uninstall Python package',
    riskLevel: 'high',
    category: 'package',
  },
  // Network — critical
  {
    pattern: /\biptables\s+-F\b/,
    description: 'Flush all firewall rules',
    riskLevel: 'critical',
    category: 'network',
  },
  {
    pattern: /\bufw\s+disable\b/,
    description: 'Disable firewall',
    riskLevel: 'critical',
    category: 'network',
  },
  // Container orchestration — high/critical (expanded)
  {
    pattern: /\bdocker\s+stop\b/,
    description: 'Stop Docker container',
    riskLevel: 'high',
    category: 'container',
  },
  {
    pattern: /\bdocker\s+volume\s+rm\b/,
    description: 'Remove Docker volume (data loss)',
    riskLevel: 'critical',
    category: 'container',
  },
  {
    pattern: /\bdocker\s+volume\s+prune\b/,
    description: 'Prune all unused Docker volumes',
    riskLevel: 'critical',
    category: 'container',
  },
  {
    pattern: /\bdocker\s+network\s+rm\b/,
    description: 'Remove Docker network',
    riskLevel: 'high',
    category: 'container',
  },
  {
    pattern: /\bdocker[\s-]compose\s+down\b/,
    description: 'Tear down Docker Compose services',
    riskLevel: 'high',
    category: 'container',
  },
  // Kubernetes — high
  {
    pattern: /\bkubectl\s+delete\b/,
    description: 'Delete Kubernetes resources',
    riskLevel: 'high',
    category: 'container',
  },
  // Infrastructure — critical
  {
    pattern: /\bterraform\s+destroy\b/,
    description: 'Destroy Terraform-managed infrastructure',
    riskLevel: 'critical',
    category: 'infra',
  },
  // Database — NoSQL/Redis (expanded)
  {
    pattern: /\bDROP\s+SCHEMA\b/i,
    description: 'Drop database schema (SQL)',
    riskLevel: 'critical',
    category: 'database',
  },
  {
    pattern: /\bDROP\s+VIEW\b/i,
    description: 'Drop view (SQL)',
    riskLevel: 'high',
    category: 'database',
  },
  {
    pattern: /\bDROP\s+INDEX\b/i,
    description: 'Drop index (SQL)',
    riskLevel: 'high',
    category: 'database',
  },
  {
    pattern: /\bFLUSHALL\b/,
    description: 'Flush all Redis databases',
    riskLevel: 'critical',
    category: 'database',
  },
  {
    pattern: /\bFLUSHDB\b/,
    description: 'Flush current Redis database',
    riskLevel: 'critical',
    category: 'database',
  },
  // Package management — high (expanded)
  {
    pattern: /\bbrew\s+(?:uninstall|remove)\b/,
    description: 'Remove macOS package (Homebrew)',
    riskLevel: 'high',
    category: 'package',
  },
  {
    pattern: /\bgem\s+uninstall\b/,
    description: 'Uninstall Ruby gem',
    riskLevel: 'high',
    category: 'package',
  },
  {
    pattern: /\byarn\s+global\s+remove\b/,
    description: 'Remove global Yarn package',
    riskLevel: 'high',
    category: 'package',
  },
  // Remote code execution — critical
  {
    pattern: /\bcurl\s+.*\|\s*(?:ba)?sh\b/,
    description: 'Pipe remote content to shell (code execution)',
    riskLevel: 'critical',
    category: 'network',
  },
  {
    pattern: /\bwget\s+.*\|\s*(?:ba)?sh\b/,
    description: 'Pipe remote download to shell (code execution)',
    riskLevel: 'critical',
    category: 'network',
  },
  // Git destructive operations — high
  {
    pattern: /\bgit\s+reset\s+--hard\b/,
    description: 'Discard all uncommitted changes',
    riskLevel: 'high',
    category: 'filesystem',
  },
  {
    pattern: /\bgit\s+clean\s+-[fdxX]+\b/,
    description: 'Remove untracked files from working tree',
    riskLevel: 'high',
    category: 'filesystem',
  },
  // System — high (expanded)
  {
    pattern: /\bcrontab\s+-r\b/,
    description: 'Remove all cron jobs for current user',
    riskLevel: 'high',
    category: 'system',
  },
  {
    pattern: /\bdoas\s+/,
    description: 'Privileged command execution (OpenBSD)',
    riskLevel: 'high',
    category: 'system',
  },
  // Process management — high (expanded)
  {
    pattern: /\bxkill\b/,
    description: 'Kill X11 window process',
    riskLevel: 'high',
    category: 'process',
  },
  // Container operations — high/critical (expanded)
  {
    pattern: /\bdocker\s+container\s+prune\b/,
    description: 'Prune all stopped Docker containers',
    riskLevel: 'high',
    category: 'container',
  },
  {
    pattern: /\bdocker\s+image\s+prune\b/,
    description: 'Prune dangling Docker images',
    riskLevel: 'high',
    category: 'container',
  },
  {
    pattern: /\bhelm\s+(?:uninstall|delete)\b/,
    description: 'Remove Kubernetes Helm release',
    riskLevel: 'high',
    category: 'container',
  },
  // Service management — high (expanded)
  {
    pattern: /\bsystemctl\s+mask\b/,
    description: 'Permanently prevent service from starting',
    riskLevel: 'high',
    category: 'service',
  },
  // Database — critical/high (expanded)
  {
    pattern: /\bALTER\s+TABLE\s+\S+\s+DROP\b/i,
    description: 'Drop column or constraint (SQL)',
    riskLevel: 'high',
    category: 'database',
  },
  {
    pattern: /\bdb\.dropDatabase\s*\(/,
    description: 'Drop MongoDB database',
    riskLevel: 'critical',
    category: 'database',
  },
  {
    pattern: /\bdb\.\w+\.drop\s*\(/,
    description: 'Drop MongoDB collection',
    riskLevel: 'critical',
    category: 'database',
  },
  // Package management — high (expanded)
  {
    pattern: /\b(?:dnf|yum)\s+(?:remove|erase)\b/,
    description: 'Remove RPM package (dnf/yum)',
    riskLevel: 'high',
    category: 'package',
  },
  {
    pattern: /\bpacman\s+-R/,
    description: 'Remove Arch Linux package',
    riskLevel: 'high',
    category: 'package',
  },
  {
    pattern: /\bsnap\s+remove\b/,
    description: 'Remove Snap package',
    riskLevel: 'high',
    category: 'package',
  },
  {
    pattern: /\bcargo\s+uninstall\b/,
    description: 'Uninstall Rust crate',
    riskLevel: 'high',
    category: 'package',
  },
  {
    pattern: /\bpnpm\s+(?:remove|uninstall)\s+-g\b/,
    description: 'Uninstall global pnpm package',
    riskLevel: 'high',
    category: 'package',
  },
  // Infrastructure — critical (expanded)
  {
    pattern: /\bpulumi\s+destroy\b/,
    description: 'Destroy Pulumi-managed infrastructure',
    riskLevel: 'critical',
    category: 'infra',
  },
  // Git destructive — high (expanded)
  {
    pattern: /\bgit\s+stash\s+drop\b/,
    description: 'Drop stashed changes',
    riskLevel: 'high',
    category: 'filesystem',
  },
  {
    pattern: /\bgit\s+reflog\s+expire\b/,
    description: 'Expire reflog entries (history loss)',
    riskLevel: 'high',
    category: 'filesystem',
  },
  // Network — critical/high (expanded)
  {
    pattern: /\biptables\s+-X\b/,
    description: 'Delete user-defined firewall chains',
    riskLevel: 'high',
    category: 'network',
  },
  {
    pattern: /\bnft\s+flush\s+ruleset\b/,
    description: 'Flush all nftables rules',
    riskLevel: 'critical',
    category: 'network',
  },
];

function isDestructiveCommand(command: string): boolean {
  if (!command || typeof command !== 'string') return false;

  return DESTRUCTIVE_PATTERNS.some((p) => p.pattern.test(command));
}

function getDestructiveDetails(command: string): DestructivePattern | null {
  if (!command || typeof command !== 'string') return null;

  return DESTRUCTIVE_PATTERNS.find((p) => p.pattern.test(command)) ?? null;
}

function extractBranch(command: string | undefined): string | null {
  if (!command) return null;
  const match = command.match(/\bgit\s+push\s+\S+\s+(\S+)/);
  return match ? match[1] : null;
}

export function normalizeIntent(rawAction: RawAgentAction | null): NormalizedIntent {
  if (!rawAction || typeof rawAction !== 'object') {
    return { action: 'unknown', target: '', agent: 'unknown', destructive: false };
  }

  const tool = rawAction.tool || '';
  let action = TOOL_ACTION_MAP[tool] || 'unknown';
  let target = rawAction.file || rawAction.target || '';

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
    destructive: action === 'shell.exec' && isDestructiveCommand(rawAction.command || ''),
  };
}

export function authorize(
  rawAction: RawAgentAction | null,
  policies: LoadedPolicy[]
): AuthorizationResult {
  const intent = normalizeIntent(rawAction);
  const events: DomainEvent[] = [];

  if (intent.destructive) {
    const result: EvalResult = {
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

  const result = evaluate(intent, policies);

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

  // Blast radius computation engine (Phase 2)
  // Computes a weighted score from action type, path sensitivity, and file count,
  // then checks against the tightest policy limit.
  let blastRadius: BlastRadiusResult | undefined;

  let tightestLimit = Infinity;
  for (const policy of policies) {
    for (const rule of policy.rules) {
      if (rule.conditions?.limit !== undefined) {
        tightestLimit = Math.min(tightestLimit, rule.conditions.limit);
      }
    }
  }

  if (tightestLimit < Infinity) {
    blastRadius = computeBlastRadius(intent, tightestLimit);

    if (blastRadius.exceeded) {
      events.push(
        createEvent(BLAST_RADIUS_EXCEEDED, {
          filesAffected: blastRadius.rawCount,
          weightedScore: blastRadius.weightedScore,
          riskLevel: blastRadius.riskLevel,
          factors: blastRadius.factors.map((f) => f.reason),
          limit: tightestLimit,
          action: intent.action,
        })
      );
    }
  }

  return { intent, result, events, blastRadius };
}

export { detectGitAction, isDestructiveCommand, getDestructiveDetails, DESTRUCTIVE_PATTERNS };
