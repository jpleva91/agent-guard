// BugMon - Entry point and game loop
//
// TODO(roadmap/phase-7): Add roguelike dungeon renderer (procedural floor layouts)
// TODO(roadmap/phase-7): Add run-based browser gameplay (session → run mapping)
// TODO(roadmap/phase-7): Add idle encounter log in browser UI
// TODO(roadmap/phase-7): Add Bug Grimoire browser UI
import { initRenderer, drawMap, drawPlayer, drawBattle, clear } from './engine/renderer.js';
import { clearJustPressed } from './engine/input.js';
import { getState, setState, STATES } from './engine/state.js';
import { getMap } from './world/map.js';
import { getPlayer, updatePlayer } from './world/player.js';
import { setMonstersData, checkEncounter } from './world/encounters.js';
import {
  setMovesData,
  setTypeData,
  startBattle,
  getBattle,
  updateBattle,
  movesData,
} from './battle/battleEngine.js';
import { preloadAll } from './sprites/sprites.js';
import { initTileTextures } from './sprites/tiles.js';
import { MONSTERS } from '../ecosystem/data/monsters.js';
import { MOVES } from '../ecosystem/data/moves.js';
import { TYPES } from '../ecosystem/data/types.js';
import { EVOLUTIONS } from '../ecosystem/data/evolutions.js';
import { startTransition, updateTransition, drawTransitionOverlay } from './engine/transition.js';
import { initTracker } from './evolution/tracker.js';
import {
  setEvolutionData,
  setMonstersDataForEvolution,
  clearPendingEvolution,
  getEvolutionProgress,
} from './evolution/evolution.js';
import {
  startEvolutionAnimation,
  updateEvolutionAnimation,
  drawEvolutionAnimation,
  clearEvolutionAnimation,
} from './evolution/animation.js';
import { saveGame, loadGame, applySave, hasSave, recordBrowserCache } from './sync/save.js';
import { eventBus, Events } from './engine/events.js';
import { updateTitle, drawTitle } from './engine/title.js';

let lastTime = 0;
let saveTimer = 0;
const AUTO_SAVE_INTERVAL = 30000; // Auto-save every 30 seconds

async function init() {
  const canvas = document.getElementById('game');
  initRenderer(canvas);

  // Wire up data modules (inlined from JSON — no fetch overhead)
  setMonstersData(MONSTERS);
  setMovesData(MOVES);
  setTypeData(TYPES);
  setEvolutionData(EVOLUTIONS);
  setMonstersDataForEvolution(MONSTERS);

  // Initialize dev activity tracker
  initTracker();

  // Try to import events from git hook file
  const { importFromFile } = await import('./evolution/tracker.js');
  await importFromFile();

  // Preload sprite images (gracefully falls back if PNGs don't exist yet)
  await preloadAll(MONSTERS);

  initTileTextures();

  // Load save or give player a starter BugMon
  const player = getPlayer();
  const savedState = loadGame();
  if (savedState) {
    applySave(player, savedState);
    console.log('[BugMon] Save loaded');
  } else {
    const starter = { ...MONSTERS[0], currentHP: MONSTERS[0].hp };
    player.party.push(starter);
  }

  // Auto-save after battle ends and after caching
  eventBus.on(Events.BATTLE_ENDED, () => {
    autoSave();
  });
  eventBus.on(Events.CACHE_SUCCESS, (data) => {
    const mon = MONSTERS.find((m) => m.name === data.name);
    if (mon) recordBrowserCache(mon);
  });

  // Start game loop
  requestAnimationFrame(loop);
}

function autoSave() {
  saveGame(getPlayer());
}

function loop(timestamp) {
  const dt = timestamp - lastTime;
  lastTime = timestamp;

  update(dt);
  render();
  clearJustPressed();

  requestAnimationFrame(loop);
}

function update(dt) {
  const state = getState();

  // Auto-save periodically during exploration
  saveTimer += dt;
  if (saveTimer >= AUTO_SAVE_INTERVAL && state === STATES.EXPLORE) {
    autoSave();
    saveTimer = 0;
  }

  if (state === STATES.TITLE) {
    const result = updateTitle(dt);
    if (result === 'continue') {
      // Save is already loaded during init
      setState(STATES.EXPLORE);
    } else if (result === 'new') {
      // Reset player to starter
      const player = getPlayer();
      player.party = [];
      const starter = { ...MONSTERS[0], currentHP: MONSTERS[0].hp };
      player.party.push(starter);
      player.x = 7;
      player.y = 5;
      setState(STATES.EXPLORE);
    }
  } else if (state === STATES.EXPLORE) {
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
      startBattle(wildMon);
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
  }
}

function render() {
  clear();
  const state = getState();
  const ctx = document.getElementById('game').getContext('2d');

  if (state === STATES.TITLE) {
    drawTitle(ctx);
    return;
  } else if (state === STATES.EXPLORE) {
    drawMap(getMap());
    drawPlayer(getPlayer());

    // HUD - show party info
    const player = getPlayer();
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, 480, 20);
    ctx.fillStyle = '#fff';
    ctx.font = '12px monospace';
    const mon = player.party[0];
    const evoProgress = getEvolutionProgress(mon);
    let hudText = `${mon.name} HP:${Math.ceil(mon.currentHP)}/${mon.hp} Party:${player.party.length}`;
    if (evoProgress) {
      hudText += ` | ${evoProgress.eventLabel}:${evoProgress.current}/${evoProgress.required}`;
    }
    ctx.fillText(hudText, 5, 14);
  } else if (state === STATES.BATTLE_TRANSITION) {
    drawTransitionOverlay(ctx, 480, 320, () => {
      drawMap(getMap());
      drawPlayer(getPlayer());
    });
  } else if (state === STATES.BATTLE) {
    const battle = getBattle();
    if (battle) {
      drawBattle(battle, movesData, TYPES.typeColors);
    }
  } else if (state === STATES.EVOLVING) {
    drawEvolutionAnimation(ctx, 480, 320);
  }
}

init().catch((err) => console.error('BugMon failed to start:', err));
