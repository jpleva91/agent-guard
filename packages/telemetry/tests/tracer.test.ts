import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTracer, resetSpanCounter } from '@red-codes/telemetry';
import type { TraceBackend, TraceSpan } from '@red-codes/telemetry';

function makeBackend(name = 'test'): TraceBackend & {
  starts: TraceSpan[];
  ends: TraceSpan[];
} {
  const starts: TraceSpan[] = [];
  const ends: TraceSpan[] = [];
  return {
    name,
    starts,
    ends,
    onSpanStart(span: TraceSpan) {
      starts.push(span);
    },
    onSpanEnd(span: TraceSpan) {
      ends.push(span);
    },
    shutdown: vi.fn(),
  };
}

beforeEach(() => {
  resetSpanCounter();
});

describe('Tracer', () => {
  describe('disabled (no backends)', () => {
    it('returns noop handle when no backends attached', () => {
      const tracer = createTracer();
      const handle = tracer.startSpan('kernel.propose', 'test');

      expect(handle.span.spanId).toBe('');
      expect(handle.span.startTime).toBe(0);

      // noop operations should not throw
      handle.end();
      handle.endWithError('err');
      handle.setAttribute('key', 'value');
    });

    it('isEnabled returns false', () => {
      const tracer = createTracer();
      expect(tracer.isEnabled()).toBe(false);
    });
  });

  describe('enabled with backends', () => {
    it('isEnabled returns true when backend is registered', () => {
      const tracer = createTracer({ backends: [makeBackend()] });
      expect(tracer.isEnabled()).toBe(true);
    });

    it('isEnabled returns true when forceEnabled', () => {
      const tracer = createTracer({ forceEnabled: true });
      expect(tracer.isEnabled()).toBe(true);
    });

    it('creates span with correct properties', () => {
      const backend = makeBackend();
      const tracer = createTracer({ backends: [backend] });

      const handle = tracer.startSpan('policy.evaluate', 'eval:file.write', 'parent-1', {
        action: 'file.write',
      });

      expect(handle.span.spanId).toMatch(/^span_/);
      expect(handle.span.kind).toBe('policy.evaluate');
      expect(handle.span.name).toBe('eval:file.write');
      expect(handle.span.parentSpanId).toBe('parent-1');
      expect(handle.span.attributes.action).toBe('file.write');
      expect(handle.span.startTime).toBeGreaterThan(0);
      expect(handle.span.status).toBeUndefined();
    });

    it('notifies backends on span start', () => {
      const backend = makeBackend();
      const tracer = createTracer({ backends: [backend] });

      tracer.startSpan('kernel.propose', 'test');
      expect(backend.starts).toHaveLength(1);
    });
  });

  describe('span lifecycle', () => {
    it('end() sets status to ok and computes duration', () => {
      const backend = makeBackend();
      const tracer = createTracer({ backends: [backend] });

      const handle = tracer.startSpan('kernel.propose', 'test');
      handle.end();

      expect(handle.span.status).toBe('ok');
      expect(handle.span.endTime).toBeGreaterThan(0);
      expect(handle.span.durationMs).toBeGreaterThanOrEqual(0);
      expect(backend.ends).toHaveLength(1);
    });

    it('endWithError() sets status to error', () => {
      const backend = makeBackend();
      const tracer = createTracer({ backends: [backend] });

      const handle = tracer.startSpan('kernel.propose', 'test');
      handle.endWithError('something broke');

      expect(handle.span.status).toBe('error');
      expect(handle.span.error).toBe('something broke');
      expect(backend.ends).toHaveLength(1);
    });

    it('double end is idempotent', () => {
      const backend = makeBackend();
      const tracer = createTracer({ backends: [backend] });

      const handle = tracer.startSpan('kernel.propose', 'test');
      handle.end();
      handle.end(); // second call should be no-op

      expect(backend.ends).toHaveLength(1);
    });

    it('endWithError after end is idempotent', () => {
      const backend = makeBackend();
      const tracer = createTracer({ backends: [backend] });

      const handle = tracer.startSpan('kernel.propose', 'test');
      handle.end();
      handle.endWithError('err');

      expect(handle.span.status).toBe('ok'); // first end wins
      expect(backend.ends).toHaveLength(1);
    });
  });

  describe('setAttribute', () => {
    it('sets attributes on the span', () => {
      const tracer = createTracer({ backends: [makeBackend()] });
      const handle = tracer.startSpan('kernel.propose', 'test');

      handle.setAttribute('key', 'value');
      handle.setAttribute('count', 42);
      handle.setAttribute('flag', true);

      expect(handle.span.attributes.key).toBe('value');
      expect(handle.span.attributes.count).toBe(42);
      expect(handle.span.attributes.flag).toBe(true);
    });
  });

  describe('backend error isolation', () => {
    it('throwing backend on start does not crash tracer', () => {
      const bad: TraceBackend = {
        name: 'bad',
        onSpanStart() {
          throw new Error('boom');
        },
        onSpanEnd() {},
      };

      const tracer = createTracer({ backends: [bad] });
      expect(() => tracer.startSpan('kernel.propose', 'test')).not.toThrow();
    });

    it('throwing backend on end does not crash tracer', () => {
      const bad: TraceBackend = {
        name: 'bad',
        onSpanStart() {},
        onSpanEnd() {
          throw new Error('boom');
        },
      };

      const tracer = createTracer({ backends: [bad] });
      const handle = tracer.startSpan('kernel.propose', 'test');
      expect(() => handle.end()).not.toThrow();
    });
  });

  describe('addBackend / removeBackend', () => {
    it('adds a backend dynamically', () => {
      const tracer = createTracer();
      const backend = makeBackend();

      expect(tracer.isEnabled()).toBe(false);
      tracer.addBackend(backend);
      expect(tracer.isEnabled()).toBe(true);
      expect(tracer.getBackendNames()).toEqual(['test']);
    });

    it('removes a backend by name', () => {
      const backend = makeBackend('removable');
      const tracer = createTracer({ backends: [backend] });

      tracer.removeBackend('removable');
      expect(tracer.getBackendNames()).toEqual([]);
    });

    it('removing non-existent backend is no-op', () => {
      const tracer = createTracer();
      tracer.removeBackend('nonexistent'); // should not throw
      expect(tracer.getBackendNames()).toEqual([]);
    });
  });

  describe('shutdown', () => {
    it('calls shutdown on all backends', () => {
      const b1 = makeBackend('b1');
      const b2 = makeBackend('b2');
      const tracer = createTracer({ backends: [b1, b2] });

      tracer.shutdown();

      expect(b1.shutdown).toHaveBeenCalled();
      expect(b2.shutdown).toHaveBeenCalled();
    });

    it('swallows shutdown errors', () => {
      const bad: TraceBackend = {
        name: 'bad',
        onSpanStart() {},
        onSpanEnd() {},
        shutdown() {
          throw new Error('shutdown fail');
        },
      };

      const tracer = createTracer({ backends: [bad] });
      expect(() => tracer.shutdown()).not.toThrow();
    });
  });

  describe('resetSpanCounter', () => {
    it('resets counter for deterministic span IDs', () => {
      const tracer = createTracer({ forceEnabled: true });

      const h1 = tracer.startSpan('kernel.propose', 'first');
      expect(h1.span.spanId).toContain('_1');

      resetSpanCounter();

      const h2 = tracer.startSpan('kernel.propose', 'second');
      expect(h2.span.spanId).toContain('_1');
    });
  });
});
