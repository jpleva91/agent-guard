// BugEvent — canonical type for normalized bug/error events
// Central interface between all BugMon layers.

export interface BugEventData {
  id: string;
  type: string;
  message: string;
  file: string | null;
  line: number | null;
  severity: number;
  frequency: number;
}

export const SEVERITY = {
  MINOR: 1,
  LOW: 2,
  MEDIUM: 3,
  HIGH: 4,
  CRITICAL: 5,
} as const;

export type SeverityLevel = (typeof SEVERITY)[keyof typeof SEVERITY];

export const TYPE_SEVERITY: Record<string, number> = {
  'null-reference': SEVERITY.MEDIUM,
  'type-mismatch': SEVERITY.LOW,
  'type-error': SEVERITY.LOW,
  syntax: SEVERITY.MEDIUM,
  'undefined-reference': SEVERITY.LOW,
  'stack-overflow': SEVERITY.HIGH,
  'range-error': SEVERITY.MEDIUM,
  network: SEVERITY.MEDIUM,
  'file-not-found': SEVERITY.LOW,
  permission: SEVERITY.MEDIUM,
  import: SEVERITY.LOW,
  'unhandled-promise': SEVERITY.MEDIUM,
  'broken-pipe': SEVERITY.HIGH,
  'memory-leak': SEVERITY.HIGH,
  regex: SEVERITY.LOW,
  assertion: SEVERITY.MEDIUM,
  deprecated: SEVERITY.MINOR,
  'merge-conflict': SEVERITY.MEDIUM,
  'security-finding': SEVERITY.HIGH,
  'ci-failure': SEVERITY.MEDIUM,
  'lint-error': SEVERITY.LOW,
  'lint-warning': SEVERITY.MINOR,
  'test-failure': SEVERITY.MEDIUM,
  'key-error': SEVERITY.LOW,
  concurrency: SEVERITY.HIGH,
  generic: SEVERITY.LOW,
};

const frequencyMap = new Map<string, number>();

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

export function createBugEvent(
  type: string,
  message: string,
  file: string | null = null,
  line: number | null = null,
  severity: number | null = null,
): BugEventData {
  const id = simpleHash(`${type}:${message}:${file || ''}:${line || ''}`);

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

export const ERROR_TO_MONSTER_TYPE: Record<string, string> = {
  'null-reference': 'backend',
  'type-mismatch': 'backend',
  'type-error': 'backend',
  syntax: 'frontend',
  'undefined-reference': 'backend',
  'stack-overflow': 'backend',
  'range-error': 'backend',
  network: 'backend',
  'file-not-found': 'devops',
  permission: 'security',
  import: 'devops',
  'unhandled-promise': 'testing',
  'broken-pipe': 'backend',
  'memory-leak': 'backend',
  regex: 'testing',
  assertion: 'testing',
  deprecated: 'architecture',
  'merge-conflict': 'devops',
  'security-finding': 'security',
  'ci-failure': 'devops',
  'lint-error': 'testing',
  'lint-warning': 'testing',
  'test-failure': 'testing',
  'key-error': 'backend',
  concurrency: 'backend',
  generic: 'testing',
};

export interface MonsterData {
  id: number;
  name: string;
  type: string;
  hp: number;
  attack: number;
  defense: number;
  speed: number;
  moves: string[];
  errorPatterns?: string[];
  [key: string]: unknown;
}

export function bugEventToMonster(
  bugEvent: BugEventData,
  monstersData: MonsterData[],
): { monster: MonsterData; confidence: number } {
  const fullText = bugEvent.message.toLowerCase();

  let bestMatch: MonsterData | null = null;
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

  if (!bestMatch) {
    const monsterType = ERROR_TO_MONSTER_TYPE[bugEvent.type];
    if (monsterType) {
      const candidates = monstersData.filter((m) => m.type === monsterType);
      if (candidates.length > 0) {
        bestMatch = candidates[Math.floor(Math.random() * candidates.length)];
        bestScore = 5;
      }
    }
  }

  if (!bestMatch) {
    bestMatch = monstersData.find((m) => m.name === 'FlakyTest') || monstersData[0];
    bestScore = 1;
  }

  const hpBonus = (bugEvent.severity - 1) * 2;

  return {
    monster: { ...bestMatch, hp: bestMatch.hp + hpBonus },
    confidence: Math.min(1, bestScore / 30),
  };
}

export function resetFrequencies(): void {
  frequencyMap.clear();
}
