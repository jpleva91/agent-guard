// Browser evolution adapter — delegates to domain/evolution.js
//
// TODO(roadmap): Phase 5 — Developer level with title progression

import { getEvents } from './tracker.js';
import type { GameMon } from '../world/player.js';

type DomainCheckEvolution = (
  monster: unknown,
  events: unknown,
  evolutionData: unknown,
  monstersData: unknown,
) => unknown;
type DomainCheckPartyEvolutions = (
  party: unknown[],
  events: unknown,
  evolutionData: unknown,
  monstersData: unknown,
) => { from: GameMon; to: GameMon; partyIndex: number } | null;
type DomainApplyEvolution = (monster: unknown, evolvedForm: unknown) => GameMon;
type DomainGetEvolutionProgress = (
  monster: unknown,
  events: unknown,
  evolutionData: unknown,
  monstersData: unknown,
) => EvolutionProgress | null;

export interface EvolutionProgress {
  eventLabel: string;
  current: number;
  required: number;
}

let evolutionData: unknown = null;
let evoMonstersData: unknown = null;
let pendingEvolution: unknown = null;

// Domain function references — set via setDomainFunctions
let domainCheckEvolution: DomainCheckEvolution | null = null;
let domainCheckPartyEvolutions: DomainCheckPartyEvolutions | null = null;
let domainApplyEvolution: DomainApplyEvolution | null = null;
let domainGetEvolutionProgress: DomainGetEvolutionProgress | null = null;

export function setDomainFunctions(fns: {
  checkEvolution: DomainCheckEvolution;
  checkPartyEvolutions: DomainCheckPartyEvolutions;
  applyEvolution: DomainApplyEvolution;
  getEvolutionProgress: DomainGetEvolutionProgress;
}): void {
  domainCheckEvolution = fns.checkEvolution;
  domainCheckPartyEvolutions = fns.checkPartyEvolutions;
  domainApplyEvolution = fns.applyEvolution;
  domainGetEvolutionProgress = fns.getEvolutionProgress;
}

export function setEvolutionData(data: unknown): void {
  evolutionData = data;
}

export function setMonstersDataForEvolution(data: unknown): void {
  evoMonstersData = data;
}

export function checkEvolution(monster: GameMon): unknown {
  if (!domainCheckEvolution) return null;
  return domainCheckEvolution(monster, getEvents(), evolutionData, evoMonstersData);
}

export function checkPartyEvolutions(
  party: GameMon[],
): { from: GameMon; to: GameMon; partyIndex: number } | null {
  if (!domainCheckPartyEvolutions) return null;
  return domainCheckPartyEvolutions(party, getEvents(), evolutionData, evoMonstersData);
}

export function applyEvolution(party: GameMon[], partyIndex: number, evolvedForm: GameMon): GameMon {
  if (domainApplyEvolution) {
    const newMon = domainApplyEvolution(party[partyIndex], evolvedForm);
    party[partyIndex] = newMon;
    return newMon;
  }
  party[partyIndex] = { ...evolvedForm, currentHP: evolvedForm.hp };
  return party[partyIndex];
}

export function getEvolutionProgress(monster: GameMon): EvolutionProgress | null {
  if (!domainGetEvolutionProgress) return null;
  return domainGetEvolutionProgress(monster, getEvents(), evolutionData, evoMonstersData);
}

export function setPendingEvolution(evo: unknown): void {
  pendingEvolution = evo;
}

export function getPendingEvolution(): unknown {
  return pendingEvolution;
}

export function clearPendingEvolution(): void {
  pendingEvolution = null;
}
