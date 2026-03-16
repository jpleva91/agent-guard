// CLI command: agentguard adoption — analyze what percentage of agent tool calls go through governance.
// Reads Claude session JSONL (which logs all tool calls) and cross-references with AgentGuard
// governance events in SQLite.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { parseArgs } from '../args.js';
import type { StorageConfig } from '@red-codes/storage';

// ---------------------------------------------------------------------------
// Session auto-detection
// ---------------------------------------------------------------------------

/**
 * Auto-detect the most recent Claude session JSONL file.
 * Looks in ~/.claude/projects/ directories for .jsonl files.
 */
function autoDetectSession(): string | null {
  const claudeDir = join(homedir(), '.claude', 'projects');

  let bestPath: string | null = null;
  let bestMtime = -1;

  function scanDir(dir: string, depth: number): void {
    if (depth > 3) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      let stat: ReturnType<typeof statSync>;
      try {
        stat = statSync(fullPath);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        scanDir(fullPath, depth + 1);
      } else if (entry.endsWith('.jsonl')) {
        const mtime = stat.mtimeMs;
        if (mtime > bestMtime) {
          bestMtime = mtime;
          bestPath = fullPath;
        }
      }
    }
  }

  scanDir(claudeDir, 0);
  return bestPath;
}

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function adoptionColor(pct: number): string {
  if (pct >= 80) return ANSI.green;
  if (pct >= 50) return ANSI.yellow;
  return ANSI.red;
}

function renderAdoptionReport(
  result: import('@red-codes/storage').CorrelationResult,
  sessionPath: string,
  jsonOutput: boolean
): void {
  if (jsonOutput) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return;
  }

  const color = adoptionColor(result.adoptionPct);

  process.stderr.write('\n');
  process.stderr.write(
    `  ${ANSI.bold}Adoption Analytics${ANSI.reset}  ${ANSI.dim}(session: ${sessionPath})${ANSI.reset}\n`
  );
  process.stderr.write(`  ${ANSI.dim}${'─'.repeat(60)}${ANSI.reset}\n`);
  process.stderr.write('\n');
  process.stderr.write(
    `  ${ANSI.bold}Overall Adoption:${ANSI.reset}  ${color}${result.adoptionPct.toFixed(1)}%${ANSI.reset}\n`
  );
  process.stderr.write(
    `  Total tool calls:   ${result.totalToolCalls}\n` +
      `  Governed:           ${ANSI.green}${result.governedActions}${ANSI.reset}\n` +
      `  Ungoverned:         ${result.ungoverned > 0 ? ANSI.red : ANSI.dim}${result.ungoverned}${ANSI.reset}\n`
  );

  const toolEntries = Object.entries(result.byTool);
  if (toolEntries.length > 0) {
    process.stderr.write('\n');
    process.stderr.write(`  ${ANSI.bold}Per-Tool Breakdown${ANSI.reset}\n`);
    process.stderr.write(`  ${ANSI.dim}${'─'.repeat(40)}${ANSI.reset}\n`);

    const maxToolLen = Math.max(...toolEntries.map(([t]) => t.length));

    for (const [tool, counts] of toolEntries.sort(([a], [b]) => a.localeCompare(b))) {
      const toolPct = counts.total > 0 ? (counts.governed / counts.total) * 100 : 0;
      const tc = adoptionColor(toolPct);
      process.stderr.write(
        `  ${tool.padEnd(maxToolLen + 2)} ` +
          `${tc}${toolPct.toFixed(0).padStart(3)}%${ANSI.reset}` +
          `  ${ANSI.dim}(${counts.governed}/${counts.total})${ANSI.reset}\n`
      );
    }
  }

  process.stderr.write('\n');

  if (result.adoptionPct < 100 && result.ungoverned > 0) {
    process.stderr.write(
      `  ${ANSI.dim}Tip: Run ${ANSI.reset}${ANSI.cyan}agentguard auto-setup${ANSI.reset}` +
        `${ANSI.dim} to configure Claude Code hooks and improve adoption.${ANSI.reset}\n\n`
    );
  }
}

// ---------------------------------------------------------------------------
// Public command
// ---------------------------------------------------------------------------

export async function adoption(args: string[]): Promise<number> {
  const parsed = parseArgs(args, {
    boolean: ['--json', '--help', '-h'],
    string: ['--session', '--store', '--db-path'],
  });

  const jsonOutput = parsed.flags['json'] === true;
  const sessionFlag = parsed.flags['session'] as string | undefined;
  const dbPathFlag = parsed.flags['db-path'] as string | undefined;

  // 1. Resolve session JSONL path
  const sessionPath: string | null = sessionFlag ? resolve(sessionFlag) : autoDetectSession();

  if (!sessionPath) {
    process.stderr.write(
      '\n  No Claude session JSONL found.\n' +
        '  Provide one with: agentguard adoption --session <path>\n' +
        '  Or ensure ~/.claude/projects/ exists with recorded sessions.\n\n'
    );
    return 1;
  }

  // 2. Parse tool calls from session
  let lines: string[];
  try {
    lines = readFileSync(sessionPath, 'utf8').split('\n');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`  Error reading session file: ${msg}\n`);
    return 1;
  }

  const { parseSessionToolCalls } = await import('@red-codes/storage');
  const toolCalls = parseSessionToolCalls(lines);

  if (toolCalls.length === 0) {
    process.stderr.write(
      `\n  No tool_use entries found in session file: ${sessionPath}\n` +
        '  Ensure the session file contains Claude Code tool call records.\n\n'
    );
    return 0;
  }

  // 3. Load governance events from SQLite
  const storageConfig: StorageConfig = {
    backend: 'sqlite',
    dbPath: dbPathFlag ?? process.env['AGENTGUARD_DB_PATH'],
  };

  const { createStorageBundle, queryEventsByKindAcrossRuns } = await import('@red-codes/storage');
  let govEvents: Array<{ kind: string; actionType?: string; timestamp?: number }> = [];

  try {
    const storage = await createStorageBundle(storageConfig);
    if (storage.db) {
      const db = storage.db as import('better-sqlite3').Database;

      const requested = queryEventsByKindAcrossRuns(db, 'ActionRequested');
      const allowed = queryEventsByKindAcrossRuns(db, 'ActionAllowed');
      const denied = queryEventsByKindAcrossRuns(db, 'ActionDenied');

      govEvents = [...requested, ...allowed, ...denied];
      storage.close();
    }
  } catch {
    // SQLite not available or no data — continue with empty governance events
    process.stderr.write(
      '  Note: Could not load governance events from SQLite. Adoption will show 0%.\n' +
        '  Ensure AgentGuard has recorded governance sessions.\n'
    );
  }

  // 4. Correlate
  const { correlateWithGovernance } = await import('@red-codes/storage');
  const result = correlateWithGovernance(toolCalls, govEvents);

  // 5. Display results
  renderAdoptionReport(result, sessionPath, jsonOutput);

  return 0;
}
