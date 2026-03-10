// CLI command: agentguard export — export a governance session to a portable JSONL file.

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from '../args.js';
import { getEventFilePath } from '../../events/jsonl.js';
import { getDecisionFilePath } from '../../events/decision-jsonl.js';
import type { DomainEvent } from '../../core/types.js';
import type { GovernanceDecisionRecord } from '../../kernel/decisions/types.js';

const BASE_DIR = '.agentguard';
const EVENTS_DIR = join(BASE_DIR, 'events');

/** Metadata header written as the first line of an exported governance session. */
export interface GovernanceExportHeader {
  readonly __agentguard_export: true;
  readonly version: 1;
  readonly runId: string;
  readonly exportedAt: number;
  readonly eventCount: number;
  readonly decisionCount: number;
}

function listRuns(): string[] {
  if (!existsSync(EVENTS_DIR)) return [];
  return readdirSync(EVENTS_DIR)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => f.replace('.jsonl', ''))
    .sort()
    .reverse();
}

function loadRunEvents(runId: string): DomainEvent[] {
  const filePath = getEventFilePath(runId);
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

function loadRunDecisions(runId: string): GovernanceDecisionRecord[] {
  const filePath = getDecisionFilePath(runId);
  if (!existsSync(filePath)) return [];

  const records: GovernanceDecisionRecord[] = [];
  const content = readFileSync(filePath, 'utf8');
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

export async function exportSession(args: string[]): Promise<void> {
  const parsed = parseArgs(args, {
    boolean: ['--last'],
    string: ['--output', '-o'],
    alias: { '-o': '--output' },
  });

  // Resolve runId
  let runId: string | undefined;
  if (parsed.flags.last) {
    const runs = listRuns();
    runId = runs[0];
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

  // Load events and decisions
  const events = loadRunEvents(runId);
  if (events.length === 0) {
    process.stderr.write(`\n  \x1b[31mError:\x1b[0m Run "${runId}" has no events to export.\n`);
    process.stderr.write(`  Expected file: ${getEventFilePath(runId)}\n\n`);
    process.exitCode = 1;
    return;
  }

  const decisions = loadRunDecisions(runId);

  // Determine output path
  const outputPath = resolve((parsed.flags.output as string) || `${runId}.agentguard.jsonl`);

  // Build export file: header + events + decisions
  const header: GovernanceExportHeader = {
    __agentguard_export: true,
    version: 1,
    runId,
    exportedAt: Date.now(),
    eventCount: events.length,
    decisionCount: decisions.length,
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
