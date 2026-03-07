// BugEvent — canonical type for normalized bug/error events
// This is the central interface between all BugMon layers.
// Core layer produces BugEvents, game layer consumes them.

/**
 * @typedef {Object} BugEvent
 * @property {string} id - Unique identifier (hash of type+message+file+line)
 * @property {string} type - Error classification (see ERROR_TYPES)
 * @property {string} message - Human-readable error message
 * @property {string|null} file - Source file path where the error occurred
 * @property {number|null} line - Line number in source file
 * @property {number} severity - 1-5 scale (1=minor, 5=critical)
 * @property {number} frequency - Times this error has occurred in session
 */

/**
 * Severity levels:
 *   1 (minor)    — deprecation warnings, lint errors
 *   2 (low)      — type mismatches, undefined references
 *   3 (medium)   — null pointer, syntax errors
 *   4 (high)     — stack overflow, memory leaks, race conditions
 *   5 (critical) — segfaults, fork bombs, heap corruption
 */
export const SEVERITY = {
  MINOR: 1,
  LOW: 2,
  MEDIUM: 3,
  HIGH: 4,
  CRITICAL: 5,
};

/**
 * Maps error-parser types to severity levels.
 */
const TYPE_SEVERITY = {
  'null-reference': SEVERITY.MEDIUM,
  'type-mismatch': SEVERITY.LOW,
  'type-error': SEVERITY.LOW,
  'syntax': SEVERITY.MEDIUM,
  'undefined-reference': SEVERITY.LOW,
  'stack-overflow': SEVERITY.HIGH,
  'range-error': SEVERITY.MEDIUM,
  'network': SEVERITY.MEDIUM,
  'file-not-found': SEVERITY.LOW,
  'permission': SEVERITY.MEDIUM,
  'import': SEVERITY.LOW,
  'unhandled-promise': SEVERITY.MEDIUM,
  'broken-pipe': SEVERITY.HIGH,
  'memory-leak': SEVERITY.HIGH,
  'regex': SEVERITY.LOW,
  'assertion': SEVERITY.MEDIUM,
  'deprecated': SEVERITY.MINOR,
  'merge-conflict': SEVERITY.MEDIUM,
  'security-finding': SEVERITY.HIGH,
  'ci-failure': SEVERITY.MEDIUM,
  'lint-error': SEVERITY.LOW,
  'lint-warning': SEVERITY.MINOR,
  'test-failure': SEVERITY.MEDIUM,
  'generic': SEVERITY.LOW,
};

// Session-scoped frequency counter
const frequencyMap = new Map();

/**
 * Simple hash for generating deterministic IDs.
 */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Create a canonical BugEvent from raw error data.
 *
 * @param {string} type - Error type from error-parser (e.g., 'null-reference', 'syntax')
 * @param {string} message - Human-readable error message
 * @param {string|null} [file=null] - Source file path
 * @param {number|null} [line=null] - Line number
 * @param {number|null} [severity=null] - Override severity (auto-derived from type if null)
 * @returns {BugEvent}
 */
export function createBugEvent(type, message, file = null, line = null, severity = null) {
  const id = simpleHash(`${type}:${message}:${file || ''}:${line || ''}`);

  // Track frequency within this session
  const freq = (frequencyMap.get(id) || 0) + 1;
  frequencyMap.set(id, freq);

  return {
    id,
    type,
    message,
    file,
    line,
    severity: severity ?? TYPE_SEVERITY[type] ?? SEVERITY.LOW,
    frequency: freq,
  };
}

/**
 * Maps error-parser type strings to BugMon monster types.
 */
export const ERROR_TO_MONSTER_TYPE = {
  'null-reference': 'backend',
  'type-mismatch': 'backend',
  'type-error': 'backend',
  'syntax': 'frontend',
  'undefined-reference': 'backend',
  'stack-overflow': 'backend',
  'range-error': 'backend',
  'network': 'backend',
  'file-not-found': 'devops',
  'permission': 'security',
  'import': 'devops',
  'unhandled-promise': 'testing',
  'broken-pipe': 'backend',
  'memory-leak': 'backend',
  'regex': 'testing',
  'assertion': 'testing',
  'deprecated': 'architecture',
  'merge-conflict': 'devops',
  'security-finding': 'security',
  'ci-failure': 'devops',
  'lint-error': 'testing',
  'lint-warning': 'testing',
  'test-failure': 'testing',
  'generic': 'testing',
};

/**
 * Convert a BugEvent into a monster match from the monsters dataset.
 * Uses errorPatterns field on monsters for best-match, falls back to type mapping.
 *
 * @param {BugEvent} bugEvent - The canonical bug event
 * @param {object[]} monstersData - Array of monster definitions from monsters.json
 * @returns {{monster: object, confidence: number}}
 */
export function bugEventToMonster(bugEvent, monstersData) {
  const fullText = bugEvent.message.toLowerCase();

  let bestMatch = null;
  let bestScore = 0;

  for (const monster of monstersData) {
    if (!monster.errorPatterns) continue;

    let score = 0;
    for (const pattern of monster.errorPatterns) {
      if (fullText.includes(pattern.toLowerCase())) {
        score += pattern.length;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = monster;
    }
  }

  // Fallback: match by error type to monster type
  if (!bestMatch) {
    const monsterType = ERROR_TO_MONSTER_TYPE[bugEvent.type];
    if (monsterType) {
      const candidates = monstersData.filter(m => m.type === monsterType);
      if (candidates.length > 0) {
        bestMatch = candidates[Math.floor(Math.random() * candidates.length)];
        bestScore = 5;
      }
    }
  }

  // Ultimate fallback
  if (!bestMatch) {
    bestMatch = monstersData.find(m => m.name === 'FlakyTest') || monstersData[0];
    bestScore = 1;
  }

  // Scale severity into HP bonus for higher-severity bugs
  const hpBonus = (bugEvent.severity - 1) * 2;

  return {
    monster: { ...bestMatch, hp: bestMatch.hp + hpBonus },
    confidence: Math.min(1, bestScore / 30),
  };
}

/**
 * Reset session frequency counters.
 */
export function resetFrequencies() {
  frequencyMap.clear();
}
