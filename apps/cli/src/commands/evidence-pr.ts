// CLI command: agentguard evidence-pr — attach governance evidence to a pull request.
// Reads JSONL event files, aggregates governance metrics, and posts a PR comment.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { parseArgs } from '../args.js';
import { aggregateEvents, formatEvidenceMarkdown } from '../evidence-summary.js';
import type { DomainEvent } from '@red-codes/core';

const BASE_DIR = '.agentguard';
const EVENTS_DIR = join(BASE_DIR, 'events');

function listRuns(): string[] {
  if (!existsSync(EVENTS_DIR)) return [];
  return readdirSync(EVENTS_DIR)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => f.replace('.jsonl', ''))
    .sort()
    .reverse();
}

function loadRunEvents(runId: string): DomainEvent[] {
  const filePath = join(EVENTS_DIR, `${runId}.jsonl`);
  if (!existsSync(filePath)) return [];

  const events: DomainEvent[] = [];
  const content = readFileSync(filePath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed) as DomainEvent);
    } catch {
      // Skip malformed lines
    }
  }
  return events;
}

function loadAllRunEvents(): DomainEvent[] {
  const runIds = listRuns();
  const events: DomainEvent[] = [];
  for (const runId of runIds) {
    events.push(...loadRunEvents(runId));
  }
  return events;
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

export async function evidencePr(args: string[]): Promise<number> {
  const parsed = parseArgs(args, {
    boolean: ['--dry-run', '--last', '--all'],
    string: ['--pr', '--run'],
    alias: { '-n': '--pr', '-r': '--run' },
  });

  // Determine which events to aggregate
  let events: DomainEvent[];

  if (parsed.flags.run) {
    const runId = parsed.flags.run as string;
    events = loadRunEvents(runId);
    if (events.length === 0) {
      process.stderr.write(`\n  \x1b[31mError:\x1b[0m Run "${runId}" has no events.\n\n`);
      return 1;
    }
  } else if (parsed.flags.last) {
    const runs = listRuns();
    if (runs.length === 0) {
      process.stderr.write('\n  \x1b[31mError:\x1b[0m No governance runs recorded.\n\n');
      return 1;
    }
    events = loadRunEvents(runs[0]);
    if (events.length === 0) {
      process.stderr.write(
        `\n  \x1b[31mError:\x1b[0m Most recent run "${runs[0]}" has no events.\n\n`
      );
      return 1;
    }
  } else {
    // Default: aggregate all events from all runs
    events = loadAllRunEvents();
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
