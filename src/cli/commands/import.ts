// CLI command: agentguard import — import a governance session from a portable JSONL file.
// Supports both JSONL (default) and SQLite storage backends.

import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from '../args.js';
import { getEventFilePath } from '../../events/jsonl.js';
import { getDecisionFilePath } from '../../events/decision-jsonl.js';
import { validateEvent } from '../../events/schema.js';
import type { DomainEvent, ValidationResult } from '../../core/types.js';
import type { GovernanceDecisionRecord } from '../../kernel/decisions/types.js';
import { EXPORT_SCHEMA_VERSION } from './export.js';
import type { GovernanceExportHeader } from './export.js';
import type { StorageConfig } from '../../storage/types.js';

const BASE_DIR = '.agentguard';

function ensureDir(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

export async function importSession(args: string[], storageConfig?: StorageConfig): Promise<void> {
  const parsed = parseArgs(args, {
    string: ['--as'],
  });

  const inputPath = parsed.positional[0];
  if (!inputPath) {
    process.stderr.write('\n  Usage: agentguard import <file> [--as <runId>]\n\n');
    process.exitCode = 1;
    return;
  }

  const resolvedPath = resolve(inputPath);
  if (!existsSync(resolvedPath)) {
    process.stderr.write(`\n  \x1b[31mError:\x1b[0m File not found: ${resolvedPath}\n\n`);
    process.exitCode = 1;
    return;
  }

  // Read and parse the file
  const content = readFileSync(resolvedPath, 'utf8');
  const lines = content.split('\n').filter((l) => l.trim());

  if (lines.length === 0) {
    process.stderr.write('\n  \x1b[31mError:\x1b[0m Import file is empty.\n\n');
    process.exitCode = 1;
    return;
  }

  // Parse and validate header
  let header: GovernanceExportHeader;
  try {
    header = JSON.parse(lines[0]) as GovernanceExportHeader;
  } catch {
    process.stderr.write('\n  \x1b[31mError:\x1b[0m Import file has an invalid header line.\n\n');
    process.exitCode = 1;
    return;
  }

  if (header.__agentguard_export !== true || header.version !== 1) {
    process.stderr.write(
      '\n  \x1b[31mError:\x1b[0m Not a valid AgentGuard export (missing or invalid header).\n\n'
    );
    process.exitCode = 1;
    return;
  }

  // Validate schema version (backward-compatible: missing schemaVersion treated as 1)
  const schemaVersion = header.schemaVersion ?? 1;
  if (schemaVersion > EXPORT_SCHEMA_VERSION) {
    process.stderr.write(
      `\n  \x1b[31mError:\x1b[0m Export uses schema version ${schemaVersion} but this version of AgentGuard only supports up to ${EXPORT_SCHEMA_VERSION}.\n` +
        '  Please upgrade AgentGuard to import this file.\n\n'
    );
    process.exitCode = 1;
    return;
  }

  const runId = (parsed.flags.as as string) || header.runId;
  if (!runId) {
    process.stderr.write(
      '\n  \x1b[31mError:\x1b[0m No runId found in export header and none provided via --as.\n\n'
    );
    process.exitCode = 1;
    return;
  }

  // Separate events and decisions based on header counts
  const eventLines = lines.slice(1, 1 + header.eventCount);
  const decisionLines = lines.slice(1 + header.eventCount);

  // Parse and validate events
  const events: DomainEvent[] = [];
  for (const line of eventLines) {
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      const { valid } = validateEvent(parsed) as ValidationResult;
      if (valid) {
        events.push(parsed as unknown as DomainEvent);
      }
    } catch {
      // Skip malformed lines
    }
  }

  // Parse decisions (no schema validation — they use a different format)
  const decisions: GovernanceDecisionRecord[] = [];
  for (const line of decisionLines) {
    try {
      const record = JSON.parse(line) as GovernanceDecisionRecord;
      if (record.outcome) {
        decisions.push(record);
      }
    } catch {
      // Skip malformed lines
    }
  }

  if (events.length === 0) {
    process.stderr.write('\n  \x1b[31mError:\x1b[0m Import file contains no valid events.\n\n');
    process.exitCode = 1;
    return;
  }

  const useSqlite = storageConfig?.backend === 'sqlite';

  if (useSqlite) {
    // Write to SQLite via storage sinks
    const { createStorageBundle } = await import('../../storage/factory.js');
    const storage = await createStorageBundle(storageConfig);
    const eventSink = storage.createEventSink(runId);
    const decisionSink = storage.createDecisionSink(runId);

    for (const event of events) {
      eventSink.write(event);
    }
    for (const decision of decisions) {
      decisionSink.write(decision);
    }

    storage.close();
  } else {
    // Check if run already exists (JSONL)
    const eventFilePath = getEventFilePath(runId);
    if (existsSync(eventFilePath)) {
      process.stderr.write(
        `\n  \x1b[33m\u26A0\x1b[0m Run "${runId}" already exists. Events will be appended.\n`
      );
    }

    // Write events
    ensureDir(join(BASE_DIR, 'events'));
    const eventData = events.map((e) => JSON.stringify(e)).join('\n') + '\n';
    appendFileSync(eventFilePath, eventData, 'utf8');

    // Write decisions (if any)
    if (decisions.length > 0) {
      ensureDir(join(BASE_DIR, 'decisions'));
      const decisionFilePath = getDecisionFilePath(runId);
      const decisionData = decisions.map((d) => JSON.stringify(d)).join('\n') + '\n';
      appendFileSync(decisionFilePath, decisionData, 'utf8');
    }
  }

  process.stderr.write(`\n  \x1b[32m\u2713\x1b[0m Imported run \x1b[1m${runId}\x1b[0m\n`);
  process.stderr.write(`    Events:    ${events.length}\n`);
  process.stderr.write(`    Decisions: ${decisions.length}\n`);
  process.stderr.write(`    Source:    ${resolvedPath}\n\n`);
}
