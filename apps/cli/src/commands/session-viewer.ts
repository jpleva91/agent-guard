// CLI command: agentguard session-viewer — generate interactive HTML visualization
// of a governance session and open it in the default browser.
// Supports both JSONL (default) and SQLite storage backends.

import { readFileSync, existsSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';
import { getEventFilePath, getDecisionFilePath } from '@red-codes/events';
import { buildReplaySession } from '@red-codes/kernel';
import type { DomainEvent } from '@red-codes/core';
import type { GovernanceDecisionRecord } from '@red-codes/core';
import type { StorageConfig } from '@red-codes/storage';
import { aggregateEvents } from '../evidence-summary.js';
import { generateSessionHtml } from '../session-viewer-html.js';

const BASE_DIR = '.agentguard';
const EVENTS_DIR = join(BASE_DIR, 'events');
const VIEWS_DIR = join(homedir(), '.agentguard', 'views');

// ---------------------------------------------------------------------------
// JSONL helpers (same pattern as inspect.ts)
// ---------------------------------------------------------------------------

function loadEventsJsonl(runId: string): DomainEvent[] {
  const filePath = getEventFilePath(runId);
  if (!existsSync(filePath)) {
    process.stderr.write(`  \x1b[31mError:\x1b[0m No events found for run: ${runId}\n`);
    process.stderr.write(`  Expected file: ${filePath}\n`);
    return [];
  }

  const content = readFileSync(filePath, 'utf8');
  const events: DomainEvent[] = [];
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

function loadDecisionsJsonl(runId: string): GovernanceDecisionRecord[] {
  const filePath = getDecisionFilePath(runId);
  if (!existsSync(filePath)) return [];

  const content = readFileSync(filePath, 'utf8');
  const records: GovernanceDecisionRecord[] = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      records.push(JSON.parse(trimmed) as GovernanceDecisionRecord);
    } catch {
      // Skip malformed lines
    }
  }
  return records;
}

function listRunsJsonl(): string[] {
  if (!existsSync(EVENTS_DIR)) return [];
  return readdirSync(EVENTS_DIR)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => f.replace('.jsonl', ''))
    .sort()
    .reverse();
}

// ---------------------------------------------------------------------------
// SQLite helpers
// ---------------------------------------------------------------------------

async function openSqliteDb(storageConfig: StorageConfig) {
  const { createStorageBundle } = await import('@red-codes/storage');
  const storage = await createStorageBundle(storageConfig);
  if (!storage.db) {
    process.stderr.write('  Error: SQLite storage backend did not initialize database.\n');
    return null;
  }
  return storage;
}

// ---------------------------------------------------------------------------
// Browser opening
// ---------------------------------------------------------------------------

function openInBrowser(filePath: string): void {
  const cmd =
    process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
        ? 'start'
        : 'xdg-open';
  try {
    execSync(`${cmd} "${filePath}"`, { stdio: 'ignore' });
  } catch {
    // Silently fail — file path is printed to stderr regardless
  }
}

// ---------------------------------------------------------------------------
// Public command
// ---------------------------------------------------------------------------

export async function sessionViewer(
  args: string[],
  storageConfig?: StorageConfig,
): Promise<number> {
  const noOpen = args.includes('--no-open');
  const filteredArgs = args.filter(
    (a) =>
      a !== '--no-open' &&
      a !== '--store' &&
      a !== '--db-path' &&
      a !== 'sqlite' &&
      a !== 'jsonl',
  );

  // Parse --output / -o flag
  let outputPath: string | undefined;
  for (let i = 0; i < filteredArgs.length; i++) {
    if ((filteredArgs[i] === '--output' || filteredArgs[i] === '-o') && filteredArgs[i + 1]) {
      outputPath = filteredArgs[i + 1];
      filteredArgs.splice(i, 2);
      break;
    }
  }

  // Filter out --db-path value from the original args
  const cleanArgs = filteredArgs.filter(
    (a) => a !== '--output' && a !== '-o',
  );
  const targetArg = cleanArgs[0];

  const useSqlite = storageConfig?.backend === 'sqlite';

  // --list: show available runs
  if (targetArg === '--list') {
    let runs: string[];
    if (useSqlite) {
      const storage = await openSqliteDb(storageConfig);
      if (!storage) return 1;
      const { listRunIds } = await import('@red-codes/storage');
      const db = storage.db as import('better-sqlite3').Database;
      runs = listRunIds(db);
      storage.close();
    } else {
      runs = listRunsJsonl();
    }

    if (runs.length === 0) {
      process.stderr.write('\n  \x1b[2mNo runs recorded yet.\x1b[0m\n');
      process.stderr.write('  Run \x1b[1magentguard guard\x1b[0m to start recording.\n\n');
      return 0;
    }

    process.stderr.write('\n  \x1b[1mRecorded Runs\x1b[0m\n');
    process.stderr.write(`  ${'\x1b[2m'}${'─'.repeat(50)}${'\x1b[0m'}\n`);
    for (const id of runs.slice(0, 20)) {
      process.stderr.write(`  ${id}\n`);
    }
    if (runs.length > 20) {
      process.stderr.write(`  \x1b[2m... and ${runs.length - 20} more\x1b[0m\n`);
    }
    process.stderr.write(
      '\n  Usage: agentguard session-viewer <runId>\n\n',
    );
    return 0;
  }

  // Resolve run ID
  let targetRunId: string | undefined;
  if (!targetArg || targetArg === '--last') {
    if (useSqlite) {
      const storage = await openSqliteDb(storageConfig);
      if (!storage) return 1;
      const { getLatestRunId: getLatestRunIdSqlite } = await import('@red-codes/storage');
      const db = storage.db as import('better-sqlite3').Database;
      targetRunId = getLatestRunIdSqlite(db) ?? undefined;
      storage.close();
    } else {
      targetRunId = listRunsJsonl()[0];
    }
  } else {
    targetRunId = targetArg;
  }

  if (!targetRunId) {
    process.stderr.write('\n  \x1b[2mNo runs recorded yet.\x1b[0m\n');
    process.stderr.write('  Run \x1b[1magentguard guard\x1b[0m to start recording.\n\n');
    return 1;
  }

  // Load events
  let eventList: DomainEvent[];
  let decisionList: GovernanceDecisionRecord[];

  if (useSqlite) {
    const storage = await openSqliteDb(storageConfig);
    if (!storage) return 1;
    const { loadRunEvents, loadRunDecisions } = await import('@red-codes/storage');
    const db = storage.db as import('better-sqlite3').Database;
    eventList = loadRunEvents(db, targetRunId);
    decisionList = loadRunDecisions(db, targetRunId);
    storage.close();
  } else {
    eventList = loadEventsJsonl(targetRunId);
    decisionList = loadDecisionsJsonl(targetRunId);
  }

  if (eventList.length === 0) {
    process.stderr.write(`  \x1b[31mError:\x1b[0m No events found for run: ${targetRunId}\n`);
    return 1;
  }

  // Build session and summary
  const session = buildReplaySession(targetRunId, eventList);
  const evidenceSummary = aggregateEvents(eventList);

  // Generate HTML
  const html = generateSessionHtml(session, evidenceSummary, decisionList, eventList);

  // Determine output path
  const outFile = outputPath || join(VIEWS_DIR, `${targetRunId}.html`);
  const outDir = outputPath ? join(outFile, '..') : VIEWS_DIR;
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }
  writeFileSync(outFile, html, 'utf8');

  process.stderr.write(`\n  \x1b[32m✓\x1b[0m Session viewer written to: ${outFile}\n`);

  if (!noOpen) {
    process.stderr.write('  Opening in browser...\n\n');
    openInBrowser(outFile);
  } else {
    process.stderr.write('\n');
  }

  return 0;
}
