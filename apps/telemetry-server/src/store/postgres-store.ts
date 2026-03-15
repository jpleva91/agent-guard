// Vercel Postgres telemetry store — persistent storage for production deployments.
// Uses @vercel/postgres which auto-reads POSTGRES_URL from environment.

import { sql } from '@vercel/postgres';
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

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;

function clampLimit(limit?: number): number {
  if (!limit || limit < 1) return DEFAULT_LIMIT;
  return Math.min(limit, MAX_LIMIT);
}

function clampOffset(offset?: number): number {
  return Math.max(offset ?? 0, 0);
}

/** Run schema migrations to create tables if they don't exist. */
export async function migratePostgresStore(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS telemetry_events (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      kind TEXT,
      timestamp BIGINT,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_events_run_id ON telemetry_events (run_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_events_kind ON telemetry_events (kind)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_events_timestamp ON telemetry_events (timestamp)`;

  await sql`
    CREATE TABLE IF NOT EXISTS telemetry_decisions (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      outcome TEXT,
      timestamp BIGINT,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_decisions_run_id ON telemetry_decisions (run_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_decisions_outcome ON telemetry_decisions (outcome)`;

  await sql`
    CREATE TABLE IF NOT EXISTS telemetry_traces (
      id TEXT PRIMARY KEY,
      run_id TEXT,
      kind TEXT,
      start_time BIGINT,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_traces_run_id ON telemetry_traces (run_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_traces_kind ON telemetry_traces (kind)`;

  await sql`
    CREATE TABLE IF NOT EXISTS telemetry_installs (
      install_id TEXT PRIMARY KEY,
      public_key TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      version TEXT NOT NULL,
      enrolled_at TEXT NOT NULL
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_installs_token_hash ON telemetry_installs (token_hash)`;

  await sql`
    CREATE TABLE IF NOT EXISTS telemetry_payloads (
      event_id TEXT PRIMARY KEY,
      install_id TEXT,
      event_json TEXT NOT NULL,
      received_at TEXT NOT NULL
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_payloads_received_at ON telemetry_payloads (received_at)`;
}

export function createPostgresStore(): TelemetryDataStore {
  return {
    async appendEvents(runId: string, events: DomainEvent[]): Promise<void> {
      for (const event of events) {
        const id =
          (event as Record<string, unknown>).id?.toString() ?? `${runId}-${event.timestamp}`;
        const kind = event.kind ?? '';
        const timestamp =
          typeof event.timestamp === 'number'
            ? event.timestamp
            : new Date(event.timestamp).getTime();
        await sql`
          INSERT INTO telemetry_events (id, run_id, kind, timestamp, data)
          VALUES (${id}, ${runId}, ${kind}, ${timestamp}, ${JSON.stringify(event)})
          ON CONFLICT (id) DO NOTHING
        `;
      }
    },

    async appendDecisions(runId: string, decisions: GovernanceDecisionRecord[]): Promise<void> {
      for (const decision of decisions) {
        const id =
          (decision as unknown as Record<string, unknown>).record_id?.toString() ??
          `${runId}-${decision.timestamp}`;
        const outcome = decision.outcome ?? '';
        const timestamp =
          typeof decision.timestamp === 'number'
            ? decision.timestamp
            : new Date(decision.timestamp).getTime();
        await sql`
          INSERT INTO telemetry_decisions (id, run_id, outcome, timestamp, data)
          VALUES (${id}, ${runId}, ${outcome}, ${timestamp}, ${JSON.stringify(decision)})
          ON CONFLICT (id) DO NOTHING
        `;
      }
    },

    async appendTraces(traces: TraceSpan[]): Promise<void> {
      for (const span of traces) {
        const id =
          (span as unknown as Record<string, unknown>).id?.toString() ??
          `trace-${span.startTime}`;
        const attrs = span.attributes as Record<string, unknown> | undefined;
        const runId = (attrs?.runId ?? attrs?.run_id ?? '') as string;
        const kind = span.kind ?? '';
        const startTime =
          typeof span.startTime === 'number'
            ? span.startTime
            : new Date(span.startTime).getTime();
        await sql`
          INSERT INTO telemetry_traces (id, run_id, kind, start_time, data)
          VALUES (${id}, ${runId}, ${kind}, ${startTime}, ${JSON.stringify(span)})
          ON CONFLICT (id) DO NOTHING
        `;
      }
    },

    async queryEvents(filter: EventQueryFilter): Promise<QueryResult<DomainEvent>> {
      const limit = clampLimit(filter.limit);
      const offset = clampOffset(filter.offset);

      // Build WHERE clauses
      const conditions: string[] = ['1=1'];
      const params: unknown[] = [];
      let paramIdx = 1;

      if (filter.runId) {
        conditions.push(`run_id = $${paramIdx++}`);
        params.push(filter.runId);
      }
      if (filter.kind) {
        conditions.push(`kind = $${paramIdx++}`);
        params.push(filter.kind);
      }
      if (filter.since) {
        conditions.push(`timestamp >= $${paramIdx++}`);
        params.push(new Date(filter.since).getTime());
      }
      if (filter.until) {
        conditions.push(`timestamp <= $${paramIdx++}`);
        params.push(new Date(filter.until).getTime());
      }

      const where = conditions.join(' AND ');

      const countResult = await sql.query(`SELECT COUNT(*)::int as total FROM telemetry_events WHERE ${where}`, params);
      const total = countResult.rows[0].total;

      const dataResult = await sql.query(
        `SELECT data FROM telemetry_events WHERE ${where} ORDER BY timestamp DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
        [...params, limit, offset]
      );
      const data = dataResult.rows.map((r: { data: DomainEvent }) => r.data);

      return { data, total, limit, offset };
    },

    async queryDecisions(
      filter: DecisionQueryFilter
    ): Promise<QueryResult<GovernanceDecisionRecord>> {
      const limit = clampLimit(filter.limit);
      const offset = clampOffset(filter.offset);

      const conditions: string[] = ['1=1'];
      const params: unknown[] = [];
      let paramIdx = 1;

      if (filter.runId) {
        conditions.push(`run_id = $${paramIdx++}`);
        params.push(filter.runId);
      }
      if (filter.outcome) {
        conditions.push(`outcome = $${paramIdx++}`);
        params.push(filter.outcome);
      }
      if (filter.since) {
        conditions.push(`timestamp >= $${paramIdx++}`);
        params.push(new Date(filter.since).getTime());
      }
      if (filter.until) {
        conditions.push(`timestamp <= $${paramIdx++}`);
        params.push(new Date(filter.until).getTime());
      }

      const where = conditions.join(' AND ');

      const countResult = await sql.query(`SELECT COUNT(*)::int as total FROM telemetry_decisions WHERE ${where}`, params);
      const total = countResult.rows[0].total;

      const dataResult = await sql.query(
        `SELECT data FROM telemetry_decisions WHERE ${where} ORDER BY timestamp DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
        [...params, limit, offset]
      );
      const data = dataResult.rows.map((r: { data: GovernanceDecisionRecord }) => r.data);

      return { data, total, limit, offset };
    },

    async queryTraces(filter: TraceQueryFilter): Promise<QueryResult<TraceSpan>> {
      const limit = clampLimit(filter.limit);
      const offset = clampOffset(filter.offset);

      const conditions: string[] = ['1=1'];
      const params: unknown[] = [];
      let paramIdx = 1;

      if (filter.runId) {
        conditions.push(`run_id = $${paramIdx++}`);
        params.push(filter.runId);
      }
      if (filter.kind) {
        conditions.push(`kind = $${paramIdx++}`);
        params.push(filter.kind);
      }
      if (filter.since) {
        conditions.push(`start_time >= $${paramIdx++}`);
        params.push(new Date(filter.since).getTime());
      }
      if (filter.until) {
        conditions.push(`start_time <= $${paramIdx++}`);
        params.push(new Date(filter.until).getTime());
      }

      const where = conditions.join(' AND ');

      const countResult = await sql.query(`SELECT COUNT(*)::int as total FROM telemetry_traces WHERE ${where}`, params);
      const total = countResult.rows[0].total;

      const dataResult = await sql.query(
        `SELECT data FROM telemetry_traces WHERE ${where} ORDER BY start_time DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
        [...params, limit, offset]
      );
      const data = dataResult.rows.map((r: { data: TraceSpan }) => r.data);

      return { data, total, limit, offset };
    },

    async createInstall(record: InstallRecord): Promise<void> {
      await sql`
        INSERT INTO telemetry_installs (install_id, public_key, token_hash, version, enrolled_at)
        VALUES (${record.install_id}, ${record.public_key}, ${record.token_hash}, ${record.version}, ${record.enrolled_at})
        ON CONFLICT (install_id) DO UPDATE SET
          token_hash = EXCLUDED.token_hash,
          version = EXCLUDED.version,
          public_key = EXCLUDED.public_key
      `;
    },

    async findInstallById(installId: string): Promise<InstallRecord | null> {
      const result = await sql`
        SELECT install_id, public_key, token_hash, version, enrolled_at
        FROM telemetry_installs WHERE install_id = ${installId}
      `;
      if (result.rows.length === 0) return null;
      return result.rows[0] as InstallRecord;
    },

    async findInstallByTokenHash(tokenHash: string): Promise<InstallRecord | null> {
      const result = await sql`
        SELECT install_id, public_key, token_hash, version, enrolled_at
        FROM telemetry_installs WHERE token_hash = ${tokenHash}
      `;
      if (result.rows.length === 0) return null;
      return result.rows[0] as InstallRecord;
    },

    async appendTelemetryPayloads(records: TelemetryPayloadRecord[]): Promise<void> {
      for (const record of records) {
        await sql`
          INSERT INTO telemetry_payloads (event_id, install_id, event_json, received_at)
          VALUES (${record.event_id}, ${record.install_id}, ${record.event_json}, ${record.received_at})
          ON CONFLICT (event_id) DO NOTHING
        `;
      }
    },

    async queryTelemetryPayloads(
      filter: QueryFilter
    ): Promise<QueryResult<TelemetryPayloadRecord>> {
      const limit = clampLimit(filter.limit);
      const offset = clampOffset(filter.offset);

      const conditions: string[] = ['1=1'];
      const params: unknown[] = [];
      let paramIdx = 1;

      if (filter.since) {
        conditions.push(`received_at >= $${paramIdx++}`);
        params.push(filter.since);
      }
      if (filter.until) {
        conditions.push(`received_at <= $${paramIdx++}`);
        params.push(filter.until);
      }

      const where = conditions.join(' AND ');

      const countResult = await sql.query(`SELECT COUNT(*)::int as total FROM telemetry_payloads WHERE ${where}`, params);
      const total = countResult.rows[0].total;

      const dataResult = await sql.query(
        `SELECT event_id, install_id, event_json, received_at FROM telemetry_payloads WHERE ${where} ORDER BY received_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
        [...params, limit, offset]
      );
      const data = dataResult.rows as TelemetryPayloadRecord[];

      return { data, total, limit, offset };
    },
  };
}
