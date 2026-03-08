// BugMon Sync Server — bridges CLI and browser game
// Uses Node.js built-in http + WebSocket (no external dependencies)

import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { loadBugDex, saveBugDex } from '../ecosystem/storage.js';
import {
  SYNC_PORT,
  PING_INTERVAL,
  MSG_PULL_CLI_STATE,
  MSG_BROWSER_STATE,
  MSG_PONG,
  MSG_CLI_STATE,
  MSG_CLI_EVENT,
  MSG_PING,
} from '../ecosystem/sync-protocol.js';
import type { Socket } from 'node:net';

const PORT = SYNC_PORT;
const WS_MAGIC = '258EAFA5-E914-47DA-95CA-5AB9FE82957E';

interface WSClient {
  socket: Socket;
  alive: boolean;
}

interface WSMessage {
  type: string;
  data?: Record<string, unknown>;
  event?: string;
}

interface SyncServerResult {
  server: ReturnType<typeof createServer>;
  port: number;
  clients: Set<WSClient>;
  broadcast: (msg: WSMessage) => void;
  stop: () => void;
}

export function startSyncServer(): Promise<SyncServerResult> {
  const clients = new Set<WSClient>();

  const server = createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.url === '/api/state' && req.method === 'GET') {
      const state = getCLIState();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(state));
      return;
    }

    if (req.url === '/api/state' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk: Buffer) => {
        body += chunk;
      });
      req.on('end', () => {
        try {
          const browserState = JSON.parse(body) as Record<string, unknown>;
          mergeBrowserState(browserState);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch {
          res.writeHead(400);
          res.end('Invalid JSON');
        }
      });
      return;
    }

    if (req.url === '/api/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          server: 'bugmon-sync',
          version: 1,
          clients: clients.size,
          uptime: process.uptime(),
        }),
      );
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  server.on('upgrade', (req, socket: Socket) => {
    if (req.headers.upgrade?.toLowerCase() !== 'websocket') {
      socket.destroy();
      return;
    }

    const key = req.headers['sec-websocket-key'];
    if (!key) {
      socket.destroy();
      return;
    }

    const accept = createHash('sha1')
      .update(key + WS_MAGIC)
      .digest('base64');

    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n` +
        '\r\n',
    );

    const client: WSClient = { socket, alive: true };
    clients.add(client);

    process.stderr.write(
      `  \x1b[32m✓\x1b[0m Browser connected (${clients.size} client${clients.size > 1 ? 's' : ''})\n`,
    );

    sendToClient(client, { type: MSG_CLI_STATE, data: getCLIState() });

    socket.on('data', (buffer: Buffer) => {
      const frames = decodeFrames(buffer);
      for (const frame of frames) {
        if (frame.opcode === 0x8) {
          clients.delete(client);
          socket.end();
          return;
        }
        if (frame.opcode === 0xa) {
          client.alive = true;
          continue;
        }
        if (frame.opcode === 0x1 && frame.payload) {
          try {
            const msg = JSON.parse(frame.payload as string) as WSMessage;
            handleClientMessage(client, msg);
          } catch {
            /* ignore malformed */
          }
        }
      }
    });

    socket.on('close', () => {
      clients.delete(client);
      process.stderr.write(
        `  \x1b[33m⚡\x1b[0m Browser disconnected (${clients.size} client${clients.size > 1 ? 's' : ''})\n`,
      );
    });

    socket.on('error', () => {
      clients.delete(client);
    });
  });

  const pingTimer = setInterval(() => {
    for (const client of clients) {
      if (!client.alive) {
        clients.delete(client);
        client.socket.destroy();
        continue;
      }
      client.alive = false;
      sendToClient(client, { type: MSG_PING });
    }
  }, PING_INTERVAL);

  return new Promise((resolve, reject) => {
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`Port ${PORT} already in use. Is another sync server running?`));
      } else {
        reject(err);
      }
    });

    server.listen(PORT, '127.0.0.1', () => {
      resolve({
        server,
        port: PORT,
        clients,
        broadcast: (msg: WSMessage) => {
          for (const client of clients) {
            sendToClient(client, msg);
          }
        },
        stop: () => {
          clearInterval(pingTimer);
          for (const client of clients) {
            client.socket.destroy();
          }
          clients.clear();
          server.close();
        },
      });
    });
  });
}

function handleClientMessage(client: WSClient, msg: WSMessage): void {
  switch (msg.type) {
    case MSG_PULL_CLI_STATE: {
      sendToClient(client, { type: MSG_CLI_STATE, data: getCLIState() });
      break;
    }
    case MSG_BROWSER_STATE: {
      if (msg.data) {
        mergeBrowserState(msg.data);
        process.stderr.write('  \x1b[36m↓\x1b[0m Received browser state\n');
      }
      break;
    }
    case MSG_PONG: {
      client.alive = true;
      break;
    }
  }
}

function getCLIState(): Record<string, unknown> {
  const dex = loadBugDex() as Record<string, unknown>;
  return {
    party: (dex.party as unknown[]) || [],
    storage: (dex.storage as unknown[]) || [],
    seen: dex.seen || {},
    stats: dex.stats || {},
    encounters: ((dex.encounters as unknown[]) || []).slice(-20),
  };
}

function mergeBrowserState(browserState: Record<string, unknown>): void {
  if (!browserState) return;
  const dex = loadBugDex() as Record<string, unknown>;

  const bugdex = browserState.bugdex as Record<string, unknown> | undefined;
  if (bugdex?.seen) {
    const dexSeen = dex.seen as Record<string, number>;
    for (const [id, count] of Object.entries(bugdex.seen as Record<string, number>)) {
      dexSeen[id] = Math.max(dexSeen[id] || 0, count);
    }
  }

  if (bugdex?.storage) {
    if (!dex.storage) dex.storage = [];
    const storage = dex.storage as Array<{ id: unknown }>;
    const existingIds = new Set(storage.map((m) => `${m.id}`));
    for (const mon of bugdex.storage as Array<{ id: unknown }>) {
      if (!existingIds.has(`${mon.id}`)) {
        storage.push(mon);
      }
    }
  }

  if (bugdex?.stats) {
    const bs = bugdex.stats as Record<string, number>;
    const stats = dex.stats as Record<string, number>;
    stats.totalEncounters = Math.max(stats.totalEncounters || 0, bs.totalEncounters || 0);
    stats.totalCached = Math.max(
      stats.totalCached || stats.totalCaught || 0,
      bs.totalCached || 0,
    );
    stats.xp = Math.max(stats.xp || 0, bs.xp || 0);
  }

  saveBugDex(dex as Parameters<typeof saveBugDex>[0]);
}

// ── WebSocket frame encoding/decoding (RFC 6455) ──

interface WSFrame {
  opcode: number;
  payload: string | Buffer;
}

function encodeFrame(data: string): Buffer {
  const payload = Buffer.from(data, 'utf8');
  const len = payload.length;

  let header: Buffer;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81;
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }

  return Buffer.concat([header, payload]);
}

function decodeFrames(buffer: Buffer): WSFrame[] {
  const frames: WSFrame[] = [];
  let offset = 0;

  while (offset < buffer.length) {
    if (offset + 2 > buffer.length) break;

    const byte0 = buffer[offset];
    const byte1 = buffer[offset + 1];
    const opcode = byte0 & 0x0f;
    const masked = (byte1 & 0x80) !== 0;
    let payloadLen = byte1 & 0x7f;
    offset += 2;

    if (payloadLen === 126) {
      if (offset + 2 > buffer.length) break;
      payloadLen = buffer.readUInt16BE(offset);
      offset += 2;
    } else if (payloadLen === 127) {
      if (offset + 8 > buffer.length) break;
      payloadLen = Number(buffer.readBigUInt64BE(offset));
      offset += 8;
    }

    let maskKey: Buffer | null = null;
    if (masked) {
      if (offset + 4 > buffer.length) break;
      maskKey = buffer.subarray(offset, offset + 4);
      offset += 4;
    }

    if (offset + payloadLen > buffer.length) break;

    let payload: Buffer = buffer.subarray(offset, offset + payloadLen);
    if (masked && maskKey) {
      payload = Buffer.from(payload);
      for (let i = 0; i < payload.length; i++) {
        payload[i] ^= maskKey[i % 4];
      }
    }

    frames.push({
      opcode,
      payload: opcode === 0x1 ? payload.toString('utf8') : payload,
    });

    offset += payloadLen;
  }

  return frames;
}

function sendToClient(client: WSClient, msg: WSMessage): void {
  try {
    const frame = encodeFrame(JSON.stringify(msg));
    client.socket.write(frame);
  } catch {
    /* client may have disconnected */
  }
}

export function notifyBrowsers(
  broadcast: (msg: WSMessage) => void,
  event: string,
  _data: unknown,
): void {
  broadcast({ type: MSG_CLI_EVENT, event, data: getCLIState() });
}
