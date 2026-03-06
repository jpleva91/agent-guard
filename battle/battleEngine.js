// Battle state machine
import { calcDamage } from './damage.js';
import { wasPressed } from '../engine/input.js';
import { setState, STATES } from '../engine/state.js';
import { getPlayer } from '../world/player.js';
import {
  playMenuNav, playMenuConfirm, playMenuCancel,
  playAttack, playFaint, playCaptureSuccess,
  playCaptureFailure, playBattleVictory
} from '../audio/sound.js';

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
  return battle;
}

export function getBattle() {
  return battle;
}

export function updateBattle(dt) {
  if (!battle) return;

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
        // Capture
        attemptCapture();
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

  if (playerFirst) {
    doAttack(battle.playerMon, playerMove, battle.enemy, () => {
      if (battle.enemy.currentHP <= 0) {
        playFaint();
        showMessage(`Wild ${battle.enemy.name} fainted!`, () => endBattle());
      } else {
        enemyTurn();
      }
    });
  } else {
    enemyTurn(() => {
      if (battle.playerMon.currentHP <= 0) {
        playFaint();
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
  const { damage, effectiveness } = calcDamage(attacker, move, defender, typeChart);
  defender.currentHP -= damage;
  playAttack();
  let msg = `${attacker.name} used ${move.name}! ${damage} damage!`;
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

function attemptCapture() {
  const hpRatio = battle.enemy.currentHP / battle.enemy.hp;
  const chance = (1 - hpRatio) * 0.5 + 0.1;

  if (Math.random() < chance) {
    const player = getPlayer();
    const captured = { ...battle.enemy, currentHP: battle.enemy.currentHP };
    player.party.push(captured);
    playCaptureSuccess();
    showMessage(`Caught ${battle.enemy.name}!`, () => endBattle());
  } else {
    playCaptureFailure();
    showMessage(`${battle.enemy.name} broke free!`, () => {
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
  if (battle.playerMon.currentHP > 0) {
    player.party[0].currentHP = battle.playerMon.currentHP;
  }
  if (battle.enemy.currentHP <= 0) {
    playBattleVictory();
  }
  battle = null;
  setState(STATES.EXPLORE);
}

export { movesData };
