/**
 * EventBus — Strongly typed publish/subscribe event system.
 *
 * The backbone of BugMon. All modules communicate through events,
 * never by direct coupling. Generic over an event map for full
 * type safety at compile time.
 *
 * Pattern: synchronous dispatch, no middleware, no async.
 * Returns an unsubscribe function from on().
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class EventBus<T extends Record<string, any>> {
  private readonly listeners = new Map<keyof T, Set<(payload: never) => void>>();

  /** Subscribe to an event. Returns an unsubscribe function. */
  on<K extends keyof T>(event: K, handler: (payload: T[K]) => void): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler as (payload: never) => void);

    return () => {
      set!.delete(handler as (payload: never) => void);
      if (set!.size === 0) {
        this.listeners.delete(event);
      }
    };
  }

  /** Remove a specific handler for an event. */
  off<K extends keyof T>(event: K, handler: (payload: T[K]) => void): void {
    const set = this.listeners.get(event);
    if (!set) return;
    set.delete(handler as (payload: never) => void);
    if (set.size === 0) {
      this.listeners.delete(event);
    }
  }

  /** Emit an event synchronously to all subscribers. */
  emit<K extends keyof T>(event: K, payload: T[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const handler of set) {
      (handler as (payload: T[K]) => void)(payload);
    }
  }

  /** Remove all listeners for all events. */
  clear(): void {
    this.listeners.clear();
  }

  /** Get the count of listeners for a specific event. */
  listenerCount<K extends keyof T>(event: K): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}
