// CLI command: agentguard inspect — show action graph and events for a run.
// Also handles: agentguard events <runId>
// Supports both JSONL (default) and SQLite storage backends.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { renderEventStream, renderDecisionTable, renderPolicyTraces } from '../tui.js';
import type { PolicyTraceEvent } from '../tui.js';
import { getEventFilePath } from '../../events/jsonl.js';
import { getDecisionFilePath } from '../../events/decision-jsonl.js';
import type { DomainEvent } from '../../core/types.js';
import type { GovernanceDecisionRecord } from '../../kernel/decisions/types.js';
import type { StorageConfig } from '../../storage/types.js';

const BASE_DIR = '.agentguard';
const EVENTS_DIR = join(BASE_DIR, 'events');

function isPolicyTraceEvent(e: DomainEvent): e is PolicyTraceEvent & DomainEvent {
  return e.kind === 'PolicyTraceRecorded';
}

// ---------------------------------------------------------------------------
// JSONL helpers (default backend)
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
  if (!existsSync(filePath)) {
    return [];
  }

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
  const { createStorageBundle } = await import('../../storage/factory.js');
  const storage = await createStorageBundle(storageConfig);
  if (!storage.db) {
    process.stderr.write('  Error: SQLite storage backend did not initialize database.\n');
    return null;
  }
  return storage;
}

// ---------------------------------------------------------------------------
// Public commands
// ---------------------------------------------------------------------------

export async function inspect(args: string[], storageConfig?: StorageConfig): Promise<void> {
  const showDecisions = args.includes('--decisions');
  const showTraces = args.includes('--traces');
  const filteredArgs = args.filter((a) => a !== '--decisions' && a !== '--traces' && a !== '--store' && a !== 'sqlite' && a !== 'jsonl');
  const targetArg = filteredArgs[0];

  const useSqlite = storageConfig?.backend === 'sqlite';

  if (!targetArg || targetArg === '--list') {
    let runs: string[];

    if (useSqlite) {
      const storage = await openSqliteDb(storageConfig);
      if (!storage) return;
      const { listRunIds } = await import('../../storage/sqlite-store.js');
      const db = storage.db as import('better-sqlite3').Database;
      runs = listRunIds(db);
      storage.close();
    } else {
      runs = listRunsJsonl();
    }

    if (runs.length === 0) {
      process.stderr.write('\n  \x1b[2mNo runs recorded yet.\x1b[0m\n');
      process.stderr.write('  Run \x1b[1magentguard guard\x1b[0m to start recording.\n\n');
      return;
    }

    process.stderr.write('\n  \x1b[1mRecorded Runs\x1b[0m\n');
    process.stderr.write(`  ${'\x1b[2m'}${'─'.repeat(50)}${'\x1b[0m'}\n`);

    if (useSqlite) {
      const storage = await openSqliteDb(storageConfig);
      if (!storage) return;
      const { loadRunEvents } = await import('../../storage/sqlite-store.js');
      const db = storage.db as import('better-sqlite3').Database;
      for (const id of runs.slice(0, 20)) {
        const events = loadRunEvents(db, id);
        process.stderr.write(`  ${id}  ${'\x1b[2m'}(${events.length} events)${'\x1b[0m'}\n`);
      }
      storage.close();
    } else {
      for (const id of runs.slice(0, 20)) {
        const events = loadEventsJsonl(id);
        process.stderr.write(`  ${id}  ${'\x1b[2m'}(${events.length} events)${'\x1b[0m'}\n`);
      }
    }
    process.stderr.write('\n');
    return;
  }

  // Check for --last flag
  let targetRunId: string | undefined;
  if (targetArg === '--last') {
    if (useSqlite) {
      const storage = await openSqliteDb(storageConfig);
      if (!storage) return;
      const { getLatestRunId } = await import('../../storage/sqlite-store.js');
      const db = storage.db as import('better-sqlite3').Database;
      targetRunId = getLatestRunId(db) ?? undefined;
      storage.close();
    } else {
      targetRunId = listRunsJsonl()[0];
    }
  } else {
    targetRunId = targetArg;
  }

  if (!targetRunId) {
    process.stderr.write('\n  \x1b[2mNo runs recorded yet.\x1b[0m\n\n');
    return;
  }

  // Load events
  let eventList: DomainEvent[];
  if (useSqlite) {
    const storage = await openSqliteDb(storageConfig);
    if (!storage) return;
    const { loadRunEvents } = await import('../../storage/sqlite-store.js');
    const db = storage.db as import('better-sqlite3').Database;
    eventList = loadRunEvents(db, targetRunId);
    if (eventList.length === 0) {
      process.stderr.write(`  \x1b[31mError:\x1b[0m No events found for run: ${targetRunId}\n`);
    }

    // Show decision records if --decisions flag is present
    if (showDecisions) {
      const { loadRunDecisions } = await import('../../storage/sqlite-store.js');
      const decisions = loadRunDecisions(db, targetRunId);
      process.stderr.write(`\n  \x1b[1mRun:\x1b[0m ${targetRunId}\n`);
      if (decisions.length > 0) {
        process.stderr.write(renderDecisionTable(decisions));
      } else {
        process.stderr.write('\n  \x1b[2mNo decision records found for this run.\x1b[0m\n');
      }
    }
    storage.close();
  } else {
    eventList = loadEventsJsonl(targetRunId);
    if (eventList.length === 0 && !showDecisions && !showTraces) return;

    process.stderr.write(`\n  \x1b[1mRun:\x1b[0m ${targetRunId}\n`);

    if (showDecisions) {
      const decisions = loadDecisionsJsonl(targetRunId);
      if (decisions.length > 0) {
        process.stderr.write(renderDecisionTable(decisions));
      } else {
        process.stderr.write('\n  \x1b[2mNo decision records found for this run.\x1b[0m\n');
      }
    }
  }

  if (!useSqlite || !showDecisions) {
    process.stderr.write(`\n  \x1b[1mRun:\x1b[0m ${targetRunId}\n`);
  }

  // Show policy evaluation traces if --traces flag is present
  if (showTraces) {
    const traceEvents = eventList.filter(isPolicyTraceEvent);
    if (traceEvents.length > 0) {
      process.stderr.write(renderPolicyTraces(traceEvents));
    } else {
      process.stderr.write('\n  \x1b[2mNo policy evaluation traces found for this run.\x1b[0m\n');
    }
  }

  // Reconstruct action graph from events
  const actionEvents = eventList.filter(
    (e) =>
      e.kind === 'ActionRequested' ||
      e.kind === 'ActionAllowed' ||
      e.kind === 'ActionDenied' ||
      e.kind === 'ActionExecuted' ||
      e.kind === 'ActionFailed'
  );

  if (actionEvents.length > 0) {
    // Group by action sequence to show action graph
    const actions: Array<{
      action: string;
      target: string;
      allowed: boolean;
      executed: boolean;
      reason: string;
      violations: string[];
    }> = [];

    for (const event of actionEvents) {
      const rec = event as unknown as Record<string, unknown>;
      if (event.kind === 'ActionAllowed') {
        actions.push({
          action: rec.actionType as string,
          target: rec.target as string,
          allowed: true,
          executed: false,
          reason: (rec.reason as string) || '',
          violations: [],
        });
      } else if (event.kind === 'ActionDenied') {
        const meta = rec.metadata as Record<string, unknown> | undefined;
        const violations = (meta?.violations as Array<{ name: string }>) || [];
        actions.push({
          action: rec.actionType as string,
          target: rec.target as string,
          allowed: false,
          executed: false,
          reason: rec.reason as string,
          violations: violations.map((v) => v.name),
        });
      } else if (event.kind === 'ActionExecuted') {
        const last = actions[actions.length - 1];
        if (last) last.executed = true;
      }
    }

    // Simple action summary
    process.stderr.write(`\n  \x1b[1mAction Summary\x1b[0m (${actions.length} actions)\n`);
    process.stderr.write(`  ${'\x1b[2m'}${'─'.repeat(50)}${'\x1b[0m'}\n`);

    for (let i = 0; i < actions.length; i++) {
      const a = actions[i];
      const num = `${i + 1}.`.padStart(4);
      const icon = a.allowed ? '\x1b[32m\u2713\x1b[0m' : '\x1b[31m\u2717\x1b[0m';
      const status = a.allowed
        ? a.executed
          ? '\x1b[32mEXECUTED\x1b[0m'
          : '\x1b[2mALLOWED\x1b[0m'
        : '\x1b[31mDENIED\x1b[0m';

      process.stderr.write(
        `  ${num} ${icon} ${a.action} \x1b[2m${a.target}\x1b[0m \x1b[90m[${status}\x1b[90m]\x1b[0m\n`
      );
      if (!a.allowed) {
        process.stderr.write(`       \x1b[2m${a.reason}\x1b[0m\n`);
      }
      for (const v of a.violations) {
        process.stderr.write(`       \x1b[33m\u26A0 ${v}\x1b[0m\n`);
      }
    }
  }

  // Show event stream
  if (eventList.length > 0) {
    process.stderr.write(renderEventStream(eventList));
  }
}

export async function events(args: string[], storageConfig?: StorageConfig): Promise<void> {
  const runId = args[0];

  if (!runId) {
    process.stderr.write('\n  Usage: agentguard events <runId>\n\n');
    return;
  }

  const useSqlite = storageConfig?.backend === 'sqlite';

  let targetRunId: string | undefined;
  if (runId === '--last') {
    if (useSqlite) {
      const storage = await openSqliteDb(storageConfig);
      if (!storage) return;
      const { getLatestRunId } = await import('../../storage/sqlite-store.js');
      const db = storage.db as import('better-sqlite3').Database;
      targetRunId = getLatestRunId(db) ?? undefined;
      storage.close();
    } else {
      targetRunId = listRunsJsonl()[0];
    }
  } else {
    targetRunId = runId;
  }

  if (!targetRunId) {
    process.stderr.write('\n  \x1b[2mNo runs recorded yet.\x1b[0m\n\n');
    return;
  }

  let eventList: DomainEvent[];
  if (useSqlite) {
    const storage = await openSqliteDb(storageConfig);
    if (!storage) return;
    const { loadRunEvents } = await import('../../storage/sqlite-store.js');
    const db = storage.db as import('better-sqlite3').Database;
    eventList = loadRunEvents(db, targetRunId);
    storage.close();
  } else {
    eventList = loadEventsJsonl(targetRunId);
  }

  if (eventList.length === 0) return;

  // Raw event dump
  for (const event of eventList) {
    process.stdout.write(JSON.stringify(event) + '\n');
  }
}
