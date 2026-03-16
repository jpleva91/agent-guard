// CLI command: agentguard evidence-pr — attach governance evidence to a pull request.
// Reads governance events from SQLite, aggregates metrics, and posts a PR comment.

import { execSync } from 'node:child_process';
import { parseArgs } from '../args.js';
import { aggregateEvents, formatEvidenceMarkdown } from '../evidence-summary.js';
import type { DomainEvent } from '@red-codes/core';
import type { StorageConfig } from '@red-codes/storage';

// ---------------------------------------------------------------------------
// SQLite helpers
// ---------------------------------------------------------------------------

async function openSqliteDb(storageConfig?: StorageConfig) {
  const { createStorageBundle } = await import('@red-codes/storage');
  const config = storageConfig ?? { backend: 'sqlite' as const };
  const storage = await createStorageBundle(config);
  if (!storage.db) {
    process.stderr.write('  Error: SQLite storage backend did not initialize database.\n');
    return null;
  }
  return storage;
}

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

const COMMENT_MARKER = '<!-- agentguard-evidence-report -->';

function postPrComment(prNumber: string, markdown: string): boolean {
  const body = `${COMMENT_MARKER}\n${markdown}`;

  // Check if a previous evidence comment exists
  try {
    const commentsJson = execSync(
      `gh pr view ${prNumber} --json comments --jq '.comments[] | select(.body | startswith("${COMMENT_MARKER}")) | .id'`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();

    if (commentsJson) {
      // Update existing comment by deleting and re-posting
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
    // No existing comments, proceed with new one
  }

  // Post new comment
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

export async function evidencePr(args: string[], storageConfig?: StorageConfig): Promise<number> {
  const parsed = parseArgs(args, {
    boolean: ['--dry-run', '--last', '--all'],
    string: ['--pr', '--run'],
    alias: { '-n': '--pr', '-r': '--run' },
  });

  // Determine which events to aggregate
  let events: DomainEvent[];

  if (parsed.flags.run) {
    const runId = parsed.flags.run as string;

    const storage = await openSqliteDb(storageConfig);
    if (!storage) return 1;
    const { loadRunEvents } = await import('@red-codes/storage');
    const db = storage.db as import('better-sqlite3').Database;
    events = loadRunEvents(db, runId);
    storage.close();

    if (events.length === 0) {
      process.stderr.write(`\n  \x1b[31mError:\x1b[0m Run "${runId}" has no events.\n\n`);
      return 1;
    }
  } else if (parsed.flags.last) {
    const storage = await openSqliteDb(storageConfig);
    if (!storage) return 1;
    const { getLatestRunId, loadRunEvents } = await import('@red-codes/storage');
    const db = storage.db as import('better-sqlite3').Database;
    const latestRunId = getLatestRunId(db);
    if (!latestRunId) {
      storage.close();
      process.stderr.write('\n  \x1b[31mError:\x1b[0m No governance runs recorded.\n\n');
      return 1;
    }
    events = loadRunEvents(db, latestRunId);
    storage.close();
    if (events.length === 0) {
      process.stderr.write(
        `\n  \x1b[31mError:\x1b[0m Most recent run "${latestRunId}" has no events.\n\n`
      );
      return 1;
    }
  } else {
    // Default: aggregate all events from all runs
    const storage = await openSqliteDb(storageConfig);
    if (!storage) return 1;
    const { listRunIds, loadRunEvents } = await import('@red-codes/storage');
    const db = storage.db as import('better-sqlite3').Database;
    const runIds = listRunIds(db);
    events = [];
    for (const rid of runIds) {
      events.push(...loadRunEvents(db, rid));
    }
    storage.close();

    if (events.length === 0) {
      process.stderr.write('\n  \x1b[31mError:\x1b[0m No governance events found.\n\n');
      return 1;
    }
  }

  // Aggregate and format
  const summary = aggregateEvents(events);
  const markdown = formatEvidenceMarkdown(summary);

  // Dry-run mode: just print the markdown
  if (parsed.flags['dry-run']) {
    process.stdout.write(markdown + '\n');
    return 0;
  }

  // Resolve PR number
  let prNumber = (parsed.flags.pr as string) || parsed.positional[0] || null;
  if (!prNumber) {
    prNumber = detectPrNumber();
  }

  if (!prNumber) {
    process.stderr.write(
      '\n  \x1b[31mError:\x1b[0m Could not determine PR number.\n' +
        '  Use --pr <number> or run from a branch with an open PR.\n\n'
    );
    return 1;
  }

  if (!/^\d+$/.test(prNumber)) {
    process.stderr.write('\n  \x1b[31mError:\x1b[0m PR number must be numeric.\n\n');
    return 1;
  }

  // Post the comment
  const success = postPrComment(prNumber, markdown);
  if (!success) {
    process.stderr.write(
      `\n  \x1b[31mError:\x1b[0m Failed to post evidence comment to PR #${prNumber}.\n\n`
    );
    return 1;
  }

  process.stderr.write(
    `\n  \x1b[32m\u2713\x1b[0m Evidence report posted to PR #${prNumber}\n` +
      `    Events analyzed: ${summary.totalEvents}\n` +
      `    Actions allowed: ${summary.actionsAllowed}\n` +
      `    Actions denied:  ${summary.actionsDenied}\n` +
      `    Violations:      ${summary.invariantViolations}\n\n`
  );
  return 0;
}
