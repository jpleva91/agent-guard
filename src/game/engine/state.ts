// Game state machine with explicit transitions
//
// TODO(roadmap): Phase 7 — Run-based browser gameplay (session → run mapping)

import { eventBus, Events } from './events.js';

export const STATES = {
  TITLE: 'TITLE',
  EXPLORE: 'EXPLORE',
  BATTLE_TRANSITION: 'BATTLE_TRANSITION',
  BATTLE: 'BATTLE',
  EVOLVING: 'EVOLVING',
  MENU: 'MENU',
} as const;

export type GameState = (typeof STATES)[keyof typeof STATES];

let currentState: GameState = STATES.TITLE;

export function getState(): GameState {
  return currentState;
}

export function setState(newState: GameState): void {
  const prev = currentState;
  currentState = newState;
  eventBus.emit(Events.STATE_CHANGED, { from: prev, to: newState });
}
