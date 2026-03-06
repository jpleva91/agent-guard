// Battle UI controller - connects pure battle engine to input/audio/state
import { calcDamage } from './damage.js';
import { wasPressed } from '../engine/input.js';
import { setState, STATES } from '../engine/state.js';
import { getPlayer } from '../world/player.js';
import { eventBus, Events } from '../engine/events.js';
import { triggerScreenShake, updateScreenShake } from '../engine/renderer.js';
import {
  playMenuNav, playMenuConfirm, playMenuCancel,
  playAttack, playFaint, playCaptureSuccess,
  playCaptureFailure, playBattleVictory
} from '../audio/sound.js';
import { cacheChance } from './battle-core.js';
import { checkPartyEvolutions, applyEvolution } from '../evolution/evolution.js';
import { startEvolutionAnimation } from '../evolution/animation.js';

let battle = null;
let movesData = [];
let typeData = null;
let messageTimer = 0;
const MESSAGE_DURATION = 1500;

export function setMovesData(data) {
  movesData = data;
}

export function setTypeData(data) {
  typeData = data;
}

export function startBattle(wildMon) {
  const player = getPlayer();
  const mon = player.party[0];
  battle = {
    enemy: { ...wildMon },
    playerMon: { ...mon, currentHP: mon.currentHP },
    state: 'menu',    // menu | fight | message
    menuIndex: 0,
    moveIndex: 0,
    message: '',
    nextAction: null
  };
  eventBus.emit(Events.BATTLE_STARTED, {
    playerMon: battle.playerMon.name,
    enemy: battle.enemy.name,
  });
  return battle;
}

export function getBattle() {
  return battle;
}

export function updateBattle(dt) {
  if (!battle) return;

  updateScreenShake(dt);

  if (battle.state === 'message') {
    messageTimer -= dt;
    if (messageTimer <= 0) {
      if (battle.nextAction) {
        const action = battle.nextAction;
        battle.nextAction = null;  // clear BEFORE calling, so action can set a new one
        action();
      }
    }
    return;
  }

  if (battle.state === 'menu') {
    if (wasPressed('ArrowLeft')) { battle.menuIndex = Math.max(0, battle.menuIndex - 1); playMenuNav(); }
    if (wasPressed('ArrowRight')) { battle.menuIndex = Math.min(2, battle.menuIndex + 1); playMenuNav(); }

    if (wasPressed('Enter') || wasPressed(' ')) {
      playMenuConfirm();
      if (battle.menuIndex === 0) {
        // Fight
        battle.state = 'fight';
        battle.moveIndex = 0;
      } else if (battle.menuIndex === 1) {
        // Cache
        attemptCache();
      } else {
        // Run
        showMessage('Got away safely!', () => endBattle());
      }
    }
  } else if (battle.state === 'fight') {
    const moveCount = battle.playerMon.moves.length;
    if (wasPressed('ArrowLeft')) { battle.moveIndex = Math.max(0, battle.moveIndex - 1); playMenuNav(); }
    if (wasPressed('ArrowRight')) { battle.moveIndex = Math.min(moveCount - 1, battle.moveIndex + 1); playMenuNav(); }
    if (wasPressed('Escape')) { playMenuCancel(); battle.state = 'menu'; return; }

    if (wasPressed('Enter') || wasPressed(' ')) {
      playMenuConfirm();
      const moveId = battle.playerMon.moves[battle.moveIndex];
      const move = movesData.find(m => m.id === moveId);
      if (move) executeTurn(move);
    }
  }
}

function executeTurn(playerMove) {
  const playerFirst = battle.playerMon.speed >= battle.enemy.speed;

  eventBus.emit(Events.TURN_STARTED, {
    turn: (battle.turn || 0) + 1,
    firstMover: playerFirst ? battle.playerMon.name : battle.enemy.name,
  });

  if (playerFirst) {
    doAttack(battle.playerMon, playerMove, battle.enemy, () => {
      if (battle.enemy.currentHP <= 0) {
        playFaint();
        eventBus.emit(Events.BUGMON_FAINTED, { name: battle.enemy.name, side: 'enemy' });
        showMessage(`Wild ${battle.enemy.name} fainted!`, () => endBattle());
      } else {
        enemyTurn();
      }
    });
  } else {
    enemyTurn(() => {
      if (battle.playerMon.currentHP <= 0) {
        playFaint();
        eventBus.emit(Events.BUGMON_FAINTED, { name: battle.playerMon.name, side: 'player' });
        showMessage(`${battle.playerMon.name} fainted!`, () => {
          // Heal and return
          const player = getPlayer();
          player.party[0].currentHP = player.party[0].hp;
          endBattle();
        });
      } else {
        doAttack(battle.playerMon, playerMove, battle.enemy, () => {
          if (battle.enemy.currentHP <= 0) {
            playFaint();
            eventBus.emit(Events.BUGMON_FAINTED, { name: battle.enemy.name, side: 'enemy' });
            showMessage(`Wild ${battle.enemy.name} fainted!`, () => endBattle());
          } else {
            battle.state = 'menu';
            battle.menuIndex = 0;
          }
        });
      }
    });
  }
}

function doAttack(attacker, move, defender, callback) {
  const typeChart = typeData ? typeData.effectiveness : null;
  const { damage, effectiveness, critical } = calcDamage(attacker, move, defender, typeChart);
  defender.currentHP -= damage;
  playAttack();
  if (critical) triggerScreenShake(6, 300);

  eventBus.emit(Events.MOVE_USED, {
    attacker: attacker.name,
    move: move.name,
    defender: defender.name,
    damage,
    effectiveness,
  });

  let msg = `${attacker.name} used ${move.name}! ${damage} damage!`;
  if (critical) msg += ' Critical hit!';
  if (effectiveness > 1.0) msg += ' Super effective!';
  else if (effectiveness < 1.0) msg += ' Not very effective...';
  showMessage(msg, callback);
}

function enemyTurn(callback) {
  const moveId = battle.enemy.moves[Math.floor(Math.random() * battle.enemy.moves.length)];
  const move = movesData.find(m => m.id === moveId);
  doAttack(battle.enemy, move, battle.playerMon, () => {
    if (battle.playerMon.currentHP <= 0) {
      playFaint();
      eventBus.emit(Events.BUGMON_FAINTED, { name: battle.playerMon.name, side: 'player' });
      showMessage(`${battle.playerMon.name} fainted!`, () => {
        const player = getPlayer();
        player.party[0].currentHP = player.party[0].hp;
        endBattle();
      });
    } else if (callback) {
      callback();
    } else {
      battle.state = 'menu';
      battle.menuIndex = 0;
    }
  });
}

function attemptCache() {
  const chance = cacheChance(battle.enemy);

  eventBus.emit(Events.CACHE_ATTEMPTED, {
    target: battle.enemy.name,
    chance,
  });

  if (Math.random() < chance) {
    const player = getPlayer();
    const cached = { ...battle.enemy, currentHP: battle.enemy.currentHP };
    player.party.push(cached);
    playCaptureSuccess();
    eventBus.emit(Events.CACHE_SUCCESS, { name: battle.enemy.name });
    showMessage(`Cached ${battle.enemy.name}!`, () => endBattle());
  } else {
    playCaptureFailure();
    eventBus.emit(Events.CACHE_FAILED, { name: battle.enemy.name });
    showMessage(`${battle.enemy.name} evicted from cache!`, () => {
      enemyTurn();
    });
  }
}

function showMessage(msg, callback) {
  battle.state = 'message';
  battle.message = msg;
  messageTimer = MESSAGE_DURATION;
  battle.nextAction = callback || null;
}

function endBattle() {
  // Sync player mon HP back
  const player = getPlayer();
  const outcome = battle.enemy.currentHP <= 0 ? 'win' : 'other';
  if (battle.playerMon.currentHP > 0) {
    player.party[0].currentHP = battle.playerMon.currentHP;
  }
  const wasVictory = battle.enemy.currentHP <= 0;
  if (wasVictory) {
    playBattleVictory();
  }
  eventBus.emit(Events.BATTLE_ENDED, { outcome });
  battle = null;

  // Check if any party member can evolve after battle
  const evo = checkPartyEvolutions(player.party);
  if (evo) {
    applyEvolution(player.party, evo.partyIndex, evo.to);
    startEvolutionAnimation(evo.from, evo.to);
    setState(STATES.EVOLVING);
  } else {
    setState(STATES.EXPLORE);
  }
}

export { movesData };
