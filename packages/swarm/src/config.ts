import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import type { SwarmConfig, SwarmTier } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(__dirname, '..');
const DEFAULT_CONFIG_PATH = join(
  PACKAGE_ROOT,
  'templates',
  'config',
  'agentguard-swarm.default.yaml',
);

export function loadDefaultConfig(): SwarmConfig {
  const raw = readFileSync(DEFAULT_CONFIG_PATH, 'utf8');
  return parseYaml(raw) as SwarmConfig;
}

export function loadConfig(projectRoot: string): SwarmConfig {
  const configPath = join(projectRoot, 'agentguard-swarm.yaml');
  const defaults = loadDefaultConfig();

  if (!existsSync(configPath)) {
    return defaults;
  }

  const raw = readFileSync(configPath, 'utf8');
  const userConfig = parseYaml(raw) as Partial<SwarmConfig>;

  return mergeConfig(defaults, userConfig);
}

function mergeConfig(defaults: SwarmConfig, overrides: Partial<SwarmConfig>): SwarmConfig {
  const user = overrides.swarm ?? {};

  return {
    swarm: {
      tiers: (user as Record<string, unknown>).tiers
        ? ((user as Record<string, unknown>).tiers as SwarmTier[])
        : defaults.swarm.tiers,
      schedules: {
        ...defaults.swarm.schedules,
        ...((user as Record<string, unknown>).schedules as Record<string, string> | undefined),
      },
      paths: {
        ...defaults.swarm.paths,
        ...((user as Record<string, unknown>).paths as Record<string, string> | undefined),
      },
      labels: {
        ...defaults.swarm.labels,
        ...((user as Record<string, unknown>).labels as Record<string, string> | undefined),
      },
      thresholds: {
        ...defaults.swarm.thresholds,
        ...((user as Record<string, unknown>).thresholds as Record<string, number> | undefined),
      },
    },
  };
}
