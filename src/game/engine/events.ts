// Event Bus — game-specific event names + canonical EventBus from domain/
// Consolidates game/engine/events.js — uses src/core/event-bus.ts as canonical impl
//
// TODO(roadmap): TS Migration — Consolidate this module with src/core/event-bus.ts

import { EventBus } from '../../core/event-bus.js';

export const Events = {
  BATTLE_STARTED: 'BATTLE_STARTED',
  BUGMON_FAINTED: 'BUGMON_FAINTED',
  CACHE_SUCCESS: 'CACHE_SUCCESS',
  BATTLE_ENDED: 'BATTLE_ENDED',
  STATE_CHANGED: 'STATE_CHANGED',
  PASSIVE_ACTIVATED: 'PASSIVE_ACTIVATED',
} as const;

export type GameEventName = (typeof Events)[keyof typeof Events];

interface GameEventMap {
  [Events.BATTLE_STARTED]: { playerMon: string; enemy: string };
  [Events.BUGMON_FAINTED]: { name: string; side: string };
  [Events.CACHE_SUCCESS]: { name: string };
  [Events.BATTLE_ENDED]: { outcome: string };
  [Events.STATE_CHANGED]: { from: string; to: string };
  [Events.PASSIVE_ACTIVATED]: { name: string; message: string };
}

export const eventBus = new EventBus<GameEventMap>();
