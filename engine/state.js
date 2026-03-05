// Game state machine
const STATES = { EXPLORE: 'EXPLORE', BATTLE_TRANSITION: 'BATTLE_TRANSITION', BATTLE: 'BATTLE', MENU: 'MENU' };

let currentState = STATES.EXPLORE;

export function getState() {
  return currentState;
}

export function setState(newState) {
  currentState = newState;
}

export { STATES };
