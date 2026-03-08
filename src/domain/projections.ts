// Projection layer — derived read models from the event log.
// These are the views that dashboards, game loops, and CLIs consume.
// No DOM, no Node.js APIs — pure domain logic.

import type { DevEvent, DevEventSeverity } from './dev-event.js';
import type { BugEntity } from './entities.js';
import type { IncidentEntity } from './entities.js';
import { assessBugRisk } from './risk.js';

// ---------------------------------------------------------------------------
// Active Bug Queue — unresolved bugs sorted by risk
// ---------------------------------------------------------------------------

export interface ActiveBugQueue {
  readonly bugs: readonly BugEntity[];
  readonly total: number;
  readonly bySeverity: Record<DevEventSeverity, number>;
}

export function projectActiveBugs(bugs: readonly BugEntity[]): ActiveBugQueue {
  const active = bugs.filter((b) => b.status !== 'resolved' && b.status !== 'suppressed');

  // Sort by risk score descending
  const sorted = [...active].sort((a, b) => {
    const riskA = assessBugRisk(a).score;
    const riskB = assessBugRisk(b).score;
    return riskB - riskA;
  });

  const bySeverity: Record<DevEventSeverity, number> = { low: 0, medium: 0, high: 0, critical: 0 };
  for (const bug of sorted) {
    bySeverity[bug.severity]++;
  }

  return { bugs: sorted, total: sorted.length, bySeverity };
}

// ---------------------------------------------------------------------------
// Hotspot Leaderboard — files with the most bugs
// ---------------------------------------------------------------------------

export interface Hotspot {
  readonly file: string;
  readonly bugCount: number;
  readonly totalOccurrences: number;
  readonly maxSeverity: DevEventSeverity;
  readonly bugIds: string[];
}

export interface HotspotLeaderboard {
  readonly hotspots: readonly Hotspot[];
  readonly totalFiles: number;
}

export function projectHotspots(bugs: readonly BugEntity[]): HotspotLeaderboard {
  const fileMap = new Map<
    string,
    { bugCount: number; totalOccurrences: number; maxSeverity: DevEventSeverity; bugIds: string[] }
  >();

  const SEVERITY_ORDER: Record<DevEventSeverity, number> = {
    low: 0,
    medium: 1,
    high: 2,
    critical: 3,
  };

  for (const bug of bugs) {
    if (!bug.file || bug.status === 'resolved') continue;

    const entry = fileMap.get(bug.file) ?? {
      bugCount: 0,
      totalOccurrences: 0,
      maxSeverity: 'low' as DevEventSeverity,
      bugIds: [],
    };

    entry.bugCount++;
    entry.totalOccurrences += bug.occurrenceCount;
    if (SEVERITY_ORDER[bug.severity] > SEVERITY_ORDER[entry.maxSeverity]) {
      entry.maxSeverity = bug.severity;
    }
    entry.bugIds.push(bug.id);

    fileMap.set(bug.file, entry);
  }

  const hotspots: Hotspot[] = [...fileMap.entries()].map(([file, data]) => ({
    file,
    ...data,
  }));

  hotspots.sort((a, b) => b.totalOccurrences - a.totalOccurrences);

  return { hotspots, totalFiles: hotspots.length };
}

// ---------------------------------------------------------------------------
// Flaky Test Index — tests that fail intermittently
// ---------------------------------------------------------------------------

export interface FlakyTest {
  readonly testName: string;
  readonly flakyCount: number;
  readonly lastFlakeTs: string;
  readonly file?: string;
}

export interface FlakyTestIndex {
  readonly tests: readonly FlakyTest[];
  readonly total: number;
}

export function projectFlakyTests(events: readonly DevEvent[]): FlakyTestIndex {
  const flakyMap = new Map<string, FlakyTest>();

  for (const event of events) {
    if (event.kind !== 'test.flaky') continue;

    const testName = (event.payload?.testName as string) ?? 'unknown';
    const existing = flakyMap.get(testName);

    if (existing) {
      flakyMap.set(testName, {
        ...existing,
        flakyCount: existing.flakyCount + 1,
        lastFlakeTs: event.ts > existing.lastFlakeTs ? event.ts : existing.lastFlakeTs,
      });
    } else {
      flakyMap.set(testName, {
        testName,
        flakyCount: 1,
        lastFlakeTs: event.ts,
        file: event.file,
      });
    }
  }

  const tests = [...flakyMap.values()].sort((a, b) => b.flakyCount - a.flakyCount);
  return { tests, total: tests.length };
}

// ---------------------------------------------------------------------------
// Repo Health Score — 0–100 composite metric
// ---------------------------------------------------------------------------

export interface RepoHealthScore {
  /** Overall health score (0-100, higher is better) */
  readonly score: number;
  /** Component scores */
  readonly components: {
    readonly errorRate: number;
    readonly testStability: number;
    readonly buildReliability: number;
    readonly resolutionRate: number;
    readonly agentTrust: number;
  };
  /** Trend direction */
  readonly trend: 'improving' | 'stable' | 'degrading';
}

export function projectRepoHealth(
  bugs: readonly BugEntity[],
  events: readonly DevEvent[]
): RepoHealthScore {
  // Error rate score: fewer unresolved bugs = higher score
  const openBugs = bugs.filter((b) => b.status !== 'resolved' && b.status !== 'suppressed');
  const errorRate = Math.max(0, 100 - openBugs.length * 5);

  // Test stability: ratio of passed to total test events
  const testEvents = events.filter(
    (e) => e.kind === 'test.passed' || e.kind === 'test.failed' || e.kind === 'test.flaky'
  );
  const testPassed = testEvents.filter((e) => e.kind === 'test.passed').length;
  const testStability =
    testEvents.length > 0 ? Math.floor((testPassed / testEvents.length) * 100) : 100;

  // Build reliability: ratio of succeeded to total build events
  const buildEvents = events.filter(
    (e) => e.kind === 'build.succeeded' || e.kind === 'build.failed'
  );
  const buildSucceeded = buildEvents.filter((e) => e.kind === 'build.succeeded').length;
  const buildReliability =
    buildEvents.length > 0 ? Math.floor((buildSucceeded / buildEvents.length) * 100) : 100;

  // Resolution rate: how many bugs have been resolved
  const resolvedBugs = bugs.filter((b) => b.status === 'resolved');
  const resolutionRate =
    bugs.length > 0 ? Math.floor((resolvedBugs.length / bugs.length) * 100) : 100;

  // Agent trust: ratio of allowed to total agent actions
  const agentActions = events.filter(
    (e) =>
      e.kind === 'agent.action.requested' ||
      e.kind === 'agent.action.denied' ||
      e.kind === 'agent.action.escalated'
  );
  const agentDenied = agentActions.filter(
    (e) => e.kind === 'agent.action.denied' || e.kind === 'agent.action.escalated'
  ).length;
  const agentTrust =
    agentActions.length > 0
      ? Math.floor(((agentActions.length - agentDenied) / agentActions.length) * 100)
      : 100;

  const score = Math.floor(
    errorRate * 0.3 +
      testStability * 0.25 +
      buildReliability * 0.2 +
      resolutionRate * 0.15 +
      agentTrust * 0.1
  );

  // Simple trend: compare recent half vs earlier half
  const trend = computeTrend(events);

  return {
    score: Math.max(0, Math.min(100, score)),
    components: { errorRate, testStability, buildReliability, resolutionRate, agentTrust },
    trend,
  };
}

// ---------------------------------------------------------------------------
// Agent Trust Score — how trustworthy agent actions are
// ---------------------------------------------------------------------------

export interface AgentTrustScore {
  readonly score: number;
  readonly totalActions: number;
  readonly denied: number;
  readonly escalated: number;
  readonly policyViolations: number;
}

export function projectAgentTrust(events: readonly DevEvent[]): AgentTrustScore {
  const agentEvents = events.filter(
    (e) => e.kind.startsWith('agent.') || e.kind.startsWith('governance.')
  );
  const denied = agentEvents.filter((e) => e.kind === 'agent.action.denied').length;
  const escalated = agentEvents.filter((e) => e.kind === 'agent.action.escalated').length;
  const policyViolations = agentEvents.filter((e) => e.kind.startsWith('governance.')).length;

  const totalActions = events.filter((e) => e.kind === 'agent.action.requested').length;
  const score =
    totalActions > 0 ? Math.floor(((totalActions - denied - escalated) / totalActions) * 100) : 100;

  return {
    score: Math.max(0, Math.min(100, score)),
    totalActions,
    denied,
    escalated,
    policyViolations,
  };
}

// ---------------------------------------------------------------------------
// Encounter Timeline — recent events for game loop / dashboard
// ---------------------------------------------------------------------------

export interface TimelineEntry {
  readonly eventId: string;
  readonly ts: string;
  readonly kind: string;
  readonly summary: string;
  readonly severity?: DevEventSeverity;
  readonly file?: string;
}

export function projectTimeline(events: readonly DevEvent[], limit = 50): TimelineEntry[] {
  const sorted = [...events].sort((a, b) => (a.ts > b.ts ? -1 : a.ts < b.ts ? 1 : 0));

  return sorted.slice(0, limit).map((e) => ({
    eventId: e.id,
    ts: e.ts,
    kind: e.kind,
    summary: summarizeEvent(e),
    severity: e.severity,
    file: e.file,
  }));
}

// ---------------------------------------------------------------------------
// Incident Summary — open incidents with impact
// ---------------------------------------------------------------------------

export interface IncidentSummary {
  readonly openIncidents: number;
  readonly totalBugs: number;
  readonly highestPriority: string;
  readonly incidents: readonly IncidentEntity[];
}

export function projectIncidentSummary(incidents: readonly IncidentEntity[]): IncidentSummary {
  const open = incidents.filter((i) => i.status !== 'resolved');
  const priorityOrder = ['p0', 'p1', 'p2', 'p3'];
  let highestPriority = 'p3';
  for (const inc of open) {
    if (priorityOrder.indexOf(inc.priority) < priorityOrder.indexOf(highestPriority)) {
      highestPriority = inc.priority;
    }
  }

  return {
    openIncidents: open.length,
    totalBugs: open.reduce((sum, i) => sum + i.bugIds.length, 0),
    highestPriority,
    incidents: open,
  };
}

// ---------------------------------------------------------------------------
// Fix-to-Regression Ratio
// ---------------------------------------------------------------------------

export interface FixRegressionRatio {
  readonly fixes: number;
  readonly regressions: number;
  readonly ratio: number;
}

export function projectFixRegressionRatio(events: readonly DevEvent[]): FixRegressionRatio {
  const fixes = events.filter((e) => e.kind === 'error.resolved').length;
  const regressions = events.filter((e) => e.kind === 'error.repeated').length;
  const ratio = regressions > 0 ? fixes / regressions : fixes > 0 ? Infinity : 1;

  return { fixes, regressions, ratio };
}

// ---------------------------------------------------------------------------
// Developer Streaks
// ---------------------------------------------------------------------------

export interface DeveloperStreak {
  readonly currentStreak: number;
  readonly bestStreak: number;
  readonly lastActivityTs: string | null;
}

export function projectDeveloperStreak(events: readonly DevEvent[]): DeveloperStreak {
  // Count consecutive days with commits or resolved bugs
  const activityDays = new Set<string>();
  for (const e of events) {
    if (e.kind === 'git.commit' || e.kind === 'error.resolved') {
      activityDays.add(e.ts.slice(0, 10)); // YYYY-MM-DD
    }
  }

  const sorted = [...activityDays].sort();
  if (sorted.length === 0) return { currentStreak: 0, bestStreak: 0, lastActivityTs: null };

  let currentStreak = 1;
  let bestStreak = 1;
  let streak = 1;

  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1]);
    const curr = new Date(sorted[i]);
    const diffMs = curr.getTime() - prev.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      streak++;
      if (streak > bestStreak) bestStreak = streak;
    } else {
      streak = 1;
    }
  }

  // Current streak: check if the last activity is today or yesterday
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const lastDay = sorted[sorted.length - 1];

  if (lastDay === today || lastDay === yesterday) {
    currentStreak = streak;
  } else {
    currentStreak = 0;
  }

  return {
    currentStreak,
    bestStreak,
    lastActivityTs: sorted[sorted.length - 1],
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function summarizeEvent(event: DevEvent): string {
  const payload = event.payload;
  switch (event.kind) {
    case 'error.detected':
      return `Error: ${(payload.message as string)?.slice(0, 80) ?? 'unknown'}`;
    case 'error.resolved':
      return `Resolved: ${(payload.errorType as string) ?? 'error'}`;
    case 'test.failed':
      return `Test failed: ${(payload.testName as string) ?? 'unknown'}`;
    case 'test.flaky':
      return `Flaky test: ${(payload.testName as string) ?? 'unknown'}`;
    case 'build.failed':
      return `Build failed${payload.tool ? ` (${payload.tool})` : ''}`;
    case 'git.commit':
      return `Commit: ${(payload.message as string)?.slice(0, 60) ?? ''}`;
    case 'agent.action.denied':
      return `Agent denied: ${(payload.reason as string)?.slice(0, 60) ?? 'policy violation'}`;
    case 'governance.invariant.breached':
      return `Invariant breach: ${(payload.invariant as string) ?? 'unknown'}`;
    case 'incident.opened':
      return `Incident opened: ${(payload.title as string)?.slice(0, 60) ?? ''}`;
    default:
      return event.kind;
  }
}

function computeTrend(events: readonly DevEvent[]): 'improving' | 'stable' | 'degrading' {
  if (events.length < 10) return 'stable';

  const sorted = [...events].sort((a, b) => (a.ts < b.ts ? -1 : 1));
  const mid = Math.floor(sorted.length / 2);
  const early = sorted.slice(0, mid);
  const recent = sorted.slice(mid);

  const earlyErrors = early.filter(
    (e) => e.kind === 'error.detected' || e.kind === 'test.failed' || e.kind === 'build.failed'
  ).length;
  const recentErrors = recent.filter(
    (e) => e.kind === 'error.detected' || e.kind === 'test.failed' || e.kind === 'build.failed'
  ).length;

  // Normalize by half-size
  const earlyRate = earlyErrors / early.length;
  const recentRate = recentErrors / recent.length;

  if (recentRate < earlyRate * 0.8) return 'improving';
  if (recentRate > earlyRate * 1.2) return 'degrading';
  return 'stable';
}
