// BugMon — Entry point and game loop
// Primary mode: Idle auto-dungeon runner (replaces manual exploration)

import { initRenderer, drawMap, drawPlayer, drawGrimoire, clear } from './engine/game-renderer.js';
import { clearJustPressed, simulatePress, simulateRelease, wasPressed } from './engine/input.js';
import { getState, setState, STATES } from './engine/state.js';
import { getMap } from './world/map.js';
import { getPlayer, updatePlayer } from './world/player.js';
import { checkEncounter } from './world/encounters.js';
import { startBattle, getBattle, updateBattle, movesData } from './battle/battle-engine.js';
import { startTransition, updateTransition, drawTransitionOverlay } from './engine/transition.js';
import { clearPendingEvolution, getEvolutionProgress } from './evolution/evolution.js';
import {
  updateEvolutionAnimation,
  drawEvolutionAnimation,
  clearEvolutionAnimation,
} from './evolution/animation.js';
import { saveGame, loadGame, applySave, recordBrowserCache } from './sync/save.js';
import { eventBus, Events } from './engine/events.js';
import { updateTitle, drawTitle } from './engine/title.js';
import { unlock, toggleMute, playMenuCancel } from './audio/sound.js';
import { loadGameData } from './data-loader.js';
import { CANVAS_W, CANVAS_H } from './theme.js';
import { setGrimoireScroll, resetGrimoireScroll, drawBattle, drawRunHUD, drawIdleOverlay } from './engine/game-renderer.js';
import { updateEffects } from './engine/effects.js';

// Dungeon runner imports
import { createRun, updateRunner, isRunOver, setRunnerMonsters } from './dungeon/runner.js';
import { drawDungeon } from './dungeon/dungeon-renderer.js';
import { loadLoot } from './dungeon/loot.js';
import type { RunnerState } from './dungeon/runner.js';

import type { LoadedGameData } from './data-loader.js';
import type { GameMon } from './world/player.js';
import type { TitleResult } from './engine/title.js';

// Re-export for inline script in index.html
export { simulatePress, simulateRelease, unlock, toggleMute };

interface MonsterData extends GameMon {
  sprite?: string;
}

interface TypesData {
  effectiveness?: Record<string, Record<string, number>>;
  typeColors?: Record<string, string>;
  [key: string]: unknown;
}

let lastTime = 0;
let saveTimer = 0;
const AUTO_SAVE_INTERVAL = 30000;

let MONSTERS: MonsterData[] = [];
let TYPES: TypesData = {};

// ── Dungeon runner state ─────────────────────────────────────────────────
let runnerState: RunnerState | null = null;

// ── Grimoire tracking ────────────────────────────────────────────────────
let discoveredIds: Set<number> = new Set();

function loadDiscovered(): Set<number> {
  try {
    const stored = localStorage.getItem('bugmon_grimoire');
    if (stored) return new Set(JSON.parse(stored) as number[]);
  } catch {
    /* ignore */
  }
  return new Set();
}

function saveDiscovered(): void {
  try {
    localStorage.setItem('bugmon_grimoire', JSON.stringify([...discoveredIds]));
  } catch {
    /* ignore */
  }
}

function discoverMon(id: number): void {
  if (!discoveredIds.has(id)) {
    discoveredIds.add(id);
    saveDiscovered();
  }
}

// ── Init ─────────────────────────────────────────────────────────────────

export async function init(canvas: HTMLCanvasElement): Promise<void> {
  initRenderer(canvas);

  const data: LoadedGameData = await loadGameData();
  MONSTERS = data.monsters as MonsterData[];
  TYPES = data.types as TypesData;

  // Setup dungeon runner with monster data
  setRunnerMonsters(MONSTERS);
  loadLoot();
  discoveredIds = loadDiscovered();

  const player = getPlayer();
  const savedState = loadGame();
  if (savedState) {
    applySave(player, savedState);
  } else {
    const starter = { ...MONSTERS[0], currentHP: MONSTERS[0].hp } as GameMon;
    player.party.push(starter);
  }

  for (const mon of player.party) discoverMon(mon.id);

  eventBus.on(Events.BATTLE_ENDED, () => autoSave());
  eventBus.on(Events.CACHE_SUCCESS, (evtData) => {
    const mon = MONSTERS.find((m) => m.name === evtData.name);
    if (mon) {
      recordBrowserCache(mon);
      discoverMon(mon.id);
    }
  });

  requestAnimationFrame(loop);
}

function autoSave(): void {
  saveGame(getPlayer());
}

// ── Game loop ────────────────────────────────────────────────────────────

function loop(timestamp: number): void {
  const dt = timestamp - lastTime;
  lastTime = timestamp;

  update(dt);
  render();
  clearJustPressed();

  requestAnimationFrame(loop);
}

function update(dt: number): void {
  const state = getState();

  updateEffects(dt);

  saveTimer += dt;
  if (saveTimer >= AUTO_SAVE_INTERVAL && state === STATES.EXPLORE) {
    autoSave();
    saveTimer = 0;
  }

  if (state === STATES.TITLE) {
    const result: TitleResult = updateTitle(dt);
    if (result === 'continue' || result === 'new') {
      // Start dungeon run (primary mode)
      const player = getPlayer();
      if (result === 'new' && player.party.length === 0) {
        const starter = { ...MONSTERS[0], currentHP: MONSTERS[0].hp } as GameMon;
        player.party.push(starter);
      }
      const lead = player.party[0] || MONSTERS[0];
      runnerState = createRun(lead);
      setState(STATES.DUNGEON);
    } else if (result === 'grimoire') {
      resetGrimoireScroll();
      setState(STATES.GRIMOIRE);
    }
  } else if (state === STATES.DUNGEON) {
    if (runnerState) {
      const up = wasPressed('ArrowUp');
      const down = wasPressed('ArrowDown');
      const confirm = wasPressed('Enter') || wasPressed(' ');

      runnerState = updateRunner(runnerState, dt, up, down, confirm);

      // Discover defeated enemies
      if (runnerState.encounterEnemy === null && runnerState.defeated > 0) {
        // We discover enemies as they're defeated via the event log
      }

      // Handle run over → return to title on confirm
      if (isRunOver(runnerState) && confirm) {
        runnerState = null;
        setState(STATES.TITLE);
      }
    }
  } else if (state === STATES.EXPLORE) {
    // Legacy explore mode (kept for compatibility)
    const tile = updatePlayer(dt);
    if (tile !== null) {
      const wildMon = checkEncounter(tile);
      if (wildMon) {
        setState(STATES.BATTLE_TRANSITION);
        startTransition(wildMon);
      }
    }
  } else if (state === STATES.BATTLE_TRANSITION) {
    const wildMon = updateTransition(dt);
    if (wildMon) {
      setState(STATES.BATTLE);
      startBattle(wildMon as GameMon);
    }
  } else if (state === STATES.BATTLE) {
    updateBattle(dt);
  } else if (state === STATES.EVOLVING) {
    const done = updateEvolutionAnimation(dt);
    if (done) {
      clearEvolutionAnimation();
      clearPendingEvolution();
      setState(STATES.EXPLORE);
    }
  } else if (state === STATES.GRIMOIRE) {
    if (wasPressed('Escape') || wasPressed('Backspace')) {
      playMenuCancel();
      setState(STATES.TITLE);
    }
    if (wasPressed('ArrowUp')) setGrimoireScroll(-1);
    if (wasPressed('ArrowDown')) setGrimoireScroll(1);
  }
}

function render(): void {
  clear();
  const state = getState();
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;

  if (state === STATES.TITLE) {
    drawTitle(ctx);
  } else if (state === STATES.DUNGEON) {
    if (runnerState) {
      const dt = lastTime > 0 ? 16 : 0; // approximate frame dt for renderer
      drawDungeon(ctx, runnerState, dt);
    }
  } else if (state === STATES.EXPLORE) {
    drawMap(getMap());
    drawPlayer(getPlayer());
    const player = getPlayer();
    const mon = player.party[0];
    const evoProgress = getEvolutionProgress(mon);
    drawRunHUD({
      monName: mon.name,
      currentHP: mon.currentHP,
      maxHP: mon.hp,
      partySize: player.party.length,
      runNumber: 1,
      evoProgress,
    });
    drawIdleOverlay();
  } else if (state === STATES.BATTLE_TRANSITION) {
    drawTransitionOverlay(ctx, CANVAS_W, CANVAS_H, () => {
      drawMap(getMap());
      drawPlayer(getPlayer());
    });
  } else if (state === STATES.BATTLE) {
    const battle = getBattle();
    if (battle) drawBattle(battle, movesData, TYPES.typeColors);
  } else if (state === STATES.EVOLVING) {
    drawEvolutionAnimation(ctx, CANVAS_W, CANVAS_H);
  } else if (state === STATES.GRIMOIRE) {
    const entries = MONSTERS.map((m) => ({
      id: m.id,
      name: m.name,
      type: m.type,
      color: m.color,
      sprite: m.sprite,
      discovered: discoveredIds.has(m.id),
    }));
    drawGrimoire(entries, discoveredIds);
  }
}

// Auto-initialize when loaded in browser
if (typeof document !== 'undefined') {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  if (canvas) {
    init(canvas).catch((err: unknown) => console.error('BugMon failed to start:', err));
  }
}
