// SQL aggregation queries for analytics — replaces in-memory loadAllEvents patterns.
// All queries run directly in SQLite, returning only summary data.

import type Database from 'better-sqlite3';

/** Time-range filter for aggregation queries */
export interface AggregationTimeFilter {
  /** Only include events at or after this timestamp (epoch ms) */
  readonly since?: number;
  /** Only include events at or before this timestamp (epoch ms) */
  readonly until?: number;
  /** Restrict to the N most recent sessions */
  readonly sessionLimit?: number;
}

/** Event count grouped by kind */
export interface EventKindCount {
  readonly kind: string;
  readonly count: number;
}

/** Decision count grouped by outcome */
export interface DecisionOutcomeCount {
  readonly outcome: string;
  readonly count: number;
}

/** Denied action count grouped by action_type */
export interface DeniedActionCount {
  readonly actionType: string;
  readonly count: number;
  readonly distinctSessions: number;
}

/** Per-run summary statistics */
export interface RunSummary {
  readonly runId: string;
  readonly totalEvents: number;
  readonly allowed: number;
  readonly denied: number;
  readonly escalated: number;
  readonly violations: number;
  readonly firstEventAt: number;
  readonly lastEventAt: number;
}

/** Violation count grouped by invariant name */
export interface ViolationByInvariant {
  readonly invariant: string;
  readonly count: number;
  readonly distinctSessions: number;
}

/** Time-bucketed event count */
export interface TimeBucketCount {
  readonly bucketStart: number;
  readonly count: number;
}

/** Overall governance statistics */
export interface GovernanceStats {
  readonly totalSessions: number;
  readonly totalEvents: number;
  readonly totalDecisions: number;
  readonly allowedCount: number;
  readonly deniedCount: number;
  readonly escalatedCount: number;
  readonly firstEventAt: number | null;
  readonly lastEventAt: number | null;
}

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

// ─── Team-Level Aggregation Queries ───────────────────────────────────────────

/** Per-agent governance summary */
export interface AgentSummary {
  readonly agent: string;
  readonly sessions: number;
  readonly totalActions: number;
  readonly allowed: number;
  readonly denied: number;
  readonly escalated: number;
  readonly violations: number;
  readonly complianceRate: number;
  readonly firstSeen: number;
  readonly lastSeen: number;
}

/** Team-wide governance report */
export interface TeamReport {
  readonly overview: GovernanceStats;
  readonly agents: AgentSummary[];
  readonly topDeniedActions: DeniedActionCount[];
  readonly topViolatedInvariants: ViolationByInvariant[];
  readonly denialTrends: DenialPatternEntry[];
}

/** Denial pattern entry for team reports */
export interface DenialPatternEntry {
  readonly actionType: string;
  readonly reason: string;
  readonly occurrences: number;
  readonly distinctSessions: number;
}

/**
 * Per-agent governance summaries.
 *
 * Resolves agent identity from RunStarted events (agentName field in JSON data),
 * then joins with decision outcomes to compute per-agent compliance metrics.
 */
export function agentSummaries(
  db: Database.Database,
  filter?: AggregationTimeFilter
): AgentSummary[] {
  const { where, params } = buildTimeConditions(filter, 'events');

  // Step 1: Map run_id → agent name from RunStarted events
  const agentMapSql = `
    SELECT
      run_id,
      COALESCE(
        json_extract(data, '$.agentName'),
        json_extract(data, '$.agentId'),
        'unknown'
      ) as agent
    FROM events
    ${where ? `${where} AND kind = 'RunStarted'` : "WHERE kind = 'RunStarted'"}
  `;
  const agentMap = db.prepare(agentMapSql).all(...params) as Array<{
    run_id: string;
    agent: string;
  }>;

  // Build a lookup of run_id → agent
  const runToAgent = new Map<string, string>();
  for (const row of agentMap) {
    runToAgent.set(row.run_id, row.agent);
  }

  // Step 2: Get per-run decision summaries
  const runSummarySql = `
    SELECT
      run_id as runId,
      COUNT(*) as totalActions,
      SUM(CASE WHEN outcome = 'allowed' THEN 1 ELSE 0 END) as allowed,
      SUM(CASE WHEN outcome = 'denied' THEN 1 ELSE 0 END) as denied,
      SUM(CASE WHEN outcome = 'escalated' THEN 1 ELSE 0 END) as escalated,
      MIN(timestamp) as firstSeen,
      MAX(timestamp) as lastSeen
    FROM decisions
    ${buildTimeConditions(filter, 'decisions').where}
    GROUP BY run_id
  `;
  const runSummaries = db
    .prepare(runSummarySql)
    .all(...buildTimeConditions(filter, 'decisions').params) as Array<{
    runId: string;
    totalActions: number;
    allowed: number;
    denied: number;
    escalated: number;
    firstSeen: number;
    lastSeen: number;
  }>;

  // Step 3: Get per-run violation counts
  const violationSql = `
    SELECT
      run_id,
      COUNT(*) as violations
    FROM events
    ${where ? `${where} AND kind = 'InvariantViolation'` : "WHERE kind = 'InvariantViolation'"}
    GROUP BY run_id
  `;
  const violationRows = db.prepare(violationSql).all(...params) as Array<{
    run_id: string;
    violations: number;
  }>;
  const runViolations = new Map<string, number>();
  for (const row of violationRows) {
    runViolations.set(row.run_id, row.violations);
  }

  // Step 4: Aggregate by agent
  const agentData = new Map<
    string,
    {
      sessions: number;
      totalActions: number;
      allowed: number;
      denied: number;
      escalated: number;
      violations: number;
      firstSeen: number;
      lastSeen: number;
    }
  >();

  for (const run of runSummaries) {
    const agent = runToAgent.get(run.runId) ?? 'unknown';
    const existing = agentData.get(agent);
    const violations = runViolations.get(run.runId) ?? 0;

    if (existing) {
      existing.sessions += 1;
      existing.totalActions += run.totalActions;
      existing.allowed += run.allowed;
      existing.denied += run.denied;
      existing.escalated += run.escalated;
      existing.violations += violations;
      existing.firstSeen = Math.min(existing.firstSeen, run.firstSeen);
      existing.lastSeen = Math.max(existing.lastSeen, run.lastSeen);
    } else {
      agentData.set(agent, {
        sessions: 1,
        totalActions: run.totalActions,
        allowed: run.allowed,
        denied: run.denied,
        escalated: run.escalated,
        violations,
        firstSeen: run.firstSeen,
        lastSeen: run.lastSeen,
      });
    }
  }

  // Convert to sorted array
  return [...agentData.entries()]
    .map(([agent, data]) => ({
      agent,
      ...data,
      complianceRate:
        data.totalActions > 0 ? Math.round((data.allowed / data.totalActions) * 1000) / 10 : 100,
    }))
    .sort((a, b) => b.sessions - a.sessions);
}

/**
 * Build a complete team governance report.
 *
 * Aggregates per-agent summaries, overall stats, top denied actions,
 * most violated invariants, and denial patterns.
 */
export function teamReport(db: Database.Database, filter?: AggregationTimeFilter): TeamReport {
  return {
    overview: governanceStats(db, filter),
    agents: agentSummaries(db, filter),
    topDeniedActions: topDeniedActions(db, 10, filter),
    topViolatedInvariants: countViolationsByInvariant(db, filter),
    denialTrends: denialPatterns(db, 15, filter) as DenialPatternEntry[],
  };
}
