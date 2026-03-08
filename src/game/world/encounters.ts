// Browser encounter adapter — delegates to domain/encounters.js, adds audio

import { playEncounterAlert } from '../audio/sound.js';
import { checkEncounter as domainCheckEncounter } from '../../domain/encounters.js';
import type { Bugmon } from '../../core/types.js';
import type { GameMon } from './player.js';

let monstersData: GameMon[] = [];

export function setMonstersData(data: GameMon[]): void {
  monstersData = data;
}

export function checkEncounter(tile: number): GameMon | null {
  const result = domainCheckEncounter(tile, monstersData as unknown as Bugmon[]);
  if (result) playEncounterAlert();
  return result as GameMon | null;
}
