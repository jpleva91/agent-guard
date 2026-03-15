// AgentGuardHQ — Digital Office Engine
// Transforms persona telemetry into a live 2D office visualization.
// Stub implementation — core logic for worker lifecycle and activity mapping.

import type { AgentPersona, PersonaRole } from '@red-codes/core';
import type { TelemetryEvent } from '@red-codes/telemetry';
import type {
  AgentWorker,
  AgentStyle,
  AgentActivity,
  AgentAction,
  DigitalOffice,
  ShopItem,
} from './types.js';
import { DEFAULT_AVATARS, TRUST_TIER_COLORS } from './types.js';

/**
 * Create a new agent worker from persona data.
 * Assigns a default style based on role and trust tier.
 */
export function createWorker(
  agentId: string,
  persona: AgentPersona,
  officeWidth: number,
  officeHeight: number,
): AgentWorker {
  const style = resolveDefaultStyle(agentId, persona);
  return {
    id: agentId,
    persona,
    style,
    position: {
      x: Math.floor(Math.random() * officeWidth),
      y: Math.floor(Math.random() * officeHeight),
    },
    activity: { type: 'idle' },
    recentActions: [],
    stats: { totalActions: 0, allowedActions: 0, deniedActions: 0, trustScore: 100, uptime: 0 },
  };
}

/** Resolve a default visual style based on persona traits. */
function resolveDefaultStyle(agentId: string, persona: AgentPersona): AgentStyle {
  const role: PersonaRole = persona.role ?? 'developer';
  const avatar = DEFAULT_AVATARS[role] ?? 'robot-blue';
  const color = TRUST_TIER_COLORS[persona.trustTier ?? 'standard'];

  return {
    name: formatAgentName(agentId, persona),
    avatar,
    color,
    animation: persona.riskTolerance === 'aggressive' ? 'energetic' : 'default',
    accessories: [],
    premium: false,
  };
}

/** Generate a friendly display name for an agent. */
function formatAgentName(agentId: string, persona: AgentPersona): string {
  const model = persona.modelMeta?.model;
  if (model) {
    // "Claude Sonnet" from "claude-sonnet-4-6"
    const parts = model.split('-');
    const name = parts.slice(0, 2).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
    return name;
  }
  // Fallback: use agent ID prefix
  const prefix = agentId.split(':')[0] ?? agentId;
  return prefix.charAt(0).toUpperCase() + prefix.slice(1);
}

/**
 * Map a telemetry event to an agent activity.
 * Used to animate what the worker is "doing" in the office.
 */
export function mapTelemetryToActivity(event: TelemetryEvent): AgentActivity {
  if (event.policy_result === 'deny') {
    return { type: 'blocked', reason: `${event.syscall} denied` };
  }

  switch (event.syscall) {
    case 'file.write':
    case 'file.read':
      return { type: 'coding', file: event.target };
    case 'git.push':
    case 'git.commit':
      return { type: 'pushing', branch: event.target };
    case 'test.run':
    case 'test.run.unit':
    case 'test.run.integration':
      return { type: 'testing', suite: event.target };
    default:
      return { type: 'coding', file: event.target };
  }
}

/** Convert a telemetry event into an action for the activity feed. */
export function telemetryToAction(event: TelemetryEvent): AgentAction {
  return {
    timestamp: new Date(event.timestamp).getTime(),
    syscall: event.syscall,
    target: event.target,
    result: event.policy_result,
  };
}

/** Create an empty digital office. */
export function createOffice(
  width = 800,
  height = 600,
  theme: DigitalOffice['theme'] = 'day',
): DigitalOffice {
  return { workers: [], width, height, theme };
}

/** Stub freemium content catalog. */
export function getShopCatalog(): ShopItem[] {
  return [
    {
      id: 'avatar-cat-hacker',
      name: 'Cat Hacker',
      category: 'avatar',
      preview: '🐱‍💻',
      tier: 'free',
      description: 'A mischievous cat with a laptop',
    },
    {
      id: 'avatar-ninja-coder',
      name: 'Ninja Coder',
      category: 'avatar',
      preview: '🥷',
      tier: 'free',
      description: 'Silent but deadly (at writing code)',
    },
    {
      id: 'accessory-coffee',
      name: 'Coffee Cup',
      category: 'accessory',
      preview: '☕',
      tier: 'free',
      description: 'Every agent needs fuel',
    },
    {
      id: 'accessory-headphones',
      name: 'Headphones',
      category: 'accessory',
      preview: '🎧',
      tier: 'free',
      description: 'In the zone',
    },
    {
      id: 'avatar-dragon-dev',
      name: 'Dragon Developer',
      category: 'avatar',
      preview: '🐲',
      tier: 'premium',
      description: 'Breathes fire and ships features',
    },
    {
      id: 'animation-party',
      name: 'Party Mode',
      category: 'animation',
      preview: '🎉',
      tier: 'premium',
      description: 'Celebrate every successful push',
    },
    {
      id: 'theme-cyberpunk',
      name: 'Cyberpunk Office',
      category: 'workspace-theme',
      preview: '🌃',
      tier: 'premium',
      description: 'Neon-lit workspace for the future',
    },
  ];
}
