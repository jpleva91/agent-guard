// CLI command: agentguard analytics — cross-session violation pattern analysis.

import { analyze } from '../../analytics/engine.js';
import { toMarkdown, toJson, toTerminal } from '../../analytics/reporter.js';
import { computeAllRunRiskScores } from '../../analytics/risk-scorer.js';
import type { StorageConfig } from '../../storage/types.js';

export async function analytics(args: string[], storageConfig?: StorageConfig): Promise<number> {
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
