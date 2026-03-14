/**
 * EventBus — Strongly typed publish/subscribe event system.
 *
 * The backbone of AgentGuard. All modules communicate through events,
 * never by direct coupling. Generic over an event map for full
 * type safety at compile time.
 *
 * Pattern: synchronous dispatch, no middleware, no async.
 * Returns an unsubscribe function from on().
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class EventBus<T extends Record<string, any>> {
  private readonly listeners = new Map<keyof T, Array<(payload: never) => void>>();

  /** Subscribe to an event. Returns an unsubscribe function. */
  on<K extends keyof T>(event: K, handler: (payload: T[K]) => void): () => void {
    let arr = this.listeners.get(event);
    if (!arr) {
      arr = [];
      this.listeners.set(event, arr);
    }
    arr.push(handler as (payload: never) => void);

    return () => {
      const list = this.listeners.get(event);
      if (!list) return;
      const idx = list.indexOf(handler as (payload: never) => void);
      if (idx !== -1) list.splice(idx, 1);
      if (list.length === 0) {
        this.listeners.delete(event);
      }
    };
  }

  /** Remove a specific handler for an event. */
  off<K extends keyof T>(event: K, handler: (payload: T[K]) => void): void {
    const list = this.listeners.get(event);
    if (!list) return;
    const idx = list.indexOf(handler as (payload: never) => void);
    if (idx !== -1) list.splice(idx, 1);
    if (list.length === 0) {
      this.listeners.delete(event);
    }
  }

  /** Emit an event synchronously to all subscribers. */
  emit<K extends keyof T>(event: K, payload?: T[K]): void {
    const list = this.listeners.get(event);
    if (!list) return;
    for (const handler of [...list]) {
      (handler as (payload: T[K]) => void)(payload as T[K]);
    }
  }

  /** Remove all listeners for all events. */
  clear(): void {
    this.listeners.clear();
  }

  /** Get the count of listeners for a specific event. */
  listenerCount<K extends keyof T>(event: K): number {
    return this.listeners.get(event)?.length ?? 0;
  }
}
