// CLI command: agentguard inspect — show action graph and events for a run.
// Also handles: agentguard events <runId>

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { renderEventStream, renderDecisionTable } from '../../agentguard/renderers/tui.js';
import { getEventFilePath } from '../../agentguard/sinks/jsonl.js';
import { getDecisionFilePath } from '../../agentguard/sinks/decision-jsonl.js';
import type { DomainEvent } from '../../core/types.js';
import type { GovernanceDecisionRecord } from '../../agentguard/decisions/types.js';

const BASE_DIR = '.agentguard';
const EVENTS_DIR = join(BASE_DIR, 'events');

function loadEvents(runId: string): DomainEvent[] {
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

function loadDecisions(runId: string): GovernanceDecisionRecord[] {
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

function listRuns(): string[] {
  if (!existsSync(EVENTS_DIR)) return [];
  return readdirSync(EVENTS_DIR)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => f.replace('.jsonl', ''))
    .sort()
    .reverse();
}

export async function inspect(args: string[]): Promise<void> {
  const showDecisions = args.includes('--decisions');
  const filteredArgs = args.filter((a) => a !== '--decisions');
  const targetArg = filteredArgs[0];

  if (!targetArg || targetArg === '--list') {
    const runs = listRuns();
    if (runs.length === 0) {
      process.stderr.write('\n  \x1b[2mNo runs recorded yet.\x1b[0m\n');
      process.stderr.write('  Run \x1b[1magentguard guard\x1b[0m to start recording.\n\n');
      return;
    }

    process.stderr.write('\n  \x1b[1mRecorded Runs\x1b[0m\n');
    process.stderr.write(`  ${'\x1b[2m'}${'─'.repeat(50)}${'\x1b[0m'}\n`);
    for (const id of runs.slice(0, 20)) {
      const events = loadEvents(id);
      process.stderr.write(`  ${id}  ${'\x1b[2m'}(${events.length} events)${'\x1b[0m'}\n`);
    }
    process.stderr.write('\n');
    return;
  }

  // Check for --last flag
  const targetRunId = targetArg === '--last' ? listRuns()[0] : targetArg;
  if (!targetRunId) {
    process.stderr.write('\n  \x1b[2mNo runs recorded yet.\x1b[0m\n\n');
    return;
  }

  const events = loadEvents(targetRunId);
  if (events.length === 0 && !showDecisions) return;

  process.stderr.write(`\n  \x1b[1mRun:\x1b[0m ${targetRunId}\n`);

  // Show decision records if --decisions flag is present
  if (showDecisions) {
    const decisions = loadDecisions(targetRunId);
    if (decisions.length > 0) {
      process.stderr.write(renderDecisionTable(decisions));
    } else {
      process.stderr.write('\n  \x1b[2mNo decision records found for this run.\x1b[0m\n');
    }
  }

  // Reconstruct action graph from events
  const actionEvents = events.filter(
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
        ? a.executed ? '\x1b[32mEXECUTED\x1b[0m' : '\x1b[2mALLOWED\x1b[0m'
        : '\x1b[31mDENIED\x1b[0m';

      process.stderr.write(`  ${num} ${icon} ${a.action} \x1b[2m${a.target}\x1b[0m \x1b[90m[${status}\x1b[90m]\x1b[0m\n`);
      if (!a.allowed) {
        process.stderr.write(`       \x1b[2m${a.reason}\x1b[0m\n`);
      }
      for (const v of a.violations) {
        process.stderr.write(`       \x1b[33m\u26A0 ${v}\x1b[0m\n`);
      }
    }
  }

  // Show event stream
  if (events.length > 0) {
    process.stderr.write(renderEventStream(events));
  }
}

export async function events(args: string[]): Promise<void> {
  const runId = args[0];

  if (!runId) {
    process.stderr.write('\n  Usage: agentguard events <runId>\n\n');
    return;
  }

  const targetRunId = runId === '--last' ? listRuns()[0] : runId;
  if (!targetRunId) {
    process.stderr.write('\n  \x1b[2mNo runs recorded yet.\x1b[0m\n\n');
    return;
  }

  const eventList = loadEvents(targetRunId);
  if (eventList.length === 0) return;

  // Raw event dump
  for (const event of eventList) {
    process.stdout.write(JSON.stringify(event) + '\n');
  }
}
