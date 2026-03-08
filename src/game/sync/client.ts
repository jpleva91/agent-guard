// Browser-side sync client
// Connects to the local BugMon sync server (started via `bugmon sync`)
//
// TODO(roadmap): Phase 7 — CLI ↔ browser sync for run state

import {
  SYNC_PORT,
  RECONNECT_INTERVAL,
  MAX_RECONNECT_ATTEMPTS,
  MSG_PULL_CLI_STATE,
  MSG_BROWSER_STATE,
  MSG_PONG,
  MSG_CLI_STATE,
  MSG_CLI_EVENT,
  MSG_PING,
} from '../../ecosystem/sync-protocol.js';

declare global {
  interface Window {
    bugmon?: {
      importFromCLI?: (data: unknown) => void;
    };
  }
}

const SYNC_URL = `ws://localhost:${SYNC_PORT}`;

let ws: WebSocket | null = null;
let connected = false;
let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let onSyncCallback: ((data: unknown) => void) | null = null;

export function initSyncClient(onSync?: (data: unknown) => void): void {
  onSyncCallback = onSync || null;
  attemptConnection();
}

export function getSyncStatus(): {
  connected: boolean;
  serverUrl: string;
  reconnectAttempts: number;
  hint: string;
} {
  return {
    connected,
    serverUrl: SYNC_URL,
    reconnectAttempts,
    hint: connected ? 'Synced with CLI' : 'Not connected. Run "bugmon sync" in your terminal.',
  };
}

export function pushToCLI(state: unknown): boolean {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  try {
    ws.send(JSON.stringify({ type: MSG_BROWSER_STATE, data: state }));
    return true;
  } catch {
    return false;
  }
}

export function pullFromCLI(): boolean {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  try {
    ws.send(JSON.stringify({ type: MSG_PULL_CLI_STATE }));
    return true;
  } catch {
    return false;
  }
}

function attemptConnection(): void {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return;

  try {
    ws = new WebSocket(SYNC_URL);
  } catch {
    return;
  }

  ws.onopen = () => {
    connected = true;
    reconnectAttempts = 0;
    console.log('[BugMon Sync] Connected to CLI sync server');
    pullFromCLI();
  };

  ws.onmessage = (event: MessageEvent) => {
    try {
      const msg = JSON.parse(event.data as string) as { type: string; data?: unknown; event?: string };
      handleMessage(msg);
    } catch {
      // Ignore malformed messages
    }
  };

  ws.onclose = () => {
    if (connected) {
      console.log('[BugMon Sync] Disconnected from CLI sync server');
    }
    connected = false;
    ws = null;
    scheduleReconnect();
  };

  ws.onerror = () => {
    // Silently handle — onclose will fire after this
  };
}

function handleMessage(msg: { type: string; data?: unknown; event?: string }): void {
  switch (msg.type) {
    case MSG_CLI_STATE: {
      console.log('[BugMon Sync] Received CLI state');
      if (onSyncCallback) {
        onSyncCallback(msg.data);
      } else if (window.bugmon?.importFromCLI) {
        window.bugmon.importFromCLI(msg.data);
      }
      break;
    }
    case MSG_CLI_EVENT: {
      console.log(`[BugMon Sync] CLI event: ${msg.event}`);
      if (msg.event === 'bugmon_cached' && window.bugmon?.importFromCLI) {
        window.bugmon.importFromCLI(msg.data);
      }
      break;
    }
    case MSG_PING: {
      if (ws) ws.send(JSON.stringify({ type: MSG_PONG }));
      break;
    }
  }
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  reconnectAttempts++;

  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return;

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    attemptConnection();
  }, RECONNECT_INTERVAL);
}
