// File-backed session store — persists event streams to ~/.bugmon/sessions/
// Each session is a JSON file with metadata + ordered events.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const BUGMON_DIR = join(homedir(), '.bugmon');
const SESSIONS_DIR = join(BUGMON_DIR, 'sessions');

function ensureDir(): void {
  if (!existsSync(SESSIONS_DIR)) {
    mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}

function generateSessionId(): string {
  const ts = Math.floor(Date.now() / 1000);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${ts}-${rand}`;
}

interface SessionMeta {
  command?: string;
  repo?: string;
}

interface SessionEvent {
  kind?: string;
  timestamp?: number;
  [key: string]: unknown;
}

interface SessionData {
  id: string;
  startedAt: string;
  command: string | null;
  repo: string | null;
  events: SessionEvent[];
  summary: Record<string, unknown> | null;
  endedAt: string | null;
}

export interface SessionWriter {
  id: string;
  path: string;
  append(event: SessionEvent): void;
  end(summary?: Record<string, unknown>): void;
}

export function createSession(meta: SessionMeta = {}): SessionWriter {
  ensureDir();
  const id = generateSessionId();
  const filePath = join(SESSIONS_DIR, `${id}.json`);

  const session: SessionData = {
    id,
    startedAt: new Date().toISOString(),
    command: meta.command || null,
    repo: meta.repo || null,
    events: [],
    summary: null,
    endedAt: null,
  };

  writeFileSync(filePath, JSON.stringify(session, null, 2), 'utf8');

  return {
    id,
    path: filePath,

    append(event: SessionEvent) {
      session.events.push(event);
      writeFileSync(filePath, JSON.stringify(session, null, 2), 'utf8');
    },

    end(summary: Record<string, unknown> = {}) {
      session.endedAt = new Date().toISOString();
      session.summary = {
        totalEvents: session.events.length,
        duration: Date.now() - new Date(session.startedAt).getTime(),
        ...summary,
      };
      writeFileSync(filePath, JSON.stringify(session, null, 2), 'utf8');
    },
  };
}

export function loadSession(idOrPath: string): SessionData | null {
  ensureDir();

  let filePath: string;
  if (existsSync(idOrPath)) {
    filePath = idOrPath;
  } else {
    filePath = join(SESSIONS_DIR, `${idOrPath}.json`);
  }

  if (!existsSync(filePath)) return null;

  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as SessionData;
  } catch {
    return null;
  }
}

interface SessionListEntry {
  id: string;
  startedAt: string;
  endedAt: string | null;
  command: string | null;
  eventCount: number;
  summary: Record<string, unknown> | null;
}

export function listSessions(limit = 20): SessionListEntry[] {
  ensureDir();

  const files = readdirSync(SESSIONS_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .reverse()
    .slice(0, limit);

  const sessions: SessionListEntry[] = [];
  for (const file of files) {
    try {
      const data = JSON.parse(readFileSync(join(SESSIONS_DIR, file), 'utf8')) as SessionData;
      sessions.push({
        id: data.id,
        startedAt: data.startedAt,
        endedAt: data.endedAt || null,
        command: data.command,
        eventCount: data.events ? data.events.length : 0,
        summary: data.summary,
      });
    } catch {
      // Skip corrupt files
    }
  }

  return sessions;
}
