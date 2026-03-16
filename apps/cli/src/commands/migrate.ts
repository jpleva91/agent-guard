// CLI command: agentguard migrate — bulk-import JSONL files into SQLite.
// Discovers .agentguard/events/*.jsonl and .agentguard/decisions/*.jsonl,
// parses each line, and inserts into the SQLite database.
// Idempotent: re-running skips already-imported records (INSERT OR IGNORE).

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { parseArgs } from '../args.js';
import { validateEvent } from '@red-codes/events';
import type { DomainEvent, ValidationResult } from '@red-codes/core';
import type { GovernanceDecisionRecord } from '@red-codes/core';
import type { StorageConfig } from '@red-codes/storage';

interface MigrateStats {
  filesProcessed: number;
  eventsImported: number;
  decisionsImported: number;
  sessionsCreated: number;
  errors: number;
  skipped: number;
}

interface RunTimestamps {
  minTs: number;
  maxTs: number;
  eventCount: number;
  decisionCount: number;
  allowCount: number;
  denyCount: number;
  violationCount: number;
}

/**
 * Discover JSONL files in a directory, sorted by name (chronological by run ID).
 */
function discoverJsonlFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith('.jsonl'))
      .sort()
      .map((f) => join(dir, f));
  } catch {
    return [];
  }
}

/**
 * Extract run ID from a JSONL filename.
 * e.g., "hook_1773216357942_927ukg.jsonl" → "hook_1773216357942_927ukg"
 */
function runIdFromFilename(filePath: string): string {
  return basename(filePath, '.jsonl');
}

/**
 * Parse a JSONL file into lines, skipping empty and malformed lines.
 */
function parseJsonlLines(filePath: string): string[] {
  try {
    const content = readFileSync(filePath, 'utf8');
    return content.split('\n').filter((l) => l.trim());
  } catch {
    return [];
  }
}

export async function migrate(args: string[], storageConfig?: StorageConfig): Promise<number> {
  const parsed = parseArgs(args, {
    boolean: ['--dry-run', '--verbose'],
    string: ['--dir', '-d', '--db-path'],
    alias: { '-d': '--dir' },
  });

  const dryRun = !!parsed.flags['dry-run'];
  const verbose = !!parsed.flags.verbose;
  const baseDir = (parsed.flags.dir as string) || '.agentguard';

  const eventsDir = join(baseDir, 'events');
  const decisionsDir = join(baseDir, 'decisions');

  process.stderr.write('\n  \x1b[1mAgentGuard Migration\x1b[0m — JSONL → SQLite\n\n');

  // Discover files
  const eventFiles = discoverJsonlFiles(eventsDir);
  const decisionFiles = discoverJsonlFiles(decisionsDir);

  if (eventFiles.length === 0 && decisionFiles.length === 0) {
    process.stderr.write(
      `  No JSONL files found in ${eventsDir}/ or ${decisionsDir}/\n` + '  Nothing to migrate.\n\n'
    );
    return 0;
  }

  process.stderr.write(`  Found ${eventFiles.length} event file(s)\n`);
  process.stderr.write(`  Found ${decisionFiles.length} decision file(s)\n`);

  if (dryRun) {
    process.stderr.write('\n  \x1b[33m[dry-run]\x1b[0m Would import:\n');
    let totalEvents = 0;
    let totalDecisions = 0;
    for (const f of eventFiles) {
      const lines = parseJsonlLines(f);
      totalEvents += lines.length;
      if (verbose) {
        process.stderr.write(`    ${basename(f)}: ${lines.length} events\n`);
      }
    }
    for (const f of decisionFiles) {
      const lines = parseJsonlLines(f);
      totalDecisions += lines.length;
      if (verbose) {
        process.stderr.write(`    ${basename(f)}: ${lines.length} decisions\n`);
      }
    }
    process.stderr.write(`\n    Events:    ${totalEvents}\n`);
    process.stderr.write(`    Decisions: ${totalDecisions}\n`);
    process.stderr.write(`    Sessions:  ${eventFiles.length} (reconstructed from event runs)\n\n`);
    return 0;
  }

  // Initialize SQLite storage
  const config = storageConfig ?? { backend: 'sqlite' as const };
  const { createStorageBundle } = await import('@red-codes/storage');
  const storage = await createStorageBundle(config);

  if (!storage.db) {
    process.stderr.write(
      '  \x1b[31mError:\x1b[0m SQLite storage backend did not initialize database.\n\n'
    );
    return 1;
  }

  const db = storage.db as import('better-sqlite3').Database;

  const stats: MigrateStats = {
    filesProcessed: 0,
    eventsImported: 0,
    decisionsImported: 0,
    sessionsCreated: 0,
    errors: 0,
    skipped: 0,
  };

  // Track run timestamps for session reconstruction
  const runTimestamps = new Map<string, RunTimestamps>();

  // Prepare bulk insert statements
  const insertEvent = db.prepare(`
    INSERT OR IGNORE INTO events (id, run_id, kind, timestamp, fingerprint, data, action_type)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertDecision = db.prepare(`
    INSERT OR IGNORE INTO decisions (record_id, run_id, timestamp, outcome, action_type, target, reason, data, severity)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertSession = db.prepare(`
    INSERT OR IGNORE INTO sessions (id, started_at, ended_at, command, repo, data)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  // Import events — wrapped in a transaction for performance
  const importEvents = db.transaction(() => {
    for (const filePath of eventFiles) {
      const runId = runIdFromFilename(filePath);
      const lines = parseJsonlLines(filePath);

      let fileEvents = 0;
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line) as Record<string, unknown>;
          const { valid } = validateEvent(parsed) as ValidationResult;
          if (!valid) {
            stats.skipped++;
            continue;
          }

          const event = parsed as unknown as DomainEvent;
          const actionType =
            typeof (parsed as Record<string, unknown>).actionType === 'string'
              ? ((parsed as Record<string, unknown>).actionType as string)
              : null;

          insertEvent.run(
            event.id,
            runId,
            event.kind,
            event.timestamp,
            event.fingerprint,
            line,
            actionType
          );
          fileEvents++;

          // Track timestamps for session reconstruction
          const existing = runTimestamps.get(runId);
          if (existing) {
            existing.minTs = Math.min(existing.minTs, event.timestamp);
            existing.maxTs = Math.max(existing.maxTs, event.timestamp);
            existing.eventCount++;
          } else {
            runTimestamps.set(runId, {
              minTs: event.timestamp,
              maxTs: event.timestamp,
              eventCount: 1,
              decisionCount: 0,
              allowCount: 0,
              denyCount: 0,
              violationCount: 0,
            });
          }
        } catch {
          stats.errors++;
        }
      }

      stats.eventsImported += fileEvents;
      stats.filesProcessed++;

      if (verbose) {
        process.stderr.write(`    \x1b[32m✓\x1b[0m ${basename(filePath)}: ${fileEvents} events\n`);
      }
    }
  });

  // Import decisions — wrapped in a transaction for performance
  const importDecisions = db.transaction(() => {
    for (const filePath of decisionFiles) {
      const runId = runIdFromFilename(filePath);
      const lines = parseJsonlLines(filePath);

      let fileDecisions = 0;
      for (const line of lines) {
        try {
          const record = JSON.parse(line) as GovernanceDecisionRecord;
          if (!record.outcome || !record.recordId) {
            stats.skipped++;
            continue;
          }

          const severity = (record.policy as Record<string, unknown> | undefined)?.severity ?? null;

          insertDecision.run(
            record.recordId,
            runId,
            record.timestamp,
            record.outcome,
            record.action?.type ?? 'unknown',
            record.action?.target ?? 'unknown',
            record.reason ?? '',
            line,
            severity as number | null
          );
          fileDecisions++;

          // Update run timestamps for session reconstruction
          const existing = runTimestamps.get(runId);
          if (existing) {
            existing.minTs = Math.min(existing.minTs, record.timestamp);
            existing.maxTs = Math.max(existing.maxTs, record.timestamp);
            existing.decisionCount++;
            if (record.outcome === 'allow') existing.allowCount++;
            if (record.outcome === 'deny') existing.denyCount++;
          } else {
            runTimestamps.set(runId, {
              minTs: record.timestamp,
              maxTs: record.timestamp,
              eventCount: 0,
              decisionCount: 1,
              allowCount: record.outcome === 'allow' ? 1 : 0,
              denyCount: record.outcome === 'deny' ? 1 : 0,
              violationCount: 0,
            });
          }
        } catch {
          stats.errors++;
        }
      }

      stats.decisionsImported += fileDecisions;
      stats.filesProcessed++;

      if (verbose) {
        process.stderr.write(
          `    \x1b[32m✓\x1b[0m ${basename(filePath)}: ${fileDecisions} decisions\n`
        );
      }
    }
  });

  // Execute imports
  process.stderr.write('  Importing events...\n');
  importEvents();
  process.stderr.write('  Importing decisions...\n');
  importDecisions();

  // Reconstruct sessions from run timestamps
  process.stderr.write('  Reconstructing sessions...\n');
  const createSessions = db.transaction(() => {
    for (const [runId, ts] of runTimestamps) {
      const startedAt = new Date(ts.minTs).toISOString();
      const endedAt = new Date(ts.maxTs).toISOString();
      const data = JSON.stringify({
        status: 'completed',
        source: 'jsonl-migration',
        totalActions: ts.eventCount + ts.decisionCount,
        allowed: ts.allowCount,
        denied: ts.denyCount,
        violations: ts.violationCount,
        durationMs: ts.maxTs - ts.minTs,
      });

      insertSession.run(runId, startedAt, endedAt, 'migrate', null, data);
      stats.sessionsCreated++;
    }
  });
  createSessions();

  storage.close();

  // Report results
  process.stderr.write('\n  \x1b[32m✓ Migration complete\x1b[0m\n');
  process.stderr.write(`    Files processed: ${stats.filesProcessed}\n`);
  process.stderr.write(`    Events imported: ${stats.eventsImported}\n`);
  process.stderr.write(`    Decisions imported: ${stats.decisionsImported}\n`);
  process.stderr.write(`    Sessions created: ${stats.sessionsCreated}\n`);
  if (stats.skipped > 0) {
    process.stderr.write(`    Skipped (invalid): ${stats.skipped}\n`);
  }
  if (stats.errors > 0) {
    process.stderr.write(`    Errors: ${stats.errors}\n`);
  }
  process.stderr.write('\n');

  return 0;
}
