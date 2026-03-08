// Invariant violation → BugMon species mapper
// Maps invariant violation events to appropriate monsters for encounters.
// No DOM, no Node.js APIs — pure functions.

import type { Bugmon, DomainEvent } from '../../core/types.js';

const VIOLATION_MONSTER_MAP: Record<string, number> = {
  test_result: 32, // InvariantBeast
  action: 33, // RogueAgent
  dependency: 34, // ChaosHydra
};

interface ViolationMatch {
  monster: Bugmon;
  confidence: number;
  hpBonus: number;
}

/** Map an InvariantViolation event to a BugMon monster for encounter. */
export function violationToMonster(
  violationEvent: DomainEvent & { metadata?: { type?: string; severity?: number } },
  monstersData: readonly Bugmon[],
): ViolationMatch | null {
  const type = violationEvent.metadata?.type;
  const severity = violationEvent.metadata?.severity || 3;

  const monsterId = type ? VIOLATION_MONSTER_MAP[type] : undefined;
  if (monsterId === undefined) return null;

  const template = monstersData.find((m) => m.id === monsterId);
  if (!template) return null;

  const hpBonus = (severity - 1) * 3;

  return {
    monster: {
      ...template,
      hp: template.hp + hpBonus,
      currentHP: template.hp + hpBonus,
    },
    confidence: 1.0,
    hpBonus,
  };
}

/** Check if a canonical event is an invariant violation. */
export function isViolationEvent(event: DomainEvent): boolean {
  return event?.kind === 'InvariantViolation';
}

export { VIOLATION_MONSTER_MAP };
