// CLI command: agentguard analytics — cross-session governance analytics via SQL aggregation.
// Replaces the old in-memory loadAllEvents pattern with direct SQLite aggregation queries.

import { parseArgs } from '../args.js';
import { bold, color, dim } from '../colors.js';
import type { StorageConfig } from '@red-codes/storage';

function bar(value: number, max: number, width: number = 20): string {
  if (max === 0) return dim('░'.repeat(width));
  const filled = Math.round((value / max) * width);
  return color('█'.repeat(filled), 'green') + dim('░'.repeat(width - filled));
}

function fmtDate(ts: number | null): string {
  if (ts === null) return dim('n/a');
  return new Date(ts).toISOString().replace('T', ' ').slice(0, 19);
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

export async function analytics(args: string[], storageConfig?: StorageConfig): Promise<number> {
  const parsed = parseArgs(args, {
    boolean: ['--json', '--help', '-h'],
    string: ['--since', '--until', '--sessions', '--db-path'],
  });

  if (parsed.flags['help'] || parsed.flags['h']) {
    process.stderr.write(
      '\n' +
        bold('  agentguard analytics') +
        dim(' — cross-session governance statistics\n\n') +
        '  Options:\n' +
        '    --json              Output as JSON\n' +
        '    --since <date>      Filter events after this ISO date\n' +
        '    --until <date>      Filter events before this ISO date\n' +
        '    --sessions <n>      Limit to N most recent sessions\n' +
        '    --db-path <path>    Path to SQLite database\n\n'
    );
    return 0;
  }

  const jsonOutput = parsed.flags['json'] === true;
  const sinceStr = parsed.flags['since'] as string | undefined;
  const untilStr = parsed.flags['until'] as string | undefined;
  const sessionsStr = parsed.flags['sessions'] as string | undefined;
  const dbPathFlag = parsed.flags['db-path'] as string | undefined;

  // Build time filter
  const filter: import('@red-codes/storage').AggregationTimeFilter = {
    since: sinceStr ? new Date(sinceStr).getTime() : undefined,
    until: untilStr ? new Date(untilStr).getTime() : undefined,
    sessionLimit: sessionsStr ? parseInt(sessionsStr, 10) : undefined,
  };

  // Open storage
  const config: StorageConfig = storageConfig ?? {
    backend: 'sqlite',
    dbPath: dbPathFlag ?? process.env['AGENTGUARD_DB_PATH'],
  };

  const {
    createStorageBundle,
    governanceStats,
    countEventsByKind,
    countDecisionsByOutcome,
    topDeniedActions,
    summarizeRuns,
    countViolationsByInvariant,
    denialPatterns,
  } = await import('@red-codes/storage');

  let storage: Awaited<ReturnType<typeof createStorageBundle>> | null = null;
  try {
    storage = await createStorageBundle(config);
  } catch {
    process.stderr.write(
      '  Error: Could not open SQLite database.\n' +
        '  Ensure AgentGuard has recorded governance sessions.\n'
    );
    return 1;
  }

  if (!storage.db) {
    process.stderr.write('  Error: No database available.\n');
    return 1;
  }

  const db = storage.db as import('better-sqlite3').Database;

  try {
    const stats = governanceStats(db, filter);

    if (stats.totalEvents === 0) {
      process.stderr.write('\n  No governance events found.\n\n');
      return 0;
    }

    if (jsonOutput) {
      const report = {
        stats,
        eventsByKind: countEventsByKind(db, filter),
        decisionsByOutcome: countDecisionsByOutcome(db, filter),
        topDenied: topDeniedActions(db, 10, filter),
        runs: summarizeRuns(db, filter),
        violationsByInvariant: countViolationsByInvariant(db, filter),
        denialPatterns: denialPatterns(db, 20, filter),
      };
      process.stdout.write(JSON.stringify(report, null, 2) + '\n');
      return 0;
    }

    // ── Header ──
    process.stderr.write('\n');
    process.stderr.write(`  ${bold('Governance Analytics')}\n`);
    process.stderr.write(`  ${dim('─'.repeat(60))}\n\n`);

    // ── Overview ──
    process.stderr.write(`  ${bold('Overview')}\n`);
    process.stderr.write(`  Sessions:    ${bold(String(stats.totalSessions))}\n`);
    process.stderr.write(`  Events:      ${bold(String(stats.totalEvents))}\n`);
    process.stderr.write(`  Decisions:   ${bold(String(stats.totalDecisions))}\n`);
    process.stderr.write(
      `  Period:      ${fmtDate(stats.firstEventAt)} → ${fmtDate(stats.lastEventAt)}\n`
    );
    if (stats.firstEventAt && stats.lastEventAt) {
      process.stderr.write(
        `  Duration:    ${fmtDuration(stats.lastEventAt - stats.firstEventAt)}\n`
      );
    }
    process.stderr.write('\n');

    // ── Decision outcomes ──
    const outcomes = countDecisionsByOutcome(db, filter);
    if (outcomes.length > 0) {
      process.stderr.write(`  ${bold('Decision Outcomes')}\n`);
      const maxOutcome = Math.max(...outcomes.map((o) => o.count));
      for (const o of outcomes) {
        const pct =
          stats.totalDecisions > 0 ? ((o.count / stats.totalDecisions) * 100).toFixed(1) : '0.0';
        const outcomeColor =
          o.outcome === 'denied' ? 'red' : o.outcome === 'allowed' ? 'green' : 'yellow';
        process.stderr.write(
          `  ${color(o.outcome.padEnd(12), outcomeColor)} ${bar(o.count, maxOutcome, 20)} ${String(o.count).padStart(5)} ${dim(`(${pct}%)`)}\n`
        );
      }
      process.stderr.write('\n');
    }

    // ── Top denied actions ──
    const denied = topDeniedActions(db, 10, filter);
    if (denied.length > 0) {
      process.stderr.write(`  ${bold('Top Denied Actions')}\n`);
      const maxDenied = denied[0].count;
      for (const d of denied) {
        process.stderr.write(
          `  ${color(d.actionType.padEnd(20), 'red')} ${bar(d.count, maxDenied, 15)} ${String(d.count).padStart(4)} ${dim(`(${d.distinctSessions} sessions)`)}\n`
        );
      }
      process.stderr.write('\n');
    }

    // ── Violations by invariant ──
    const violations = countViolationsByInvariant(db, filter);
    if (violations.length > 0) {
      process.stderr.write(`  ${bold('Invariant Violations')}\n`);
      const maxViol = violations[0].count;
      for (const v of violations) {
        process.stderr.write(
          `  ${v.invariant.padEnd(30)} ${bar(v.count, maxViol, 15)} ${String(v.count).padStart(4)} ${dim(`(${v.distinctSessions} sessions)`)}\n`
        );
      }
      process.stderr.write('\n');
    }

    // ── Denial patterns ──
    const patterns = denialPatterns(db, 10, filter);
    if (patterns.length > 0) {
      process.stderr.write(`  ${bold('Denial Patterns')}\n`);
      for (const p of patterns) {
        process.stderr.write(
          `  ${color(p.actionType, 'yellow')} ${dim('→')} ${p.reason}\n` +
            `    ${dim(`${p.occurrences} occurrences across ${p.distinctSessions} sessions`)}\n`
        );
      }
      process.stderr.write('\n');
    }

    // ── Per-run summary ──
    const runs = summarizeRuns(db, filter);
    if (runs.length > 0) {
      process.stderr.write(`  ${bold('Recent Sessions')} ${dim(`(${runs.length} total)`)}\n`);
      const shown = runs.slice(0, 10);
      for (const r of shown) {
        const duration = fmtDuration(r.lastEventAt - r.firstEventAt);
        const denyRate =
          r.allowed + r.denied > 0 ? ((r.denied / (r.allowed + r.denied)) * 100).toFixed(0) : '0';
        process.stderr.write(
          `  ${dim(r.runId.slice(0, 12))} ${fmtDate(r.firstEventAt)} ${dim(duration.padStart(8))} ` +
            `${color(String(r.allowed), 'green')}/${color(String(r.denied), 'red')} ` +
            `${dim(`(${denyRate}% denied)`)}\n`
        );
      }
      if (runs.length > 10) {
        process.stderr.write(`  ${dim(`... and ${runs.length - 10} more`)}\n`);
      }
      process.stderr.write('\n');
    }
  } finally {
    storage.close();
  }

  return 0;
}
