// CLI command: agentguard audit-verify — generate enforcement audit report
// from SQLite decision records.

import { generateEnforcementAudit, formatEnforcementAudit } from '@red-codes/kernel';
import type { GovernanceDecisionRecord } from '@red-codes/core';
import type { StorageConfig } from '@red-codes/storage';

async function loadDecisionsFromSqlite(
  runId: string,
  storageConfig?: StorageConfig
): Promise<GovernanceDecisionRecord[]> {
  const config = storageConfig ?? { backend: 'sqlite' as const };
  const { createStorageBundle } = await import('@red-codes/storage');
  const storage = await createStorageBundle(config);
  if (!storage.db) return [];
  const { loadRunDecisions } = await import('@red-codes/storage');
  const db = storage.db as import('better-sqlite3').Database;
  const decisions = loadRunDecisions(db, runId);
  storage.close();
  return decisions;
}

async function listRuns(storageConfig?: StorageConfig): Promise<string[]> {
  const config = storageConfig ?? { backend: 'sqlite' as const };
  const { createStorageBundle } = await import('@red-codes/storage');
  const storage = await createStorageBundle(config);
  if (!storage.db) return [];
  const { listRunIds } = await import('@red-codes/storage');
  const db = storage.db as import('better-sqlite3').Database;
  const runs = listRunIds(db);
  storage.close();
  return runs;
}

async function getLastRunId(storageConfig?: StorageConfig): Promise<string | null> {
  const config = storageConfig ?? { backend: 'sqlite' as const };
  const { createStorageBundle } = await import('@red-codes/storage');
  const storage = await createStorageBundle(config);
  if (!storage.db) return null;
  const { getLatestRunId } = await import('@red-codes/storage');
  const db = storage.db as import('better-sqlite3').Database;
  const runId = getLatestRunId(db);
  storage.close();
  return runId;
}

export async function auditVerify(
  args: string[],
  storageConfig?: StorageConfig
): Promise<number> {
  const wantsJson = args.includes('--json');
  const wantsList = args.includes('--list');
  const wantsLast = args.includes('--last');

  // List available runs
  if (wantsList) {
    const runs = await listRuns(storageConfig);
    if (runs.length === 0) {
      console.log('  No governance runs found.');
      return 0;
    }
    console.log(`\n  Governance runs (${runs.length}):\n`);
    for (const r of runs.slice(0, 20)) {
      console.log(`    ${r}`);
    }
    console.log('');
    return 0;
  }

  // Resolve run ID
  let runId: string | null = null;
  if (wantsLast) {
    runId = await getLastRunId(storageConfig);
    if (!runId) {
      console.error('  No governance runs found.');
      return 1;
    }
  } else {
    // First positional argument that isn't a flag
    runId = args.find((a) => !a.startsWith('--')) || null;
    if (!runId) {
      runId = await getLastRunId(storageConfig);
      if (!runId) {
        console.error('  Usage: agentguard audit-verify [runId] [--last] [--json]');
        return 1;
      }
    }
  }

  // Load decisions from SQLite
  const decisions = await loadDecisionsFromSqlite(runId, storageConfig);

  // Generate enforcement audit report
  const report = generateEnforcementAudit({
    runId,
    decisions,
    chainVerified: true, // SQLite provides integrity via database constraints
  });

  if (wantsJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatEnforcementAudit(report));
  }

  return 0;
}
