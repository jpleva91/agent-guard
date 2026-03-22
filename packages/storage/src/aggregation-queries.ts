// SQL aggregation queries for analytics — replaces in-memory loadAllEvents patterns.
// All queries run directly in SQLite, returning only summary data.

import type Database from 'better-sqlite3';
import type {
  AggregationTimeFilter,
  EventKindCount,
  DecisionOutcomeCount,
  DeniedActionCount,
  RunSummary,
  ViolationByInvariant,
  TimeBucketCount,
  GovernanceStats,
  AgentStats,
  TimeRollup,
  TeamViolationPattern,
} from './types.js';

export type {
  AggregationTimeFilter,
  EventKindCount,
  DecisionOutcomeCount,
  DeniedActionCount,
  RunSummary,
  ViolationByInvariant,
  TimeBucketCount,
  GovernanceStats,
  AgentStats,
  TimeRollup,
  TeamViolationPattern,
};

// ─── Helper: build WHERE clause from time filter + optional run_id restriction ───

function buildRunIdSubquery(sessionLimit: number): string {
  return `run_id IN (SELECT run_id FROM (SELECT run_id, MAX(timestamp) as max_ts FROM events GROUP BY run_id ORDER BY max_ts DESC LIMIT ${sessionLimit}))`;
}

function buildTimeConditions(
  filter: AggregationTimeFilter | undefined,
  table: 'events' | 'decisions'
): { where: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filter?.since !== undefined) {
    conditions.push(`${table}.timestamp >= ?`);
    params.push(filter.since);
  }
  if (filter?.until !== undefined) {
    conditions.push(`${table}.timestamp <= ?`);
    params.push(filter.until);
  }
  if (filter?.sessionLimit !== undefined && filter.sessionLimit > 0) {
    conditions.push(buildRunIdSubquery(filter.sessionLimit));
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return { where, params };
}

// ─── Aggregation Queries ─────────────────────────────────────────────────────

/**
 * Count events grouped by kind, ordered by count descending.
 * Replaces: loading all events then reducing by kind in memory.
 */
export function countEventsByKind(
  db: Database.Database,
  filter?: AggregationTimeFilter
): EventKindCount[] {
  const { where, params } = buildTimeConditions(filter, 'events');
  const sql = `SELECT kind, COUNT(*) as count FROM events ${where} GROUP BY kind ORDER BY count DESC`;
  return db.prepare(sql).all(...params) as EventKindCount[];
}

/**
 * Count decisions grouped by outcome (allowed/denied/escalated).
 * Replaces: loading all decisions then grouping by outcome in memory.
 */
export function countDecisionsByOutcome(
  db: Database.Database,
  filter?: AggregationTimeFilter
): DecisionOutcomeCount[] {
  const { where, params } = buildTimeConditions(filter, 'decisions');
  const sql = `SELECT outcome, COUNT(*) as count FROM decisions ${where} GROUP BY outcome ORDER BY count DESC`;
  return db.prepare(sql).all(...params) as DecisionOutcomeCount[];
}

/**
 * Top-N most denied action types across all sessions.
 * Replaces: loading all denied events then grouping by actionType in memory.
 */
export function topDeniedActions(
  db: Database.Database,
  limit: number = 10,
  filter?: AggregationTimeFilter
): DeniedActionCount[] {
  const { where, params } = buildTimeConditions(filter, 'decisions');
  const whereClause = where
    ? `${where} AND outcome = 'denied' AND action_type IS NOT NULL`
    : "WHERE outcome = 'denied' AND action_type IS NOT NULL";
  const sql = `
    SELECT action_type as actionType, COUNT(*) as count, COUNT(DISTINCT run_id) as distinctSessions
    FROM decisions ${whereClause}
    GROUP BY action_type
    ORDER BY count DESC
    LIMIT ?
  `;
  return db.prepare(sql).all(...params, limit) as DeniedActionCount[];
}

/**
 * Per-run summary: event counts broken down by governance outcome.
 * Replaces: loading all events per run then computing counts in memory.
 */
export function summarizeRuns(db: Database.Database, filter?: AggregationTimeFilter): RunSummary[] {
  const { where, params } = buildTimeConditions(filter, 'events');
  const sql = `
    SELECT
      run_id as runId,
      COUNT(*) as totalEvents,
      SUM(CASE WHEN kind = 'ActionAllowed' THEN 1 ELSE 0 END) as allowed,
      SUM(CASE WHEN kind = 'ActionDenied' THEN 1 ELSE 0 END) as denied,
      SUM(CASE WHEN kind = 'ActionEscalated' THEN 1 ELSE 0 END) as escalated,
      SUM(CASE WHEN kind = 'InvariantViolation' THEN 1 ELSE 0 END) as violations,
      MIN(timestamp) as firstEventAt,
      MAX(timestamp) as lastEventAt
    FROM events
    ${where}
    GROUP BY run_id
    ORDER BY MAX(timestamp) DESC
  `;
  return db.prepare(sql).all(...params) as RunSummary[];
}

/**
 * Count invariant violations grouped by invariant name.
 * Extracts the invariant name from the JSON data column using json_extract.
 * Replaces: loading all InvariantViolation events then grouping in memory.
 */
export function countViolationsByInvariant(
  db: Database.Database,
  filter?: AggregationTimeFilter
): ViolationByInvariant[] {
  const { where, params } = buildTimeConditions(filter, 'events');
  const kindCondition = where
    ? `${where} AND kind = 'InvariantViolation'`
    : "WHERE kind = 'InvariantViolation'";
  const sql = `
    SELECT
      COALESCE(json_extract(data, '$.invariant'), json_extract(data, '$.invariantId'), 'unknown') as invariant,
      COUNT(*) as count,
      COUNT(DISTINCT run_id) as distinctSessions
    FROM events
    ${kindCondition}
    GROUP BY invariant
    ORDER BY count DESC
  `;
  return db.prepare(sql).all(...params) as ViolationByInvariant[];
}

/**
 * Count events in fixed-size time buckets for trend visualization.
 * @param bucketSizeMs — Bucket width in milliseconds (default: 1 hour)
 */
export function eventTimeSeries(
  db: Database.Database,
  bucketSizeMs: number = 3_600_000,
  filter?: AggregationTimeFilter
): TimeBucketCount[] {
  const { where, params } = buildTimeConditions(filter, 'events');
  const sql = `
    SELECT
      (timestamp / CAST(? AS INTEGER)) * CAST(? AS INTEGER) as bucketStart,
      COUNT(*) as count
    FROM events
    ${where}
    GROUP BY bucketStart
    ORDER BY bucketStart
  `;
  return db.prepare(sql).all(bucketSizeMs, bucketSizeMs, ...params) as TimeBucketCount[];
}

/**
 * Overall governance statistics across all sessions.
 * Single-row aggregate — returns totals for the entire database or filtered subset.
 */
export function governanceStats(
  db: Database.Database,
  filter?: AggregationTimeFilter
): GovernanceStats {
  const { where: eventWhere, params: eventParams } = buildTimeConditions(filter, 'events');
  const { where: decisionWhere, params: decisionParams } = buildTimeConditions(filter, 'decisions');

  const eventSql = `
    SELECT
      COUNT(DISTINCT run_id) as totalSessions,
      COUNT(*) as totalEvents,
      MIN(timestamp) as firstEventAt,
      MAX(timestamp) as lastEventAt
    FROM events ${eventWhere}
  `;
  const eventRow = db.prepare(eventSql).get(...eventParams) as {
    totalSessions: number;
    totalEvents: number;
    firstEventAt: number | null;
    lastEventAt: number | null;
  };

  const decisionSql = `
    SELECT
      COUNT(*) as totalDecisions,
      COALESCE(SUM(CASE WHEN outcome = 'allowed' THEN 1 ELSE 0 END), 0) as allowedCount,
      COALESCE(SUM(CASE WHEN outcome = 'denied' THEN 1 ELSE 0 END), 0) as deniedCount,
      COALESCE(SUM(CASE WHEN outcome = 'escalated' THEN 1 ELSE 0 END), 0) as escalatedCount
    FROM decisions ${decisionWhere}
  `;
  const decisionRow = db.prepare(decisionSql).get(...decisionParams) as {
    totalDecisions: number;
    allowedCount: number;
    deniedCount: number;
    escalatedCount: number;
  };

  return {
    totalSessions: eventRow.totalSessions,
    totalEvents: eventRow.totalEvents,
    totalDecisions: decisionRow.totalDecisions,
    allowedCount: decisionRow.allowedCount,
    deniedCount: decisionRow.deniedCount,
    escalatedCount: decisionRow.escalatedCount,
    firstEventAt: eventRow.firstEventAt,
    lastEventAt: eventRow.lastEventAt,
  };
}

/**
 * Denial patterns grouped by action_type and reason — pre-aggregated in SQL.
 * Replaces: the in-memory groupDenialsByPattern from denial-learner.ts.
 */
export function denialPatterns(
  db: Database.Database,
  limit: number = 20,
  filter?: AggregationTimeFilter
): Array<{
  readonly actionType: string;
  readonly reason: string;
  readonly occurrences: number;
  readonly distinctSessions: number;
}> {
  const { where, params } = buildTimeConditions(filter, 'decisions');
  const whereClause = where ? `${where} AND outcome = 'denied'` : "WHERE outcome = 'denied'";
  const sql = `
    SELECT
      action_type as actionType,
      reason,
      COUNT(*) as occurrences,
      COUNT(DISTINCT run_id) as distinctSessions
    FROM decisions
    ${whereClause}
    GROUP BY action_type, reason
    ORDER BY occurrences DESC
    LIMIT ?
  `;
  return db.prepare(sql).all(...params, limit) as Array<{
    actionType: string;
    reason: string;
    occurrences: number;
    distinctSessions: number;
  }>;
}

// ─── Team Observability Queries ────────────────────────────────────────────────

/**
 * Governance statistics grouped by agent identity.
 * Extracts agent from the decisions data JSON ($.action.agent).
 */
export function statsByAgent(db: Database.Database, filter?: AggregationTimeFilter): AgentStats[] {
  const { where, params } = buildTimeConditions(filter, 'decisions');
  const sql = `
    SELECT
      COALESCE(json_extract(data, '$.action.agent'), 'unknown') as agent,
      COUNT(*) as totalDecisions,
      SUM(CASE WHEN outcome = 'allowed' THEN 1 ELSE 0 END) as allowed,
      SUM(CASE WHEN outcome = 'denied' THEN 1 ELSE 0 END) as denied,
      SUM(CASE WHEN outcome = 'escalated' THEN 1 ELSE 0 END) as escalated,
      COUNT(DISTINCT run_id) as distinctSessions,
      MIN(timestamp) as firstSeenAt,
      MAX(timestamp) as lastSeenAt
    FROM decisions
    ${where}
    GROUP BY agent
    ORDER BY totalDecisions DESC
  `;
  return db.prepare(sql).all(...params) as AgentStats[];
}

/**
 * Governance statistics bucketed by time period (daily, weekly, monthly).
 * Uses SQLite date functions for natural calendar alignment.
 */
export function timeRollup(
  db: Database.Database,
  granularity: 'daily' | 'weekly' | 'monthly',
  filter?: AggregationTimeFilter
): TimeRollup[] {
  const { where: eventWhere, params: eventParams } = buildTimeConditions(filter, 'events');
  const { where: decisionWhere, params: decisionParams } = buildTimeConditions(filter, 'decisions');

  // SQLite date expression for bucketing timestamps (epoch ms → date string)
  const dateBucket =
    granularity === 'daily'
      ? "date(timestamp / 1000, 'unixepoch')"
      : granularity === 'weekly'
        ? "date(timestamp / 1000, 'unixepoch', 'weekday 0', '-6 days')"
        : "strftime('%Y-%m', timestamp / 1000, 'unixepoch')";

  // Event counts per period
  const eventSql = `
    SELECT ${dateBucket} as period, COUNT(*) as totalEvents, COUNT(DISTINCT run_id) as distinctSessions
    FROM events ${eventWhere}
    GROUP BY period
    ORDER BY period
  `;
  const eventRows = db.prepare(eventSql).all(...eventParams) as Array<{
    period: string;
    totalEvents: number;
    distinctSessions: number;
  }>;

  // Decision counts per period
  const decisionSql = `
    SELECT ${dateBucket} as period,
      COUNT(*) as totalDecisions,
      SUM(CASE WHEN outcome = 'allowed' THEN 1 ELSE 0 END) as allowed,
      SUM(CASE WHEN outcome = 'denied' THEN 1 ELSE 0 END) as denied
    FROM decisions ${decisionWhere}
    GROUP BY period
    ORDER BY period
  `;
  const decisionRows = db.prepare(decisionSql).all(...decisionParams) as Array<{
    period: string;
    totalDecisions: number;
    allowed: number;
    denied: number;
  }>;

  // Merge event and decision data by period
  const periodMap = new Map<string, TimeRollup>();

  for (const row of eventRows) {
    periodMap.set(row.period, {
      period: row.period,
      totalEvents: row.totalEvents,
      totalDecisions: 0,
      allowed: 0,
      denied: 0,
      distinctSessions: row.distinctSessions,
    });
  }

  for (const row of decisionRows) {
    const existing = periodMap.get(row.period);
    if (existing) {
      periodMap.set(row.period, {
        ...existing,
        totalDecisions: row.totalDecisions,
        allowed: row.allowed,
        denied: row.denied,
      });
    } else {
      periodMap.set(row.period, {
        period: row.period,
        totalEvents: 0,
        totalDecisions: row.totalDecisions,
        allowed: row.allowed,
        denied: row.denied,
        distinctSessions: 0,
      });
    }
  }

  return Array.from(periodMap.values()).sort((a, b) => a.period.localeCompare(b.period));
}

/**
 * Invariant violations that affect multiple agents — team-wide patterns.
 */
export function teamViolationPatterns(
  db: Database.Database,
  filter?: AggregationTimeFilter
): TeamViolationPattern[] {
  const { where, params } = buildTimeConditions(filter, 'events');
  const kindCondition = where
    ? `${where} AND kind = 'InvariantViolation'`
    : "WHERE kind = 'InvariantViolation'";

  const sql = `
    SELECT
      COALESCE(json_extract(data, '$.invariant'), json_extract(data, '$.invariantId'), 'unknown') as invariant,
      COUNT(*) as count,
      COUNT(DISTINCT COALESCE(json_extract(data, '$.agent'), 'unknown')) as distinctAgents,
      COUNT(DISTINCT run_id) as distinctSessions
    FROM events
    ${kindCondition}
    GROUP BY invariant
    ORDER BY count DESC
  `;
  return db.prepare(sql).all(...params) as TeamViolationPattern[];
}
