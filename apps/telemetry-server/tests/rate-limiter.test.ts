import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { createRateLimiter } from '../src/middleware/rate-limiter.js';

describe('rate limiter', () => {
  it('allows requests under the limit', async () => {
    const app = new Hono();
    const limiter = createRateLimiter(
      { windowMs: 60_000, maxRequests: 3 },
      (c) => c.req.header('x-test-key') ?? null
    );
    app.use('/*', limiter);
    app.get('/test', (c) => c.text('ok'));

    for (let i = 0; i < 3; i++) {
      const res = await app.request('/test', {
        headers: { 'x-test-key': 'client-1' },
      });
      expect(res.status).toBe(200);
    }
  });

  it('returns 429 when limit exceeded', async () => {
    const app = new Hono();
    const limiter = createRateLimiter(
      { windowMs: 60_000, maxRequests: 2 },
      (c) => c.req.header('x-test-key') ?? null
    );
    app.use('/*', limiter);
    app.get('/test', (c) => c.text('ok'));

    // First 2 should pass
    await app.request('/test', { headers: { 'x-test-key': 'client-a' } });
    await app.request('/test', { headers: { 'x-test-key': 'client-a' } });

    // Third should be rate limited
    const res = await app.request('/test', { headers: { 'x-test-key': 'client-a' } });
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBeDefined();
  });

  it('tracks different keys independently', async () => {
    const app = new Hono();
    const limiter = createRateLimiter(
      { windowMs: 60_000, maxRequests: 1 },
      (c) => c.req.header('x-test-key') ?? null
    );
    app.use('/*', limiter);
    app.get('/test', (c) => c.text('ok'));

    const res1 = await app.request('/test', { headers: { 'x-test-key': 'a' } });
    expect(res1.status).toBe(200);

    const res2 = await app.request('/test', { headers: { 'x-test-key': 'b' } });
    expect(res2.status).toBe(200);
  });

  it('skips rate limiting when key function returns null', async () => {
    const app = new Hono();
    const limiter = createRateLimiter(
      { windowMs: 60_000, maxRequests: 1 },
      () => null
    );
    app.use('/*', limiter);
    app.get('/test', (c) => c.text('ok'));

    // Both should pass since no key → no limiting
    const res1 = await app.request('/test');
    const res2 = await app.request('/test');
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
  });
});
