// Correlation engine — clusters DevEvents into related groups.
// Supports multiple correlation dimensions: fingerprint, commit, branch,
// file path, agent run ID, CI job ID.
// No DOM, no Node.js APIs — pure domain logic.

import type { DevEvent } from './dev-event.js';
import type { BugEntity } from './entities.js';
import { simpleHash } from './hash.js';

// ---------------------------------------------------------------------------
// Correlation Dimension
// ---------------------------------------------------------------------------

export type CorrelationDimension =
  | 'fingerprint'
  | 'commit'
  | 'branch'
  | 'file'
  | 'agentRun'
  | 'ciJob'
  | 'repo'
  | 'errorType';

// ---------------------------------------------------------------------------
// Correlation Key — a typed grouping token
// ---------------------------------------------------------------------------

export interface CorrelationKey {
  readonly dimension: CorrelationDimension;
  readonly value: string;
}

// ---------------------------------------------------------------------------
// Cluster — a group of related events
// ---------------------------------------------------------------------------

export interface EventCluster {
  /** Unique cluster ID */
  readonly id: string;
  /** Correlation keys that define this cluster */
  readonly keys: readonly CorrelationKey[];
  /** Event IDs in this cluster */
  readonly eventIds: string[];
  /** Count of events */
  readonly size: number;
  /** First event timestamp */
  readonly firstSeen: string;
  /** Last event timestamp */
  readonly lastSeen: string;
}

// ---------------------------------------------------------------------------
// Correlation Engine
// ---------------------------------------------------------------------------

export interface CorrelationEngine {
  /** Add an event and return matching cluster IDs */
  ingest(event: DevEvent): string[];
  /** Get a cluster by ID */
  getCluster(id: string): EventCluster | undefined;
  /** Get all clusters */
  getClusters(): EventCluster[];
  /** Find clusters matching a dimension/value pair */
  findByDimension(dimension: CorrelationDimension, value: string): EventCluster[];
  /** Merge two clusters */
  merge(clusterIdA: string, clusterIdB: string): EventCluster | undefined;
  /** Get cluster count */
  size(): number;
  /** Clear all state */
  clear(): void;
}

/**
 * Extract correlation keys from a DevEvent.
 * Each key represents a dimension this event can be grouped by.
 */
export function extractCorrelationKeys(event: DevEvent): CorrelationKey[] {
  const keys: CorrelationKey[] = [];

  if (event.fingerprint) {
    keys.push({ dimension: 'fingerprint', value: event.fingerprint });
  }
  if (event.commit) {
    keys.push({ dimension: 'commit', value: event.commit });
  }
  if (event.branch) {
    keys.push({ dimension: 'branch', value: event.branch });
  }
  if (event.file) {
    keys.push({ dimension: 'file', value: event.file });
  }
  if (event.agentRunId) {
    keys.push({ dimension: 'agentRun', value: event.agentRunId });
  }
  if (event.ciJobId) {
    keys.push({ dimension: 'ciJob', value: event.ciJobId });
  }
  if (event.repo) {
    keys.push({ dimension: 'repo', value: event.repo });
  }

  // Extract errorType from payload for error events
  const errorType = event.payload?.errorType;
  if (typeof errorType === 'string') {
    keys.push({ dimension: 'errorType', value: errorType });
  }

  return keys;
}

/**
 * Generate a deterministic cluster ID from correlation keys.
 */
function clusterIdFromKeys(keys: readonly CorrelationKey[]): string {
  const sorted = [...keys].sort((a, b) => {
    const d = a.dimension.localeCompare(b.dimension);
    return d !== 0 ? d : a.value.localeCompare(b.value);
  });
  return `cl_${simpleHash(sorted.map((k) => `${k.dimension}:${k.value}`).join('|'))}`;
}

/**
 * Key for the dimension→value index.
 */
function dimensionKey(dimension: CorrelationDimension, value: string): string {
  return `${dimension}::${value}`;
}

/**
 * Create a correlation engine.
 * Configurable with which dimensions to use for primary clustering.
 */
export function createCorrelationEngine(
  options: {
    /** Which dimensions drive primary clustering. Defaults to fingerprint + file. */
    primaryDimensions?: CorrelationDimension[];
  } = {}
): CorrelationEngine {
  const primaryDimensions = new Set(options.primaryDimensions ?? ['fingerprint', 'file']);

  // Cluster storage
  const clusters = new Map<string, EventCluster>();

  // Index: dimension::value → cluster IDs
  const dimensionIndex = new Map<string, Set<string>>();

  function indexCluster(cluster: EventCluster): void {
    for (const key of cluster.keys) {
      const dk = dimensionKey(key.dimension, key.value);
      let set = dimensionIndex.get(dk);
      if (!set) {
        set = new Set();
        dimensionIndex.set(dk, set);
      }
      set.add(cluster.id);
    }
  }

  function removeFromIndex(cluster: EventCluster): void {
    for (const key of cluster.keys) {
      const dk = dimensionKey(key.dimension, key.value);
      const set = dimensionIndex.get(dk);
      if (set) {
        set.delete(cluster.id);
        if (set.size === 0) dimensionIndex.delete(dk);
      }
    }
  }

  return {
    ingest(event: DevEvent): string[] {
      const keys = extractCorrelationKeys(event);
      const primaryKeys = keys.filter((k) => primaryDimensions.has(k.dimension));

      if (primaryKeys.length === 0) {
        // No primary keys — create a singleton cluster
        const cluster: EventCluster = {
          id: clusterIdFromKeys(
            keys.length > 0 ? keys : [{ dimension: 'fingerprint', value: event.id }]
          ),
          keys,
          eventIds: [event.id],
          size: 1,
          firstSeen: event.ts,
          lastSeen: event.ts,
        };
        clusters.set(cluster.id, cluster);
        indexCluster(cluster);
        return [cluster.id];
      }

      // Find existing clusters matching primary keys
      const matchedClusterIds = new Set<string>();
      for (const key of primaryKeys) {
        const dk = dimensionKey(key.dimension, key.value);
        const existing = dimensionIndex.get(dk);
        if (existing) {
          for (const cid of existing) matchedClusterIds.add(cid);
        }
      }

      if (matchedClusterIds.size === 0) {
        // No match — create new cluster
        const cluster: EventCluster = {
          id: clusterIdFromKeys(primaryKeys),
          keys,
          eventIds: [event.id],
          size: 1,
          firstSeen: event.ts,
          lastSeen: event.ts,
        };
        clusters.set(cluster.id, cluster);
        indexCluster(cluster);
        return [cluster.id];
      }

      // Add event to all matched clusters
      const result: string[] = [];
      for (const cid of matchedClusterIds) {
        const existing = clusters.get(cid);
        if (existing) {
          const updated: EventCluster = {
            ...existing,
            eventIds: [...existing.eventIds, event.id],
            size: existing.size + 1,
            lastSeen: event.ts,
            // Merge keys (add new dimensions)
            keys: mergeKeys(existing.keys, keys),
          };
          removeFromIndex(existing);
          clusters.set(cid, updated);
          indexCluster(updated);
          result.push(cid);
        }
      }

      return result;
    },

    getCluster(id: string): EventCluster | undefined {
      return clusters.get(id);
    },

    getClusters(): EventCluster[] {
      return [...clusters.values()];
    },

    findByDimension(dimension: CorrelationDimension, value: string): EventCluster[] {
      const dk = dimensionKey(dimension, value);
      const ids = dimensionIndex.get(dk);
      if (!ids) return [];
      return [...ids].map((id) => clusters.get(id)).filter(Boolean) as EventCluster[];
    },

    merge(clusterIdA: string, clusterIdB: string): EventCluster | undefined {
      const a = clusters.get(clusterIdA);
      const b = clusters.get(clusterIdB);
      if (!a || !b || clusterIdA === clusterIdB) return undefined;

      removeFromIndex(a);
      removeFromIndex(b);
      clusters.delete(clusterIdB);

      const merged: EventCluster = {
        id: clusterIdA,
        keys: mergeKeys(a.keys, b.keys),
        eventIds: [...a.eventIds, ...b.eventIds],
        size: a.size + b.size,
        firstSeen: a.firstSeen < b.firstSeen ? a.firstSeen : b.firstSeen,
        lastSeen: a.lastSeen > b.lastSeen ? a.lastSeen : b.lastSeen,
      };

      clusters.set(clusterIdA, merged);
      indexCluster(merged);
      return merged;
    },

    size(): number {
      return clusters.size;
    },

    clear(): void {
      clusters.clear();
      dimensionIndex.clear();
    },
  };
}

// ---------------------------------------------------------------------------
// Bug Correlation — group bugs by shared attributes
// ---------------------------------------------------------------------------

/**
 * Group bugs that share the same file path into candidate incident clusters.
 */
export function correlateByFile(bugs: readonly BugEntity[]): Map<string, BugEntity[]> {
  const groups = new Map<string, BugEntity[]>();
  for (const bug of bugs) {
    if (!bug.file) continue;
    const existing = groups.get(bug.file) ?? [];
    existing.push(bug);
    groups.set(bug.file, existing);
  }
  return groups;
}

/**
 * Group bugs that share the same error type.
 */
export function correlateByErrorType(bugs: readonly BugEntity[]): Map<string, BugEntity[]> {
  const groups = new Map<string, BugEntity[]>();
  for (const bug of bugs) {
    const existing = groups.get(bug.errorType) ?? [];
    existing.push(bug);
    groups.set(bug.errorType, existing);
  }
  return groups;
}

/**
 * Group bugs by branch.
 */
export function correlateByBranch(bugs: readonly BugEntity[]): Map<string, BugEntity[]> {
  const groups = new Map<string, BugEntity[]>();
  for (const bug of bugs) {
    if (!bug.branch) continue;
    const existing = groups.get(bug.branch) ?? [];
    existing.push(bug);
    groups.set(bug.branch, existing);
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mergeKeys(
  existing: readonly CorrelationKey[],
  incoming: readonly CorrelationKey[]
): CorrelationKey[] {
  const seen = new Set(existing.map((k) => `${k.dimension}:${k.value}`));
  const merged = [...existing];
  for (const key of incoming) {
    const sig = `${key.dimension}:${key.value}`;
    if (!seen.has(sig)) {
      merged.push(key);
      seen.add(sig);
    }
  }
  return merged;
}
