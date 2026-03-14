// Firestore EventStore implementation — drop-in replacement for the in-memory/SQLite store.
// Implements the EventStore interface from src/core/types.ts.
// All reads are async internally but the interface is sync, so we use a local cache
// that syncs on-demand. For query-heavy workloads, pre-load with fromNDJSON or sync().

import type { DomainEvent, EventFilter, EventStore } from '@red-codes/core';

/** Extended Firestore interfaces for query operations */
export interface FirestoreClient {
  collection(name: string): FirestoreQueryCollection;
}

export interface FirestoreQueryCollection {
  doc(id: string): FirestoreDocRef;
  where(field: string, op: string, value: unknown): FirestoreQuery;
  orderBy(field: string, direction?: string): FirestoreQuery;
  get(): Promise<FirestoreQuerySnapshot>;
}

export interface FirestoreQuery {
  where(field: string, op: string, value: unknown): FirestoreQuery;
  orderBy(field: string, direction?: string): FirestoreQuery;
  get(): Promise<FirestoreQuerySnapshot>;
}

export interface FirestoreQuerySnapshot {
  docs: FirestoreDocSnapshot[];
  size: number;
}

export interface FirestoreDocSnapshot {
  data(): Record<string, unknown> | undefined;
  id: string;
}

export interface FirestoreDocRef {
  set(data: Record<string, unknown>): Promise<unknown>;
  get(): Promise<FirestoreDocSnapshot>;
  delete(): Promise<unknown>;
}

/**
 * Create an EventStore backed by Firestore.
 * Note: The EventStore interface is synchronous, but Firestore is async.
 * This implementation maintains a local cache for sync reads and writes through to Firestore.
 * Call sync() to pull remote data into the local cache.
 */
export function createFirestoreEventStore(
  db: FirestoreClient,
  runId?: string
): EventStore & { sync(): Promise<void> } {
  const collection = db.collection('events');
  const localCache: DomainEvent[] = [];

  return {
    append(event: DomainEvent): void {
      localCache.push(event);
      const rid = runId ?? extractRunId(event) ?? 'unknown';

      // Fire-and-forget write to Firestore
      collection
        .doc(event.id)
        .set({
          id: event.id,
          run_id: rid,
          kind: event.kind,
          timestamp: event.timestamp,
          fingerprint: event.fingerprint,
          data: JSON.stringify(event),
        })
        .catch(() => {
          // Swallow — sink pattern
        });
    },

    query(filter: EventFilter = {}): DomainEvent[] {
      return localCache.filter((e) => {
        if (filter.kind && e.kind !== filter.kind) return false;
        if (filter.since !== undefined && e.timestamp < filter.since) return false;
        if (filter.until !== undefined && e.timestamp > filter.until) return false;
        if (filter.fingerprint && e.fingerprint !== filter.fingerprint) return false;
        return true;
      });
    },

    replay(fromId?: string): DomainEvent[] {
      if (!fromId) return [...localCache].sort((a, b) => a.timestamp - b.timestamp);
      const anchor = localCache.find((e) => e.id === fromId);
      if (!anchor) return [];
      return localCache
        .filter((e) => e.timestamp >= anchor.timestamp)
        .sort((a, b) => a.timestamp - b.timestamp);
    },

    count(): number {
      return localCache.length;
    },

    clear(): void {
      localCache.length = 0;
    },

    toNDJSON(): string {
      return localCache.map((e) => JSON.stringify(e)).join('\n');
    },

    fromNDJSON(ndjson: string): number {
      const lines = ndjson.split('\n').filter((l) => l.trim());
      let loaded = 0;
      for (const line of lines) {
        const event = JSON.parse(line) as DomainEvent;
        localCache.push(event);
        loaded++;
      }
      return loaded;
    },

    /** Pull all events from Firestore into the local cache */
    async sync(): Promise<void> {
      const snapshot = await collection.orderBy('timestamp').get();
      localCache.length = 0;
      for (const doc of snapshot.docs) {
        const docData = doc.data();
        if (docData?.data) {
          localCache.push(JSON.parse(docData.data as string) as DomainEvent);
        }
      }
    },
  };
}

/** Extract run_id from event metadata if present */
function extractRunId(event: DomainEvent): string | undefined {
  const meta = event.metadata as Record<string, unknown> | undefined;
  if (meta && typeof meta.runId === 'string') return meta.runId;
  if (typeof event.runId === 'string') return event.runId;
  return undefined;
}

/** List all distinct run IDs from Firestore, most recent first */
export async function listRunIdsFirestore(db: FirestoreClient): Promise<string[]> {
  const snapshot = await db.collection('events').orderBy('timestamp', 'desc').get();
  const runMap = new Map<string, number>();
  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (data) {
      const rid = data.run_id as string;
      if (!runMap.has(rid)) {
        runMap.set(rid, data.timestamp as number);
      }
    }
  }
  return [...runMap.entries()].sort((a, b) => b[1] - a[1]).map(([rid]) => rid);
}

/** Get the most recent run ID from Firestore */
export async function getLatestRunIdFirestore(db: FirestoreClient): Promise<string | null> {
  const ids = await listRunIdsFirestore(db);
  return ids[0] ?? null;
}

/** Load all events for a specific run ID from Firestore */
export async function loadRunEventsFirestore(
  db: FirestoreClient,
  rid: string
): Promise<DomainEvent[]> {
  const snapshot = await db
    .collection('events')
    .where('run_id', '==', rid)
    .orderBy('timestamp')
    .get();
  return snapshot.docs
    .map((d) => d.data())
    .filter((d): d is Record<string, unknown> => d !== undefined)
    .map((d) => JSON.parse(d.data as string) as DomainEvent);
}
