import { describe, it, expect, vi } from 'vitest';
import { createRendererRegistry } from '../../src/renderers/registry.js';
import type {
  GovernanceRenderer,
  PolicyTracePayload,
  RendererConfig,
  RunSummary,
} from '../../src/renderers/types.js';
import type { KernelResult } from '../../src/kernel/kernel.js';

function makeRenderer(id: string, overrides: Partial<GovernanceRenderer> = {}): GovernanceRenderer {
  return {
    id,
    name: `Test Renderer ${id}`,
    ...overrides,
  };
}

function makeConfig(overrides: Partial<RendererConfig> = {}): RendererConfig {
  return {
    runId: 'run_test_123',
    policyName: 'test-policy',
    invariantCount: 6,
    ...overrides,
  };
}

function makeSummary(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    runId: 'run_test_123',
    totalActions: 5,
    allowed: 4,
    denied: 1,
    violations: 0,
    durationMs: 1000,
    ...overrides,
  };
}

describe('RendererRegistry', () => {
  describe('register/unregister', () => {
    it('registers a renderer', () => {
      const registry = createRendererRegistry();
      const renderer = makeRenderer('tui');
      registry.register(renderer);
      expect(registry.count()).toBe(1);
      expect(registry.list()).toEqual(['tui']);
    });

    it('throws on duplicate ID', () => {
      const registry = createRendererRegistry();
      registry.register(makeRenderer('tui'));
      expect(() => registry.register(makeRenderer('tui'))).toThrow(
        'Renderer already registered: "tui"'
      );
    });

    it('unregisters a renderer and calls dispose', () => {
      const registry = createRendererRegistry();
      const dispose = vi.fn();
      registry.register(makeRenderer('tui', { dispose }));
      const removed = registry.unregister('tui');
      expect(removed).toBe(true);
      expect(dispose).toHaveBeenCalledOnce();
      expect(registry.count()).toBe(0);
    });

    it('returns false for unknown ID on unregister', () => {
      const registry = createRendererRegistry();
      expect(registry.unregister('nonexistent')).toBe(false);
    });

    it('gets a renderer by ID', () => {
      const registry = createRendererRegistry();
      const renderer = makeRenderer('tui');
      registry.register(renderer);
      expect(registry.get('tui')).toBe(renderer);
      expect(registry.get('nonexistent')).toBeUndefined();
    });
  });

  describe('multiple renderers', () => {
    it('supports multiple simultaneous renderers', () => {
      const registry = createRendererRegistry();
      registry.register(makeRenderer('tui'));
      registry.register(makeRenderer('html'));
      registry.register(makeRenderer('json'));
      expect(registry.count()).toBe(3);
      expect(registry.list()).toEqual(['tui', 'html', 'json']);
    });
  });

  describe('lifecycle dispatch', () => {
    it('dispatches onRunStarted to all renderers', () => {
      const registry = createRendererRegistry();
      const onRunStarted1 = vi.fn();
      const onRunStarted2 = vi.fn();
      registry.register(makeRenderer('r1', { onRunStarted: onRunStarted1 }));
      registry.register(makeRenderer('r2', { onRunStarted: onRunStarted2 }));

      const config = makeConfig();
      registry.notifyRunStarted(config);

      expect(onRunStarted1).toHaveBeenCalledWith(config);
      expect(onRunStarted2).toHaveBeenCalledWith(config);
    });

    it('dispatches onActionResult to all renderers', () => {
      const registry = createRendererRegistry();
      const onActionResult = vi.fn();
      registry.register(makeRenderer('r1', { onActionResult }));

      const result = { allowed: true, runId: 'test' } as unknown as KernelResult;
      registry.notifyActionResult(result);

      expect(onActionResult).toHaveBeenCalledWith(result);
    });

    it('dispatches onRunEnded to all renderers', () => {
      const registry = createRendererRegistry();
      const onRunEnded = vi.fn();
      registry.register(makeRenderer('r1', { onRunEnded }));

      const summary = makeSummary();
      registry.notifyRunEnded(summary);

      expect(onRunEnded).toHaveBeenCalledWith(summary);
    });

    it('dispatches onPolicyTrace to all renderers', () => {
      const registry = createRendererRegistry();
      const onPolicyTrace1 = vi.fn();
      const onPolicyTrace2 = vi.fn();
      registry.register(makeRenderer('r1', { onPolicyTrace: onPolicyTrace1 }));
      registry.register(makeRenderer('r2', { onPolicyTrace: onPolicyTrace2 }));

      const trace: PolicyTracePayload = {
        actionType: 'file.write',
        target: 'src/index.ts',
        decision: 'allow',
        totalRulesChecked: 2,
        phaseThatMatched: 'allow',
        durationMs: 0.5,
      };
      registry.notifyPolicyTrace(trace);

      expect(onPolicyTrace1).toHaveBeenCalledWith(trace);
      expect(onPolicyTrace2).toHaveBeenCalledWith(trace);
    });

    it('skips renderers without the hook', () => {
      const registry = createRendererRegistry();
      // Renderer without onRunStarted — should not throw
      registry.register(makeRenderer('minimal'));
      expect(() => registry.notifyRunStarted(makeConfig())).not.toThrow();
    });
  });

  describe('error isolation', () => {
    it('isolates errors in one renderer from others', () => {
      const registry = createRendererRegistry();
      const onRunStarted1 = vi.fn(() => {
        throw new Error('Renderer 1 crashed');
      });
      const onRunStarted2 = vi.fn();

      registry.register(makeRenderer('r1', { onRunStarted: onRunStarted1 }));
      registry.register(makeRenderer('r2', { onRunStarted: onRunStarted2 }));

      const config = makeConfig();
      registry.notifyRunStarted(config);

      // r1 threw, but r2 still received the event
      expect(onRunStarted1).toHaveBeenCalled();
      expect(onRunStarted2).toHaveBeenCalledWith(config);
    });

    it('isolates dispose errors', () => {
      const registry = createRendererRegistry();
      registry.register(
        makeRenderer('r1', {
          dispose: () => {
            throw new Error('Dispose failed');
          },
        })
      );
      registry.register(makeRenderer('r2', { dispose: vi.fn() }));

      // Should not throw even if r1.dispose crashes
      expect(() => registry.disposeAll()).not.toThrow();
      expect(registry.count()).toBe(0);
    });
  });

  describe('disposeAll', () => {
    it('disposes all renderers and clears registry', () => {
      const registry = createRendererRegistry();
      const dispose1 = vi.fn();
      const dispose2 = vi.fn();
      registry.register(makeRenderer('r1', { dispose: dispose1 }));
      registry.register(makeRenderer('r2', { dispose: dispose2 }));

      registry.disposeAll();

      expect(dispose1).toHaveBeenCalledOnce();
      expect(dispose2).toHaveBeenCalledOnce();
      expect(registry.count()).toBe(0);
    });
  });
});
