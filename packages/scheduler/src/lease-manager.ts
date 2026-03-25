// Lease manager — prevents duplicate work across agents
import type { Lease } from './types.js';

const DEFAULT_LEASE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export class LeaseManager {
  private leases = new Map<string, Lease>();

  /** Acquire a lease. Returns the lease if granted, null if already held. */
  acquire(
    resourceType: Lease['resourceType'],
    resourceKey: string,
    owner: string,
    ttlMs: number = DEFAULT_LEASE_TTL_MS
  ): Lease | null {
    const key = leaseKey(resourceType, resourceKey);
    const existing = this.leases.get(key);

    // If lease exists and hasn't expired, deny
    if (existing && existing.expiresAt > Date.now()) {
      return null;
    }

    const lease: Lease = {
      resourceType,
      resourceKey,
      owner,
      acquiredAt: Date.now(),
      expiresAt: Date.now() + ttlMs,
    };

    this.leases.set(key, lease);
    return lease;
  }

  /** Release a lease. Only the owner can release. Returns true if released. */
  release(resourceType: Lease['resourceType'], resourceKey: string, owner: string): boolean {
    const key = leaseKey(resourceType, resourceKey);
    const existing = this.leases.get(key);

    if (!existing || existing.owner !== owner) {
      return false;
    }

    this.leases.delete(key);
    return true;
  }

  /** Renew a lease. Only the owner can renew. Returns renewed lease or null. */
  renew(
    resourceType: Lease['resourceType'],
    resourceKey: string,
    owner: string,
    ttlMs: number = DEFAULT_LEASE_TTL_MS
  ): Lease | null {
    const key = leaseKey(resourceType, resourceKey);
    const existing = this.leases.get(key);

    if (!existing || existing.owner !== owner) {
      return null;
    }

    const renewed: Lease = {
      ...existing,
      expiresAt: Date.now() + ttlMs,
    };

    this.leases.set(key, renewed);
    return renewed;
  }

  /** Check if a resource is leased (and not expired). */
  isLeased(resourceType: Lease['resourceType'], resourceKey: string): boolean {
    const key = leaseKey(resourceType, resourceKey);
    const existing = this.leases.get(key);
    return existing !== undefined && existing.expiresAt > Date.now();
  }

  /** Get the current lease holder. */
  holder(resourceType: Lease['resourceType'], resourceKey: string): string | null {
    const key = leaseKey(resourceType, resourceKey);
    const existing = this.leases.get(key);
    if (!existing || existing.expiresAt <= Date.now()) return null;
    return existing.owner;
  }

  /** Expire all stale leases. Returns count of expired. */
  expireStale(): number {
    const now = Date.now();
    let count = 0;
    for (const [key, lease] of this.leases) {
      if (lease.expiresAt <= now) {
        this.leases.delete(key);
        count++;
      }
    }
    return count;
  }

  /** Get all active leases (for metrics/debugging). */
  active(): readonly Lease[] {
    const now = Date.now();
    return [...this.leases.values()].filter((l) => l.expiresAt > now);
  }
}

function leaseKey(type: Lease['resourceType'], key: string): string {
  return `${type}:${key}`;
}
