// Firestore event and decision sinks — write-only, append-only.
// Mirrors the SQLite sink pattern: swallows write errors, never crashes the kernel.

import type { DomainEvent, EventSink, GovernanceDecisionRecord, DecisionSink } from '@red-codes/core';

/** Minimal Firestore interface — avoids hard dependency on @google-cloud/firestore types */
export interface FirestoreClient {
  collection(name: string): FirestoreCollection;
}

export interface FirestoreQuerySnapshot {
  docs: Array<{ id: string; data: () => Record<string, unknown> | undefined }>;
  size: number;
}

export interface FirestoreQuery {
  where(field: string, op: string, value: unknown): FirestoreQuery;
  orderBy(field: string, direction?: string): FirestoreQuery;
  get(): Promise<FirestoreQuerySnapshot>;
}

export interface FirestoreCollection {
  doc(id: string): FirestoreDocRef;
  where(field: string, op: string, value: unknown): FirestoreQuery;
  orderBy(field: string, direction?: string): FirestoreQuery;
  get(): Promise<FirestoreQuerySnapshot>;
}

export interface FirestoreDocRef {
  set(data: Record<string, unknown>, options?: { merge?: boolean }): Promise<unknown>;
}

/** Create an EventSink that writes events to a Firestore 'events' collection */
export function createFirestoreEventSink(
  db: FirestoreClient,
  runId: string,
  onError?: (error: Error) => void
): EventSink {
  const collection = db.collection('events');

  return {
    write(event: DomainEvent): void {
      // Fire-and-forget — don't block the kernel on network I/O
      collection
        .doc(event.id)
        .set({
          id: event.id,
          run_id: runId,
          kind: event.kind,
          timestamp: event.timestamp,
          fingerprint: event.fingerprint,
          data: JSON.stringify(event),
        })
        .catch((err: unknown) => {
          onError?.(err instanceof Error ? err : new Error(String(err)));
        });
    },

    flush(): void {
      // Writes are async fire-and-forget — no buffering to flush
    },
  };
}

/** Create a DecisionSink that writes decision records to a Firestore 'decisions' collection */
export function createFirestoreDecisionSink(
  db: FirestoreClient,
  runId: string,
  onError?: (error: Error) => void
): DecisionSink {
  const collection = db.collection('decisions');

  return {
    write(record: GovernanceDecisionRecord): void {
      collection
        .doc(record.recordId)
        .set({
          record_id: record.recordId,
          run_id: runId,
          timestamp: record.timestamp,
          outcome: record.outcome,
          action_type: record.action.type,
          target: record.action.target,
          reason: record.reason,
          data: JSON.stringify(record),
        })
        .catch((err: unknown) => {
          onError?.(err instanceof Error ? err : new Error(String(err)));
        });
    },

    flush(): void {
      // Writes are async fire-and-forget
    },
  };
}
