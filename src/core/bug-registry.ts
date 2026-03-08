/**
 * BugRegistry — In-memory storage and lookup for bug events.
 *
 * Pure data management. No events, no side effects.
 * Uses a Map keyed by bug ID for O(1) lookups.
 */

import type { BugEvent } from './types.js';

export class BugRegistry {
  private readonly bugs = new Map<string, BugEvent>();
  private readonly resolved = new Set<string>();

  /** Register a new bug. Returns false if already registered. */
  add(bug: BugEvent): boolean {
    if (this.bugs.has(bug.id)) return false;
    this.bugs.set(bug.id, bug);
    return true;
  }

  /** Retrieve a bug by ID. */
  get(id: string): BugEvent | undefined {
    return this.bugs.get(id);
  }

  /** Check if a bug exists. */
  has(id: string): boolean {
    return this.bugs.has(id);
  }

  /** Mark a bug as resolved. Returns false if not found or already resolved. */
  resolve(id: string): boolean {
    if (!this.bugs.has(id) || this.resolved.has(id)) return false;
    this.resolved.add(id);
    return true;
  }

  /** Check if a bug is resolved. */
  isResolved(id: string): boolean {
    return this.resolved.has(id);
  }

  /** Get all active (unresolved) bugs. */
  getActive(): BugEvent[] {
    return [...this.bugs.values()].filter((b) => !this.resolved.has(b.id));
  }

  /** Get all bugs regardless of status. */
  getAll(): BugEvent[] {
    return [...this.bugs.values()];
  }

  /** Get count of active bugs. */
  activeCount(): number {
    return this.bugs.size - this.resolved.size;
  }

  /** Get total bug count. */
  totalCount(): number {
    return this.bugs.size;
  }

  /** Clear all bugs and resolved state. */
  clear(): void {
    this.bugs.clear();
    this.resolved.clear();
  }
}
