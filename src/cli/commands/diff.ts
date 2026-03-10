// CLI command: agentguard diff — compare two governance sessions side-by-side.
//
// Loads two sessions by run ID, compares action sequences, policy decisions,
// and invariant evaluations, and outputs a structured diff report.

import { parseArgs } from '../args.js';
import { BOLD, RESET, DIM, FG, bold, dim, color, padVis } from '../colors.js';
import { compareRunIds } from '../../kernel/replay-comparator.js';
import { listRunIds } from '../../kernel/replay-engine.js';
import type { ComparisonReport, ActionComparison } from '../../kernel/replay-comparator.js';

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

/**
 * Render a comparison report with ANSI colors for terminal display.
 */
function renderDiffReport(report: ComparisonReport): string {
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

      if (comp.status === 'missing' && comp.original) {
        lines.push(`       ${dim('Only in Session A')}`);
      }

      if (comp.status === 'extra' && comp.replayed) {
        lines.push(`       ${dim('Only in Session B')}`);
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

  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// CLI command
// ---------------------------------------------------------------------------

export async function diff(args: string[]): Promise<void> {
  const parsed = parseArgs(args, {
    boolean: ['--json', '--last'],
    string: ['--dir', '-d'],
    alias: { '-d': '--dir' },
  });

  const baseDir = (parsed.flags.dir as string) || undefined;
  const wantJson = !!parsed.flags.json;

  // Resolve run IDs
  let runIdA: string | undefined;
  let runIdB: string | undefined;

  if (parsed.flags.last) {
    // --last: compare the two most recent runs
    const runs = listRunIds(baseDir);
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

  ${BOLD}Examples:${RESET}
    agentguard diff run_abc123 run_def456
    agentguard diff --last
    agentguard diff --last --json
`);
    process.exitCode = 1;
    return;
  }

  // Compare
  const report = compareRunIds(runIdA, runIdB, { baseDir });

  if (!report) {
    process.stderr.write(`\n  ${FG.red}Error:${RESET} Could not load one or both sessions.\n`);
    process.stderr.write(`  Session A: ${runIdA}\n`);
    process.stderr.write(`  Session B: ${runIdB}\n\n`);
    process.exitCode = 1;
    return;
  }

  // Output
  if (wantJson) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    process.stderr.write(renderDiffReport(report));
  }

  // Exit with non-zero if sessions diverge
  if (!report.identical) {
    process.exitCode = 1;
  }
}
