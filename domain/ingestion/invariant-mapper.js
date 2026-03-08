// Invariant violation → BugMon species mapper
// Maps invariant violation events to appropriate monsters for encounters.
// No DOM, no Node.js APIs — pure functions.

/**
 * Invariant type → monster ID mapping.
 * Each invariant type maps to a specific monster designed for that violation class.
 */
const VIOLATION_MONSTER_MAP = {
  test_result: 32,   // InvariantBeast
  action: 33,        // RogueAgent
  dependency: 34,    // ChaosHydra
};

/**
 * Map an InvariantViolation event to a BugMon monster for encounter.
 *
 * @param {object} violationEvent - An InvariantViolation canonical event
 * @param {object[]} monstersData - The full monsters array
 * @returns {{ monster: object, confidence: number, hpBonus: number }|null}
 */
export function violationToMonster(violationEvent, monstersData) {
  const type = violationEvent.metadata?.type;
  const severity = violationEvent.metadata?.severity || 3;

  // Look up the designated monster for this violation type
  const monsterId = VIOLATION_MONSTER_MAP[type];
  if (monsterId == null) return null;

  const template = monstersData.find((m) => m.id === monsterId);
  if (!template) return null;

  // Higher severity = more HP (severity 3 = +6, severity 5 = +12)
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

/**
 * Check if a canonical event is an invariant violation.
 * @param {object} event
 * @returns {boolean}
 */
export function isViolationEvent(event) {
  return event?.kind === 'InvariantViolation';
}

export { VIOLATION_MONSTER_MAP };
