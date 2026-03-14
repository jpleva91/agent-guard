// Firestore-optimized violation aggregation — mirrors sqlite-analytics.ts pattern.
// Uses Firestore 'in' query on the kind field for indexed violation retrieval.

import type { DomainEvent } from '@red-codes/core';
import type { ViolationRecord } from '@red-codes/analytics';
import type { FirestoreClient } from './firestore-sink.js';

/** Event kinds that represent governance violations */
const VIOLATION_KINDS = [
  'InvariantViolation',
  'PolicyDenied',
  'ActionDenied',
  'BlastRadiusExceeded',
  'MergeGuardFailure',
  'UnauthorizedAction',
];

/**
 * Aggregate violations from Firestore using an indexed 'in' query on kind.
 * Mirrors aggregateViolationsSqlite() for API compatibility.
 */
export async function aggregateViolationsFirestore(db: FirestoreClient): Promise<{
  violations: ViolationRecord[];
  sessionCount: number;
  allEvents: DomainEvent[];
}> {
  // Firestore 'in' supports up to 10 values — we have 6, well within limits
  const snapshot = await db
    .collection('events')
    .where('kind', 'in', VIOLATION_KINDS)
    .orderBy('timestamp')
    .get();

  const violations: ViolationRecord[] = [];
  const allEvents: DomainEvent[] = [];
  const sessionIds = new Set<string>();

  for (const doc of snapshot.docs) {
    const docData = doc.data();
    if (!docData?.data) continue;

    const event = JSON.parse(docData.data as string) as DomainEvent;
    const runId = docData.run_id as string;
    allEvents.push(event);
    sessionIds.add(runId);

    const rec = event as unknown as Record<string, unknown>;
    const metadata = (rec.metadata as Record<string, unknown>) ?? {};

    violations.push({
      sessionId: runId,
      eventId: event.id,
      kind: event.kind,
      timestamp: event.timestamp,
      actionType: (rec.actionType as string) ?? (rec.action as string) ?? undefined,
      target: (rec.target as string) ?? (rec.file as string) ?? undefined,
      reason: (rec.reason as string) ?? undefined,
      invariantId: (rec.invariant as string) ?? (rec.invariantId as string) ?? undefined,
      metadata,
    });
  }

  // Count total distinct sessions (need a separate query)
  const allSnapshot = await db.collection('events').get();
  const allSessionIds = new Set<string>();
  for (const doc of allSnapshot.docs) {
    const data = doc.data();
    if (data?.run_id) allSessionIds.add(data.run_id as string);
  }

  return { violations, sessionCount: allSessionIds.size, allEvents };
}

/** Load all events from Firestore for full analytics pipeline compatibility */
export async function loadAllEventsFirestore(db: FirestoreClient): Promise<{
  events: DomainEvent[];
  sessionCount: number;
}> {
  const snapshot = await db.collection('events').orderBy('timestamp').get();

  const events: DomainEvent[] = [];
  const sessionIds = new Set<string>();

  for (const doc of snapshot.docs) {
    const docData = doc.data();
    if (!docData?.data) continue;
    events.push(JSON.parse(docData.data as string) as DomainEvent);
    if (docData.run_id) sessionIds.add(docData.run_id as string);
  }

  return { events, sessionCount: sessionIds.size };
}
