// CLI command: agentguard analytics — cross-session governance analytics via SQL aggregation.
// Replaces the old in-memory loadAllEvents pattern with direct SQLite aggregation queries.
// Supports --team flag for team-level observability (per-agent breakdowns).

import { parseArgs } from '../args.js';
import { bold, color, dim } from '../colors.js';
import type { StorageConfig } from '@red-codes/storage';
import type {
  AggregationTimeFilter,
  GovernanceStats,
  AgentStats,
  TimeRollup,
  TeamViolationPattern,
  DecisionOutcomeCount,
  DeniedActionCount,
  ViolationByInvariant,
  RunSummary,
} from '@red-codes/storage';

type Granularity = 'daily' | 'weekly' | 'monthly';

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

// ── Markdown output helpers ──

function markdownTeamReport(
  stats: GovernanceStats,
  agents: AgentStats[],
  rollups: TimeRollup[],
  teamPatterns: TeamViolationPattern[],
  outcomes: DecisionOutcomeCount[],
  denied: DeniedActionCount[],
  violations: ViolationByInvariant[],
  runs: RunSummary[],
  granularity: Granularity,
): string {
  const lines: string[] = [];
  lines.push('# Team Governance Report\n');

  // Overview
  lines.push('## Overview\n');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Sessions | ${stats.totalSessions} |`);
  lines.push(`| Events | ${stats.totalEvents} |`);
  lines.push(`| Decisions | ${stats.totalDecisions} |`);
  lines.push(`| Allowed | ${stats.allowedCount} |`);
  lines.push(`| Denied | ${stats.deniedCount} |`);
  lines.push(`| Agents | ${agents.length} |`);
  const period =
    stats.firstEventAt && stats.lastEventAt
      ? `${new Date(stats.firstEventAt).toISOString()} to ${new Date(stats.lastEventAt).toISOString()}`
      : 'n/a';
  lines.push(`| Period | ${period} |`);
  lines.push('');

  // Per-agent breakdown
  if (agents.length > 0) {
    lines.push('## Per-Agent Breakdown\n');
    lines.push('| Agent | Decisions | Allowed | Denied | Deny Rate | Sessions |');
    lines.push('|-------|-----------|---------|--------|-----------|----------|');
    for (const a of agents) {
      const denyRate =
        a.totalDecisions > 0 ? ((a.denied / a.totalDecisions) * 100).toFixed(1) : '0.0';
      lines.push(
        `| ${a.agent} | ${a.totalDecisions} | ${a.allowed} | ${a.denied} | ${denyRate}% | ${a.distinctSessions} |`
      );
    }
    lines.push('');
  }

  // Time rollup
  if (rollups.length > 0) {
    lines.push(`## ${granularity.charAt(0).toUpperCase() + granularity.slice(1)} Rollup\n`);
    lines.push('| Period | Events | Decisions | Allowed | Denied | Sessions |');
    lines.push('|--------|--------|-----------|---------|--------|----------|');
    for (const r of rollups) {
      lines.push(
        `| ${r.period} | ${r.totalEvents} | ${r.totalDecisions} | ${r.allowed} | ${r.denied} | ${r.distinctSessions} |`
      );
    }
    lines.push('');
  }

  // Team-wide violation patterns
  if (teamPatterns.length > 0) {
    lines.push('## Team-Wide Violation Patterns\n');
    lines.push('| Invariant | Count | Agents | Sessions |');
    lines.push('|-----------|-------|--------|----------|');
    for (const p of teamPatterns) {
      lines.push(
        `| ${p.invariant} | ${p.count} | ${p.distinctAgents} | ${p.distinctSessions} |`
      );
    }
    lines.push('');
  }

  // Decision outcomes
  if (outcomes.length > 0) {
    lines.push('## Decision Outcomes\n');
    lines.push('| Outcome | Count | Percentage |');
    lines.push('|---------|-------|------------|');
    for (const o of outcomes) {
      const pct =
        stats.totalDecisions > 0 ? ((o.count / stats.totalDecisions) * 100).toFixed(1) : '0.0';
      lines.push(`| ${o.outcome} | ${o.count} | ${pct}% |`);
    }
    lines.push('');
  }

  // Top denied
  if (denied.length > 0) {
    lines.push('## Top Denied Actions\n');
    lines.push('| Action Type | Count | Sessions |');
    lines.push('|-------------|-------|----------|');
    for (const d of denied) {
      lines.push(`| ${d.actionType} | ${d.count} | ${d.distinctSessions} |`);
    }
    lines.push('');
  }

  // Violations
  if (violations.length > 0) {
    lines.push('## Invariant Violations\n');
    lines.push('| Invariant | Count | Sessions |');
    lines.push('|-----------|-------|----------|');
    for (const v of violations) {
      lines.push(`| ${v.invariant} | ${v.count} | ${v.distinctSessions} |`);
    }
    lines.push('');
  }

  // Recent sessions
  if (runs.length > 0) {
    lines.push('## Recent Sessions\n');
    lines.push('| Run ID | Started | Duration | Allowed | Denied | Deny Rate |');
    lines.push('|--------|---------|----------|---------|--------|-----------|');
    for (const r of runs.slice(0, 20)) {
      const started = new Date(r.firstEventAt).toISOString().replace('T', ' ').slice(0, 19);
      const duration = fmtDuration(r.lastEventAt - r.firstEventAt);
      const denyRate =
        r.allowed + r.denied > 0 ? ((r.denied / (r.allowed + r.denied)) * 100).toFixed(0) : '0';
      lines.push(
        `| ${r.runId.slice(0, 16)} | ${started} | ${duration} | ${r.allowed} | ${r.denied} | ${denyRate}% |`
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}

export async function analytics(args: string[], storageConfig?: StorageConfig): Promise<number> {
  const parsed = parseArgs(args, {
    boolean: ['--json', '--help', '-h', '--team', '--markdown', '--md'],
    string: ['--since', '--until', '--sessions', '--db-path', '--format', '--rollup'],
  });

  if (parsed.flags['help'] || parsed.flags['h']) {
    process.stderr.write(
      '\n' +
        bold('  agentguard analytics') +
        dim(' — cross-session governance statistics\n\n') +
        '  Options:\n' +
        '    --json              Output as JSON\n' +
        '    --team              Team view: per-agent breakdowns and patterns\n' +
        '    --rollup <period>   Time rollup: daily, weekly, or monthly\n' +
        '    --format <type>     Output format: terminal (default), json, or markdown\n' +
        '    --markdown, --md    [deprecated] Alias for --format markdown\n' +
        '    --since <date>      Filter events after this ISO date\n' +
        '    --until <date>      Filter events before this ISO date\n' +
        '    --sessions <n>      Limit to N most recent sessions\n' +
        '    --db-path <path>    Path to SQLite database\n\n' +
        '  Examples:\n' +
        '    agentguard analytics --team\n' +
        '    agentguard analytics --team --rollup weekly --since 2026-03-01\n' +
        '    agentguard analytics --team --format markdown > report.md\n\n'
    );
    return 0;
  }

  const teamMode = parsed.flags['team'] === true;
  const jsonOutput = parsed.flags['json'] === true;
  const legacyMarkdown = parsed.flags['markdown'] === true || parsed.flags['md'] === true;
  if (legacyMarkdown) {
    process.stderr.write(
      '  [deprecated] --markdown/--md is deprecated. Use --format markdown instead.\n'
    );
  }
  const formatFlag = legacyMarkdown ? 'markdown' : (parsed.flags['format'] as string | undefined);
  const rollupFlag = parsed.flags['rollup'] as string | undefined;
  const sinceStr = parsed.flags['since'] as string | undefined;
  const untilStr = parsed.flags['until'] as string | undefined;
  const sessionsStr = parsed.flags['sessions'] as string | undefined;
  const dbPathFlag = parsed.flags['db-path'] as string | undefined;

  const outputFormat: 'terminal' | 'json' | 'markdown' = jsonOutput
    ? 'json'
    : formatFlag === 'markdown'
      ? 'markdown'
      : formatFlag === 'json'
        ? 'json'
        : 'terminal';

  const granularity: Granularity | undefined =
    rollupFlag === 'daily' || rollupFlag === 'weekly' || rollupFlag === 'monthly'
      ? rollupFlag
      : undefined;

  // Build time filter
  const filter: AggregationTimeFilter = {
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
    statsByAgent,
    timeRollup,
    teamViolationPatterns,
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

    // Gather shared data
    const outcomes = countDecisionsByOutcome(db, filter);
    const denied = topDeniedActions(db, 10, filter);
    const violations = countViolationsByInvariant(db, filter);
    const runs = summarizeRuns(db, filter);

    // Team-specific data
    const agents = teamMode ? statsByAgent(db, filter) : [];
    const rollups = granularity ? timeRollup(db, granularity, filter) : [];
    const teamPatterns = teamMode ? teamViolationPatterns(db, filter) : [];

    // ── JSON output ──
    if (outputFormat === 'json') {
      const report: Record<string, unknown> = {
        stats,
        eventsByKind: countEventsByKind(db, filter),
        decisionsByOutcome: outcomes,
        topDenied: denied,
        runs,
        violationsByInvariant: violations,
        denialPatterns: denialPatterns(db, 20, filter),
      };
      if (teamMode) {
        report.agents = agents;
        report.teamViolationPatterns = teamPatterns;
      }
      if (granularity) {
        report.rollup = { granularity, periods: rollups };
      }
      process.stdout.write(JSON.stringify(report, null, 2) + '\n');
      return 0;
    }

    // ── Markdown output ──
    if (outputFormat === 'markdown') {
      const md = markdownTeamReport(
        stats,
        agents,
        rollups,
        teamPatterns,
        outcomes,
        denied,
        violations,
        runs,
        granularity ?? 'daily',
      );
      process.stdout.write(md);
      return 0;
    }

    // ── Terminal output ──
    process.stderr.write('\n');
    if (teamMode) {
      process.stderr.write(`  ${bold('Team Governance Analytics')}\n`);
    } else {
      process.stderr.write(`  ${bold('Governance Analytics')}\n`);
    }
    process.stderr.write(`  ${dim('─'.repeat(60))}\n\n`);

    // ── Overview ──
    process.stderr.write(`  ${bold('Overview')}\n`);
    process.stderr.write(`  Sessions:    ${bold(String(stats.totalSessions))}\n`);
    process.stderr.write(`  Events:      ${bold(String(stats.totalEvents))}\n`);
    process.stderr.write(`  Decisions:   ${bold(String(stats.totalDecisions))}\n`);
    if (teamMode && agents.length > 0) {
      process.stderr.write(`  Agents:      ${bold(String(agents.length))}\n`);
    }
    process.stderr.write(
      `  Period:      ${fmtDate(stats.firstEventAt)} → ${fmtDate(stats.lastEventAt)}\n`
    );
    if (stats.firstEventAt && stats.lastEventAt) {
      process.stderr.write(
        `  Duration:    ${fmtDuration(stats.lastEventAt - stats.firstEventAt)}\n`
      );
    }
    process.stderr.write('\n');

    // ── Per-agent breakdown (team mode) ──
    if (teamMode && agents.length > 0) {
      process.stderr.write(`  ${bold('Per-Agent Breakdown')}\n`);
      const maxAgent = Math.max(...agents.map((a) => a.totalDecisions));
      for (const a of agents) {
        const denyRate =
          a.totalDecisions > 0 ? ((a.denied / a.totalDecisions) * 100).toFixed(1) : '0.0';
        const agentColor = a.denied > 0 ? 'yellow' : 'green';
        process.stderr.write(
          `  ${color(a.agent.padEnd(24), agentColor)} ${bar(a.totalDecisions, maxAgent, 15)} ` +
            `${color(String(a.allowed), 'green')}/${color(String(a.denied), 'red')} ` +
            `${dim(`(${denyRate}% denied, ${a.distinctSessions} sessions)`)}\n`
        );
      }
      process.stderr.write('\n');
    }

    // ── Time rollup ──
    if (granularity && rollups.length > 0) {
      const label = granularity.charAt(0).toUpperCase() + granularity.slice(1);
      process.stderr.write(`  ${bold(`${label} Rollup`)}\n`);
      const maxRollup = Math.max(...rollups.map((r) => r.totalEvents));
      for (const r of rollups) {
        const denyRate =
          r.totalDecisions > 0 ? ((r.denied / r.totalDecisions) * 100).toFixed(0) : '0';
        process.stderr.write(
          `  ${r.period.padEnd(12)} ${bar(r.totalEvents, maxRollup, 15)} ` +
            `${String(r.totalEvents).padStart(5)} events  ` +
            `${color(String(r.allowed), 'green')}/${color(String(r.denied), 'red')} ` +
            `${dim(`(${denyRate}% denied)`)}\n`
        );
      }
      process.stderr.write('\n');
    }

    // ── Team-wide violation patterns (team mode) ──
    if (teamMode && teamPatterns.length > 0) {
      process.stderr.write(`  ${bold('Team-Wide Violation Patterns')}\n`);
      for (const p of teamPatterns) {
        const agentLabel = p.distinctAgents === 1 ? 'agent' : 'agents';
        process.stderr.write(
          `  ${color(p.invariant.padEnd(30), 'red')} ${String(p.count).padStart(4)} ` +
            `${dim(`(${p.distinctAgents} ${agentLabel}, ${p.distinctSessions} sessions)`)}\n`
        );
      }
      process.stderr.write('\n');
    }

    // ── Decision outcomes ──
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
