// agentguard config — unified configuration management

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { RESET, BOLD, DIM, FG } from '../colors.js';
import { findDefaultPolicy } from '../policy-resolver.js';
import { detectExistingHooks } from './auto-setup.js';

/** AgentGuard configuration schema. */
export interface AgentGuardConfig {
  storage?: 'sqlite';
  dbPath?: string;
  policy?: string;
  autoSetup?: boolean;
  viewer?: {
    autoOpen?: boolean;
  };
}

const CONFIG_FILENAME = 'config.yaml';
const DEFAULT_CONFIG: AgentGuardConfig = {
  storage: 'sqlite',
  autoSetup: true,
  viewer: { autoOpen: true },
};

/**
 * Resolve configuration by layering:
 * 1. Defaults
 * 2. User-level (~/.agentguard/config.yaml)
 * 3. Project-level (.agentguard/config.yaml)
 *
 * Higher layers override lower layers (project > user > defaults).
 */
export function resolveConfig(cwd: string = process.cwd()): AgentGuardConfig {
  const config = { ...DEFAULT_CONFIG, viewer: { ...DEFAULT_CONFIG.viewer } };

  // User-level config
  const userConfig = loadConfigFile(join(homedir(), '.agentguard', CONFIG_FILENAME));
  if (userConfig) mergeConfig(config, userConfig);

  // Project-level config
  const projectConfig = loadConfigFile(join(cwd, '.agentguard', CONFIG_FILENAME));
  if (projectConfig) mergeConfig(config, projectConfig);

  return config;
}

/** Load a config file from disk. Returns null if not found or invalid. */
export function loadConfigFile(filePath: string): AgentGuardConfig | null {
  if (!existsSync(filePath)) return null;

  try {
    const content = readFileSync(filePath, 'utf8').trim();
    if (!content) return null;

    // Simple YAML key-value parser (no external dependency)
    return parseSimpleYaml(content);
  } catch {
    return null;
  }
}

/** Save a config object to a YAML file. */
export function saveConfigFile(filePath: string, config: AgentGuardConfig): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const yaml = serializeSimpleYaml(config);
  writeFileSync(filePath, yaml, 'utf8');
}

/** Get a nested config value by dot-separated key path. */
export function getConfigValue(config: AgentGuardConfig, key: string): unknown {
  const parts = key.split('.');
  let current: unknown = config;

  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

const PROTOTYPE_POISON_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** Set a nested config value by dot-separated key path. */
export function setConfigValue(config: AgentGuardConfig, key: string, value: string): void {
  const parts = key.split('.');
  let current: Record<string, unknown> = config as Record<string, unknown>;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (PROTOTYPE_POISON_KEYS.has(part)) return;
    if (!(part in current) || typeof current[part] !== 'object' || current[part] === null) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }

  const lastKey = parts[parts.length - 1];
  if (PROTOTYPE_POISON_KEYS.has(lastKey)) return;

  // Type coercion for known boolean/number fields
  if (value === 'true') {
    current[lastKey] = true;
  } else if (value === 'false') {
    current[lastKey] = false;
  } else {
    current[lastKey] = value;
  }
}

/** Valid top-level config keys and their descriptions. */
const CONFIG_KEYS: Record<string, string> = {
  storage: 'Storage backend (sqlite)',
  dbPath: 'SQLite database file path',
  policy: 'Default policy file path',
  autoSetup: 'Auto-detect and configure hooks on session start',
  'viewer.autoOpen': 'Auto-open session viewer in browser',
};

/**
 * CLI handler for `agentguard config` command.
 *
 * Subcommands:
 *   show                Display all resolved config (user + project + defaults)
 *   get <key>           Get a specific config value
 *   set <key> <value>   Set a config value (project-level by default, --global for user-level)
 *   path                Show config file locations
 *   keys                List available config keys
 */
export async function config(args: string[]): Promise<number> {
  const sub = args[0];

  switch (sub) {
    case 'show':
      return showConfig(args.slice(1));
    case 'get':
      return getConfig(args.slice(1));
    case 'set':
      return setConfig(args.slice(1));
    case 'path':
      return showPaths();
    case 'keys':
      return showKeys();
    case 'help':
    case undefined:
      return showConfigHelp();
    default:
      process.stderr.write(`  ${FG.red}Error:${RESET} Unknown subcommand: ${sub}\n`);
      process.stderr.write(`  ${DIM}Run "agentguard config help" for usage.${RESET}\n`);
      return 1;
  }
}

function showConfig(args: string[]): number {
  const json = args.includes('--json');
  const cwd = process.cwd();
  const resolved = resolveConfig(cwd);

  // Also detect runtime context
  const policyPath = resolved.policy ?? findDefaultPolicy() ?? null;
  const hooksInstalled = detectExistingHooks(cwd);

  if (json) {
    console.log(JSON.stringify({ ...resolved, _runtime: { policyPath, hooksInstalled } }, null, 2));
    return 0;
  }

  process.stderr.write('\n');
  process.stderr.write(`  ${BOLD}AgentGuard Configuration${RESET}\n\n`);

  process.stderr.write(`  ${BOLD}Settings${RESET}\n`);
  process.stderr.write(`  ${DIM}storage${RESET}          ${resolved.storage ?? 'sqlite'}\n`);
  process.stderr.write(
    `  ${DIM}dbPath${RESET}           ${resolved.dbPath ?? '~/.agentguard/agentguard.db (default)'}\n`
  );
  process.stderr.write(`  ${DIM}policy${RESET}           ${policyPath ?? 'none (fail-open)'}\n`);
  process.stderr.write(
    `  ${DIM}autoSetup${RESET}        ${resolved.autoSetup !== false ? 'true' : 'false'}\n`
  );
  process.stderr.write(
    `  ${DIM}viewer.autoOpen${RESET}  ${resolved.viewer?.autoOpen !== false ? 'true' : 'false'}\n`
  );

  process.stderr.write('\n');
  process.stderr.write(`  ${BOLD}Runtime${RESET}\n`);
  const hooksIcon = hooksInstalled ? `${FG.green}✓${RESET}` : `${FG.red}✗${RESET}`;
  process.stderr.write(
    `  ${DIM}hooks${RESET}            ${hooksIcon} ${hooksInstalled ? 'installed' : 'not installed'}\n`
  );

  process.stderr.write('\n');
  process.stderr.write(`  ${BOLD}Config files${RESET}\n`);
  const userPath = join(homedir(), '.agentguard', CONFIG_FILENAME);
  const projectPath = join(cwd, '.agentguard', CONFIG_FILENAME);
  process.stderr.write(
    `  ${DIM}user${RESET}     ${existsSync(userPath) ? FG.green + '●' + RESET : FG.gray + '○' + RESET} ${userPath}\n`
  );
  process.stderr.write(
    `  ${DIM}project${RESET}  ${existsSync(projectPath) ? FG.green + '●' + RESET : FG.gray + '○' + RESET} ${projectPath}\n`
  );
  process.stderr.write('\n');

  return 0;
}

function getConfig(args: string[]): number {
  const key = args[0];
  if (!key) {
    process.stderr.write(
      `  ${FG.red}Error:${RESET} Missing key. Usage: agentguard config get <key>\n`
    );
    return 1;
  }

  if (!(key in CONFIG_KEYS)) {
    process.stderr.write(`  ${FG.red}Error:${RESET} Unknown key: ${key}\n`);
    process.stderr.write(`  ${DIM}Valid keys: ${Object.keys(CONFIG_KEYS).join(', ')}${RESET}\n`);
    return 1;
  }

  const resolved = resolveConfig();
  const value = getConfigValue(resolved, key);
  console.log(value === undefined ? '' : String(value));
  return 0;
}

function setConfig(args: string[]): number {
  const isGlobal = args.includes('--global') || args.includes('-g');
  const filtered = args.filter((a) => a !== '--global' && a !== '-g');
  const key = filtered[0];
  const value = filtered[1];

  if (!key || value === undefined) {
    process.stderr.write(
      `  ${FG.red}Error:${RESET} Usage: agentguard config set <key> <value> [--global]\n`
    );
    return 1;
  }

  if (!(key in CONFIG_KEYS)) {
    process.stderr.write(`  ${FG.red}Error:${RESET} Unknown key: ${key}\n`);
    process.stderr.write(`  ${DIM}Valid keys: ${Object.keys(CONFIG_KEYS).join(', ')}${RESET}\n`);
    return 1;
  }

  // Validate storage values
  if (key === 'storage' && value !== 'sqlite') {
    process.stderr.write(
      `  ${FG.red}Error:${RESET} Invalid storage backend: ${value}. Must be "sqlite".\n`
    );
    return 1;
  }

  const configDir = isGlobal ? join(homedir(), '.agentguard') : join(process.cwd(), '.agentguard');
  const configPath = join(configDir, CONFIG_FILENAME);

  // Load existing config or start fresh
  const existing = loadConfigFile(configPath) ?? {};
  setConfigValue(existing, key, value);
  saveConfigFile(configPath, existing);

  const scope = isGlobal ? 'user' : 'project';
  process.stderr.write(
    `  ${FG.green}✓${RESET}  Set ${FG.cyan}${key}${RESET} = ${value} ${DIM}(${scope})${RESET}\n`
  );
  return 0;
}

function showPaths(): number {
  const userPath = join(homedir(), '.agentguard', CONFIG_FILENAME);
  const projectPath = join(process.cwd(), '.agentguard', CONFIG_FILENAME);

  process.stderr.write('\n');
  process.stderr.write(
    `  ${BOLD}Config file locations${RESET} (higher precedence listed last)\n\n`
  );
  process.stderr.write(
    `  ${DIM}user${RESET}     ${existsSync(userPath) ? FG.green + '●' : FG.gray + '○'}${RESET} ${userPath}\n`
  );
  process.stderr.write(
    `  ${DIM}project${RESET}  ${existsSync(projectPath) ? FG.green + '●' : FG.gray + '○'}${RESET} ${projectPath}\n`
  );
  process.stderr.write('\n');
  return 0;
}

function showKeys(): number {
  process.stderr.write('\n');
  process.stderr.write(`  ${BOLD}Available config keys${RESET}\n\n`);
  for (const [key, desc] of Object.entries(CONFIG_KEYS)) {
    process.stderr.write(`  ${FG.cyan}${key}${RESET}  ${DIM}${desc}${RESET}\n`);
  }
  process.stderr.write('\n');
  return 0;
}

function showConfigHelp(): number {
  process.stderr.write(`
  ${BOLD}agentguard config${RESET} — Manage AgentGuard configuration

  ${BOLD}Usage:${RESET}
    agentguard config show [--json]          Display resolved configuration
    agentguard config get <key>              Get a specific value
    agentguard config set <key> <value>      Set a project-level value
    agentguard config set <key> <value> -g   Set a user-level value
    agentguard config path                   Show config file paths
    agentguard config keys                   List available keys

  ${BOLD}Config layers${RESET} (highest precedence last):
    1. Built-in defaults
    2. User:    ~/.agentguard/config.yaml
    3. Project: .agentguard/config.yaml

  ${BOLD}Examples:${RESET}
    agentguard config show
    agentguard config set storage sqlite
    agentguard config set autoSetup false --global
    agentguard config get viewer.autoOpen
`);
  return 0;
}

// --- Simple YAML parser/serializer (no external deps) ---

function parseSimpleYaml(content: string): AgentGuardConfig {
  const config: Record<string, unknown> = {};
  const lines = content.split('\n');
  let currentSection: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Nested key (2-space indent): belongs to current section
    if (line.startsWith('  ') && currentSection) {
      const match = trimmed.match(/^(\w+):\s*(.+)$/);
      if (match) {
        const parent = config[currentSection] as Record<string, unknown> | undefined;
        if (parent && typeof parent === 'object') {
          parent[match[1]] = parseYamlValue(match[2]);
        }
      }
      continue;
    }

    // Section header (key with no value or object value)
    const sectionMatch = trimmed.match(/^(\w+):\s*$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      config[currentSection] = {};
      continue;
    }

    // Top-level key: value
    const kvMatch = trimmed.match(/^(\w+):\s*(.+)$/);
    if (kvMatch) {
      currentSection = null;
      config[kvMatch[1]] = parseYamlValue(kvMatch[2]);
    }
  }

  return config as AgentGuardConfig;
}

function parseYamlValue(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null' || trimmed === '~') return undefined;
  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);
  // Strip quotes
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function serializeSimpleYaml(config: AgentGuardConfig): string {
  const lines: string[] = [
    '# AgentGuard configuration',
    '# Docs: https://github.com/AgentGuardHQ/agent-guard',
    '',
  ];

  const obj = config as Record<string, unknown>;
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;

    if (typeof value === 'object' && value !== null) {
      lines.push(`${key}:`);
      for (const [subKey, subValue] of Object.entries(value as Record<string, unknown>)) {
        if (subValue === undefined) continue;
        lines.push(`  ${subKey}: ${formatYamlValue(subValue)}`);
      }
    } else {
      lines.push(`${key}: ${formatYamlValue(value)}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

function formatYamlValue(value: unknown): string {
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') {
    // Quote strings with spaces or special characters
    if (/[\s:#{}[\],&*?|>!'"%@`\\]/.test(value)) {
      return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    }
    return value;
  }
  return String(value);
}

function mergeConfig(target: AgentGuardConfig, source: AgentGuardConfig): void {
  if (source.storage !== undefined) target.storage = source.storage;
  if (source.dbPath !== undefined) target.dbPath = source.dbPath;
  if (source.policy !== undefined) target.policy = source.policy;
  if (source.autoSetup !== undefined) target.autoSetup = source.autoSetup;
  if (source.viewer) {
    if (!target.viewer) target.viewer = {};
    if (source.viewer.autoOpen !== undefined) {
      target.viewer.autoOpen = source.viewer.autoOpen;
    }
  }
}
