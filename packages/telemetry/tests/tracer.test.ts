import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTracer, resetSpanCounter } from '../src/tracer.js';
import type { TraceBackend, TraceSpan } from '../src/tracepoint.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBackend(name = 'test-backend'): TraceBackend & {
  started: TraceSpan[];
  ended: TraceSpan[];
  shutdownCalled: boolean;
} {
  const started: TraceSpan[] = [];
  const ended: TraceSpan[] = [];
  let shutdownCalled = false;
  return {
    name,
    onSpanStart(span) {
      started.push({ ...span });
    },
    onSpanEnd(span) {
      ended.push({ ...span });
    },
    shutdown() {
      shutdownCalled = true;
    },
    get started() {
      return started;
    },
    get ended() {
      return ended;
    },
    get shutdownCalled() {
      return shutdownCalled;
    },
  };
}

// ---------------------------------------------------------------------------
// isEnabled / no-op behaviour
// ---------------------------------------------------------------------------

describe('createTracer — isEnabled', () => {
  it('is disabled with no backends and no forceEnabled', () => {
    const tracer = createTracer();
    expect(tracer.isEnabled()).toBe(false);
  });

  it('is enabled when forceEnabled is true', () => {
    const tracer = createTracer({ forceEnabled: true });
    expect(tracer.isEnabled()).toBe(true);
  });

  it('is enabled when a backend is registered at construction', () => {
    const tracer = createTracer({ backends: [makeBackend()] });
    expect(tracer.isEnabled()).toBe(true);
  });

  it('becomes enabled after addBackend', () => {
    const tracer = createTracer();
    expect(tracer.isEnabled()).toBe(false);
    tracer.addBackend(makeBackend());
    expect(tracer.isEnabled()).toBe(true);
  });

  it('becomes disabled after all backends are removed', () => {
    const b = makeBackend('b1');
    const tracer = createTracer({ backends: [b] });
    expect(tracer.isEnabled()).toBe(true);
    tracer.removeBackend('b1');
    expect(tracer.isEnabled()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// no-op span when disabled
// ---------------------------------------------------------------------------

describe('createTracer — no-op span when disabled', () => {
  it('startSpan returns a handle with an empty span when disabled', () => {
    const tracer = createTracer();
    const handle = tracer.startSpan('kernel.propose', 'test');
    expect(handle).toBeDefined();
    expect(handle.span.spanId).toBe('');
  });

  it('calling end() on a no-op handle is safe', () => {
    const tracer = createTracer();
    const handle = tracer.startSpan('policy.evaluate', 'noop');
    expect(() => handle.end()).not.toThrow();
  });

  it('calling endWithError() on a no-op handle is safe', () => {
    const tracer = createTracer();
    const handle = tracer.startSpan('invariant.check', 'noop');
    expect(() => handle.endWithError('boom')).not.toThrow();
  });

  it('calling setAttribute() on a no-op handle is safe', () => {
    const tracer = createTracer();
    const handle = tracer.startSpan('aab.normalize', 'noop');
    expect(() => handle.setAttribute('key', 'value')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Real span lifecycle
// ---------------------------------------------------------------------------

describe('createTracer — real spans with a backend', () => {
  beforeEach(() => {
    resetSpanCounter();
  });

  it('creates a real span with a non-empty spanId', () => {
    const b = makeBackend();
    const tracer = createTracer({ backends: [b] });
    const handle = tracer.startSpan('aab.normalize', 'aab.normalize:file.write');
    expect(handle.span.spanId).not.toBe('');
    handle.end();
  });

  it('notifies backend on span start', () => {
    const b = makeBackend();
    const tracer = createTracer({ backends: [b] });
    tracer.startSpan('policy.evaluate', 'policy:test').end();
    expect(b.started).toHaveLength(1);
    expect(b.started[0].kind).toBe('policy.evaluate');
    expect(b.started[0].name).toBe('policy:test');
  });

  it('notifies backend on span end with status ok', () => {
    const b = makeBackend();
    const tracer = createTracer({ backends: [b] });
    const handle = tracer.startSpan('adapter.dispatch', 'dispatch:shell');
    handle.end();
    expect(b.ended).toHaveLength(1);
    expect(b.ended[0].status).toBe('ok');
    expect(b.ended[0].endTime).toBeGreaterThan(0);
    expect(b.ended[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it('notifies backend on span end with status error', () => {
    const b = makeBackend();
    const tracer = createTracer({ backends: [b] });
    const handle = tracer.startSpan('invariant.checkAll', 'inv-check');
    handle.endWithError('invariant failed');
    expect(b.ended).toHaveLength(1);
    expect(b.ended[0].status).toBe('error');
    expect(b.ended[0].error).toBe('invariant failed');
  });

  it('end() is idempotent — backend notified only once', () => {
    const b = makeBackend();
    const tracer = createTracer({ backends: [b] });
    const handle = tracer.startSpan('event.emit', 'emit');
    handle.end();
    handle.end();
    handle.end();
    expect(b.ended).toHaveLength(1);
  });

  it('endWithError() is idempotent', () => {
    const b = makeBackend();
    const tracer = createTracer({ backends: [b] });
    const handle = tracer.startSpan('event.store', 'store');
    handle.endWithError('err');
    handle.endWithError('err2');
    expect(b.ended).toHaveLength(1);
    expect(b.ended[0].error).toBe('err');
  });

  it('setAttribute sets attribute on the live span', () => {
    const b = makeBackend();
    const tracer = createTracer({ backends: [b] });
    const handle = tracer.startSpan('decision.build', 'decision');
    handle.setAttribute('action', 'file.write');
    handle.setAttribute('count', 3);
    handle.setAttribute('dry_run', true);
    handle.end();
    expect(b.ended[0].attributes['action']).toBe('file.write');
    expect(b.ended[0].attributes['count']).toBe(3);
    expect(b.ended[0].attributes['dry_run']).toBe(true);
  });

  it('span inherits initial attributes from startSpan', () => {
    const b = makeBackend();
    const tracer = createTracer({ backends: [b] });
    tracer.startSpan('simulation.run', 'sim', undefined, { env: 'test' }).end();
    expect(b.ended[0].attributes['env']).toBe('test');
  });

  it('span records parentSpanId when provided', () => {
    const b = makeBackend();
    const tracer = createTracer({ backends: [b] });
    const root = tracer.startSpan('kernel.propose', 'root');
    const child = tracer.startSpan('policy.evaluate', 'child', root.span.spanId);
    child.end();
    root.end();
    expect(b.ended[0].parentSpanId).toBe(root.span.spanId);
    expect(b.ended[1].parentSpanId).toBeUndefined();
  });

  it('span has startTime set at creation', () => {
    const b = makeBackend();
    const tracer = createTracer({ backends: [b] });
    const before = Date.now();
    tracer.startSpan('aab.authorize', 'auth').end();
    const after = Date.now();
    expect(b.ended[0].startTime).toBeGreaterThanOrEqual(before);
    expect(b.ended[0].startTime).toBeLessThanOrEqual(after);
  });
});

// ---------------------------------------------------------------------------
// Backend management
// ---------------------------------------------------------------------------

describe('createTracer — backend management', () => {
  it('getBackendNames returns names of all backends', () => {
    const tracer = createTracer({ backends: [makeBackend('a'), makeBackend('b')] });
    expect(tracer.getBackendNames()).toEqual(['a', 'b']);
  });

  it('addBackend appends a backend', () => {
    const tracer = createTracer();
    tracer.addBackend(makeBackend('x'));
    expect(tracer.getBackendNames()).toContain('x');
  });

  it('removeBackend removes by name', () => {
    const tracer = createTracer({ backends: [makeBackend('rm-me')] });
    tracer.removeBackend('rm-me');
    expect(tracer.getBackendNames()).not.toContain('rm-me');
  });

  it('removeBackend on unknown name is a no-op', () => {
    const tracer = createTracer({ backends: [makeBackend('keep')] });
    expect(() => tracer.removeBackend('nonexistent')).not.toThrow();
    expect(tracer.getBackendNames()).toContain('keep');
  });

  it('multiple backends all receive span callbacks', () => {
    const b1 = makeBackend('b1');
    const b2 = makeBackend('b2');
    const tracer = createTracer({ backends: [b1, b2] });
    tracer.startSpan('event.emit', 'emit').end();
    expect(b1.ended).toHaveLength(1);
    expect(b2.ended).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// shutdown
// ---------------------------------------------------------------------------

describe('createTracer — shutdown', () => {
  it('calls shutdown on all backends', () => {
    const b1 = makeBackend('b1');
    const b2 = makeBackend('b2');
    const tracer = createTracer({ backends: [b1, b2] });
    tracer.shutdown();
    expect(b1.shutdownCalled).toBe(true);
    expect(b2.shutdownCalled).toBe(true);
  });

  it('shutdown is safe when a backend has no shutdown method', () => {
    const backend: TraceBackend = {
      name: 'no-shutdown',
      onSpanStart: () => {},
      onSpanEnd: () => {},
    };
    const tracer = createTracer({ backends: [backend] });
    expect(() => tracer.shutdown()).not.toThrow();
  });

  it('backend errors during shutdown are swallowed', () => {
    const bad: TraceBackend = {
      name: 'bad',
      onSpanStart: () => {},
      onSpanEnd: () => {},
      shutdown: () => {
        throw new Error('shutdown crash');
      },
    };
    const tracer = createTracer({ backends: [bad] });
    expect(() => tracer.shutdown()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Backend errors are swallowed
// ---------------------------------------------------------------------------

describe('createTracer — backend error isolation', () => {
  beforeEach(() => {
    resetSpanCounter();
  });

  it('onSpanStart errors do not crash the caller', () => {
    const bad: TraceBackend = {
      name: 'bad',
      onSpanStart: () => {
        throw new Error('start crash');
      },
      onSpanEnd: () => {},
    };
    const tracer = createTracer({ backends: [bad] });
    expect(() => tracer.startSpan('kernel.propose', 'test')).not.toThrow();
  });

  it('onSpanEnd errors do not crash the caller', () => {
    const bad: TraceBackend = {
      name: 'bad',
      onSpanStart: () => {},
      onSpanEnd: () => {
        throw new Error('end crash');
      },
    };
    const tracer = createTracer({ backends: [bad] });
    const handle = tracer.startSpan('kernel.propose', 'test');
    expect(() => handle.end()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// resetSpanCounter
// ---------------------------------------------------------------------------

describe('resetSpanCounter', () => {
  it('resets the global span counter so IDs restart from 1', () => {
    resetSpanCounter();
    const b = makeBackend();
    const tracer = createTracer({ backends: [b] });
    tracer.startSpan('aab.normalize', 't1').end();
    const firstId = b.ended[0].spanId;

    resetSpanCounter();
    const b2 = makeBackend();
    const tracer2 = createTracer({ backends: [b2] });
    tracer2.startSpan('aab.normalize', 't2').end();
    const secondId = b2.ended[0].spanId;

    // Both IDs should have counter suffix _1 after reset — don't compare timestamps
    // since Date.now() may differ by 1ms between the two calls on loaded CI runners.
    expect(firstId).toMatch(/_1$/);
    expect(secondId).toMatch(/_1$/);
  });
});
