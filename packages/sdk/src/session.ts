import type { DomainEvent, EventKind, EventSink, RunManifest } from '@red-codes/core';
import { createKernel } from '@red-codes/kernel';
import type { Kernel, KernelResult } from '@red-codes/kernel';
import { DEFAULT_INVARIANTS } from '@red-codes/invariants';
import type { EventHandler, GovernedSession, RawActionInput, SDKConfig } from './types.js';

/**
 * Event sink that captures events and dispatches them to registered handlers.
 * Bridges the kernel's sink-based event emission with the SDK's subscription API.
 */
class DispatchSink implements EventSink {
  private readonly kindHandlers = new Map<EventKind, Set<EventHandler>>();
  private readonly anyHandlers = new Set<EventHandler>();

  write(event: DomainEvent): void {
    const kindSet = this.kindHandlers.get(event.kind);
    if (kindSet) {
      for (const handler of kindSet) {
        handler(event);
      }
    }
    for (const handler of this.anyHandlers) {
      handler(event);
    }
  }

  onKind(kind: EventKind, handler: EventHandler): () => void {
    let set = this.kindHandlers.get(kind);
    if (!set) {
      set = new Set();
      this.kindHandlers.set(kind, set);
    }
    set.add(handler);
    return () => {
      set!.delete(handler);
      if (set!.size === 0) this.kindHandlers.delete(kind);
    };
  }

  onAny(handler: EventHandler): () => void {
    this.anyHandlers.add(handler);
    return () => {
      this.anyHandlers.delete(handler);
    };
  }

  clear(): void {
    this.kindHandlers.clear();
    this.anyHandlers.clear();
  }
}

export function createSession(config: SDKConfig): GovernedSession {
  const dispatchSink = new DispatchSink();
  const sinks: EventSink[] = [...(config.sinks ?? []), dispatchSink];

  // Filter invariants if disabledInvariants is specified (same pattern as CLI)
  const disabledIds = new Set(config.disabledInvariants ?? []);
  const invariants =
    disabledIds.size > 0 ? DEFAULT_INVARIANTS.filter((inv) => !disabledIds.has(inv.id)) : undefined;

  const kernel: Kernel = createKernel({
    policyDefs: config.policies ?? [],
    dryRun: config.dryRun ?? true,
    adapters: config.adapters,
    sinks,
    decisionSinks: config.decisionSinks,
    manifest: config.manifest,
    pauseHandler: config.pauseHandler,
    snapshotProvider: config.snapshotProvider,
    modifyHandler: config.modifyHandler,
    evaluateOptions: {
      defaultDeny: config.defaultDeny ?? true,
    },
    ...(invariants ? { invariants } : {}),
  });

  let ended = false;

  const session: GovernedSession = {
    get id() {
      return kernel.getRunId();
    },

    async propose(action: RawActionInput): Promise<KernelResult> {
      if (ended) {
        throw new Error(`Session ${kernel.getRunId()} has ended`);
      }
      return kernel.propose(action);
    },

    on(kind: EventKind, handler: EventHandler): () => void {
      return dispatchSink.onKind(kind, handler);
    },

    onAny(handler: EventHandler): () => void {
      return dispatchSink.onAny(handler);
    },

    getActionLog(): KernelResult[] {
      return kernel.getActionLog();
    },

    getEventCount(): number {
      return kernel.getEventCount();
    },

    getManifest(): RunManifest | null {
      return kernel.getManifest();
    },

    end(): void {
      if (ended) return;
      ended = true;
      kernel.shutdown();
      dispatchSink.clear();
    },
  };

  return session;
}
