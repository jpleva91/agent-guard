// Shared WebSocket sync protocol constants
// Used by both CLI sync-server and browser sync client.

export const SYNC_PORT = 9876;

export const MSG_PULL_CLI_STATE = 'pull_cli_state';
export const MSG_BROWSER_STATE = 'browser_state';
export const MSG_PONG = 'pong';

export const MSG_CLI_STATE = 'cli_state';
export const MSG_CLI_EVENT = 'cli_event';
export const MSG_PING = 'ping';

export const PING_INTERVAL = 15000;
export const RECONNECT_INTERVAL = 5000;
export const MAX_RECONNECT_ATTEMPTS = 12;
