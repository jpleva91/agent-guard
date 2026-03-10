// JSONL event reader — reads governance events from .agentguard/events/*.jsonl
// Mirrors the parsing logic in src/cli/file-event-store.ts

import * as fs from 'node:fs';
import * as path from 'node:path';

/** Governance event kinds relevant to the sidebar */
const GOVERNANCE_KINDS = new Set([
  'ActionRequested',
  'ActionAllowed',
  'ActionDenied',
  'ActionEscalated',
  'ActionExecuted',
  'ActionFailed',
  'PolicyDenied',
  'InvariantViolation',
  'BlastRadiusExceeded',
  'RunStarted',
  'RunEnded',
  'DecisionRecorded',
  'SimulationCompleted',
]);

/** Escalation level labels */
export const ESCALATION_LABELS: Record<number, string> = {
  0: 'NORMAL',
  1: 'ELEVATED',
  2: 'HIGH',
  3: 'LOCKDOWN',
};

/** A parsed domain event from a JSONL file */
export interface GovernanceEvent {
  readonly id: string;
  readonly kind: string;
  readonly timestamp: number;
  readonly fingerprint: string;
  readonly [key: string]: unknown;
}

/** Summary of a governance run */
export interface RunSummary {
  readonly runId: string;
  readonly sessionFile: string;
  readonly startedAt: number;
  readonly endedAt: number | null;
  readonly totalEvents: number;
  readonly actionsRequested: number;
  readonly actionsAllowed: number;
  readonly actionsDenied: number;
  readonly violations: number;
  readonly escalationLevel: number;
  readonly status: 'active' | 'completed';
}

/**
 * Parse a JSONL file into an array of governance events.
 * Skips malformed lines gracefully.
 */
export function parseJsonlFile(filePath: string): GovernanceEvent[] {
  if (!fs.existsSync(filePath)) return [];

  const events: GovernanceEvent[] = [];
  const content = fs.readFileSync(filePath, 'utf8');

  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as GovernanceEvent;
      if (parsed.kind && parsed.id && parsed.timestamp) {
        events.push(parsed);
      }
    } catch {
      // Skip malformed lines
    }
  }

  return events;
}

/**
 * List all session IDs from the events directory.
 */
export function listSessionIds(eventsDir: string): string[] {
  if (!fs.existsSync(eventsDir)) return [];

  return fs
    .readdirSync(eventsDir)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => f.replace('.jsonl', ''))
    .sort()
    .reverse(); // Most recent first
}

/**
 * Build a RunSummary from a list of events.
 */
export function summarizeRun(
  sessionId: string,
  sessionFile: string,
  events: GovernanceEvent[]
): RunSummary {
  let startedAt = 0;
  let endedAt: number | null = null;
  let actionsRequested = 0;
  let actionsAllowed = 0;
  let actionsDenied = 0;
  let violations = 0;
  let escalationLevel = 0;

  for (const event of events) {
    switch (event.kind) {
      case 'RunStarted':
        startedAt = event.timestamp;
        break;
      case 'RunEnded':
        endedAt = event.timestamp;
        break;
      case 'ActionRequested':
        actionsRequested++;
        break;
      case 'ActionAllowed':
        actionsAllowed++;
        break;
      case 'ActionDenied':
        actionsDenied++;
        break;
      case 'InvariantViolation':
        violations++;
        break;
      case 'ActionEscalated': {
        const level =
          typeof event.metadata === 'object' && event.metadata !== null
            ? (event.metadata as Record<string, unknown>).escalationLevel
            : undefined;
        if (typeof level === 'number' && level > escalationLevel) {
          escalationLevel = level;
        }
        break;
      }
    }
  }

  if (startedAt === 0 && events.length > 0) {
    startedAt = events[0].timestamp;
  }

  return {
    runId: sessionId,
    sessionFile,
    startedAt,
    endedAt,
    totalEvents: events.length,
    actionsRequested,
    actionsAllowed,
    actionsDenied,
    violations,
    escalationLevel,
    status: endedAt ? 'completed' : 'active',
  };
}

/**
 * Get the events directory path for a workspace.
 */
export function getEventsDir(workspaceRoot: string): string {
  return path.join(workspaceRoot, '.agentguard', 'events');
}

/**
 * Load all run summaries from the events directory.
 */
export function loadAllRuns(workspaceRoot: string): RunSummary[] {
  const eventsDir = getEventsDir(workspaceRoot);
  const sessionIds = listSessionIds(eventsDir);
  const summaries: RunSummary[] = [];

  for (const sessionId of sessionIds) {
    const filePath = path.join(eventsDir, `${sessionId}.jsonl`);
    const events = parseJsonlFile(filePath);
    if (events.length > 0) {
      summaries.push(summarizeRun(sessionId, filePath, events));
    }
  }

  return summaries;
}

/**
 * Find the most recent active or last completed run.
 */
export function findLatestRun(workspaceRoot: string): RunSummary | null {
  const runs = loadAllRuns(workspaceRoot);
  if (runs.length === 0) return null;

  // Prefer active runs
  const active = runs.find((r) => r.status === 'active');
  if (active) return active;

  // Otherwise return most recent by start time
  return runs.sort((a, b) => b.startedAt - a.startedAt)[0];
}

/**
 * Check if governance events are relevant (not battle/game events).
 */
export function isGovernanceEvent(kind: string): boolean {
  return GOVERNANCE_KINDS.has(kind);
}

/** Policy file names to search for, in priority order */
const POLICY_FILE_NAMES = ['agentguard.yaml', 'agentguard.yml', '.agentguard.yaml'];

/**
 * Find the active policy file in the workspace.
 * Returns the filename if found, null otherwise.
 */
export function findPolicyFile(workspaceRoot: string): string | null {
  for (const name of POLICY_FILE_NAMES) {
    const filePath = path.join(workspaceRoot, name);
    if (fs.existsSync(filePath)) {
      return name;
    }
  }
  return null;
}

/** A recent governance event for display in the sidebar */
export interface RecentEvent {
  readonly id: string;
  readonly kind: string;
  readonly timestamp: number;
  readonly actionType: string | null;
  readonly target: string | null;
  readonly reason: string | null;
}

/**
 * Extract recent governance events (allowed/denied actions) from the latest run.
 * Returns the most recent N events, newest first.
 */
export function getRecentEvents(workspaceRoot: string, limit = 20): RecentEvent[] {
  const latestRun = findLatestRun(workspaceRoot);
  if (!latestRun) return [];

  const events = parseJsonlFile(latestRun.sessionFile);
  const actionKinds = new Set([
    'ActionAllowed',
    'ActionDenied',
    'ActionEscalated',
    'PolicyDenied',
    'InvariantViolation',
    'BlastRadiusExceeded',
  ]);

  const recent: RecentEvent[] = [];
  for (let i = events.length - 1; i >= 0 && recent.length < limit; i--) {
    const event = events[i];
    if (actionKinds.has(event.kind)) {
      const metadata =
        typeof event.metadata === 'object' && event.metadata !== null
          ? (event.metadata as Record<string, unknown>)
          : {};

      recent.push({
        id: event.id,
        kind: event.kind,
        timestamp: event.timestamp,
        actionType: (event.actionType as string) ?? (metadata.actionType as string) ?? null,
        target: (event.target as string) ?? (metadata.target as string) ?? null,
        reason: (event.reason as string) ?? (metadata.reason as string) ?? null,
      });
    }
  }

  return recent;
}
