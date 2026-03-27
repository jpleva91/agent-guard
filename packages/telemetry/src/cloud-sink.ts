// CloudSinkBundle — EventSink + DecisionSink for cloud telemetry API.

/**
 * Governance event telemetry — sends rich domain events to AgentGuard Cloud.
 * Uses tenant API key auth via X-API-Key header.
 * Sends events to /v1/events directly (not the batch endpoint).
 *
 * This is the primary telemetry path for governed sessions.
 * For lightweight anonymous CLI telemetry (install/usage metrics),
 * use @red-codes/telemetry-client instead.
 */

import { homedir } from 'node:os';
import type {
  DomainEvent,
  DecisionSink,
  EventKind,
  EventSink,
  GovernanceDecisionRecord,
} from '@red-codes/core';
import { anonymizeEvent } from './anonymize.js';
import { createAgentEventQueue } from './agent-event-queue.js';
import { createAgentEventSender } from './agent-event-sender.js';
import { mapDomainEventToAgentEvent, mapDecisionToAgentEvent, parseDriverType } from './event-mapper.js';
import type { AgentEvent } from './event-mapper.js';
import type { AgentEventQueue } from './agent-event-queue.js';
import type { AgentEventSender } from './agent-event-sender.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TelemetryMode = 'off' | 'anonymous' | 'verified';

export interface CloudSinkConfig {
  mode: TelemetryMode;
  serverUrl: string;
  runId: string;
  agentId: string;
  apiKey?: string;
  installId?: string;
  queueDir?: string;
  flushIntervalMs?: number;
  batchSize?: number;
  parentSessionId?: string;
}

export interface CloudSinkBundle {
  eventSink: EventSink;
  decisionSink: DecisionSink;
  flush(): Promise<void>;
  stop(): void;
  registerRun(): void;
}

// ---------------------------------------------------------------------------
// No-op bundle (used when mode === 'off' or initialization fails)
// ---------------------------------------------------------------------------

function createNoopBundle(): CloudSinkBundle {
  return {
    eventSink: { write() {} },
    decisionSink: { write() {} },
    async flush() {},
    stop() {},
    registerRun() {},
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export async function createCloudSinks(config: CloudSinkConfig): Promise<CloudSinkBundle> {
  if (config.mode === 'off') {
    return createNoopBundle();
  }

  const {
    serverUrl,
    runId,
    agentId,
    installId = '',
    queueDir = `${homedir()}/.agentguard`,
    flushIntervalMs = 60_000,
    batchSize = 50,
  } = config;
  const { parentSessionId } = config;

  const isAnonymous = config.mode === 'anonymous';

  let queue: AgentEventQueue;
  try {
    queue = createAgentEventQueue(queueDir);
  } catch {
    return createNoopBundle();
  }

  let sender: AgentEventSender;
  try {
    sender = createAgentEventSender({
      serverUrl,
      queue,
      batchSize,
      apiKey: config.apiKey,
      // Short-lived hooks need a tighter fetch timeout to avoid blocking the agent
      fetchTimeoutMs: flushIntervalMs === 0 ? 2000 : 10_000,
      maxRetries: flushIntervalMs === 0 ? 1 : 3,
    });
  } catch {
    return createNoopBundle();
  }

  // Only start the background interval for long-lived processes.
  // Short-lived hooks (flushIntervalMs === 0) rely on explicit flush() before exit —
  // setInterval(fn, 0) races with flush() and causes events to be dequeued but not delivered.
  if (flushIntervalMs > 0) {
    sender.start(flushIntervalMs);
  }

  function prepareEvent(agentEvent: AgentEvent): AgentEvent {
    const resolvedAgentId = agentEvent.agentId === 'unknown' ? agentId : agentEvent.agentId;
    const resolvedDriverType =
      agentEvent.driverType ?? parseDriverType(resolvedAgentId) ?? parseDriverType(agentId);
    const prepared: AgentEvent = {
      ...agentEvent,
      sessionId: runId,
      agentId: resolvedAgentId,
      ...(resolvedDriverType !== undefined ? { driverType: resolvedDriverType } : {}),
      ...(parentSessionId ? { parentSessionId } : {}),
    };
    if (isAnonymous) {
      return anonymizeEvent(prepared, installId);
    }
    return prepared;
  }

  // Domain event kinds whose decision information is already captured by the
  // richer GovernanceDecisionRecord via the decisionSink.  Emitting them from
  // both sinks produces duplicate 'decision'-typed rows in cloud telemetry.
  const DECISION_SINK_COVERED: ReadonlySet<EventKind> = new Set([
    'DecisionRecorded',
    'ActionAllowed',
    'ActionDenied',
    'ActionEscalated',
  ]);

  const eventSink: EventSink = {
    write(event: DomainEvent): void {
      try {
        if (DECISION_SINK_COVERED.has(event.kind)) return;
        const agentEvent = mapDomainEventToAgentEvent(event);
        queue.enqueue(prepareEvent(agentEvent));
      } catch {
        // never crash the kernel
      }
    },
  };

  const decisionSink: DecisionSink = {
    write(record: GovernanceDecisionRecord): void {
      try {
        const agentEvent = mapDecisionToAgentEvent(record);
        queue.enqueue(prepareEvent(agentEvent));
      } catch {
        // never crash the kernel
      }
    },
  };

  async function flush(): Promise<void> {
    try {
      await sender.flush();
    } catch {
      // swallow
    }
  }

  function stop(): void {
    sender.stop();
    queue.close();
  }

  function registerRun(): void {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (config.apiKey) {
        headers['X-API-Key'] = config.apiKey;
      }
      fetch(`${serverUrl}/v1/runs`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ agentId, sessionId: runId }),
        signal: AbortSignal.timeout(5_000),
      }).catch(() => {
        // fire-and-forget — swallow all errors
      });
    } catch {
      // swallow synchronous errors
    }
  }

  return { eventSink, decisionSink, flush, stop, registerRun };
}
