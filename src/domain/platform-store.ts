// Platform store — append-only DevEvent store with entity tracking,
// correlation, and projection support. The central state substrate.
// No DOM, no Node.js APIs — pure domain logic.

import type { DevEvent, DevEventFilter } from './dev-event.js';
import { validateDevEvent } from './dev-event.js';
import type { BugEntity, IncidentEntity } from './entities.js';
import {
  createBugEntity,
  recordOccurrence,
  resolveBug,
  createIncident,
  addBugToIncident,
} from './entities.js';
import type { CorrelationEngine } from './correlation.js';
import { createCorrelationEngine } from './correlation.js';
import { assessRisk, isSensitiveFile } from './risk.js';
import type { RiskAssessment } from './risk.js';

// ---------------------------------------------------------------------------
// Platform Store Interface
// ---------------------------------------------------------------------------

export interface PlatformStore {
  // --- Event operations ---
  /** Append a DevEvent. Validates, correlates, and updates entities. */
  append(event: DevEvent): AppendResult;
  /** Query events with filters */
  queryEvents(filter?: DevEventFilter): DevEvent[];
  /** Replay all events from a given ID */
  replayFrom(eventId?: string): DevEvent[];
  /** Get event count */
  eventCount(): number;

  // --- Bug operations ---
  /** Get a bug by ID */
  getBug(id: string): BugEntity | undefined;
  /** Get all bugs */
  getBugs(): BugEntity[];
  /** Get bugs by status */
  getBugsByStatus(status: string): BugEntity[];
  /** Resolve a bug */
  resolveBug(bugId: string, commit?: string): BugEntity | undefined;

  // --- Incident operations ---
  /** Get an incident by ID */
  getIncident(id: string): IncidentEntity | undefined;
  /** Get all incidents */
  getIncidents(): IncidentEntity[];

  // --- Correlation ---
  /** Get the correlation engine */
  getCorrelation(): CorrelationEngine;

  // --- Lifecycle ---
  /** Clear all state */
  clear(): void;
}

export interface AppendResult {
  /** The appended event */
  readonly event: DevEvent;
  /** Bug entity created or updated */
  readonly bug?: BugEntity;
  /** Incident created or updated */
  readonly incident?: IncidentEntity;
  /** Risk assessment for this event */
  readonly risk: RiskAssessment;
  /** Cluster IDs this event was added to */
  readonly clusterIds: string[];
}

// ---------------------------------------------------------------------------
// Platform Store Factory
// ---------------------------------------------------------------------------

export interface PlatformStoreOptions {
  /** Minimum bug count in a file cluster to auto-create an incident */
  readonly incidentThreshold?: number;
}

export function createPlatformStore(options: PlatformStoreOptions = {}): PlatformStore {
  const incidentThreshold = options.incidentThreshold ?? 3;

  // Append-only event log
  const events: DevEvent[] = [];

  // Entity indexes
  const bugsByFingerprint = new Map<string, BugEntity>();
  const bugsById = new Map<string, BugEntity>();
  const incidentsById = new Map<string, IncidentEntity>();

  // Correlation
  const correlation = createCorrelationEngine();

  // Bug → resolved state for regression detection
  const resolvedFingerprints = new Set<string>();

  function storeBug(bug: BugEntity): void {
    bugsById.set(bug.id, bug);
    bugsByFingerprint.set(bug.fingerprint, bug);
  }

  function storeIncident(incident: IncidentEntity): void {
    incidentsById.set(incident.id, incident);
  }

  return {
    append(event: DevEvent): AppendResult {
      const validation = validateDevEvent(event);
      if (!validation.valid) {
        throw new Error(`Invalid DevEvent: ${validation.errors.join('; ')}`);
      }

      events.push(event);

      // Correlate
      const clusterIds = correlation.ingest(event);

      // Risk assessment
      const existingBug = bugsByFingerprint.get(event.fingerprint);
      const risk = assessRisk(event, {
        occurrenceCount: existingBug ? existingBug.occurrenceCount : 0,
        wasResolved: resolvedFingerprints.has(event.fingerprint),
        isAgentOriginated: event.actor === 'agent',
        isSensitiveFile: event.file ? isSensitiveFile(event.file) : false,
      });

      let bug: BugEntity | undefined;
      let incident: IncidentEntity | undefined;

      // Track bugs for error events
      if (event.kind === 'error.detected' || event.kind === 'error.repeated') {
        if (existingBug) {
          bug = recordOccurrence(existingBug, event);
          storeBug(bug);
        } else {
          bug = createBugEntity({
            fingerprint: event.fingerprint,
            errorType: (event.payload?.errorType as string) ?? 'unknown',
            message: (event.payload?.message as string) ?? '',
            severity: event.severity ?? 'low',
            file: event.file,
            repo: event.repo,
            branch: event.branch,
            commit: event.commit,
            eventId: event.id,
          });
          storeBug(bug);
        }

        // Auto-incident: if a file cluster reaches threshold
        if (bug.file) {
          incident = maybeCreateIncident(bug, incidentThreshold);
        }
      }

      // Track resolutions
      if (event.kind === 'error.resolved' && existingBug) {
        bug = resolveBug(existingBug, event.commit);
        storeBug(bug);
        resolvedFingerprints.add(event.fingerprint);
      }

      return { event, bug, risk, clusterIds, incident };
    },

    queryEvents(filter: DevEventFilter = {}): DevEvent[] {
      let result = events;

      if (filter.kind) result = result.filter((e) => e.kind === filter.kind);
      if (filter.source) result = result.filter((e) => e.source === filter.source);
      if (filter.actor) result = result.filter((e) => e.actor === filter.actor);
      if (filter.severity) result = result.filter((e) => e.severity === filter.severity);
      if (filter.repo) result = result.filter((e) => e.repo === filter.repo);
      if (filter.branch) result = result.filter((e) => e.branch === filter.branch);
      if (filter.fingerprint) result = result.filter((e) => e.fingerprint === filter.fingerprint);
      if (filter.correlationId)
        result = result.filter((e) => e.correlationId === filter.correlationId);
      if (filter.file) result = result.filter((e) => e.file === filter.file);
      if (filter.since) result = result.filter((e) => e.ts >= filter.since!);
      if (filter.until) result = result.filter((e) => e.ts <= filter.until!);
      if (filter.limit) result = result.slice(0, filter.limit);

      return result;
    },

    replayFrom(eventId?: string): DevEvent[] {
      if (!eventId) return [...events];
      const idx = events.findIndex((e) => e.id === eventId);
      if (idx === -1) return [];
      return events.slice(idx);
    },

    eventCount(): number {
      return events.length;
    },

    getBug(id: string): BugEntity | undefined {
      return bugsById.get(id);
    },

    getBugs(): BugEntity[] {
      return [...bugsById.values()];
    },

    getBugsByStatus(status: string): BugEntity[] {
      return [...bugsById.values()].filter((b) => b.status === status);
    },

    resolveBug(bugId: string, commit?: string): BugEntity | undefined {
      const bug = bugsById.get(bugId);
      if (!bug) return undefined;
      const resolved = resolveBug(bug, commit);
      storeBug(resolved);
      resolvedFingerprints.add(resolved.fingerprint);
      return resolved;
    },

    getIncident(id: string): IncidentEntity | undefined {
      return incidentsById.get(id);
    },

    getIncidents(): IncidentEntity[] {
      return [...incidentsById.values()];
    },

    getCorrelation(): CorrelationEngine {
      return correlation;
    },

    clear(): void {
      events.length = 0;
      bugsByFingerprint.clear();
      bugsById.clear();
      incidentsById.clear();
      correlation.clear();
      resolvedFingerprints.clear();
    },
  };

  // --- Internal helpers ---

  function maybeCreateIncident(bug: BugEntity, threshold: number): IncidentEntity | undefined {
    if (!bug.file) return undefined;

    // Count open bugs in the same file
    const samefile: BugEntity[] = [];
    for (const b of bugsById.values()) {
      if (b.file === bug.file && b.status !== 'resolved' && b.status !== 'suppressed') {
        samefile.push(b);
      }
    }

    if (samefile.length < threshold) return undefined;

    // Check if an incident already covers these bugs
    for (const inc of incidentsById.values()) {
      if (inc.status === 'resolved') continue;
      if (inc.bugIds.includes(bug.id)) return undefined;
      // If this incident covers the same file, add the bug
      if (samefile.some((b) => inc.bugIds.includes(b.id))) {
        const updated = addBugToIncident(inc, bug);
        storeIncident(updated);
        return updated;
      }
    }

    // Create new incident
    const inc = createIncident(samefile, [`file:${bug.file}`]);
    storeIncident(inc);
    // Link bugs to incident
    for (const b of samefile) {
      const linked = { ...b, incidentId: inc.id };
      storeBug(linked);
    }
    return inc;
  }
}
