// CLI command: agentguard traces — display policy evaluation traces for a run.
// Supports filtering by action type and decision, summary statistics, and JSON output.
// Works with both JSONL (default) and SQLite storage backends.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from '../args.js';
import { renderPolicyTraces } from '../tui.js';
import type { PolicyTraceEvent } from '../tui.js';
import { getEventFilePath } from '@red-codes/events';
import type { DomainEvent } from '@red-codes/core';
import type { StorageConfig } from '@red-codes/storage';

const BASE_DIR = '.agentguard';
const EVENTS_DIR = join(BASE_DIR, 'events');

function isPolicyTraceEvent(e: DomainEvent): e is PolicyTraceEvent & DomainEvent {
  return e.kind === 'PolicyTraceRecorded';
}

// ---------------------------------------------------------------------------
// JSONL helpers
// ---------------------------------------------------------------------------

function loadEventsJsonl(runId: string): DomainEvent[] {
  const filePath = getEventFilePath(runId);
  if (!existsSync(filePath)) return [];

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

function listRunsJsonl(): string[] {
  if (!existsSync(EVENTS_DIR)) return [];
  return readdirSync(EVENTS_DIR)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => f.replace('.jsonl', ''))
    .sort()
    .reverse();
}

// ---------------------------------------------------------------------------
// Trace filtering
// ---------------------------------------------------------------------------

function filterTraces(
  traces: PolicyTraceEvent[],
  actionFilter?: string,
  decisionFilter?: string
): PolicyTraceEvent[] {
  let result = traces;

  if (actionFilter) {
    const pattern = actionFilter.toLowerCase();
    result = result.filter((t) => {
      const actionType = t.actionType.toLowerCase();
      // Support prefix matching (e.g., "git" matches "git.push", "git.commit")
      return actionType === pattern || actionType.startsWith(pattern + '.');
    });
  }

  if (decisionFilter) {
    const decision = decisionFilter.toLowerCase();
    result = result.filter((t) => t.decision.toLowerCase() === decision);
  }

  return result;
}

// ---------------------------------------------------------------------------
// JSON output
// ---------------------------------------------------------------------------

function formatTracesJson(traces: PolicyTraceEvent[]): string {
  const summary = computeSummary(traces);
  return JSON.stringify(
    {
      totalEvaluations: traces.length,
      summary,
      traces: traces.map((t) => ({
        actionType: t.actionType,
        target: t.target,
        decision: t.decision,
        phaseThatMatched: t.phaseThatMatched,
        totalRulesChecked: t.totalRulesChecked,
        durationMs: t.durationMs,
        rulesEvaluated: t.rulesEvaluated,
      })),
    },
    null,
    2
  );
}

interface TraceSummary {
  totalEvaluations: number;
  allowed: number;
  denied: number;
  avgDurationMs: number | null;
  actionTypes: Record<string, { allowed: number; denied: number }>;
  topMatchedRules: Array<{ rule: string; policy: string; matchCount: number }>;
  phaseBreakdown: Record<string, number>;
}

function computeSummary(traces: PolicyTraceEvent[]): TraceSummary {
  let allowed = 0;
  let denied = 0;
  let totalDuration = 0;
  let durationCount = 0;
  const actionTypes: Record<string, { allowed: number; denied: number }> = {};
  const ruleMatchCounts: Record<string, { rule: string; policy: string; count: number }> = {};
  const phaseBreakdown: Record<string, number> = {};

  for (const trace of traces) {
    if (trace.decision === 'allow') allowed++;
    else denied++;

    if (trace.durationMs !== undefined) {
      totalDuration += trace.durationMs;
      durationCount++;
    }

    // Action type breakdown
    if (!actionTypes[trace.actionType]) {
      actionTypes[trace.actionType] = { allowed: 0, denied: 0 };
    }
    if (trace.decision === 'allow') actionTypes[trace.actionType].allowed++;
    else actionTypes[trace.actionType].denied++;

    // Phase breakdown
    const phase = trace.phaseThatMatched || 'none';
    phaseBreakdown[phase] = (phaseBreakdown[phase] || 0) + 1;

    // Rule match counting
    const rules = trace.rulesEvaluated || [];
    for (const rule of rules) {
      if (rule.outcome === 'match') {
        const key = `${rule.policyName}#${rule.ruleIndex}`;
        if (!ruleMatchCounts[key]) {
          const pattern = Array.isArray(rule.actionPattern)
            ? rule.actionPattern.join(', ')
            : rule.actionPattern;
          ruleMatchCounts[key] = { rule: `[${rule.effect}] ${pattern}`, policy: key, count: 0 };
        }
        ruleMatchCounts[key].count++;
      }
    }
  }

  const topMatchedRules = Object.values(ruleMatchCounts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((r) => ({ rule: r.rule, policy: r.policy, matchCount: r.count }));

  return {
    totalEvaluations: traces.length,
    allowed,
    denied,
    avgDurationMs: durationCount > 0 ? totalDuration / durationCount : null,
    actionTypes,
    topMatchedRules,
    phaseBreakdown,
  };
}

// ---------------------------------------------------------------------------
// Summary rendering
// ---------------------------------------------------------------------------

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  gray: '\x1b[90m',
};

const ICONS = {
  allowed: '\u2713', // ✓
  denied: '\u2717', // ✗
};

export function renderTracesSummary(summary: TraceSummary): string {
  const lines: string[] = [];
  lines.push('');
  lines.push(
    `  ${ANSI.bold}Trace Summary${ANSI.reset} ${ANSI.dim}(${summary.totalEvaluations} evaluations)${ANSI.reset}`
  );
  lines.push(`  ${ANSI.dim}${'─'.repeat(60)}${ANSI.reset}`);

  // Decision breakdown
  const allowPct =
    summary.totalEvaluations > 0
      ? ((summary.allowed / summary.totalEvaluations) * 100).toFixed(0)
      : '0';
  const denyPct =
    summary.totalEvaluations > 0
      ? ((summary.denied / summary.totalEvaluations) * 100).toFixed(0)
      : '0';

  lines.push(
    `  ${ANSI.green}${ICONS.allowed} Allowed:${ANSI.reset} ${summary.allowed} (${allowPct}%)  ${ANSI.red}${ICONS.denied} Denied:${ANSI.reset} ${summary.denied} (${denyPct}%)`
  );

  if (summary.avgDurationMs !== null) {
    lines.push(
      `  ${ANSI.dim}Avg evaluation time: ${summary.avgDurationMs.toFixed(2)}ms${ANSI.reset}`
    );
  }

  // Phase breakdown
  const phases = Object.entries(summary.phaseBreakdown);
  if (phases.length > 0) {
    lines.push('');
    lines.push(`  ${ANSI.bold}Phase Breakdown${ANSI.reset}`);
    for (const [phase, count] of phases) {
      const phaseColor = phase === 'deny' ? ANSI.red : phase === 'allow' ? ANSI.green : ANSI.gray;
      lines.push(`    ${phaseColor}${phase}${ANSI.reset}: ${count}`);
    }
  }

  // Action type breakdown
  const actionEntries = Object.entries(summary.actionTypes);
  if (actionEntries.length > 0) {
    lines.push('');
    lines.push(`  ${ANSI.bold}Action Types${ANSI.reset}`);
    for (const [actionType, counts] of actionEntries) {
      const parts: string[] = [];
      if (counts.allowed > 0) parts.push(`${ANSI.green}${counts.allowed} allowed${ANSI.reset}`);
      if (counts.denied > 0) parts.push(`${ANSI.red}${counts.denied} denied${ANSI.reset}`);
      lines.push(`    ${actionType}: ${parts.join(', ')}`);
    }
  }

  // Top matched rules
  if (summary.topMatchedRules.length > 0) {
    lines.push('');
    lines.push(`  ${ANSI.bold}Top Matched Rules${ANSI.reset}`);
    for (const entry of summary.topMatchedRules) {
      lines.push(
        `    ${entry.matchCount}x  ${entry.rule} ${ANSI.dim}(${entry.policy})${ANSI.reset}`
      );
    }
  }

  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Public command
// ---------------------------------------------------------------------------

export { computeSummary };
export type { TraceSummary };

export async function traces(args: string[], storageConfig?: StorageConfig): Promise<number> {
  const parsed = parseArgs(args, {
    boolean: ['--last', '--list', '--summary', '--json', '--help', '-h'],
    string: ['--action', '--decision', '--store'],
    alias: { '-a': '--action', '-d': '--decision', '-s': '--summary' },
  });

  const showList = parsed.flags['list'] === true;
  const showLast = parsed.flags['last'] === true;
  const summaryOnly = parsed.flags['summary'] === true;
  const jsonOutput = parsed.flags['json'] === true;
  const actionFilter = parsed.flags['action'] as string | undefined;
  const decisionFilter = parsed.flags['decision'] as string | undefined;
  const targetArg = parsed.positional[0];

  const useSqlite = storageConfig?.backend === 'sqlite';

  // List runs
  if (showList || (!targetArg && !showLast)) {
    let runs: string[];

    if (useSqlite) {
      const { createStorageBundle } = await import('@red-codes/storage');
      const storage = await createStorageBundle(storageConfig!);
      if (!storage.db) {
        process.stderr.write('  Error: SQLite storage backend did not initialize database.\n');
        return 1;
      }
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
    process.stderr.write(`  \x1b[2m${'─'.repeat(50)}\x1b[0m\n`);
    for (const id of runs.slice(0, 20)) {
      process.stderr.write(`  ${id}\n`);
    }
    process.stderr.write('\n  Use: agentguard traces <runId> or agentguard traces --last\n\n');
    return 0;
  }

  // Resolve run ID
  let runId: string | undefined;
  if (showLast) {
    if (useSqlite) {
      const { createStorageBundle } = await import('@red-codes/storage');
      const storage = await createStorageBundle(storageConfig!);
      if (!storage.db) {
        process.stderr.write('  Error: SQLite storage backend did not initialize database.\n');
        return 1;
      }
      const { getLatestRunId } = await import('@red-codes/storage');
      const db = storage.db as import('better-sqlite3').Database;
      runId = getLatestRunId(db) ?? undefined;
      storage.close();
    } else {
      runId = listRunsJsonl()[0];
    }
  } else {
    runId = targetArg;
  }

  if (!runId) {
    process.stderr.write('\n  \x1b[2mNo runs recorded yet.\x1b[0m\n\n');
    return 0;
  }

  // Load events
  let eventList: DomainEvent[];
  if (useSqlite) {
    const { createStorageBundle } = await import('@red-codes/storage');
    const storage = await createStorageBundle(storageConfig!);
    if (!storage.db) {
      process.stderr.write('  Error: SQLite storage backend did not initialize database.\n');
      return 1;
    }
    const { loadRunEvents } = await import('@red-codes/storage');
    const db = storage.db as import('better-sqlite3').Database;
    eventList = loadRunEvents(db, runId);
    storage.close();
  } else {
    eventList = loadEventsJsonl(runId);
  }

  // Extract and filter traces
  let traceEvents: PolicyTraceEvent[] = eventList.filter(isPolicyTraceEvent);

  if (traceEvents.length === 0) {
    if (jsonOutput) {
      process.stdout.write(JSON.stringify({ totalEvaluations: 0, traces: [] }, null, 2) + '\n');
    } else {
      process.stderr.write(`\n  \x1b[1mRun:\x1b[0m ${runId}\n`);
      process.stderr.write('\n  \x1b[2mNo policy evaluation traces found for this run.\x1b[0m\n\n');
    }
    return 0;
  }

  traceEvents = filterTraces(traceEvents, actionFilter, decisionFilter);

  // JSON output
  if (jsonOutput) {
    process.stdout.write(formatTracesJson(traceEvents) + '\n');
    return 0;
  }

  // Terminal output
  process.stderr.write(`\n  \x1b[1mRun:\x1b[0m ${runId}\n`);

  if (actionFilter || decisionFilter) {
    const filters: string[] = [];
    if (actionFilter) filters.push(`action=${actionFilter}`);
    if (decisionFilter) filters.push(`decision=${decisionFilter}`);
    process.stderr.write(`  \x1b[2mFilters: ${filters.join(', ')}\x1b[0m\n`);
  }

  // Summary
  const summary = computeSummary(traceEvents);
  process.stderr.write(renderTracesSummary(summary));

  // Detailed traces (unless --summary)
  if (!summaryOnly) {
    process.stderr.write(renderPolicyTraces(traceEvents));
  }

  return 0;
}
