// Local data source — reads governance data from SQLite via @red-codes/storage.

import type { DomainEvent, GovernanceDecisionRecord } from '@red-codes/core';
import type { DataSource } from './types.js';
import type { McpConfig } from '../config.js';
import type { StorageBundle } from '@red-codes/storage';

export function createLocalDataSource(config: McpConfig): DataSource {
  // Lazy-load storage to avoid requiring better-sqlite3 at import time
  let storagePromise: Promise<StorageBundle> | null = null;

  async function getStorage(): Promise<StorageBundle> {
    if (!storagePromise) {
      storagePromise = (async () => {
        const { createStorageBundle } = await import('@red-codes/storage');
        const storage = await createStorageBundle({
          backend: 'sqlite',
          baseDir: config.baseDir,
        });
        if (!storage.db) {
          throw new Error('SQLite storage backend did not initialize database.');
        }
        return storage;
      })();
    }
    return storagePromise;
  }

  return {
    async listRuns(limit?: number): Promise<string[]> {
      const storage = await getStorage();
      const { listRunIds } = await import('@red-codes/storage');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const runs = listRunIds(storage.db as any);
      return limit ? runs.slice(0, limit) : runs;
    },

    async loadEvents(runId: string): Promise<DomainEvent[]> {
      const storage = await getStorage();
      const { loadRunEvents } = await import('@red-codes/storage');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return loadRunEvents(storage.db as any, runId);
    },

    async loadDecisions(runId: string): Promise<GovernanceDecisionRecord[]> {
      const storage = await getStorage();
      const { loadRunDecisions } = await import('@red-codes/storage');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return loadRunDecisions(storage.db as any, runId);
    },

    async queryEvents(opts: {
      runId?: string;
      kind?: string;
      limit?: number;
    }): Promise<DomainEvent[]> {
      let events: DomainEvent[] = [];

      if (opts.runId) {
        events = await this.loadEvents(opts.runId);
      } else {
        // Load from all runs (most recent first)
        const runs = await this.listRuns(10);
        for (const runId of runs) {
          events.push(...(await this.loadEvents(runId)));
        }
      }

      if (opts.kind) {
        events = events.filter((e) => e.kind === opts.kind);
      }

      if (opts.limit) {
        events = events.slice(0, opts.limit);
      }

      return events;
    },
  };
}
