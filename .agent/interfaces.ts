/**
 * Interface Contract — System API definitions
 *
 * These TypeScript interfaces describe the shapes used throughout BugMon.
 * The actual implementation is vanilla JavaScript (ES6 modules).
 * These definitions serve as machine-readable documentation for agents.
 *
 * Source files:
 *   domain/events.js, domain/event-bus.js, domain/battle.js,
 *   domain/evolution.js, domain/encounters.js, core/bug-event.js,
 *   ecosystem/data/monsters.json, ecosystem/data/moves.json
 */

// --- Canonical Event (domain/events.js) ---

export interface CanonicalEvent {
  id: string; // Unique: evt_{timestamp}_{counter}
  kind: string; // One of the EventKind constants
  timestamp: number; // Date.now()
  fingerprint: string; // Stable DJB2 hash for deduplication
  [key: string]: unknown; // Event-specific payload fields
}

// --- EventBus (domain/event-bus.js) ---

export interface EventBus {
  on(event: string, callback: (data: unknown) => void): () => void; // Returns unsubscribe fn
  off(event: string, callback: (data: unknown) => void): void;
  emit(event: string, data: object): void;
  clear(): void;
}

// --- BugEvent (core/bug-event.js) ---

export interface BugEvent {
  id: string; // Deterministic hash of type:message:file:line
  type: string; // Error classification (e.g., 'null-reference', 'syntax')
  message: string; // Human-readable error message
  file: string | null; // Source file path
  line: number | null; // Line number
  severity: 1 | 2 | 3 | 4 | 5; // 1=minor, 2=low, 3=medium, 4=high, 5=critical
  frequency: number; // Session encounter count
}

// --- Monster (ecosystem/data/monsters.json) ---

export interface Monster {
  id: number;
  name: string;
  type: MonsterType;
  hp: number;
  attack: number;
  defense: number;
  speed: number;
  moves: string[]; // Move IDs
  color: string; // Hex color for terminal rendering
  sprite: string; // Filename for PNG sprite
  rarity: "common" | "uncommon" | "rare" | "legendary" | "evolved" | "boss";
  theme: string; // Short description of error theme
  passive: { name: string; description: string } | null;
  description: string;
  errorPatterns?: string[]; // Patterns for matching in error messages
  evolvesTo?: number; // Target monster ID for evolution
}

export type MonsterType =
  | "frontend"
  | "backend"
  | "devops"
  | "testing"
  | "architecture"
  | "security"
  | "ai";

// --- Move (ecosystem/data/moves.json) ---

export interface Move {
  id: string;
  name: string;
  power: number;
  accuracy: number;
  type: MonsterType;
  category: "attack" | "special" | "heal";
  effect?: string; // Special effect description
}

// --- Type Effectiveness (ecosystem/data/types.json) ---

export interface TypeChart {
  effectiveness: {
    [attackerType in MonsterType]: {
      [defenderType in MonsterType]: number; // 0.5, 1.0, or 1.5
    };
  };
}

// --- Battle State (domain/battle.js) ---

export interface BattleState {
  playerMon: BattleMonster;
  enemy: BattleMonster;
  turn: number;
  log: BattleEvent[];
  outcome: null | "win" | "lose" | "run" | "cache";
}

export interface BattleMonster extends Monster {
  currentHP: number;
}

export interface BattleEvent {
  type: string; // MOVE_USED, DAMAGE_DEALT, etc.
  side: "player" | "enemy";
  [key: string]: unknown;
}

export interface DamageResult {
  damage: number;
  effectiveness: number; // 0.5, 1.0, or 1.5
  critical: boolean;
}

// --- Evolution (domain/evolution.js) ---

export interface EvolutionChain {
  id: string;
  name: string;
  stages: Array<{ monsterId: number; name: string }>;
  triggers: EvolutionTrigger[];
}

export interface EvolutionTrigger {
  from: number; // Monster ID
  to: number; // Monster ID
  condition: {
    event: string; // Activity type (commits, prs_merged, etc.)
    count: number; // Threshold
  };
  description: string;
}

export interface EvolutionResult {
  from: Monster;
  to: Monster;
  trigger: EvolutionTrigger;
  chain: { name: string; triggers: EvolutionTrigger[] };
}

// --- Encounter (domain/encounters.js) ---

export interface RarityWeights {
  common: 10;
  uncommon: 5;
  rare: 2;
  legendary: 1;
}

// --- Boss (ecosystem/bosses.js) ---

export interface Boss {
  id: string;
  name: string;
  type: MonsterType;
  trigger: string; // Trigger condition key
  triggerThreshold: number;
  hp: number;
  attack: number;
  defense: number;
  speed: number;
  moves: string[];
  defeatCondition: string;
  description: string;
  rarity: "boss";
  ascii: string[];
}

// --- Ingestion Pipeline (domain/ingestion/) ---

export interface ParsedError {
  type: string; // Error classification
  message: string; // Human-readable message
  rawLines: string[]; // Original stderr lines
  file?: string; // Source file path
  line?: number; // Line number
}

export interface MonsterMatch {
  monster: Monster;
  confidence: number; // 0.0 to 1.0
}

// --- Storage (ecosystem/storage.js) ---

export interface BugDexData {
  encounters: Array<{ monster: string; timestamp: number }>;
  stats: {
    totalEncounters: number;
    totalResolved: number;
    xp: number;
    level: number;
  };
  seen: { [monsterId: string]: number };
}
