// Auto-walk system — emits walk events while CLI watcher is running

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const SESSION_PATH = join(homedir(), '.bugmon', 'session.json');

const DIRECTIONS = ['up', 'down', 'left', 'right'] as const;
type Direction = (typeof DIRECTIONS)[number];

const MAP_WIDTH = 15;
const MAP_HEIGHT = 10;

interface MapData {
  width: number;
  height: number;
  tiles: number[][] | null;
}

interface SessionState {
  active: boolean;
  mode: string;
  startedAt: string;
  player: { x: number; y: number; dir: Direction };
  steps: number;
  encounters: number;
  paused: boolean;
}

interface StepEvent {
  x: number;
  y: number;
  dir: Direction;
  tile: number;
}

interface AutoWalkOptions {
  stepInterval?: number;
  onStep?: (event: StepEvent) => void;
  onEncounter?: (event: { x: number; y: number; tile: number }) => void;
}

export interface AutoWalkControls {
  stop(): void;
  pause(): void;
  resume(): void;
  getState(): SessionState;
}

let mapData: MapData | null = null;
let walkInterval: ReturnType<typeof setInterval> | null = null;
let sessionState: SessionState | null = null;

function loadMap(): MapData {
  if (mapData) return mapData;
  try {
    const dataPath = join(import.meta.dirname || '.', '..', '..', 'ecosystem', 'data', 'map.json');
    mapData = JSON.parse(readFileSync(dataPath, 'utf8')) as MapData;
  } catch {
    mapData = { width: MAP_WIDTH, height: MAP_HEIGHT, tiles: null };
  }
  return mapData;
}

function isWalkable(x: number, y: number): boolean {
  const map = loadMap();
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return false;
  if (!map.tiles) return true;
  const tile = map.tiles[y]?.[x];
  return tile !== 1;
}

function getTile(x: number, y: number): number {
  const map = loadMap();
  if (!map.tiles) return 0;
  return map.tiles[y]?.[x] ?? 0;
}

export function startAutoWalk(options: AutoWalkOptions = {}): AutoWalkControls {
  const interval = options.stepInterval || 800;

  sessionState = {
    active: true,
    mode: 'auto-walk',
    startedAt: new Date().toISOString(),
    player: { x: 1, y: 1, dir: 'down' },
    steps: 0,
    encounters: 0,
    paused: false,
  };

  writeSession(sessionState);

  walkInterval = setInterval(() => {
    if (!sessionState || sessionState.paused) return;

    const { x, y } = sessionState.player;

    let dir = sessionState.player.dir;
    if (Math.random() < 0.3) {
      dir = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
    }

    const dx = dir === 'left' ? -1 : dir === 'right' ? 1 : 0;
    const dy = dir === 'up' ? -1 : dir === 'down' ? 1 : 0;
    const nx = x + dx;
    const ny = y + dy;

    if (isWalkable(nx, ny)) {
      sessionState.player.x = nx;
      sessionState.player.y = ny;
      sessionState.player.dir = dir;
      sessionState.steps++;

      const tile = getTile(nx, ny);

      if (options.onStep) {
        options.onStep({ x: nx, y: ny, dir, tile });
      }

      if (tile === 2 && Math.random() < 0.1) {
        sessionState.encounters++;
        if (options.onEncounter) {
          options.onEncounter({ x: nx, y: ny, tile });
        }
      }
    } else {
      sessionState.player.dir = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
    }

    writeSession(sessionState);
  }, interval);

  return {
    stop() {
      if (walkInterval) clearInterval(walkInterval);
      walkInterval = null;
      if (sessionState) {
        sessionState.active = false;
        writeSession(sessionState);
      }
    },
    pause() {
      if (sessionState) {
        sessionState.paused = true;
        writeSession(sessionState);
      }
    },
    resume() {
      if (sessionState) {
        sessionState.paused = false;
        writeSession(sessionState);
      }
    },
    getState() {
      return { ...sessionState! };
    },
  };
}

export function readSession(): SessionState | null {
  if (!existsSync(SESSION_PATH)) return null;
  try {
    return JSON.parse(readFileSync(SESSION_PATH, 'utf8')) as SessionState;
  } catch {
    return null;
  }
}

function writeSession(state: SessionState): void {
  try {
    writeFileSync(SESSION_PATH, JSON.stringify(state, null, 2), 'utf8');
  } catch {
    // Best effort
  }
}
