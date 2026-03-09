// File-based event store — persists domain events to ~/.agentguard/events/
// Implements the EventStore interface from src/domain/event-store.ts
// Each session gets its own JSONL file for efficient append-only writes.

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
  appendFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { DomainEvent, EventFilter, EventStore } from '../core/types.js';
import { validateEvent } from '../events/schema.js';
import type { ValidationResult } from '../core/types.js';

const EVENTS_DIR = join(homedir(), '.agentguard', 'events');

function ensureDir(): void {
  if (!existsSync(EVENTS_DIR)) {
    mkdirSync(EVENTS_DIR, { recursive: true });
  }
}

function sessionFileName(sessionId: string): string {
  return join(EVENTS_DIR, `${sessionId}.jsonl`);
}

/**
 * Create a file-based event store.
 * Events are persisted as newline-delimited JSON (JSONL) files.
 * Each session gets its own file for efficient append operations.
 */
export function createFileEventStore(sessionId?: string): EventStore & { sessionId: string } {
  const sid = sessionId || `session_${Date.now()}`;
  ensureDir();

  return {
    sessionId: sid,

    append(event: DomainEvent): void {
      const { valid, errors } = validateEvent(
        event as unknown as Record<string, unknown>
      ) as ValidationResult;
      if (!valid) {
        throw new Error(`Cannot append invalid event: ${errors.join('; ')}`);
      }
      ensureDir();
      appendFileSync(sessionFileName(sid), JSON.stringify(event) + '\n', 'utf8');
    },

    query(filter: EventFilter = {}): DomainEvent[] {
      const allEvents = loadAllEvents();
      let result = allEvents;
      if (filter.kind) {
        result = result.filter((e) => e.kind === filter.kind);
      }
      if (filter.since !== undefined) {
        result = result.filter((e) => e.timestamp >= filter.since!);
      }
      if (filter.until !== undefined) {
        result = result.filter((e) => e.timestamp <= filter.until!);
      }
      if (filter.fingerprint) {
        result = result.filter((e) => e.fingerprint === filter.fingerprint);
      }
      return result;
    },

    replay(fromId?: string): DomainEvent[] {
      const allEvents = loadAllEvents();
      if (!fromId) return allEvents;
      const idx = allEvents.findIndex((e) => e.id === fromId);
      if (idx === -1) return [];
      return allEvents.slice(idx);
    },

    count(): number {
      return loadAllEvents().length;
    },

    clear(): void {
      const filePath = sessionFileName(sid);
      if (existsSync(filePath)) {
        writeFileSync(filePath, '', 'utf8');
      }
    },
  };
}

/**
 * Load all events from all session files, sorted by timestamp.
 */
function loadAllEvents(): DomainEvent[] {
  ensureDir();
  const events: DomainEvent[] = [];

  const files = readdirSync(EVENTS_DIR).filter((f: string) => f.endsWith('.jsonl'));
  for (const file of files) {
    const filePath = join(EVENTS_DIR, file);
    try {
      const content = readFileSync(filePath, 'utf8');
      for (const line of content.split('\n')) {
        if (!line.trim()) continue;
        try {
          events.push(JSON.parse(line) as DomainEvent);
        } catch {
          // Skip malformed lines
        }
      }
    } catch {
      // Skip unreadable files
    }
  }

  events.sort((a, b) => a.timestamp - b.timestamp);
  return events;
}

/**
 * List all session IDs that have stored events.
 */
export function listSessions(): string[] {
  ensureDir();
  return readdirSync(EVENTS_DIR)
    .filter((f: string) => f.endsWith('.jsonl'))
    .map((f: string) => f.replace('.jsonl', ''));
}

/**
 * Load events from a specific session.
 */
export function loadSession(sessionId: string): DomainEvent[] {
  const filePath = sessionFileName(sessionId);
  if (!existsSync(filePath)) return [];

  const events: DomainEvent[] = [];
  const content = readFileSync(filePath, 'utf8');
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line) as DomainEvent);
    } catch {
      // Skip malformed lines
    }
  }
  return events;
}
