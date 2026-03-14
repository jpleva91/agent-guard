// CLI command: agentguard diff — compare two governance sessions side-by-side.
//
// Loads two sessions by run ID, compares action sequences, policy decisions,
// escalation levels, invariant violations, and outputs a structured diff report.
// Supports both JSONL (default) and SQLite storage backends via --store flag.

import { parseArgs } from '../args.js';
import { BOLD, RESET, DIM, FG, bold, dim, color, padVis } from '../colors.js';
import { compareRunIds, compareReplaySessions } from '@red-codes/kernel';
import { listRunIds, loadReplaySession, buildReplaySession } from '@red-codes/kernel';
import type { ReplaySession, ReplayAction } from '@red-codes/kernel';
import type { ComparisonReport, ActionComparison } from '@red-codes/kernel';
import type { StorageConfig } from '@red-codes/storage';

// ---------------------------------------------------------------------------
// Terminal rendering
// ---------------------------------------------------------------------------

const ICONS = {
  match: `${FG.green}\u2713${RESET}`,
  divergent: `${FG.red}\u2260${RESET}`,
  missing: `${FG.yellow}\u2190${RESET}`,
  extra: `${FG.yellow}\u2192${RESET}`,
  identical: `${FG.green}\u2713${RESET}`,
  changed: `${FG.red}\u2717${RESET}`,
};

function statusIcon(status: ActionComparison['status']): string {
  return ICONS[status] || '?';
}

function statusLabel(status: ActionComparison['status']): string {
  switch (status) {
    case 'match':
      return color('MATCH', 'green');
    case 'divergent':
      return color('DIVERGENT', 'red');
    case 'missing':
      return color('MISSING', 'yellow');
    case 'extra':
      return color('EXTRA', 'yellow');
    default:
      return status;
  }
}

// ---------------------------------------------------------------------------
// Session-level analysis helpers
// ---------------------------------------------------------------------------

/** Escalation level ordering for comparison. */
const ESCALATION_LEVELS = ['NORMAL', 'ELEVATED', 'HIGH', 'LOCKDOWN'] as const;

/** Extract the maximum escalation level observed in a session. */
function getMaxEscalationLevel(session: ReplaySession): string {
  let maxLevel = 0;
  for (const action of session.actions) {
    if (action.escalationEvent) {
      const level = (action.escalationEvent.escalationLevel as string) || '';
      const idx = ESCALATION_LEVELS.indexOf(level as (typeof ESCALATION_LEVELS)[number]);
      if (idx > maxLevel) maxLevel = idx;
    }
  }
  return ESCALATION_LEVELS[maxLevel];
}

/** Extract invariant violations from a session, grouped by invariant name. */
function getInvariantViolations(session: ReplaySession): Map<string, number> {
  const violations = new Map<string, number>();
  for (const action of session.actions) {
    for (const gov of action.governanceEvents) {
      if (gov.kind === 'InvariantViolation') {
        const name = (gov.invariant as string) || 'unknown';
        violations.set(name, (violations.get(name) || 0) + 1);
      }
    }
  }
  return violations;
}

/** Get per-action governance detail strings for display. */
function getActionGovernanceDetail(action: ReplayAction): string[] {
  const details: string[] = [];
  if (action.escalationEvent) {
    const level = (action.escalationEvent.escalationLevel as string) || 'unknown';
    details.push(`escalation: ${level}`);
  }
  for (const gov of action.governanceEvents) {
    if (gov.kind === 'InvariantViolation') {
      const inv = (gov.invariant as string) || 'unknown';
      details.push(`violation: ${inv}`);
    } else if (gov.kind === 'PolicyDenied') {
      const reason = (gov.reason as string) || '';
      details.push(`policy: ${reason}`);
    }
  }
  return details;
}

/**
 * Render a comparison report with ANSI colors for terminal display.
 */
function renderDiffReport(
  report: ComparisonReport,
  sessionA?: ReplaySession,
  sessionB?: ReplaySession
): string {
  const lines: string[] = [];

  // Header
  lines.push('');
  lines.push(`  ${BOLD}Session Comparison${RESET}`);
  lines.push(`  ${DIM}${'─'.repeat(50)}${RESET}`);
  lines.push(`  ${BOLD}Session A:${RESET} ${report.originalRunId}`);
  lines.push(`  ${BOLD}Session B:${RESET} ${report.replayedRunId}`);
  lines.push('');

  // Verdict
  if (report.identical) {
    lines.push(
      `  ${ICONS.identical} ${color('IDENTICAL', 'green')} — all governance decisions match.`
    );
  } else {
    lines.push(`  ${ICONS.changed} ${color('DIVERGENT', 'red')} — governance decisions differ.`);
  }
  lines.push('');

  // Summary table
  lines.push(`  ${BOLD}Overview${RESET}`);
  lines.push(`  ${DIM}${'─'.repeat(50)}${RESET}`);
  const summaryRows: Array<[string, number, string]> = [
    ['Total comparisons', report.totalComparisons, 'white'],
    ['Matches', report.matches, 'green'],
    ['Divergences', report.divergences, report.divergences > 0 ? 'red' : 'green'],
    ['Missing (A only)', report.missing, report.missing > 0 ? 'yellow' : 'green'],
    ['Extra (B only)', report.extra, report.extra > 0 ? 'yellow' : 'green'],
  ];

  for (const [label, count, fg] of summaryRows) {
    lines.push(`  ${padVis(label, 22)} ${color(String(count), fg)}`);
  }
  lines.push('');

  // Action-level details — only show non-matching actions
  const nonMatching = report.comparisons.filter((c) => c.status !== 'match');
  if (nonMatching.length > 0) {
    lines.push(`  ${BOLD}Action Details${RESET}`);
    lines.push(`  ${DIM}${'─'.repeat(50)}${RESET}`);

    for (const comp of nonMatching) {
      const actionType = comp.original?.actionType || comp.replayed?.actionType || 'unknown';
      const target = comp.original?.target || comp.replayed?.target || '';
      const idx = `${comp.index + 1}.`.padStart(4);

      lines.push(
        `  ${idx} ${statusIcon(comp.status)} ${bold(actionType)} ${dim(target)} [${statusLabel(comp.status)}]`
      );

      if (comp.status === 'divergent' && comp.differences.length > 0) {
        for (const diff of comp.differences) {
          const origStr = String(diff.original);
          const replayStr = String(diff.replayed);
          lines.push(
            `       ${dim(diff.field + ':')} ${color(origStr, 'red')} ${dim('\u2192')} ${color(replayStr, 'green')}`
          );
        }
      }

      // Show governance details (escalation, violations) for divergent actions
      if (comp.status === 'divergent') {
        const origDetails = comp.original ? getActionGovernanceDetail(comp.original) : [];
        const replayDetails = comp.replayed ? getActionGovernanceDetail(comp.replayed) : [];
        if (origDetails.length > 0 || replayDetails.length > 0) {
          if (origDetails.length > 0) {
            for (const d of origDetails) {
              lines.push(`       ${dim('A:')} ${color(d, 'red')}`);
            }
          }
          if (replayDetails.length > 0) {
            for (const d of replayDetails) {
              lines.push(`       ${dim('B:')} ${color(d, 'green')}`);
            }
          }
        }
      }

      if (comp.status === 'missing' && comp.original) {
        lines.push(`       ${dim('Only in Session A')}`);
        const details = getActionGovernanceDetail(comp.original);
        for (const d of details) {
          lines.push(`       ${dim('\u2514')} ${color(d, 'yellow')}`);
        }
      }

      if (comp.status === 'extra' && comp.replayed) {
        lines.push(`       ${dim('Only in Session B')}`);
        const details = getActionGovernanceDetail(comp.replayed);
        for (const d of details) {
          lines.push(`       ${dim('\u2514')} ${color(d, 'yellow')}`);
        }
      }
    }
    lines.push('');
  }

  // Summary-level diffs
  if (report.summaryDiff.differences.length > 0) {
    lines.push(`  ${BOLD}Summary Differences${RESET}`);
    lines.push(`  ${DIM}${'─'.repeat(50)}${RESET}`);

    for (const diff of report.summaryDiff.differences) {
      const origStr = String(diff.original);
      const replayStr = String(diff.replayed);
      lines.push(
        `  ${padVis(diff.field, 20)} ${color(origStr, 'red')} ${dim('\u2192')} ${color(replayStr, 'green')}`
      );
    }
    lines.push('');
  }

  // Escalation level comparison
  if (sessionA && sessionB) {
    const levelA = getMaxEscalationLevel(sessionA);
    const levelB = getMaxEscalationLevel(sessionB);

    if (levelA !== levelB) {
      lines.push(`  ${BOLD}Escalation Levels${RESET}`);
      lines.push(`  ${DIM}${'─'.repeat(50)}${RESET}`);
      const colorA = levelA === 'NORMAL' ? 'green' : levelA === 'LOCKDOWN' ? 'red' : 'yellow';
      const colorB = levelB === 'NORMAL' ? 'green' : levelB === 'LOCKDOWN' ? 'red' : 'yellow';
      lines.push(
        `  ${padVis('Max escalation', 20)} ${color(levelA, colorA)} ${dim('\u2192')} ${color(levelB, colorB)}`
      );
      lines.push('');
    }

    // Invariant violation comparison
    const violationsA = getInvariantViolations(sessionA);
    const violationsB = getInvariantViolations(sessionB);
    const allInvariants = new Set([...violationsA.keys(), ...violationsB.keys()]);

    if (allInvariants.size > 0) {
      const changedInvariants: Array<[string, number, number]> = [];
      for (const inv of allInvariants) {
        const countA = violationsA.get(inv) || 0;
        const countB = violationsB.get(inv) || 0;
        if (countA !== countB) {
          changedInvariants.push([inv, countA, countB]);
        }
      }

      if (changedInvariants.length > 0) {
        lines.push(`  ${BOLD}Invariant Violations${RESET}`);
        lines.push(`  ${DIM}${'─'.repeat(50)}${RESET}`);
        for (const [inv, countA, countB] of changedInvariants) {
          const colorA = countA === 0 ? 'green' : 'red';
          const colorB = countB === 0 ? 'green' : 'red';
          lines.push(
            `  ${padVis(inv, 30)} ${color(String(countA), colorA)} ${dim('\u2192')} ${color(String(countB), colorB)}`
          );
        }
        lines.push('');
      }
    }
  }

  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// CLI command
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// SQLite helpers
// ---------------------------------------------------------------------------

async function loadSessionSqlite(
  runId: string,
  storageConfig: StorageConfig
): Promise<ReplaySession | null> {
  const { createStorageBundle } = await import('@red-codes/storage');
  const { loadRunEvents } = await import('@red-codes/storage');
  const storage = await createStorageBundle(storageConfig);
  if (!storage.db) {
    process.stderr.write(`  ${FG.red}Error:${RESET} SQLite storage backend did not initialize.\n`);
    return null;
  }
  const db = storage.db as import('better-sqlite3').Database;
  const events = loadRunEvents(db, runId);
  storage.close();
  if (events.length === 0) return null;
  return buildReplaySession(runId, events);
}

async function listRunIdsSqlite(storageConfig: StorageConfig): Promise<string[]> {
  const { createStorageBundle } = await import('@red-codes/storage');
  const { listRunIds: listSqliteRunIds } = await import('@red-codes/storage');
  const storage = await createStorageBundle(storageConfig);
  if (!storage.db) return [];
  const db = storage.db as import('better-sqlite3').Database;
  const runs = listSqliteRunIds(db);
  storage.close();
  return runs;
}

// ---------------------------------------------------------------------------
// CLI command
// ---------------------------------------------------------------------------

export async function diff(args: string[], storageConfig?: StorageConfig): Promise<void> {
  const parsed = parseArgs(args, {
    boolean: ['--json', '--last'],
    string: ['--dir', '-d', '--store'],
    alias: { '-d': '--dir' },
  });

  const baseDir = (parsed.flags.dir as string) || undefined;
  const wantJson = !!parsed.flags.json;
  const useSqlite = storageConfig?.backend === 'sqlite' || parsed.flags.store === 'sqlite';
  const resolvedConfig: StorageConfig = storageConfig || {
    backend: useSqlite ? 'sqlite' : 'jsonl',
    baseDir,
  };

  // Resolve run IDs
  let runIdA: string | undefined;
  let runIdB: string | undefined;

  if (parsed.flags.last) {
    // --last: compare the two most recent runs
    const runs = useSqlite ? await listRunIdsSqlite(resolvedConfig) : listRunIds(baseDir);
    if (runs.length < 2) {
      process.stderr.write(
        `\n  ${FG.red}Error:${RESET} Need at least 2 recorded runs for --last comparison.\n`
      );
      process.stderr.write(`  Found ${runs.length} run(s).\n\n`);
      process.exitCode = 1;
      return;
    }
    runIdA = runs[1]; // second most recent
    runIdB = runs[0]; // most recent
  } else {
    runIdA = parsed.positional[0];
    runIdB = parsed.positional[1];
  }

  if (!runIdA || !runIdB) {
    process.stderr.write(`
  ${BOLD}Usage:${RESET}  agentguard diff <runId-A> <runId-B> [flags]
          agentguard diff --last

  ${BOLD}Flags:${RESET}
    --json          Output as JSON
    --last          Compare the two most recent runs
    --dir, -d       Base directory for event data
    --store         Storage backend: jsonl (default) or sqlite

  ${BOLD}Examples:${RESET}
    agentguard diff run_abc123 run_def456
    agentguard diff --last
    agentguard diff --last --json
    agentguard diff --last --store sqlite
`);
    process.exitCode = 1;
    return;
  }

  // Load sessions and compare
  let report: ComparisonReport | null;
  let sessionA: ReplaySession | null = null;
  let sessionB: ReplaySession | null = null;

  if (useSqlite) {
    sessionA = await loadSessionSqlite(runIdA, resolvedConfig);
    sessionB = await loadSessionSqlite(runIdB, resolvedConfig);
    if (sessionA && sessionB) {
      report = compareReplaySessions(sessionA, sessionB);
    } else {
      report = null;
    }
  } else {
    sessionA = loadReplaySession(runIdA, { baseDir });
    sessionB = loadReplaySession(runIdB, { baseDir });
    report = compareRunIds(runIdA, runIdB, { baseDir });
  }

  if (!report) {
    process.stderr.write(`\n  ${FG.red}Error:${RESET} Could not load one or both sessions.\n`);
    process.stderr.write(`  Session A: ${runIdA}\n`);
    process.stderr.write(`  Session B: ${runIdB}\n\n`);
    process.exitCode = 1;
    return;
  }

  // Output
  if (wantJson) {
    // Enrich JSON output with escalation and violation details
    const enriched = enrichJsonReport(report, sessionA, sessionB);
    process.stdout.write(JSON.stringify(enriched, null, 2) + '\n');
  } else {
    process.stderr.write(renderDiffReport(report, sessionA ?? undefined, sessionB ?? undefined));
  }

  // Exit with non-zero if sessions diverge
  if (!report.identical) {
    process.exitCode = 1;
  }
}

/** Enrich a ComparisonReport with escalation and violation metadata for JSON output. */
function enrichJsonReport(
  report: ComparisonReport,
  sessionA: ReplaySession | null,
  sessionB: ReplaySession | null
): Record<string, unknown> {
  const base = report as unknown as Record<string, unknown>;
  if (!sessionA || !sessionB) return base;

  const levelA = getMaxEscalationLevel(sessionA);
  const levelB = getMaxEscalationLevel(sessionB);
  const violationsA = Object.fromEntries(getInvariantViolations(sessionA));
  const violationsB = Object.fromEntries(getInvariantViolations(sessionB));

  return {
    ...base,
    escalation: {
      sessionA: levelA,
      sessionB: levelB,
      changed: levelA !== levelB,
    },
    invariantViolations: {
      sessionA: violationsA,
      sessionB: violationsB,
    },
  };
}
