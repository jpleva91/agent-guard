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

    toNDJSON(): string {
      const allEvents = loadAllEvents();
      return allEvents.map((e) => JSON.stringify(e)).join('\n');
    },

    fromNDJSON(ndjson: string): number {
      const lines = ndjson.split('\n').filter((line) => line.trim().length > 0);
      let loaded = 0;
      ensureDir();
      for (const line of lines) {
        const parsed = JSON.parse(line) as DomainEvent;
        appendFileSync(sessionFileName(sid), JSON.stringify(parsed) + '\n', 'utf8');
        loaded++;
      }
      return loaded;
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

/** Metadata header written as the first line of an exported session file. */
export interface ExportHeader {
  readonly __agentguard_export: true;
  readonly version: 1;
  readonly sessionId: string;
  readonly exportedAt: number;
  readonly eventCount: number;
}

/**
 * Export a session to a portable JSONL file for sharing.
 * The first line is a metadata header; subsequent lines are domain events.
 * Returns the number of events exported.
 */
export function exportSession(sessionId: string, outputPath: string): number {
  const events = loadSession(sessionId);
  if (events.length === 0) {
    throw new Error(`Session "${sessionId}" has no events to export`);
  }

  const header: ExportHeader = {
    __agentguard_export: true,
    version: 1,
    sessionId,
    exportedAt: Date.now(),
    eventCount: events.length,
  };

  const lines = [JSON.stringify(header), ...events.map((e) => JSON.stringify(e))];
  writeFileSync(outputPath, lines.join('\n') + '\n', 'utf8');
  return events.length;
}

/**
 * Import a session from a portable JSONL file.
 * Validates the export header and each event before writing.
 * Returns the sessionId and number of events imported.
 */
export function importSession(
  inputPath: string,
  targetSessionId?: string
): { sessionId: string; eventCount: number } {
  if (!existsSync(inputPath)) {
    throw new Error(`Import file not found: ${inputPath}`);
  }

  const content = readFileSync(inputPath, 'utf8');
  const lines = content.split('\n').filter((l: string) => l.trim());
  if (lines.length === 0) {
    throw new Error('Import file is empty');
  }

  // Parse and validate the metadata header
  let header: Record<string, unknown>;
  try {
    header = JSON.parse(lines[0]) as Record<string, unknown>;
  } catch {
    throw new Error('Import file has an invalid header line');
  }

  if (header.__agentguard_export !== true || header.version !== 1) {
    throw new Error('Import file is not a valid AgentGuard export (missing or invalid header)');
  }

  const sessionId = targetSessionId || (header.sessionId as string);
  if (!sessionId) {
    throw new Error('No sessionId found in export header and none provided');
  }

  // Parse and validate events from remaining lines
  const events: DomainEvent[] = [];
  for (let i = 1; i < lines.length; i++) {
    try {
      const parsed = JSON.parse(lines[i]) as Record<string, unknown>;
      const { valid } = validateEvent(parsed) as ValidationResult;
      if (valid) {
        events.push(parsed as unknown as DomainEvent);
      }
    } catch {
      // Skip malformed lines
    }
  }

  if (events.length === 0) {
    throw new Error('Import file contains no valid events');
  }

  // Write events to the target session file
  ensureDir();
  const eventLines = events.map((e) => JSON.stringify(e)).join('\n') + '\n';
  appendFileSync(sessionFileName(sessionId), eventLines, 'utf8');

  return { sessionId, eventCount: events.length };
}
