// CLI command: agentguard ci-check — CI governance verification.
//
// Reads an exported governance session (or the most recent local run),
// summarises governance outcomes, and exits with code 1 when violations
// or denials exceed the configured threshold. Designed for CI pipelines.
// Supports both JSONL (default) and SQLite storage backends.

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { parseArgs } from '../args.js';
import { loadReplaySession, getLatestRunId, buildReplaySession } from '@red-codes/kernel';
import type { ReplaySession } from '@red-codes/kernel';
import type { DomainEvent } from '@red-codes/core';
import type { GovernanceExportHeader } from './export.js';
import type { StorageConfig } from '@red-codes/storage';
import { aggregateEvents, formatEvidenceMarkdown } from '../evidence-summary.js';
import type { EvidenceMarkdownOptions } from '../evidence-summary.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CiCheckResult {
  readonly runId: string;
  readonly totalActions: number;
  readonly allowed: number;
  readonly denied: number;
  readonly violations: number;
  readonly escalations: number;
  readonly denialReasons: readonly string[];
  readonly pass: boolean;
}

// ---------------------------------------------------------------------------
// Session Loading
// ---------------------------------------------------------------------------

/**
 * Load a replay session from an exported `.agentguard.jsonl` file.
 * Parses the header, extracts events, and builds a ReplaySession.
 */
function loadSessionFromExport(filePath: string): ReplaySession | null {
  const content = readFileSync(filePath, 'utf8');
  const lines = content.split('\n').filter((l) => l.trim());

  if (lines.length === 0) return null;

  let header: GovernanceExportHeader;
  try {
    header = JSON.parse(lines[0]) as GovernanceExportHeader;
  } catch {
    return null;
  }

  if (header.__agentguard_export !== true || header.version !== 1) {
    return null;
  }

  const eventLines = lines.slice(1, 1 + header.eventCount);
  const events: DomainEvent[] = [];
  for (const line of eventLines) {
    try {
      events.push(JSON.parse(line) as DomainEvent);
    } catch {
      // Skip malformed lines
    }
  }

  if (events.length === 0) return null;

  return buildReplaySession(header.runId, events);
}

/**
 * Load the most recent replay session from SQLite.
 */
async function loadLatestSessionSqlite(
  storageConfig: StorageConfig
): Promise<ReplaySession | null> {
  const { createStorageBundle } = await import('@red-codes/storage');
  const { getLatestRunId: getLatestRunIdSqlite, loadRunEvents } =
    await import('@red-codes/storage');

  const storage = await createStorageBundle(storageConfig);
  if (!storage.db) {
    process.stderr.write('  Error: SQLite storage backend did not initialize database.\n');
    return null;
  }
  const db = storage.db as import('better-sqlite3').Database;

  const runId = getLatestRunIdSqlite(db);
  if (!runId) {
    storage.close();
    return null;
  }

  const events = loadRunEvents(db, runId);
  storage.close();

  if (events.length === 0) return null;
  return buildReplaySession(runId, events);
}

// ---------------------------------------------------------------------------
// Core Logic
// ---------------------------------------------------------------------------

function evaluateSession(
  session: ReplaySession,
  options: { failOnViolation: boolean; failOnDenial: boolean }
): CiCheckResult {
  const { summary } = session;

  let pass = true;
  if (options.failOnDenial && summary.denied > 0) {
    pass = false;
  }
  if (options.failOnViolation && summary.violations > 0) {
    pass = false;
  }

  return {
    runId: session.runId,
    totalActions: summary.totalActions,
    allowed: summary.allowed,
    denied: summary.denied,
    violations: summary.violations,
    escalations: summary.escalations,
    denialReasons: summary.denialReasons,
    pass,
  };
}

// ---------------------------------------------------------------------------
// Output Formatting
// ---------------------------------------------------------------------------

function formatTerminal(result: CiCheckResult): string {
  const icon = result.pass ? '\x1b[32m\u2713\x1b[0m' : '\x1b[31m\u2717\x1b[0m';
  const verdict = result.pass ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';

  const lines: string[] = [];
  lines.push('');
  lines.push(`  ${icon} Governance CI Check — ${verdict}`);
  lines.push(`  Run: ${result.runId}`);
  lines.push('');
  lines.push(`  Actions:     ${result.totalActions}`);
  lines.push(`  Allowed:     ${result.allowed}`);
  lines.push(`  Denied:      ${result.denied}`);
  lines.push(`  Violations:  ${result.violations}`);
  lines.push(`  Escalations: ${result.escalations}`);

  if (result.denialReasons.length > 0) {
    lines.push('');
    lines.push('  Denial reasons:');
    for (const reason of result.denialReasons) {
      lines.push(`    - ${reason}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

function formatGitHubAnnotation(result: CiCheckResult): string {
  const lines: string[] = [];

  if (!result.pass) {
    const reasons = result.denialReasons.join('; ');
    lines.push(
      `::error title=Governance Check Failed::${result.denied} action(s) denied, ${result.violations} violation(s). ${reasons}`
    );
  }

  // Always output summary as a notice
  lines.push(
    `::notice title=Governance Summary::Actions: ${result.totalActions} | Allowed: ${result.allowed} | Denied: ${result.denied} | Violations: ${result.violations} | Escalations: ${result.escalations}`
  );

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Evidence Posting
// ---------------------------------------------------------------------------

const COMMENT_MARKER = '<!-- agentguard-evidence-report -->';

function detectPrNumber(): string | null {
  try {
    const result = execSync('gh pr view --json number --jq .number 2>/dev/null', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return result || null;
  } catch {
    return null;
  }
}

function postEvidenceComment(prNumber: string, markdown: string): boolean {
  const body = `${COMMENT_MARKER}\n${markdown}`;

  // Delete any existing evidence comments
  try {
    const commentsJson = execSync(
      `gh pr view ${prNumber} --json comments --jq '.comments[] | select(.body | startswith("${COMMENT_MARKER}")) | .id'`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();

    if (commentsJson) {
      const commentIds = commentsJson.split('\n').filter((id) => /^\d+$/.test(id));
      for (const id of commentIds) {
        try {
          execSync(`gh api repos/{owner}/{repo}/issues/comments/${id} -X DELETE`, {
            stdio: ['pipe', 'pipe', 'pipe'],
          });
        } catch {
          // Ignore delete failures
        }
      }
    }
  } catch {
    // No existing comments
  }

  try {
    execSync(`gh pr comment ${prNumber} --body -`, {
      input: body,
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

export async function ciCheck(args: string[], storageConfig?: StorageConfig): Promise<number> {
  const parsed = parseArgs(args, {
    boolean: ['--fail-on-violation', '--fail-on-denial', '--json', '--last', '--post-evidence'],
    string: ['--base-dir', '--pr', '--artifact-url'],
    alias: { '-d': '--base-dir', '-n': '--pr' },
  });

  const failOnViolation = !!parsed.flags['fail-on-violation'];
  const failOnDenial = !!parsed.flags['fail-on-denial'];
  const jsonOutput = !!parsed.flags.json;
  const useLast = !!parsed.flags.last;
  const postEvidence = !!parsed.flags['post-evidence'];
  const baseDir = (parsed.flags['base-dir'] as string) || '.agentguard';
  const prNumberFlag = (parsed.flags.pr as string) || null;
  const artifactUrl = (parsed.flags['artifact-url'] as string) || undefined;
  const sessionFile = parsed.positional[0];
  const isGitHubActions = !!process.env.GITHUB_ACTIONS;

  const useSqlite = storageConfig?.backend === 'sqlite';

  // Resolve the session
  let session: ReplaySession | null = null;

  if (sessionFile) {
    // Session file is always JSONL format (portable export)
    const resolvedPath = resolve(sessionFile);
    if (!existsSync(resolvedPath)) {
      process.stderr.write(`\n  \x1b[31mError:\x1b[0m Session file not found: ${resolvedPath}\n\n`);
      return 1;
    }
    session = loadSessionFromExport(resolvedPath);
    if (!session) {
      process.stderr.write(
        `\n  \x1b[31mError:\x1b[0m Could not parse session file: ${resolvedPath}\n\n`
      );
      return 1;
    }
  } else if (useLast) {
    if (useSqlite) {
      session = await loadLatestSessionSqlite(storageConfig);
    } else {
      const runId = getLatestRunId(baseDir);
      if (!runId) {
        process.stderr.write('\n  \x1b[31mError:\x1b[0m No governance runs found.\n\n');
        return 1;
      }
      session = loadReplaySession(runId, { baseDir });
    }
    if (!session) {
      process.stderr.write('\n  \x1b[31mError:\x1b[0m Could not load the most recent run.\n\n');
      return 1;
    }
  } else {
    process.stderr.write('\n  Usage: agentguard ci-check <session-file> [flags]\n');
    process.stderr.write('         agentguard ci-check --last [flags]\n\n');
    process.stderr.write('  Flags:\n');
    process.stderr.write('    --fail-on-violation      Exit 1 if invariant violations found\n');
    process.stderr.write('    --fail-on-denial         Exit 1 if any actions were denied\n');
    process.stderr.write('    --json                   Output as JSON\n');
    process.stderr.write('    --last                   Use the most recent local run\n');
    process.stderr.write('    --post-evidence          Post evidence report as PR comment\n');
    process.stderr.write(
      '    --pr, -n <number>        Target PR number (auto-detected if omitted)\n'
    );
    process.stderr.write('    --artifact-url <url>     Link to full session artifact\n');
    process.stderr.write('    --base-dir, -d <dir>     Base directory for events\n');
    process.stderr.write('    --store <backend>        Storage backend (sqlite)\n\n');
    return 1;
  }

  // Evaluate
  const result = evaluateSession(session, { failOnViolation, failOnDenial });

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

  // Post evidence report to PR
  if (postEvidence) {
    const prNumber = prNumberFlag || detectPrNumber();
    if (!prNumber) {
      process.stderr.write(
        '\n  \x1b[33mWarning:\x1b[0m --post-evidence: could not determine PR number. ' +
          'Use --pr <number> or run from a branch with an open PR.\n\n'
      );
    } else if (!/^\d+$/.test(prNumber)) {
      process.stderr.write(
        '\n  \x1b[33mWarning:\x1b[0m --post-evidence: PR number must be numeric.\n\n'
      );
    } else {
      const evidenceSummary = aggregateEvents([...session.events]);
      const markdownOptions: EvidenceMarkdownOptions = { artifactUrl };
      const markdown = formatEvidenceMarkdown(evidenceSummary, markdownOptions);
      const posted = postEvidenceComment(prNumber, markdown);
      if (posted) {
        process.stderr.write(
          `  \x1b[32m\u2713\x1b[0m Evidence report posted to PR #${prNumber}\n\n`
        );
      } else {
        process.stderr.write(
          `\n  \x1b[33mWarning:\x1b[0m Failed to post evidence report to PR #${prNumber}.\n\n`
        );
      }
    }
  }

  return result.pass ? 0 : 1;
}
