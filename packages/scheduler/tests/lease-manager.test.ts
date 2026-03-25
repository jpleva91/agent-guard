import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LeaseManager } from '../src/lease-manager.js';

describe('LeaseManager', () => {
  let mgr: LeaseManager;

  beforeEach(() => {
    mgr = new LeaseManager();
  });

  it('acquires a lease', () => {
    const lease = mgr.acquire('task', 'task-1', 'worker-a');
    expect(lease).not.toBeNull();
    expect(lease!.owner).toBe('worker-a');
    expect(lease!.resourceKey).toBe('task-1');
  });

  it('denies a lease if already held', () => {
    mgr.acquire('task', 'task-1', 'worker-a');
    const denied = mgr.acquire('task', 'task-1', 'worker-b');
    expect(denied).toBeNull();
  });

  it('allows acquiring expired lease', () => {
    vi.useFakeTimers();
    mgr.acquire('task', 'task-1', 'worker-a', 1000);

    vi.advanceTimersByTime(1001);

    const lease = mgr.acquire('task', 'task-1', 'worker-b');
    expect(lease).not.toBeNull();
    expect(lease!.owner).toBe('worker-b');

    vi.useRealTimers();
  });

  it('releases a lease by owner', () => {
    mgr.acquire('task', 'task-1', 'worker-a');
    expect(mgr.release('task', 'task-1', 'worker-a')).toBe(true);
    expect(mgr.isLeased('task', 'task-1')).toBe(false);
  });

  it('denies release from non-owner', () => {
    mgr.acquire('task', 'task-1', 'worker-a');
    expect(mgr.release('task', 'task-1', 'worker-b')).toBe(false);
    expect(mgr.isLeased('task', 'task-1')).toBe(true);
  });

  it('renews a lease', () => {
    mgr.acquire('task', 'task-1', 'worker-a', 5000);
    const renewed = mgr.renew('task', 'task-1', 'worker-a', 60000);
    expect(renewed).not.toBeNull();
    expect(renewed!.expiresAt).toBeGreaterThan(Date.now() + 50000);
  });

  it('denies renewal from non-owner', () => {
    mgr.acquire('task', 'task-1', 'worker-a');
    expect(mgr.renew('task', 'task-1', 'worker-b')).toBeNull();
  });

  it('reports holder', () => {
    mgr.acquire('task', 'task-1', 'worker-a');
    expect(mgr.holder('task', 'task-1')).toBe('worker-a');
    expect(mgr.holder('task', 'task-999')).toBeNull();
  });

  it('expires stale leases', () => {
    vi.useFakeTimers();
    mgr.acquire('task', 'task-1', 'worker-a', 1000);
    mgr.acquire('repo', 'agent-guard', 'worker-b', 1000);
    mgr.acquire('task', 'task-2', 'worker-c', 60000);

    vi.advanceTimersByTime(2000);

    const expired = mgr.expireStale();
    expect(expired).toBe(2);
    expect(mgr.active()).toHaveLength(1);
    expect(mgr.active()[0].resourceKey).toBe('task-2');

    vi.useRealTimers();
  });

  it('supports different resource types independently', () => {
    mgr.acquire('task', 'task-1', 'worker-a');
    mgr.acquire('repo', 'task-1', 'worker-b'); // same key, different type

    expect(mgr.holder('task', 'task-1')).toBe('worker-a');
    expect(mgr.holder('repo', 'task-1')).toBe('worker-b');
  });
});
