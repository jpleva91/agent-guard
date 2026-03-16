// AgentEvent JSONL-backed queue — file-persisted FIFO queue for AgentEvent payloads.

import {
  mkdirSync,
  appendFileSync,
  readFileSync,
  writeFileSync,
  existsSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';
import type { AgentEvent } from './event-mapper.js';

const QUEUE_FILENAME = 'agent-event-queue.jsonl';

// ---------------------------------------------------------------------------
// AgentEventQueue interface
// ---------------------------------------------------------------------------

export interface AgentEventQueue {
  enqueue(event: AgentEvent): void;
  dequeue(count: number): AgentEvent[];
  size(): number;
  sizeBytes(): number;
  clear(): void;
  close(): void;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createAgentEventQueue(dir: string): AgentEventQueue {
  mkdirSync(dir, { recursive: true });

  const filePath = join(dir, QUEUE_FILENAME);

  // Load existing events from disk (if any)
  let events: AgentEvent[] = [];

  if (existsSync(filePath)) {
    const content = readFileSync(filePath, 'utf-8').trim();
    if (content.length > 0) {
      events = content.split('\n').map((line) => JSON.parse(line) as AgentEvent);
    }
  }

  function flush(): void {
    if (events.length === 0) {
      writeFileSync(filePath, '');
      return;
    }
    const content = events.map((e) => JSON.stringify(e)).join('\n') + '\n';
    writeFileSync(filePath, content);
  }

  const queue: AgentEventQueue = {
    enqueue(event: AgentEvent): void {
      events.push(event);
      appendFileSync(filePath, JSON.stringify(event) + '\n');
    },

    dequeue(count: number): AgentEvent[] {
      const batch = events.splice(0, count);
      flush();
      return batch;
    },

    size(): number {
      return events.length;
    },

    sizeBytes(): number {
      if (!existsSync(filePath)) {
        return 0;
      }
      return statSync(filePath).size;
    },

    clear(): void {
      events = [];
      writeFileSync(filePath, '');
    },

    close(): void {
      flush();
    },
  };

  return queue;
}
