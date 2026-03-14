import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SwarmManifest, SwarmAgent, SwarmConfig, SwarmTier } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(__dirname, '..');
const MANIFEST_PATH = join(PACKAGE_ROOT, 'manifest.json');

export function loadManifest(): SwarmManifest {
  const raw = readFileSync(MANIFEST_PATH, 'utf8');
  return JSON.parse(raw) as SwarmManifest;
}

export function filterAgentsByTier(
  agents: readonly SwarmAgent[],
  enabledTiers: readonly SwarmTier[],
): SwarmAgent[] {
  return agents.filter((a) => enabledTiers.includes(a.tier));
}

export function resolveSchedule(agent: SwarmAgent, config: SwarmConfig): string {
  return config.swarm.schedules[agent.id] ?? agent.cron;
}

export function collectSkills(agents: readonly SwarmAgent[]): string[] {
  const seen = new Set<string>();
  for (const agent of agents) {
    for (const skill of agent.skills) {
      seen.add(skill);
    }
  }
  return [...seen].sort();
}
