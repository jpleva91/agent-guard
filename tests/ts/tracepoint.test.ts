// Tests for the tracepoint interface and Tracer implementation
import { describe, it, expect, beforeEach } from 'vitest';
import { createTracer, resetSpanCounter } from '../../src/telemetry/tracer.js';
import type { TraceBackend, TraceSpan, TracepointKind } from '../../src/telemetry/tracepoint.js';

// ---------------------------------------------------------------------------
// Test helper: collecting backend
// ---------------------------------------------------------------------------

function createCollectingBackend(name = 'test'): TraceBackend & {
  started: TraceSpan[];
  ended: TraceSpan[];
} {
  const started: TraceSpan[] = [];
  const ended: TraceSpan[] = [];
  return {
    name,
    started,
    ended,
    onSpanStart(span: TraceSpan) {
      started.push(span);
    },
    onSpanEnd(span: TraceSpan) {
      ended.push(span);
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetSpanCounter();
});

describe('Tracer', () => {
  describe('creation and configuration', () => {
    it('creates a tracer with no backends', () => {
      const tracer = createTracer();
      expect(tracer.isEnabled()).toBe(false);
      expect(tracer.getBackendNames()).toEqual([]);
    });

    it('creates a tracer with initial backends', () => {
      const backend = createCollectingBackend();
      const tracer = createTracer({ backends: [backend] });
      expect(tracer.isEnabled()).toBe(true);
      expect(tracer.getBackendNames()).toEqual(['test']);
    });

    it('supports forceEnabled even with no backends', () => {
      const tracer = createTracer({ forceEnabled: true });
      expect(tracer.isEnabled()).toBe(true);
    });
  });

  describe('backend management', () => {
    it('adds and removes backends dynamically', () => {
      const tracer = createTracer();
      const backend = createCollectingBackend('console');
      tracer.addBackend(backend);
      expect(tracer.getBackendNames()).toEqual(['console']);
      expect(tracer.isEnabled()).toBe(true);

      tracer.removeBackend('console');
      expect(tracer.getBackendNames()).toEqual([]);
      expect(tracer.isEnabled()).toBe(false);
    });

    it('removing a non-existent backend is a no-op', () => {
      const tracer = createTracer();
      tracer.removeBackend('nonexistent');
      expect(tracer.getBackendNames()).toEqual([]);
    });
  });

  describe('no-op behavior when disabled', () => {
    it('returns a no-op span handle when disabled', () => {
      const tracer = createTracer();
      const handle = tracer.startSpan('aab.normalize', 'test');
      expect(handle.span.spanId).toBe('');
      handle.end(); // should not throw
      handle.endWithError('fail'); // should not throw
      handle.setAttribute('key', 'value'); // should not throw
    });
  });

  describe('span lifecycle', () => {
    it('creates a span with correct metadata', () => {
      const backend = createCollectingBackend();
      const tracer = createTracer({ backends: [backend] });

      const handle = tracer.startSpan('policy.evaluate', 'policy.evaluate:file.write');

      expect(handle.span.spanId).toMatch(/^span_/);
      expect(handle.span.kind).toBe('policy.evaluate');
      expect(handle.span.name).toBe('policy.evaluate:file.write');
      expect(handle.span.startTime).toBeGreaterThan(0);
      expect(handle.span.endTime).toBeUndefined();
      expect(handle.span.status).toBeUndefined();
    });

    it('notifies backends on span start', () => {
      const backend = createCollectingBackend();
      const tracer = createTracer({ backends: [backend] });

      tracer.startSpan('aab.normalize', 'normalize');

      expect(backend.started).toHaveLength(1);
      expect(backend.started[0].kind).toBe('aab.normalize');
    });

    it('notifies backends on span end', () => {
      const backend = createCollectingBackend();
      const tracer = createTracer({ backends: [backend] });

      const handle = tracer.startSpan('adapter.dispatch', 'dispatch:shell');
      handle.end();

      expect(backend.ended).toHaveLength(1);
      const span = backend.ended[0];
      expect(span.status).toBe('ok');
      expect(span.endTime).toBeGreaterThan(0);
      expect(span.durationMs).toBeGreaterThanOrEqual(0);
      expect(span.error).toBeUndefined();
    });

    it('records error on endWithError', () => {
      const backend = createCollectingBackend();
      const tracer = createTracer({ backends: [backend] });

      const handle = tracer.startSpan('invariant.check', 'check:secret-exposure');
      handle.endWithError('Secret detected in file');

      expect(backend.ended).toHaveLength(1);
      const span = backend.ended[0];
      expect(span.status).toBe('error');
      expect(span.error).toBe('Secret detected in file');
      expect(span.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('end() is idempotent — calling twice does not notify twice', () => {
      const backend = createCollectingBackend();
      const tracer = createTracer({ backends: [backend] });

      const handle = tracer.startSpan('event.emit', 'emit');
      handle.end();
      handle.end();

      expect(backend.ended).toHaveLength(1);
    });

    it('endWithError() after end() is a no-op', () => {
      const backend = createCollectingBackend();
      const tracer = createTracer({ backends: [backend] });

      const handle = tracer.startSpan('event.store', 'store');
      handle.end();
      handle.endWithError('should be ignored');

      expect(backend.ended).toHaveLength(1);
      expect(backend.ended[0].status).toBe('ok');
    });
  });

  describe('span attributes', () => {
    it('supports initial attributes', () => {
      const backend = createCollectingBackend();
      const tracer = createTracer({ backends: [backend] });

      const handle = tracer.startSpan('policy.evaluate', 'eval', undefined, {
        actionType: 'file.write',
        ruleCount: 5,
      });

      expect(handle.span.attributes).toEqual({
        actionType: 'file.write',
        ruleCount: 5,
      });
    });

    it('allows setting attributes after creation', () => {
      const backend = createCollectingBackend();
      const tracer = createTracer({ backends: [backend] });

      const handle = tracer.startSpan('adapter.dispatch', 'dispatch');
      handle.setAttribute('executionTime', 42);
      handle.setAttribute('success', true);

      expect(handle.span.attributes).toEqual({
        executionTime: 42,
        success: true,
      });
    });
  });

  describe('parent-child span relationships', () => {
    it('supports parent span ID for nesting', () => {
      const backend = createCollectingBackend();
      const tracer = createTracer({ backends: [backend] });

      const parent = tracer.startSpan('kernel.propose', 'propose:file.write');
      const child = tracer.startSpan('aab.normalize', 'normalize:file.write', parent.span.spanId);

      expect(child.span.parentSpanId).toBe(parent.span.spanId);
      expect(parent.span.parentSpanId).toBeUndefined();

      child.end();
      parent.end();

      expect(backend.ended).toHaveLength(2);
    });

    it('supports multi-level nesting', () => {
      const backend = createCollectingBackend();
      const tracer = createTracer({ backends: [backend] });

      const root = tracer.startSpan('kernel.propose', 'propose');
      const mid = tracer.startSpan('aab.authorize', 'authorize', root.span.spanId);
      const leaf = tracer.startSpan('policy.evaluate', 'eval', mid.span.spanId);

      leaf.end();
      mid.end();
      root.end();

      expect(backend.ended).toHaveLength(3);
      expect(backend.ended[0].parentSpanId).toBe(mid.span.spanId);
      expect(backend.ended[1].parentSpanId).toBe(root.span.spanId);
      expect(backend.ended[2].parentSpanId).toBeUndefined();
    });
  });

  describe('multiple backends', () => {
    it('notifies all registered backends', () => {
      const b1 = createCollectingBackend('b1');
      const b2 = createCollectingBackend('b2');
      const tracer = createTracer({ backends: [b1, b2] });

      const handle = tracer.startSpan('simulation.run', 'simulate');
      handle.end();

      expect(b1.started).toHaveLength(1);
      expect(b2.started).toHaveLength(1);
      expect(b1.ended).toHaveLength(1);
      expect(b2.ended).toHaveLength(1);
    });

    it('continues notifying other backends if one throws', () => {
      const badBackend: TraceBackend = {
        name: 'bad',
        onSpanStart() {
          throw new Error('backend crash');
        },
        onSpanEnd() {
          throw new Error('backend crash');
        },
      };
      const goodBackend = createCollectingBackend('good');
      const tracer = createTracer({ backends: [badBackend, goodBackend] });

      const handle = tracer.startSpan('decision.build', 'build');
      handle.end();

      expect(goodBackend.started).toHaveLength(1);
      expect(goodBackend.ended).toHaveLength(1);
    });
  });

  describe('shutdown', () => {
    it('calls shutdown on all backends', () => {
      let shutdownCalled = false;
      const backend: TraceBackend = {
        name: 'shutdownable',
        onSpanStart() {},
        onSpanEnd() {},
        shutdown() {
          shutdownCalled = true;
        },
      };
      const tracer = createTracer({ backends: [backend] });

      tracer.shutdown();
      expect(shutdownCalled).toBe(true);
    });

    it('does not throw if backend shutdown throws', () => {
      const backend: TraceBackend = {
        name: 'crashy',
        onSpanStart() {},
        onSpanEnd() {},
        shutdown() {
          throw new Error('shutdown crash');
        },
      };
      const tracer = createTracer({ backends: [backend] });

      expect(() => tracer.shutdown()).not.toThrow();
    });
  });

  describe('all TracepointKinds', () => {
    const allKinds: TracepointKind[] = [
      'aab.normalize',
      'aab.authorize',
      'policy.evaluate',
      'invariant.check',
      'invariant.checkAll',
      'simulation.run',
      'adapter.dispatch',
      'event.emit',
      'event.store',
      'decision.build',
      'kernel.propose',
    ];

    it('accepts all defined tracepoint kinds', () => {
      const backend = createCollectingBackend();
      const tracer = createTracer({ backends: [backend] });

      for (const kind of allKinds) {
        const handle = tracer.startSpan(kind, `test:${kind}`);
        handle.end();
      }

      expect(backend.started).toHaveLength(allKinds.length);
      expect(backend.ended).toHaveLength(allKinds.length);

      const recordedKinds = backend.started.map((s) => s.kind);
      expect(recordedKinds).toEqual(allKinds);
    });
  });

  describe('span ID uniqueness', () => {
    it('generates unique span IDs', () => {
      const backend = createCollectingBackend();
      const tracer = createTracer({ backends: [backend] });

      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const handle = tracer.startSpan('kernel.propose', `span-${i}`);
        ids.add(handle.span.spanId);
        handle.end();
      }

      expect(ids.size).toBe(100);
    });
  });
});
