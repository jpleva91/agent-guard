// Telemetry client facade — main entry point for the telemetry SDK.

import { randomUUID } from 'node:crypto';
import { unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type {
  TelemetryClient,
  TelemetryClientConfig,
  TelemetryStatus,
  TrackableEvent,
  TelemetryPayloadEvent,
  TelemetryQueue,
} from './types.js';
import {
  loadIdentity,
  saveIdentity,
  deleteIdentity,
  generateIdentity,
  resolveMode,
} from './identity.js';
import { createQueue } from './queue.js';
import { createTelemetrySender } from './sender.js';
import type { TelemetrySender } from './sender.js';

/** Read the AgentGuard version from a best-effort approach */
function getVersion(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require('../../package.json') as { version: string }).version;
  } catch {
    return '0.0.0';
  }
}

function createNoopClient(): TelemetryClient {
  return {
    track(): void {
      // No-op
    },
    async enroll(): Promise<void> {
      // No-op
    },
    start(): void {
      // No-op
    },
    stop(): void {
      // No-op
    },
    status(): TelemetryStatus {
      return { mode: 'off', installId: null, enrolled: false, queueSize: 0, queueSizeBytes: 0 };
    },
    reset(): void {
      // No-op
    },
  };
}

/** Create a telemetry client. Returns a no-op client when mode is 'off'. */
export async function createTelemetryClient(
  config?: Partial<TelemetryClientConfig>
): Promise<TelemetryClient> {
  const identityPath = config?.identityPath;
  const identity = loadIdentity(identityPath);
  const mode = config?.mode ?? resolveMode(identity);

  if (mode === 'off') return createNoopClient();

  const fullConfig: TelemetryClientConfig = {
    serverUrl: config?.serverUrl,
    mode,
    flushIntervalMs: config?.flushIntervalMs ?? 60_000,
    batchSize: config?.batchSize ?? 50,
    maxRetries: config?.maxRetries ?? 3,
    maxQueueSizeMb: config?.maxQueueSizeMb ?? 10,
    identityPath: config?.identityPath,
    queuePath: config?.queuePath,
  };

  let queue: TelemetryQueue;
  try {
    queue = await createQueue(fullConfig.queuePath);
  } catch {
    return createNoopClient();
  }

  let sender: TelemetrySender | null = null;
  const version = getVersion();

  return {
    track(event: TrackableEvent): void {
      try {
        const payload: TelemetryPayloadEvent = {
          event_id: randomUUID(),
          timestamp: Math.floor(Date.now() / 1000),
          version,
          ...event,
        };
        queue.enqueue(payload);
      } catch {
        // Never crash
      }
    },

    async enroll(serverUrl: string): Promise<void> {
      let current = identity ?? generateIdentity('verified');
      current = { ...current, mode: 'verified' };

      const url = serverUrl.replace(/\/+$/, '') + '/api/v1/telemetry/enroll';
      const response = await globalThis.fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          install_id: current.install_id,
          public_key: current.public_key,
          version,
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Enrollment failed (${response.status}): ${text}`);
      }

      const result = (await response.json()) as { ok: boolean; token: string };
      current.enrollment_token = result.token;
      current.enrolled_at = new Date().toISOString();

      saveIdentity(current, identityPath);
    },

    start(): void {
      if (sender) return;
      sender = createTelemetrySender(fullConfig, identity, queue);
      sender.start();
    },

    stop(): void {
      if (sender) {
        // Fire one last flush, but don't await it
        sender.flush().catch(() => {
          // Swallow
        });
        sender.stop();
        sender = null;
      }
      queue.close();
    },

    status(): TelemetryStatus {
      return {
        mode,
        installId: identity?.install_id ?? null,
        enrolled: !!identity?.enrollment_token,
        queueSize: queue.size(),
        queueSizeBytes: queue.sizeBytes(),
      };
    },

    reset(): void {
      if (sender) {
        sender.stop();
        sender = null;
      }
      queue.clear();
      queue.close();
      deleteIdentity(identityPath);

      // Also remove queue files
      const defaultQueueDir = join(homedir(), '.agentguard');
      for (const f of ['telemetry-queue.db', 'telemetry-queue.jsonl']) {
        try {
          unlinkSync(join(defaultQueueDir, f));
        } catch {
          // Ignore
        }
      }
    },
  };
}
