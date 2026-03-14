// In-memory telemetry store — suitable for serverless and local dev.
// Caps at maxSize per collection with oldest-first eviction.

import type { DomainEvent, GovernanceDecisionRecord } from '@red-codes/core';
import type { TraceSpan } from '@red-codes/telemetry';
import type {
  TelemetryDataStore,
  EventQueryFilter,
  DecisionQueryFilter,
  TraceQueryFilter,
  QueryFilter,
  QueryResult,
  InstallRecord,
  TelemetryPayloadRecord,
} from './types.js';

interface StoredEvent {
  readonly runId: string;
  readonly event: DomainEvent;
}

interface StoredDecision {
  readonly runId: string;
  readonly decision: GovernanceDecisionRecord;
}

const DEFAULT_MAX_SIZE = 10_000;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;

function clampLimit(limit?: number): number {
  if (!limit || limit < 1) return DEFAULT_LIMIT;
  return Math.min(limit, MAX_LIMIT);
}

function clampOffset(offset?: number): number {
  return Math.max(offset ?? 0, 0);
}

function matchesTimeRange(
  timestamp: number | string,
  since?: string,
  until?: string
): boolean {
  const ts = typeof timestamp === 'number' ? timestamp : new Date(timestamp).getTime();
  if (since && ts < new Date(since).getTime()) return false;
  if (until && ts > new Date(until).getTime()) return false;
  return true;
}

export function createMemoryStore(maxSize = DEFAULT_MAX_SIZE): TelemetryDataStore {
  const events: StoredEvent[] = [];
  const decisions: StoredDecision[] = [];
  const traces: TraceSpan[] = [];
  const installs: InstallRecord[] = [];
  const payloads: TelemetryPayloadRecord[] = [];

  function evict<T>(arr: T[]): void {
    if (arr.length > maxSize) {
      arr.splice(0, arr.length - maxSize);
    }
  }

  return {
    appendEvents(runId: string, batch: DomainEvent[]): void {
      for (const event of batch) {
        events.push({ runId, event });
      }
      evict(events);
    },

    appendDecisions(runId: string, batch: GovernanceDecisionRecord[]): void {
      for (const decision of batch) {
        decisions.push({ runId, decision });
      }
      evict(decisions);
    },

    appendTraces(batch: TraceSpan[]): void {
      for (const span of batch) {
        traces.push(span);
      }
      evict(traces);
    },

    queryEvents(filter: EventQueryFilter): QueryResult<DomainEvent> {
      let filtered = events;

      if (filter.runId) {
        filtered = filtered.filter((e) => e.runId === filter.runId);
      }
      if (filter.kind) {
        filtered = filtered.filter((e) => e.event.kind === filter.kind);
      }
      if (filter.since || filter.until) {
        filtered = filtered.filter((e) =>
          matchesTimeRange(e.event.timestamp, filter.since, filter.until)
        );
      }

      const total = filtered.length;
      const limit = clampLimit(filter.limit);
      const offset = clampOffset(filter.offset);
      const data = filtered.slice(offset, offset + limit).map((e) => e.event);

      return { data, total, limit, offset };
    },

    queryDecisions(filter: DecisionQueryFilter): QueryResult<GovernanceDecisionRecord> {
      let filtered = decisions;

      if (filter.runId) {
        filtered = filtered.filter((d) => d.runId === filter.runId);
      }
      if (filter.outcome) {
        filtered = filtered.filter((d) => d.decision.outcome === filter.outcome);
      }
      if (filter.since || filter.until) {
        filtered = filtered.filter((d) =>
          matchesTimeRange(d.decision.timestamp, filter.since, filter.until)
        );
      }

      const total = filtered.length;
      const limit = clampLimit(filter.limit);
      const offset = clampOffset(filter.offset);
      const data = filtered.slice(offset, offset + limit).map((d) => d.decision);

      return { data, total, limit, offset };
    },

    queryTraces(filter: TraceQueryFilter): QueryResult<TraceSpan> {
      let filtered = [...traces];

      if (filter.runId) {
        filtered = filtered.filter(
          (s) =>
            (s.attributes as Record<string, unknown>).runId === filter.runId ||
            (s.attributes as Record<string, unknown>).run_id === filter.runId
        );
      }
      if (filter.kind) {
        filtered = filtered.filter((s) => s.kind === filter.kind);
      }
      if (filter.since || filter.until) {
        filtered = filtered.filter((s) =>
          matchesTimeRange(s.startTime, filter.since, filter.until)
        );
      }

      const total = filtered.length;
      const limit = clampLimit(filter.limit);
      const offset = clampOffset(filter.offset);
      const data = filtered.slice(offset, offset + limit);

      return { data, total, limit, offset };
    },

    // --- Enrollment & payload telemetry ---

    createInstall(record: InstallRecord): void {
      // Upsert: replace if install_id already exists
      const idx = installs.findIndex((i) => i.install_id === record.install_id);
      if (idx >= 0) {
        installs[idx] = record;
      } else {
        installs.push(record);
        evict(installs);
      }
    },

    findInstallById(installId: string): InstallRecord | null {
      return installs.find((i) => i.install_id === installId) ?? null;
    },

    findInstallByTokenHash(tokenHash: string): InstallRecord | null {
      return installs.find((i) => i.token_hash === tokenHash) ?? null;
    },

    appendTelemetryPayloads(records: TelemetryPayloadRecord[]): void {
      for (const record of records) {
        payloads.push(record);
      }
      evict(payloads);
    },

    queryTelemetryPayloads(filter: QueryFilter): QueryResult<TelemetryPayloadRecord> {
      let filtered = [...payloads];

      if (filter.since || filter.until) {
        filtered = filtered.filter((p) =>
          matchesTimeRange(p.received_at, filter.since, filter.until)
        );
      }

      const total = filtered.length;
      const limit = clampLimit(filter.limit);
      const offset = clampOffset(filter.offset);
      const data = filtered.slice(offset, offset + limit);

      return { data, total, limit, offset };
    },
  };
}
