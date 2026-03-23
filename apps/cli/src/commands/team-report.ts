// CLI command: agentguard team-report — team-level governance observability.
// Aggregates governance data across multiple agents/sessions for team leads
// and security teams. Supports text, JSON, CSV, and markdown output formats.

import { parseArgs } from '../args.js';
import { bold, color, dim } from '../colors.js';
import type { StorageConfig, TeamReport, AgentSummary } from '@red-codes/storage';

function fmtDate(ts: number | null): string {
  if (ts === null) return dim('n/a');
  return new Date(ts).toISOString().replace('T', ' ').slice(0, 19);
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3_600_000) return `${(ms / 60_000).toFixed(1)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

function bar(value: number, max: number, width: number = 20): string {
  if (max === 0) return dim('░'.repeat(width));
  const filled = Math.round((value / max) * width);
  return color('█'.repeat(filled), 'green') + dim('░'.repeat(width - filled));
}

function complianceColor(rate: number): string {
  if (rate >= 95) return 'green';
  if (rate >= 80) return 'yellow';
  return 'red';
}

function renderTextOutput(report: TeamReport): void {
  const { overview, agents, topDeniedActions, topViolatedInvariants, denialTrends } = report;

  // Header
  process.stderr.write('\n');
  process.stderr.write(`  ${bold('Team Governance Report')}\n`);
  process.stderr.write(`  ${dim('═'.repeat(60))}\n\n`);

  // Overview
  process.stderr.write(`  ${bold('Overview')}\n`);
  process.stderr.write(`  Agents:      ${bold(String(agents.length))}\n`);
  process.stderr.write(`  Sessions:    ${bold(String(overview.totalSessions))}\n`);
  process.stderr.write(`  Events:      ${bold(String(overview.totalEvents))}\n`);
  process.stderr.write(`  Decisions:   ${bold(String(overview.totalDecisions))}\n`);
  process.stderr.write(
    `  Period:      ${fmtDate(overview.firstEventAt)} → ${fmtDate(overview.lastEventAt)}\n`
  );
  if (overview.firstEventAt && overview.lastEventAt) {
    process.stderr.write(
      `  Duration:    ${fmtDuration(overview.lastEventAt - overview.firstEventAt)}\n`
    );
  }

  // Overall compliance
  const overallCompliance =
    overview.totalDecisions > 0
      ? Math.round((overview.allowedCount / overview.totalDecisions) * 1000) / 10
      : 100;
  process.stderr.write(
    `  Compliance:  ${color(`${overallCompliance}%`, complianceColor(overallCompliance))}\n`
  );
  process.stderr.write('\n');

  // Per-agent summary
  if (agents.length > 0) {
    process.stderr.write(`  ${bold('Agent Profiles')}\n`);
    process.stderr.write(`  ${dim('─'.repeat(60))}\n`);

    const maxSessions = Math.max(...agents.map((a) => a.sessions));
    for (const agent of agents) {
      const rate = agent.complianceRate;
      process.stderr.write(`\n  ${bold(agent.agent)}\n`);
      process.stderr.write(
        `    Sessions:   ${bar(agent.sessions, maxSessions, 15)} ${String(agent.sessions).padStart(4)}\n`
      );
      process.stderr.write(
        `    Actions:    ${color(String(agent.allowed), 'green')} allowed / ${color(String(agent.denied), 'red')} denied / ${color(String(agent.escalated), 'yellow')} escalated\n`
      );
      if (agent.violations > 0) {
        process.stderr.write(`    Violations: ${color(String(agent.violations), 'red')}\n`);
      }
      process.stderr.write(`    Compliance: ${color(`${rate}%`, complianceColor(rate))}\n`);
      process.stderr.write(
        `    Active:     ${fmtDate(agent.firstSeen)} → ${fmtDate(agent.lastSeen)}\n`
      );
    }
    process.stderr.write('\n');
  }

  // Top denied actions
  if (topDeniedActions.length > 0) {
    process.stderr.write(`  ${bold('Top Denied Actions')}\n`);
    process.stderr.write(`  ${dim('─'.repeat(60))}\n`);
    const maxDenied = topDeniedActions[0].count;
    for (const d of topDeniedActions) {
      process.stderr.write(
        `  ${color(d.actionType.padEnd(20), 'red')} ${bar(d.count, maxDenied, 15)} ${String(d.count).padStart(4)} ${dim(`(${d.distinctSessions} sessions)`)}\n`
      );
    }
    process.stderr.write('\n');
  }

  // Invariant violations
  if (topViolatedInvariants.length > 0) {
    process.stderr.write(`  ${bold('Most Violated Invariants')}\n`);
    process.stderr.write(`  ${dim('─'.repeat(60))}\n`);
    const maxViol = topViolatedInvariants[0].count;
    for (const v of topViolatedInvariants) {
      process.stderr.write(
        `  ${v.invariant.padEnd(30)} ${bar(v.count, maxViol, 15)} ${String(v.count).padStart(4)} ${dim(`(${v.distinctSessions} sessions)`)}\n`
      );
    }
    process.stderr.write('\n');
  }

  // Denial patterns
  if (denialTrends.length > 0) {
    process.stderr.write(`  ${bold('Denial Patterns')}\n`);
    process.stderr.write(`  ${dim('─'.repeat(60))}\n`);
    for (const p of denialTrends.slice(0, 10)) {
      process.stderr.write(
        `  ${color(p.actionType, 'yellow')} ${dim('→')} ${p.reason}\n` +
          `    ${dim(`${p.occurrences} occurrences across ${p.distinctSessions} sessions`)}\n`
      );
    }
    process.stderr.write('\n');
  }
}

function renderMarkdownOutput(report: TeamReport): void {
  const { overview, agents, topDeniedActions, topViolatedInvariants, denialTrends } = report;

  const overallCompliance =
    overview.totalDecisions > 0
      ? Math.round((overview.allowedCount / overview.totalDecisions) * 1000) / 10
      : 100;

  const lines: string[] = [];
  lines.push('# Team Governance Report');
  lines.push('');
  lines.push('## Overview');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Agents | ${agents.length} |`);
  lines.push(`| Sessions | ${overview.totalSessions} |`);
  lines.push(`| Total events | ${overview.totalEvents} |`);
  lines.push(`| Total decisions | ${overview.totalDecisions} |`);
  lines.push(`| Allowed | ${overview.allowedCount} |`);
  lines.push(`| Denied | ${overview.deniedCount} |`);
  lines.push(`| Escalated | ${overview.escalatedCount} |`);
  lines.push(`| Compliance rate | ${overallCompliance}% |`);
  lines.push('');

  if (agents.length > 0) {
    lines.push('## Agent Profiles');
    lines.push('');
    lines.push('| Agent | Sessions | Allowed | Denied | Escalated | Violations | Compliance |');
    lines.push('|-------|----------|---------|--------|-----------|------------|------------|');
    for (const agent of agents) {
      lines.push(
        `| ${agent.agent} | ${agent.sessions} | ${agent.allowed} | ${agent.denied} | ${agent.escalated} | ${agent.violations} | ${agent.complianceRate}% |`
      );
    }
    lines.push('');
  }

  if (topDeniedActions.length > 0) {
    lines.push('## Top Denied Actions');
    lines.push('');
    lines.push('| Action Type | Count | Sessions |');
    lines.push('|-------------|-------|----------|');
    for (const d of topDeniedActions) {
      lines.push(`| ${d.actionType} | ${d.count} | ${d.distinctSessions} |`);
    }
    lines.push('');
  }

  if (topViolatedInvariants.length > 0) {
    lines.push('## Most Violated Invariants');
    lines.push('');
    lines.push('| Invariant | Count | Sessions |');
    lines.push('|-----------|-------|----------|');
    for (const v of topViolatedInvariants) {
      lines.push(`| ${v.invariant} | ${v.count} | ${v.distinctSessions} |`);
    }
    lines.push('');
  }

  if (denialTrends.length > 0) {
    lines.push('## Denial Patterns');
    lines.push('');
    lines.push('| Action | Reason | Occurrences | Sessions |');
    lines.push('|--------|--------|-------------|----------|');
    for (const p of denialTrends) {
      lines.push(`| ${p.actionType} | ${p.reason} | ${p.occurrences} | ${p.distinctSessions} |`);
    }
    lines.push('');
  }

  process.stdout.write(lines.join('\n') + '\n');
}

function renderCsvOutput(agents: AgentSummary[]): void {
  const lines: string[] = [];
  lines.push(
    'agent,sessions,total_actions,allowed,denied,escalated,violations,compliance_rate,first_seen,last_seen'
  );
  for (const a of agents) {
    lines.push(
      `${a.agent},${a.sessions},${a.totalActions},${a.allowed},${a.denied},${a.escalated},${a.violations},${a.complianceRate},${new Date(a.firstSeen).toISOString()},${new Date(a.lastSeen).toISOString()}`
    );
  }
  process.stdout.write(lines.join('\n') + '\n');
}

export async function teamReportCommand(
  args: string[],
  storageConfig?: StorageConfig
): Promise<number> {
  const parsed = parseArgs(args, {
    boolean: ['--json', '--markdown', '--md', '--csv', '--help', '-h'],
    string: ['--since', '--until', '--sessions', '--db-path'],
  });

  if (parsed.flags['help'] || parsed.flags['h']) {
    process.stderr.write(
      '\n' +
        bold('  agentguard team-report') +
        dim(' — team-level governance observability\n\n') +
        '  Aggregates governance data across agents and sessions for team leads\n' +
        '  and security teams.\n\n' +
        '  Options:\n' +
        '    --json              Output as JSON\n' +
        '    --markdown, --md    Output as Markdown\n' +
        '    --csv               Output agent profiles as CSV\n' +
        '    --since <date>      Filter events after this ISO date\n' +
        '    --until <date>      Filter events before this ISO date\n' +
        '    --sessions <n>      Limit to N most recent sessions\n' +
        '    --db-path <path>    Path to SQLite database\n\n' +
        '  Examples:\n' +
        '    agentguard team-report\n' +
        '    agentguard team-report --json\n' +
        '    agentguard team-report --markdown > report.md\n' +
        '    agentguard team-report --csv > agents.csv\n' +
        '    agentguard team-report --since 2026-03-01\n\n'
    );
    return 0;
  }

  const jsonOutput = parsed.flags['json'] === true;
  const markdownOutput = parsed.flags['markdown'] === true || parsed.flags['md'] === true;
  const csvOutput = parsed.flags['csv'] === true;
  const sinceStr = parsed.flags['since'] as string | undefined;
  const untilStr = parsed.flags['until'] as string | undefined;
  const sessionsStr = parsed.flags['sessions'] as string | undefined;
  const dbPathFlag = parsed.flags['db-path'] as string | undefined;

  const filter: import('@red-codes/storage').AggregationTimeFilter = {
    since: sinceStr ? new Date(sinceStr).getTime() : undefined,
    until: untilStr ? new Date(untilStr).getTime() : undefined,
    sessionLimit: sessionsStr ? parseInt(sessionsStr, 10) : undefined,
  };

  const config: StorageConfig = storageConfig ?? {
    backend: 'sqlite',
    dbPath: dbPathFlag ?? process.env['AGENTGUARD_DB_PATH'],
  };

  const { createStorageBundle, teamReport } = await import('@red-codes/storage');

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
    const report = teamReport(db, filter);

    if (report.overview.totalEvents === 0) {
      process.stderr.write('\n  No governance events found.\n\n');
      return 0;
    }

    if (jsonOutput) {
      process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    } else if (markdownOutput) {
      renderMarkdownOutput(report);
    } else if (csvOutput) {
      renderCsvOutput(report.agents);
    } else {
      renderTextOutput(report);
    }
  } finally {
    storage.close();
  }

  return 0;
}
