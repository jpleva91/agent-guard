// AgentGuardHQ — Digital Office Types
// 2D agent workers visualization powered by persona telemetry.
// Agents walk around, perform tasks, and have customizable styles.

import type { AgentPersona, TrustTier, PersonaRole } from '@red-codes/core';

/** Visual style for an agent worker in the digital office */
export interface AgentStyle {
  /** Display name shown above the agent sprite */
  readonly name: string;
  /** Sprite/avatar identifier (e.g. 'robot-blue', 'cat-hacker', 'ninja-coder') */
  readonly avatar: string;
  /** Color theme for the agent's workspace area */
  readonly color: string;
  /** Animation set identifier */
  readonly animation: 'default' | 'energetic' | 'chill' | 'focused';
  /** Accessory items (hats, tools, pets) — freemium content */
  readonly accessories: readonly string[];
  /** Whether this style is a premium/freemium item */
  readonly premium: boolean;
}

/** Predefined avatar styles by role — the starting collection */
export const DEFAULT_AVATARS: Record<PersonaRole, string> = {
  developer: 'robot-blue',
  reviewer: 'owl-wise',
  ops: 'hardhat-orange',
  security: 'shield-guard',
  ci: 'gears-bot',
};

/** Trust tier badge colors */
export const TRUST_TIER_COLORS: Record<TrustTier, string> = {
  untrusted: '#ef4444',
  limited: '#f59e0b',
  standard: '#3b82f6',
  elevated: '#8b5cf6',
  admin: '#10b981',
};

/** An agent worker in the digital office */
export interface AgentWorker {
  /** Unique worker ID (derived from agent identity hash) */
  readonly id: string;
  /** Agent persona from governance telemetry */
  readonly persona: AgentPersona;
  /** Visual style and customization */
  readonly style: AgentStyle;
  /** Current position in the 2D office grid */
  position: { x: number; y: number };
  /** Current activity state */
  activity: AgentActivity;
  /** Activity log — recent actions for the feed */
  readonly recentActions: readonly AgentAction[];
  /** Stats from telemetry */
  readonly stats: AgentStats;
}

/** What the agent is currently doing */
export type AgentActivity =
  | { type: 'idle' }
  | { type: 'coding'; file: string }
  | { type: 'reviewing'; target: string }
  | { type: 'pushing'; branch: string }
  | { type: 'testing'; suite: string }
  | { type: 'blocked'; reason: string }
  | { type: 'walking'; destination: { x: number; y: number } };

/** A recorded agent action for the activity feed */
export interface AgentAction {
  readonly timestamp: number;
  readonly syscall: string;
  readonly target: string;
  readonly result: 'allow' | 'deny';
}

/** Aggregated stats for an agent worker */
export interface AgentStats {
  readonly totalActions: number;
  readonly allowedActions: number;
  readonly deniedActions: number;
  readonly trustScore: number;
  readonly uptime: number;
}

/** The full digital office state */
export interface DigitalOffice {
  /** All active agent workers */
  readonly workers: AgentWorker[];
  /** Office layout dimensions */
  readonly width: number;
  readonly height: number;
  /** Office theme */
  readonly theme: 'day' | 'night' | 'sunset';
}

/** Freemium content catalog item */
export interface ShopItem {
  readonly id: string;
  readonly name: string;
  readonly category: 'avatar' | 'accessory' | 'animation' | 'workspace-theme';
  readonly preview: string;
  readonly tier: 'free' | 'premium';
  readonly description: string;
}
