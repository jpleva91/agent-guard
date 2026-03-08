// Bridge: existing ingestion pipeline → platform DevEvent store.
// Converts DomainEvent (ErrorObserved) output from ingest() into DevEvents
// and feeds them into the PlatformStore.
// No DOM, no Node.js APIs — pure domain logic.

import type { DomainEvent } from '../../core/types.js';
import type { DevEventSource, DevEventSeverity } from '../dev-event.js';
import { createDevEvent } from '../dev-event.js';
import type { PlatformStore, AppendResult } from '../platform-store.js';

const NUMERIC_TO_DEV_SEVERITY: Record<number, DevEventSeverity> = {
  1: 'low',
  2: 'low',
  3: 'medium',
  4: 'high',
  5: 'critical',
};

/**
 * Convert a DomainEvent (ErrorObserved) from the ingestion pipeline
 * into a DevEvent and append it to the PlatformStore.
 */
export function bridgeToDevEvent(domainEvent: DomainEvent, store: PlatformStore): AppendResult {
  const severity = NUMERIC_TO_DEV_SEVERITY[domainEvent.severity as number] ?? 'low';
  const source: DevEventSource = (domainEvent.source as DevEventSource) ?? 'runtime';

  const devEvent = createDevEvent({
    source,
    actor: 'system',
    kind: 'error.detected',
    severity,
    file: domainEvent.file as string | undefined,
    payload: {
      errorType: domainEvent.errorType,
      message: domainEvent.message,
      line: domainEvent.line,
      fingerprint: domainEvent.fingerprint,
      bugEvent: domainEvent.bugEvent,
    },
  });

  return store.append(devEvent);
}

/**
 * Bridge a batch of ingestion pipeline results into the platform store.
 */
export function bridgeBatch(
  domainEvents: readonly DomainEvent[],
  store: PlatformStore
): AppendResult[] {
  return domainEvents.map((de) => bridgeToDevEvent(de, store));
}
