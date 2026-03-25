import { describe, it, expect, beforeEach } from 'vitest';
import { createTracer, resetSpanCounter } from '../src/tracer.js';
import type { TraceBackend, TraceSpan } from '../src/tracepoint.js';

// ---------------------------------------------------------------------------
// Test backend — collects spans for assertions
// ---------------------------------------------------------------------------

function createTestBackend(name = 'test'): TraceBackend & { spans: TraceSpan[] } {
  const spans: TraceSpan[] = [];
  return {
    name,
    spans,
    onSpanStart(span: TraceSpan) {
      spans.push(span);
    },
    onSpanEnd() {},
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Tracer', () => {
  beforeEach(() => {
    resetSpanCounter();
  });

  describe('startTrace', () => {
    it('generates a unique traceId for the root span', () => {
      const backend = createTestBackend();
      const tracer = createTracer({ backends: [backend] });

      const handle = tracer.startTrace('propose:file.write');
      expect(handle.span.traceId).toMatch(/^trace_/);
      expect(handle.span.parentSpanId).toBeUndefined();
      expect(handle.span.kind).toBe('kernel.propose');
      handle.end();
    });

    it('different traces get different traceIds', () => {
      const backend = createTestBackend();
      const tracer = createTracer({ backends: [backend] });

      const h1 = tracer.startTrace('trace-1');
      const h2 = tracer.startTrace('trace-2');
      expect(h1.span.traceId).not.toBe(h2.span.traceId);
      h1.end();
      h2.end();
    });

    it('returns noop handle when disabled', () => {
      const tracer = createTracer();
      const handle = tracer.startTrace('test');
      expect(handle.span.spanId).toBe('');
      expect(handle.span.traceId).toBe('');
    });

    it('applies initial attributes', () => {
      const backend = createTestBackend();
      const tracer = createTracer({ backends: [backend] });

      const handle = tracer.startTrace('test', { action: 'file.write', target: 'foo.ts' });
      expect(handle.span.attributes).toEqual({ action: 'file.write', target: 'foo.ts' });
      handle.end();
    });
  });

  describe('startSpan with traceId', () => {
    it('child spans share parent traceId', () => {
      const backend = createTestBackend();
      const tracer = createTracer({ backends: [backend] });

      const root = tracer.startTrace('propose:file.write');
      const child = tracer.startSpan(
        'policy.evaluate',
        'policy:file.write',
        root.span.spanId,
        undefined,
        root.span.traceId
      );

      expect(child.span.traceId).toBe(root.span.traceId);
      expect(child.span.parentSpanId).toBe(root.span.spanId);
      child.end();
      root.end();
    });

    it('generates new traceId when none provided', () => {
      const backend = createTestBackend();
      const tracer = createTracer({ backends: [backend] });

      const handle = tracer.startSpan('policy.evaluate', 'policy:file.write');
      expect(handle.span.traceId).toMatch(/^trace_/);
      handle.end();
    });
  });

  describe('span lifecycle', () => {
    it('records durationMs and status on end()', () => {
      const backend = createTestBackend();
      const tracer = createTracer({ backends: [backend] });

      const handle = tracer.startTrace('test');
      expect(handle.span.status).toBeUndefined();
      expect(handle.span.durationMs).toBeUndefined();

      handle.end();
      expect(handle.span.status).toBe('ok');
      expect(handle.span.durationMs).toBeGreaterThanOrEqual(0);
      expect(handle.span.endTime).toBeDefined();
    });

    it('records error on endWithError()', () => {
      const backend = createTestBackend();
      const tracer = createTracer({ backends: [backend] });

      const handle = tracer.startTrace('test');
      handle.endWithError('something went wrong');

      expect(handle.span.status).toBe('error');
      expect(handle.span.error).toBe('something went wrong');
      expect(handle.span.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('end() is idempotent', () => {
      const endedSpans: TraceSpan[] = [];
      const backend: TraceBackend = {
        name: 'count',
        onSpanStart() {},
        onSpanEnd(span) {
          endedSpans.push(span);
        },
      };
      const tracer = createTracer({ backends: [backend] });

      const handle = tracer.startTrace('test');
      handle.end();
      handle.end();
      handle.end();

      expect(endedSpans).toHaveLength(1);
    });

    it('setAttribute adds attributes to span', () => {
      const backend = createTestBackend();
      const tracer = createTracer({ backends: [backend] });

      const handle = tracer.startTrace('test');
      handle.setAttribute('outcome', 'allow');
      handle.setAttribute('tier', 'fast');
      handle.setAttribute('count', 42);

      expect(handle.span.attributes).toMatchObject({
        outcome: 'allow',
        tier: 'fast',
        count: 42,
      });
      handle.end();
    });
  });

  describe('verbosity filtering', () => {
    it('minimal: only creates kernel.propose spans', () => {
      const backend = createTestBackend();
      const tracer = createTracer({ backends: [backend], verbosity: 'minimal' });

      const propose = tracer.startSpan('kernel.propose', 'propose:file.write');
      const policy = tracer.startSpan('policy.evaluate', 'policy:file.write');
      const invariant = tracer.startSpan('invariant.checkAll', 'inv:all');
      const adapter = tracer.startSpan('adapter.dispatch', 'adapter:file');

      // Only kernel.propose should create a real span
      expect(propose.span.spanId).toMatch(/^span_/);
      expect(policy.span.spanId).toBe('');
      expect(invariant.span.spanId).toBe('');
      expect(adapter.span.spanId).toBe('');

      propose.end();
    });

    it('standard: creates pipeline stage spans but not event.emit or invariant.check', () => {
      const backend = createTestBackend();
      const tracer = createTracer({ backends: [backend], verbosity: 'standard' });

      const propose = tracer.startSpan('kernel.propose', 'propose');
      const policy = tracer.startSpan('policy.evaluate', 'policy');
      const adapter = tracer.startSpan('adapter.dispatch', 'adapter');
      const eventEmit = tracer.startSpan('event.emit', 'emit');
      const singleInvariant = tracer.startSpan('invariant.check', 'inv:single');

      expect(propose.span.spanId).toMatch(/^span_/);
      expect(policy.span.spanId).toMatch(/^span_/);
      expect(adapter.span.spanId).toMatch(/^span_/);
      // event.emit and invariant.check excluded at standard level
      expect(eventEmit.span.spanId).toBe('');
      expect(singleInvariant.span.spanId).toBe('');

      propose.end();
      policy.end();
      adapter.end();
    });

    it('verbose: creates all span kinds', () => {
      const backend = createTestBackend();
      const tracer = createTracer({ backends: [backend], verbosity: 'verbose' });

      const eventEmit = tracer.startSpan('event.emit', 'emit');
      const eventStore = tracer.startSpan('event.store', 'store');
      const singleInvariant = tracer.startSpan('invariant.check', 'inv:single');

      expect(eventEmit.span.spanId).toMatch(/^span_/);
      expect(eventStore.span.spanId).toMatch(/^span_/);
      expect(singleInvariant.span.spanId).toMatch(/^span_/);

      eventEmit.end();
      eventStore.end();
      singleInvariant.end();
    });

    it('defaults to standard verbosity', () => {
      const backend = createTestBackend();
      const tracer = createTracer({ backends: [backend] });
      expect(tracer.getVerbosity()).toBe('standard');
    });

    it('getVerbosity returns configured level', () => {
      const backend = createTestBackend();
      expect(createTracer({ backends: [backend], verbosity: 'minimal' }).getVerbosity()).toBe(
        'minimal'
      );
      expect(createTracer({ backends: [backend], verbosity: 'verbose' }).getVerbosity()).toBe(
        'verbose'
      );
    });
  });

  describe('backend notifications', () => {
    it('notifies backend on span start and end', () => {
      const started: TraceSpan[] = [];
      const ended: TraceSpan[] = [];
      const backend: TraceBackend = {
        name: 'notify-test',
        onSpanStart(span) {
          started.push(span);
        },
        onSpanEnd(span) {
          ended.push(span);
        },
      };
      const tracer = createTracer({ backends: [backend] });

      const handle = tracer.startTrace('test');
      expect(started).toHaveLength(1);
      expect(ended).toHaveLength(0);

      handle.end();
      expect(ended).toHaveLength(1);
      expect(ended[0].status).toBe('ok');
    });

    it('backend errors do not propagate', () => {
      const backend: TraceBackend = {
        name: 'crashy',
        onSpanStart() {
          throw new Error('crash');
        },
        onSpanEnd() {
          throw new Error('crash');
        },
      };
      const tracer = createTracer({ backends: [backend] });

      // Should not throw
      const handle = tracer.startTrace('test');
      handle.end();
    });
  });

  describe('hierarchical spans (end-to-end)', () => {
    it('builds a span tree for a simulated kernel proposal', () => {
      const ended: TraceSpan[] = [];
      const backend: TraceBackend = {
        name: 'tree-test',
        onSpanStart() {},
        onSpanEnd(span) {
          ended.push(span);
        },
      };
      const tracer = createTracer({ backends: [backend] });

      // Root: kernel.propose
      const root = tracer.startTrace('propose:file.write');
      const traceId = root.span.traceId;
      const rootId = root.span.spanId;

      // Child: policy evaluation
      const policy = tracer.startSpan('policy.evaluate', 'policy:file.write', rootId, {}, traceId);
      policy.setAttribute('outcome', 'allow');
      policy.end();

      // Child: adapter execution
      const adapter = tracer.startSpan(
        'adapter.dispatch',
        'adapter:file.write',
        rootId,
        {},
        traceId
      );
      adapter.setAttribute('success', true);
      adapter.end();

      // End root
      root.setAttribute('outcome', 'allow');
      root.end();

      // Verify all spans share the same traceId
      expect(ended).toHaveLength(3);
      for (const span of ended) {
        expect(span.traceId).toBe(traceId);
      }

      // Verify parent-child relationships
      const policySpan = ended.find((s) => s.kind === 'policy.evaluate')!;
      const adapterSpan = ended.find((s) => s.kind === 'adapter.dispatch')!;
      const rootSpan = ended.find((s) => s.kind === 'kernel.propose')!;

      expect(policySpan.parentSpanId).toBe(rootSpan.spanId);
      expect(adapterSpan.parentSpanId).toBe(rootSpan.spanId);
      expect(rootSpan.parentSpanId).toBeUndefined();
    });
  });
});
