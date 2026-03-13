// CLI command: agentguard analytics — cross-session violation pattern analysis.

import { analyze } from '../../analytics/engine.js';
import { toMarkdown, toJson, toTerminal } from '../../analytics/reporter.js';
import { computeAllRunRiskScores } from '../../analytics/risk-scorer.js';
import type { StorageConfig } from '../../storage/types.js';

export async function analytics(args: string[], storageConfig?: StorageConfig): Promise<number> {
  // Handle built-in SQL analytics queries (SQLite only)
  const query = parseQuery(args);
  if (query) {
    return handleQuery(query, args, storageConfig);
  }

  const format = parseFormat(args);
  const baseDir = parseBaseDir(args);
  const minClusterSize = parseMinCluster(args);

  let report;
  if (storageConfig?.backend === 'sqlite') {
    const { createStorageBundle } = await import('../../storage/factory.js');
    const { aggregateViolationsSqlite } = await import('../../storage/sqlite-analytics.js');
    const { listRunIds, loadRunEvents } = await import('../../storage/sqlite-store.js');
    const { clusterViolations } = await import('../../analytics/cluster.js');
    const { computeAllTrends } = await import('../../analytics/trends.js');
    const storage = await createStorageBundle(storageConfig);
    if (!storage.db) {
      process.stderr.write('  Error: SQLite storage backend did not initialize database.\n');
      return 1;
    }
    const db = storage.db as import('better-sqlite3').Database;
    const { violations, sessionCount } = aggregateViolationsSqlite(db);
    const clusters = clusterViolations(violations, minClusterSize ?? 2);
    const trends = computeAllTrends(violations);
    const violationsByKind: Record<string, number> = {};
    for (const v of violations) {
      violationsByKind[v.kind] = (violationsByKind[v.kind] ?? 0) + 1;
    }
    const topInferredCauses = clusters
      .filter((c) => c.inferredCause)
      .map((c) => ({ cause: c.inferredCause!, count: c.count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    const runIds = listRunIds(db);
    const sessionEventsMap = new Map<string, import('../../core/types.js').DomainEvent[]>();
    for (const rid of runIds) {
      sessionEventsMap.set(rid, loadRunEvents(db, rid));
    }
    const runRiskScores = computeAllRunRiskScores(sessionEventsMap);
    report = {
      generatedAt: Date.now(),
      sessionsAnalyzed: sessionCount,
      totalViolations: violations.length,
      violationsByKind,
      clusters,
      trends,
      topInferredCauses,
      runRiskScores,
    };
    storage.close();
  } else {
    report = analyze({ baseDir, minClusterSize });
  }

  if (report.totalViolations === 0) {
    process.stderr.write('\n  No violations found across recorded sessions.\n');
    process.stderr.write('  Run governance sessions first to generate violation data.\n\n');
    return 0;
  }

  switch (format) {
    case 'json':
      process.stdout.write(toJson(report) + '\n');
      break;
    case 'markdown':
      process.stdout.write(toMarkdown(report) + '\n');
      break;
    case 'terminal':
    default:
      process.stderr.write(toTerminal(report));
      break;
  }

  return 0;
}

function parseFormat(args: string[]): 'json' | 'markdown' | 'terminal' {
  const idx = args.findIndex((a) => a === '--format' || a === '-f');
  if (idx !== -1 && args[idx + 1]) {
    const fmt = args[idx + 1];
    if (fmt === 'json' || fmt === 'markdown' || fmt === 'terminal') return fmt;
  }
  if (args.includes('--json')) return 'json';
  if (args.includes('--markdown') || args.includes('--md')) return 'markdown';
  return 'terminal';
}

function parseBaseDir(args: string[]): string | undefined {
  const idx = args.findIndex((a) => a === '--dir' || a === '-d');
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return undefined;
}

function parseMinCluster(args: string[]): number | undefined {
  const idx = args.findIndex((a) => a === '--min-cluster');
  if (idx !== -1 && args[idx + 1]) {
    const n = parseInt(args[idx + 1], 10);
    if (!isNaN(n) && n > 0) return n;
  }
  return undefined;
}

type QueryName = 'top-denied' | 'violation-rate' | 'session-stats';

function parseQuery(args: string[]): QueryName | undefined {
  const idx = args.findIndex((a) => a === '--query' || a === '-q');
  if (idx !== -1 && args[idx + 1]) {
    const q = args[idx + 1];
    if (q === 'top-denied' || q === 'violation-rate' || q === 'session-stats') return q;
  }
  return undefined;
}

function parseLimit(args: string[]): number | undefined {
  const idx = args.findIndex((a) => a === '--limit');
  if (idx !== -1 && args[idx + 1]) {
    const n = parseInt(args[idx + 1], 10);
    if (!isNaN(n) && n > 0) return n;
  }
  return undefined;
}

function parseBucket(args: string[]): 'hourly' | 'daily' {
  const idx = args.findIndex((a) => a === '--bucket');
  if (idx !== -1 && args[idx + 1] === 'hourly') return 'hourly';
  return 'daily';
}

async function handleQuery(
  query: QueryName,
  args: string[],
  storageConfig?: StorageConfig
): Promise<number> {
  if (storageConfig?.backend !== 'sqlite') {
    process.stderr.write('  Error: --query requires SQLite storage backend (--store sqlite).\n');
    return 1;
  }

  const { createStorageBundle } = await import('../../storage/factory.js');
  const { queryTopDeniedActions, queryViolationRateOverTime, querySessionStats } =
    await import('../../storage/sqlite-analytics.js');

  const storage = await createStorageBundle(storageConfig);
  if (!storage.db) {
    process.stderr.write('  Error: SQLite storage backend did not initialize database.\n');
    return 1;
  }
  const db = storage.db as import('better-sqlite3').Database;
  const format = parseFormat(args);

  let result: unknown;
  switch (query) {
    case 'top-denied':
      result = queryTopDeniedActions(db, parseLimit(args) ?? 10);
      break;
    case 'violation-rate':
      result = queryViolationRateOverTime(db, parseBucket(args));
      break;
    case 'session-stats':
      result = querySessionStats(db);
      break;
  }

  storage.close();

  if (format === 'json') {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    formatQueryTerminal(query, result);
  }

  return 0;
}

function formatQueryTerminal(query: QueryName, result: unknown): void {
  switch (query) {
    case 'top-denied': {
      const rows = result as import('../../storage/sqlite-analytics.js').TopDeniedAction[];
      if (rows.length === 0) {
        process.stderr.write('\n  No denied actions found.\n\n');
        return;
      }
      process.stderr.write('\n  Top Denied Actions\n');
      process.stderr.write('  ─────────────────────────────────\n');
      for (const row of rows) {
        process.stderr.write(`  ${row.actionType.padEnd(25)} ${row.count}\n`);
      }
      process.stderr.write('\n');
      break;
    }
    case 'violation-rate': {
      const rows = result as import('../../storage/sqlite-analytics.js').ViolationTimeBucket[];
      if (rows.length === 0) {
        process.stderr.write('\n  No violations found.\n\n');
        return;
      }
      process.stderr.write('\n  Violation Rate Over Time\n');
      process.stderr.write('  ─────────────────────────────────\n');
      for (const row of rows) {
        process.stderr.write(`  ${row.bucket.padEnd(25)} ${row.count}\n`);
      }
      process.stderr.write('\n');
      break;
    }
    case 'session-stats': {
      const rows = result as import('../../storage/sqlite-analytics.js').SessionSummary[];
      if (rows.length === 0) {
        process.stderr.write('\n  No sessions found.\n\n');
        return;
      }
      process.stderr.write('\n  Session Statistics\n');
      process.stderr.write('  ─────────────────────────────────────────────────────────────\n');
      process.stderr.write(
        `  ${'Session'.padEnd(30)} ${'Duration'.padEnd(12)} ${'Actions'.padEnd(10)} Denials\n`
      );
      process.stderr.write('  ─────────────────────────────────────────────────────────────\n');
      for (const row of rows) {
        const dur = formatDuration(row.durationMs);
        const sid = row.sessionId.length > 28 ? row.sessionId.slice(0, 28) + '..' : row.sessionId;
        process.stderr.write(
          `  ${sid.padEnd(30)} ${dur.padEnd(12)} ${String(row.actionCount).padEnd(10)} ${row.denialCount}\n`
        );
      }
      process.stderr.write('\n');
      break;
    }
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  return `${hours}h ${remainMinutes}m`;
}
