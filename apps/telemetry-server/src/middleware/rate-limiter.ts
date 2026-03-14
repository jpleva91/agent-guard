// In-memory sliding window rate limiter middleware.

import type { Context, Next } from 'hono';

export interface RateLimiterConfig {
  readonly windowMs: number;
  readonly maxRequests: number;
}

/**
 * Create a rate limiter middleware.
 * @param config - Window size and max request count
 * @param keyFn - Function to extract the rate limit key from the request context
 */
export function createRateLimiter(
  config: RateLimiterConfig,
  keyFn: (c: Context) => string | null
) {
  const windows = new Map<string, number[]>();

  // Periodic cleanup to prevent memory leaks
  const cleanupInterval = setInterval(() => {
    const cutoff = Date.now() - config.windowMs;
    for (const [key, timestamps] of windows) {
      const filtered = timestamps.filter((t) => t > cutoff);
      if (filtered.length === 0) {
        windows.delete(key);
      } else {
        windows.set(key, filtered);
      }
    }
  }, config.windowMs);

  if (cleanupInterval && typeof cleanupInterval === 'object' && 'unref' in cleanupInterval) {
    cleanupInterval.unref();
  }

  return async (c: Context, next: Next) => {
    const key = keyFn(c);
    if (!key) {
      await next();
      return;
    }

    const now = Date.now();
    const cutoff = now - config.windowMs;
    const timestamps = (windows.get(key) ?? []).filter((t) => t > cutoff);

    if (timestamps.length >= config.maxRequests) {
      const retryAfter = Math.ceil((timestamps[0] + config.windowMs - now) / 1000);
      c.header('Retry-After', String(retryAfter));
      return c.json({ error: 'Too many requests' }, 429);
    }

    timestamps.push(now);
    windows.set(key, timestamps);

    await next();
  };
}
