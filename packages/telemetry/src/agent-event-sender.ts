// AgentEvent Sender — background batch sender posting AgentEvent batches to /v1/events.

import type { AgentEventQueue } from './agent-event-queue.js';
import type { AgentEvent } from './event-mapper.js';

// ---------------------------------------------------------------------------
// Config & interface
// ---------------------------------------------------------------------------

export interface AgentEventSenderConfig {
  serverUrl: string;
  queue: AgentEventQueue;
  batchSize: number;
  apiKey?: string;
  maxRetries?: number; // default 3
  retryDelayMs?: number; // default 1000
  fetchTimeoutMs?: number; // default 10000
}

export interface AgentEventSender {
  start(intervalMs: number): void;
  stop(): void;
  flush(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isRetryable(status: number): boolean {
  return status >= 500 || status === 429;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createAgentEventSender(config: AgentEventSenderConfig): AgentEventSender {
  const { serverUrl, queue, batchSize } = config;
  const maxRetries = config.maxRetries ?? 3;
  const retryDelayMs = config.retryDelayMs ?? 1000;
  const fetchTimeoutMs = config.fetchTimeoutMs ?? 10_000;

  let intervalId: ReturnType<typeof setInterval> | undefined;

  async function sendBatch(): Promise<void> {
    const events: AgentEvent[] = queue.dequeue(batchSize);
    if (events.length === 0) {
      return;
    }

    const url = `${serverUrl}/v1/events`;
    const body = JSON.stringify({ events });

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (config.apiKey) {
          headers['X-API-Key'] = config.apiKey;
        }
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body,
          signal: AbortSignal.timeout(fetchTimeoutMs),
        });

        if (response.ok) {
          return;
        }

        if (isRetryable(response.status) && attempt < maxRetries) {
          await delay(retryDelayMs * (attempt + 1));
          continue;
        }

        // Non-retryable HTTP error — drop the batch
        return;
      } catch {
        // Network error — retry if attempts remain
        if (attempt < maxRetries) {
          await delay(retryDelayMs * (attempt + 1));
          continue;
        }
        // Exhausted retries — drop the batch
        return;
      }
    }
  }

  const sender: AgentEventSender = {
    start(intervalMs: number): void {
      if (intervalId !== undefined) {
        return;
      }
      intervalId = setInterval(() => {
        void sendBatch();
      }, intervalMs);
    },

    stop(): void {
      if (intervalId !== undefined) {
        clearInterval(intervalId);
        intervalId = undefined;
      }
    },

    async flush(): Promise<void> {
      while (queue.size() > 0) {
        await sendBatch();
      }
    },
  };

  return sender;
}
