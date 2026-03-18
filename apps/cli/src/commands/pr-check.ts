// CLI command: agentguard pr-check — Pre-merge policy validation.
//
// Analyzes a PR diff against AgentGuard policies and reports violations
// before merge. Extracts file changes, dependency modifications, and
// shell commands from the diff, then evaluates each as a governance action.

import { execFileSync } from 'node:child_process';
import { parseArgs } from '../args.js';
import { loadComposedPolicies, findDefaultPolicy } from '../policy-resolver.js';
import { evaluate } from '@red-codes/policy';
import type { LoadedPolicy, EvalResult } from '@red-codes/policy';
import { normalizeIntent } from '@red-codes/kernel';
import type { RawAgentAction } from '@red-codes/kernel';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PrCheckViolation {
  readonly file: string;
  readonly action: string;
  readonly decision: 'deny';
  readonly reason: string;
  readonly severity: number;
  readonly policyName: string | null;
}

export interface PrCheckResult {
  readonly pr: number | null;
  readonly totalFiles: number;
  readonly allowed: number;
  readonly denied: number;
  readonly violations: readonly PrCheckViolation[];
  readonly pass: boolean;
  readonly mode: 'block' | 'warn';
}

// ---------------------------------------------------------------------------
// Diff Parsing
// ---------------------------------------------------------------------------

interface DiffEntry {
  file: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
}

/**
 * Parse a unified diff (from `gh pr diff` or `git diff`) to extract
 * the list of changed files and their change type.
 */
export function parseDiffStat(diffOutput: string): DiffEntry[] {
  const entries: DiffEntry[] = [];
  const seen = new Set<string>();

  // Match diff headers: "diff --git a/path b/path"
  const diffHeaderRe = /^diff --git a\/(.+?) b\/(.+?)$/gm;
  let match: RegExpExecArray | null;

  while ((match = diffHeaderRe.exec(diffOutput)) !== null) {
    const oldPath = match[1];
    const newPath = match[2];

    if (seen.has(newPath)) continue;
    seen.add(newPath);

    // Look ahead for the file mode line — limit to content before the next diff header
    const sliceStart = match.index + match[0].length;
    const nextDiff = diffOutput.indexOf('\ndiff --git ', sliceStart);
    const sliceEnd = nextDiff !== -1 ? nextDiff : sliceStart + 500;
    const afterHeader = diffOutput.slice(sliceStart, sliceEnd);

    if (afterHeader.includes('new file mode')) {
      entries.push({ file: newPath, status: 'added' });
    } else if (afterHeader.includes('deleted file mode')) {
      entries.push({ file: oldPath, status: 'deleted' });
    } else if (oldPath !== newPath) {
      entries.push({ file: newPath, status: 'renamed' });
    } else {
      entries.push({ file: newPath, status: 'modified' });
    }
  }

  return entries;
}

/**
 * Convert diff entries into raw agent actions for policy evaluation.
 */
export function diffEntriesToActions(entries: DiffEntry[]): RawAgentAction[] {
  const actions: RawAgentAction[] = [];

  for (const entry of entries) {
    switch (entry.status) {
      case 'added':
      case 'modified':
      case 'renamed':
        actions.push({
          tool: 'Write',
          file: entry.file,
          agent: 'pr-check',
        });
        break;

      case 'deleted':
        actions.push({
          tool: 'Bash',
          command: `rm ${entry.file}`,
          file: entry.file,
          agent: 'pr-check',
        });
        break;
    }

    // Detect dependency changes
    if (
      (entry.status === 'added' || entry.status === 'modified') &&
      (entry.file === 'package.json' || entry.file.endsWith('/package.json'))
    ) {
      actions.push({
        tool: 'Bash',
        command: 'npm install',
        agent: 'pr-check',
        metadata: { source: 'dependency-change', file: entry.file },
      });
    }
  }

  return actions;
}

// ---------------------------------------------------------------------------
// PR Diff Retrieval (uses execFileSync to avoid shell injection)
// ---------------------------------------------------------------------------

function getPrDiff(prNumber: number | null): string | null {
  try {
    const args = prNumber ? ['pr', 'diff', String(prNumber)] : ['pr', 'diff'];
    return execFileSync('gh', args, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024, // 10MB for large diffs
    });
  } catch {
    return null;
  }
}

function detectPrNumber(): number | null {
  try {
    const result = execFileSync('gh', ['pr', 'view', '--json', 'number', '--jq', '.number'], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    const num = parseInt(result, 10);
    return isNaN(num) ? null : num;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Policy Evaluation
// ---------------------------------------------------------------------------

function evaluateActions(
  actions: RawAgentAction[],
  policies: LoadedPolicy[],
  branch?: string
): { allowed: number; denied: number; violations: PrCheckViolation[] } {
  let allowed = 0;
  let denied = 0;
  const violations: PrCheckViolation[] = [];

  for (const raw of actions) {
    const intent = normalizeIntent(raw);

    // Attach branch if provided
    if (branch && !intent.branch) {
      (intent as { branch?: string }).branch = branch;
    }

    const result: EvalResult = evaluate(intent, policies, { defaultDeny: true });

    if (result.allowed) {
      allowed++;
    } else {
      denied++;
      violations.push({
        file: raw.file || raw.command || 'unknown',
        action: intent.action,
        decision: 'deny',
        reason: result.reason,
        severity: result.severity,
        policyName: result.matchedPolicy?.name ?? null,
      });
    }
  }

  return { allowed, denied, violations };
}

// ---------------------------------------------------------------------------
// Output Formatting
// ---------------------------------------------------------------------------

function formatTerminal(result: PrCheckResult): string {
  const icon = result.pass ? '\x1b[32m\u2713\x1b[0m' : '\x1b[31m\u2717\x1b[0m';
  const verdict = result.pass ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
  const modeLabel = result.mode === 'warn' ? ' (warn-only)' : '';

  const lines: string[] = [];
  lines.push('');
  lines.push(`  ${icon} Pre-merge Policy Check — ${verdict}${modeLabel}`);
  if (result.pr) {
    lines.push(`  PR: #${result.pr}`);
  }
  lines.push('');
  lines.push(`  Files changed: ${result.totalFiles}`);
  lines.push(`  Actions:       ${result.allowed + result.denied}`);
  lines.push(`  Allowed:       ${result.allowed}`);
  lines.push(`  Denied:        ${result.denied}`);

  if (result.violations.length > 0) {
    lines.push('');
    lines.push('  \x1b[1mViolations:\x1b[0m');
    for (const v of result.violations) {
      const severity = v.severity >= 4 ? '\x1b[31m' : v.severity >= 3 ? '\x1b[33m' : '\x1b[37m';
      lines.push(`    ${severity}\u2717\x1b[0m ${v.file}`);
      lines.push(`      Action: ${v.action}`);
      lines.push(`      Reason: ${v.reason}`);
      if (v.policyName) {
        lines.push(`      Policy: ${v.policyName}`);
      }
    }
  }

  lines.push('');
  return lines.join('\n');
}

function formatGitHubAnnotation(result: PrCheckResult): string {
  const lines: string[] = [];

  if (!result.pass) {
    const summary = result.violations.map((v) => `${v.file}: ${v.reason}`).join('; ');
    lines.push(
      `::error title=Pre-merge Policy Check Failed::${result.denied} action(s) denied. ${summary}`
    );
  }

  lines.push(
    `::notice title=Pre-merge Policy Summary::Files: ${result.totalFiles} | Allowed: ${result.allowed} | Denied: ${result.denied}`
  );

  return lines.join('\n');
}

const COMMENT_MARKER = '<!-- agentguard-pr-check -->';

function formatPrComment(result: PrCheckResult): string {
  const icon = result.pass ? ':white_check_mark:' : ':x:';
  const verdict = result.pass ? 'PASS' : 'FAIL';
  const modeNote = result.mode === 'warn' ? ' (warn-only mode)' : '';

  const lines: string[] = [];
  lines.push(`${COMMENT_MARKER}`);
  lines.push(`## ${icon} Pre-merge Policy Check — ${verdict}${modeNote}`);
  lines.push('');
  lines.push('| Metric | Count |');
  lines.push('|--------|-------|');
  lines.push(`| Files changed | ${result.totalFiles} |`);
  lines.push(`| Actions evaluated | ${result.allowed + result.denied} |`);
  lines.push(`| Allowed | ${result.allowed} |`);
  lines.push(`| Denied | ${result.denied} |`);

  if (result.violations.length > 0) {
    lines.push('');
    lines.push('### Violations');
    lines.push('');
    lines.push('| File | Action | Reason | Policy |');
    lines.push('|------|--------|--------|--------|');
    for (const v of result.violations) {
      const escapedReason = v.reason.replace(/\|/g, '\\|');
      lines.push(
        `| \`${v.file}\` | ${v.action} | ${escapedReason} | ${v.policyName ?? '\u2014'} |`
      );
    }
  }

  lines.push('');
  lines.push('---');
  lines.push(
    '*Generated by [AgentGuard](https://github.com/AgentGuardHQ/agentguard) pre-merge check*'
  );

  return lines.join('\n');
}

function postPrComment(prNumber: number, markdown: string): boolean {
  // Delete any existing pr-check comments
  try {
    const commentsJson = execFileSync(
      'gh',
      [
        'pr',
        'view',
        String(prNumber),
        '--json',
        'comments',
        '--jq',
        `.comments[] | select(.body | startswith("${COMMENT_MARKER}")) | .id`,
      ],
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();

    if (commentsJson) {
      const commentIds = commentsJson.split('\n').filter((id) => /^\d+$/.test(id));
      for (const id of commentIds) {
        try {
          execFileSync(
            'gh',
            ['api', `repos/{owner}/{repo}/issues/comments/${id}`, '-X', 'DELETE'],
            { stdio: ['pipe', 'pipe', 'pipe'] }
          );
        } catch {
          // Ignore delete failures
        }
      }
    }
  } catch {
    // No existing comments
  }

  try {
    execFileSync('gh', ['pr', 'comment', String(prNumber), '--body', markdown], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// CLI Entry Point
// ---------------------------------------------------------------------------

export async function prCheck(args: string[]): Promise<number> {
  const parsed = parseArgs(args, {
    boolean: ['--json', '--warn-only', '--post-comment'],
    string: ['--pr', '--policy', '--branch'],
    alias: { '-n': '--pr', '-p': '--policy', '-b': '--branch' },
  });

  const jsonOutput = !!parsed.flags.json;
  const warnOnly = !!parsed.flags['warn-only'];
  const postComment = !!parsed.flags['post-comment'];
  const policyPath = (parsed.flags.policy as string) || undefined;
  const branchFlag = (parsed.flags.branch as string) || undefined;
  const isGitHubActions = !!process.env.GITHUB_ACTIONS;

  // Resolve PR number
  let prNumber: number | null = null;
  const prFlag = parsed.flags.pr as string;
  if (prFlag) {
    prNumber = parseInt(prFlag, 10);
    if (isNaN(prNumber)) {
      process.stderr.write('\n  \x1b[31mError:\x1b[0m PR number must be numeric.\n\n');
      return 1;
    }
  } else {
    prNumber = detectPrNumber();
  }

  // Load policies
  const composition = loadComposedPolicies(policyPath ? [policyPath] : undefined);
  const policies = composition.policies;

  if (policies.length === 0) {
    const defaultPolicy = findDefaultPolicy();
    if (!defaultPolicy) {
      process.stderr.write(
        '\n  \x1b[33mWarning:\x1b[0m No policy file found. Nothing to validate against.\n\n'
      );
      return 0;
    }
  }

  // Get PR diff
  const diff = getPrDiff(prNumber);
  if (!diff) {
    if (prNumber) {
      process.stderr.write(`\n  \x1b[31mError:\x1b[0m Could not get diff for PR #${prNumber}.\n`);
    } else {
      process.stderr.write(
        '\n  \x1b[31mError:\x1b[0m No PR found for current branch. Use --pr <number>.\n'
      );
    }
    process.stderr.write('  Make sure `gh` CLI is installed and authenticated.\n\n');
    return 1;
  }

  // Parse diff and build actions
  const diffEntries = parseDiffStat(diff);
  const actions = diffEntriesToActions(diffEntries);

  // Evaluate against policy
  const { allowed, denied, violations } = evaluateActions(actions, policies, branchFlag);

  // Build result
  const pass = warnOnly ? true : denied === 0;
  const result: PrCheckResult = {
    pr: prNumber,
    totalFiles: diffEntries.length,
    allowed,
    denied,
    violations,
    pass,
    mode: warnOnly ? 'warn' : 'block',
  };

  // Output
  if (jsonOutput) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    process.stderr.write(formatTerminal(result));
  }

  // GitHub Actions annotations
  if (isGitHubActions) {
    process.stdout.write(formatGitHubAnnotation(result) + '\n');
  }

  // Post PR comment
  if (postComment && prNumber) {
    const markdown = formatPrComment(result);
    const posted = postPrComment(prNumber, markdown);
    if (posted) {
      process.stderr.write(`  \x1b[32m\u2713\x1b[0m Policy check posted to PR #${prNumber}\n\n`);
    } else {
      process.stderr.write(
        `\n  \x1b[33mWarning:\x1b[0m Failed to post check to PR #${prNumber}.\n\n`
      );
    }
  } else if (postComment && !prNumber) {
    process.stderr.write(
      '\n  \x1b[33mWarning:\x1b[0m --post-comment: could not determine PR number. ' +
        'Use --pr <number> or run from a branch with an open PR.\n\n'
    );
  }

  return result.pass ? 0 : 1;
}
