// CLI command: agentguard export — export a governance session to a portable JSONL file.
// Uses SQLite storage backend.

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from '../args.js';
import type { DomainEvent } from '@red-codes/core';
import type { GovernanceDecisionRecord } from '@red-codes/core';
import type { StorageConfig } from '@red-codes/storage';

/**
 * Current schema version for the event/decision data shape.
 * Bump this when the DomainEvent or GovernanceDecisionRecord structure changes.
 */
export const EXPORT_SCHEMA_VERSION = 1;

/** Metadata header written as the first line of an exported governance session. */
export interface GovernanceExportHeader {
  readonly __agentguard_export: true;
  /** Export wrapper format version */
  readonly version: 1;
  /** Event/decision data schema version */
  readonly schemaVersion: number;
  readonly runId: string;
  readonly exportedAt: number;
  readonly eventCount: number;
  readonly decisionCount: number;
  /** Storage backend the session was exported from */
  readonly sourceBackend?: 'sqlite';
}

// ---------------------------------------------------------------------------
// Public command
// ---------------------------------------------------------------------------

export async function exportSession(args: string[], storageConfig?: StorageConfig): Promise<void> {
  const parsed = parseArgs(args, {
    boolean: ['--last'],
    string: ['--output', '-o'],
    alias: { '-o': '--output' },
  });

  const config = storageConfig ?? { backend: 'sqlite' as const };

  // Resolve runId
  let runId: string | undefined;
  if (parsed.flags.last) {
    const { createStorageBundle } = await import('@red-codes/storage');
    const storage = await createStorageBundle(config);
    if (!storage.db) {
      process.stderr.write('  Error: SQLite storage backend did not initialize database.\n');
      process.exitCode = 1;
      return;
    }
    const { getLatestRunId } = await import('@red-codes/storage');
    const db = storage.db as import('better-sqlite3').Database;
    runId = getLatestRunId(db) ?? undefined;
    storage.close();

    if (!runId) {
      process.stderr.write('\n  \x1b[31mError:\x1b[0m No runs recorded yet.\n\n');
      process.exitCode = 1;
      return;
    }
  } else {
    runId = parsed.positional[0];
  }

  if (!runId) {
    process.stderr.write('\n  Usage: agentguard export <runId> [--output <file>]\n');
    process.stderr.write('         agentguard export --last\n\n');
    process.exitCode = 1;
    return;
  }

  // Load events and decisions from SQLite
  let events: DomainEvent[];
  let decisions: GovernanceDecisionRecord[];

  const { createStorageBundle } = await import('@red-codes/storage');
  const storage = await createStorageBundle(config);
  if (!storage.db) {
    process.stderr.write('  Error: SQLite storage backend did not initialize database.\n');
    process.exitCode = 1;
    return;
  }
  const { loadRunEvents, loadRunDecisions } = await import('@red-codes/storage');
  const db = storage.db as import('better-sqlite3').Database;
  events = loadRunEvents(db, runId);
  decisions = loadRunDecisions(db, runId);
  storage.close();

  if (events.length === 0) {
    process.stderr.write(`\n  \x1b[31mError:\x1b[0m Run "${runId}" has no events to export.\n\n`);
    process.exitCode = 1;
    return;
  }

  // Determine output path
  const outputPath = resolve((parsed.flags.output as string) || `${runId}.agentguard.jsonl`);

  // Build export file: header + events + decisions
  const header: GovernanceExportHeader = {
    __agentguard_export: true,
    version: 1,
    schemaVersion: EXPORT_SCHEMA_VERSION,
    runId,
    exportedAt: Date.now(),
    eventCount: events.length,
    decisionCount: decisions.length,
    sourceBackend: 'sqlite',
  };

  const lines = [
    JSON.stringify(header),
    ...events.map((e) => JSON.stringify(e)),
    ...decisions.map((d) => JSON.stringify(d)),
  ];

  writeFileSync(outputPath, lines.join('\n') + '\n', 'utf8');

  process.stderr.write(`\n  \x1b[32m\u2713\x1b[0m Exported run \x1b[1m${runId}\x1b[0m\n`);
  process.stderr.write(`    Events:    ${events.length}\n`);
  process.stderr.write(`    Decisions: ${decisions.length}\n`);
  process.stderr.write(`    Output:    ${outputPath}\n\n`);
}
