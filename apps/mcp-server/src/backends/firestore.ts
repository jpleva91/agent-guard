// Firestore data source — reads governance data from Firestore via @red-codes/storage.
// Requires AGENTGUARD_FIRESTORE_PROJECT env var.

import type { DomainEvent, GovernanceDecisionRecord } from '@red-codes/core';
import type { DataSource } from './types.js';
import type { McpConfig } from '../config.js';

export async function createFirestoreDataSource(config: McpConfig): Promise<DataSource> {
  const { createStorageBundle } = await import('@red-codes/storage');
  const bundle = await createStorageBundle({
    backend: 'firestore',
    firestoreProjectId: config.firestoreProject,
  });

  const store = bundle as {
    listRunIds?: (limit?: number) => Promise<string[]>;
    loadRunEvents?: (runId: string) => Promise<DomainEvent[]>;
    loadRunDecisions?: (runId: string) => Promise<GovernanceDecisionRecord[]>;
  };

  const loadEvents = async (runId: string): Promise<DomainEvent[]> => {
    if (store.loadRunEvents) {
      return store.loadRunEvents(runId);
    }
    return [];
  };

  return {
    async listRuns(limit?: number): Promise<string[]> {
      if (store.listRunIds) {
        return store.listRunIds(limit);
      }
      return [];
    },

    loadEvents,

    async loadDecisions(runId: string): Promise<GovernanceDecisionRecord[]> {
      if (store.loadRunDecisions) {
        return store.loadRunDecisions(runId);
      }
      return [];
    },

    async queryEvents(opts: {
      runId?: string;
      kind?: string;
      limit?: number;
    }): Promise<DomainEvent[]> {
      if (opts.runId) {
        let events = await loadEvents(opts.runId);
        if (opts.kind) events = events.filter((e: DomainEvent) => e.kind === opts.kind);
        if (opts.limit) events = events.slice(0, opts.limit);
        return events;
      }
      return [];
    },
  };
}
