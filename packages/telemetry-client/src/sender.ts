// Batched telemetry sender — non-blocking background transmission with retry.

import type {
  TelemetryQueue,
  TelemetryIdentity,
  TelemetryClientConfig,
  TelemetryPayloadEvent,
} from './types.js';
import { canonicalize, signPayload } from './signing.js';

const DEFAULT_FLUSH_INTERVAL_MS = 60_000;
const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_MAX_RETRIES = 3;

export interface TelemetrySender {
  start(): void;
  stop(): void;
  flush(): Promise<void>;
}

/** Create a batched background sender */
export function createTelemetrySender(
  config: TelemetryClientConfig,
  identity: TelemetryIdentity | null,
  queue: TelemetryQueue
): TelemetrySender {
  const flushInterval = config.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
  const batchSize = config.batchSize ?? DEFAULT_BATCH_SIZE;
  const maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
  const serverUrl = config.serverUrl;
  const cloudApiKey = config.cloudApiKey;

  let timer: ReturnType<typeof setInterval> | null = null;
  let flushing = false;

  async function sendBatch(events: TelemetryPayloadEvent[]): Promise<boolean> {
    if (!serverUrl || events.length === 0) return true;

    const mode = identity?.mode ?? 'anonymous';
    const body = { mode, events };
    const canonical = canonicalize(body);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Cloud API key auth (from config.json or env var)
    if (cloudApiKey) {
      headers['X-API-Key'] = cloudApiKey;
      headers['X-Install-Id'] = identity?.install_id ?? 'unknown';
    }

    if (mode === 'verified' && identity) {
      if (identity.enrollment_token) {
        headers['Authorization'] = `Bearer ${identity.enrollment_token}`;
      }
      headers['X-AgentGuard-Install-ID'] = identity.install_id;
      try {
        headers['X-AgentGuard-Signature'] = signPayload(canonical, identity.private_key);
      } catch {
        // If signing fails, send without signature
      }
    }

    // When sending to cloud, use /v1/ path; for legacy servers use /api/v1/
    const pathPrefix = cloudApiKey ? '/v1/telemetry/batch' : '/api/v1/telemetry/batch';
    const url = serverUrl.replace(/\/+$/, '') + pathPrefix;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await globalThis.fetch(url, {
          method: 'POST',
          headers,
          body: canonical,
          signal: AbortSignal.timeout(10_000),
        });

        if (response.ok) return true;
        if (response.status === 429 || response.status >= 500) {
          // Retryable
          if (attempt < maxRetries) {
            await sleep(1000 * Math.pow(2, attempt));
            continue;
          }
        }
        return false;
      } catch {
        if (attempt < maxRetries) {
          await sleep(1000 * Math.pow(2, attempt));
          continue;
        }
        return false;
      }
    }

    return false;
  }

  async function flush(): Promise<void> {
    if (flushing) return;
    flushing = true;
    try {
      const events = queue.dequeue(batchSize);
      if (events.length > 0) {
        await sendBatch(events);
        // Events are dropped on failure (already dequeued)
      }
    } catch {
      // Never crash
    } finally {
      flushing = false;
    }
  }

  return {
    start(): void {
      if (timer) return;
      timer = setInterval(() => {
        flush().catch(() => {
          // Swallow
        });
      }, flushInterval);
      // Prevent the timer from keeping the process alive
      if (timer && typeof timer === 'object' && 'unref' in timer) {
        timer.unref();
      }
    },

    stop(): void {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },

    flush,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
