// Hook integrity verification for Claude Code settings.json.
// Detects tampering of AgentGuard-owned hook entries using SHA-256 checksums.

import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { computeSHA256, loadTrustStore, saveTrustStore } from '@red-codes/core';

function canonicalPath(filePath: string): string {
  try {
    return realpathSync(filePath);
  } catch {
    return filePath;
  }
}

/** Hook types recognized by Claude Code and AgentGuard. */
const HOOK_TYPES = ['Notification', 'PostToolUse', 'PreToolUse', 'SessionStart', 'Stop'] as const;

/** An entry in a hook type array within settings.json */
interface HookEntry {
  matcher?: string;
  hooks?: Array<{ type?: string; command?: string }>;
  [key: string]: unknown;
}

/** Parsed hooks object from settings.json */
interface HooksSettings {
  hooks?: Record<string, HookEntry[]>;
  [key: string]: unknown;
}

/**
 * Returns true if any hook command in the entry references AgentGuard.
 */
function isAgentGuardEntry(entry: HookEntry): boolean {
  if (!Array.isArray(entry.hooks)) return false;
  return entry.hooks.some(
    (h) =>
      typeof h.command === 'string' &&
      (h.command.includes('claude-hook') || h.command.includes('agentguard')),
  );
}

/**
 * Reads .claude/settings.json (or the provided path), extracts AgentGuard-owned
 * hook entries, and computes a deterministic SHA-256 hash over them.
 * Returns `null` if the file cannot be read, parsed, or contains no AgentGuard hooks.
 */
export function computeHookHash(settingsPath: string): string | null {
  if (!existsSync(settingsPath)) return null;

  let parsed: HooksSettings;
  try {
    parsed = JSON.parse(readFileSync(settingsPath, 'utf8')) as HooksSettings;
  } catch {
    return null;
  }

  const hooksObj = parsed.hooks ?? {};

  // For each known hook type, collect AgentGuard-owned entries.
  // Sort by hook type name (HOOK_TYPES is already alphabetically sorted) for determinism.
  const extracted: Array<{ hookType: string; entries: HookEntry[] }> = [];

  for (const hookType of HOOK_TYPES) {
    const typeEntries = hooksObj[hookType];
    if (!Array.isArray(typeEntries)) continue;
    const agEntries = typeEntries.filter(isAgentGuardEntry);
    if (agEntries.length > 0) {
      extracted.push({ hookType, entries: agEntries });
    }
  }

  if (extracted.length === 0) return null;

  const serialized = JSON.stringify(extracted);
  return computeSHA256(serialized);
}

/**
 * Computes the current hook hash and stores it in the AgentGuard trust store
 * under the key `hook:<canonical settingsPath>`.
 * Does nothing if there are no AgentGuard hooks to baseline.
 */
export function storeHookBaseline(settingsPath: string): void {
  const hash = computeHookHash(settingsPath);
  if (hash === null) return;

  const canonical = canonicalPath(settingsPath);
  const key = `hook:${canonical}`;
  const store = loadTrustStore();
  store.entries[key] = {
    path: canonical,
    hash,
    trustedAt: new Date().toISOString(),
    trustedBy: 'user',
  };
  saveTrustStore(store);
}

/**
 * Verifies that the current AgentGuard hook entries in settings.json match
 * the stored baseline hash.
 *
 * Returns:
 *   - `'verified'`      — hash matches the stored baseline
 *   - `'tampered'`      — hash does not match the stored baseline
 *   - `'no_baseline'`   — AgentGuard hooks present but no baseline stored
 *   - `'hooks_missing'` — no AgentGuard hooks found in the settings file
 */
export function verifyHookIntegrity(
  settingsPath: string,
): 'verified' | 'tampered' | 'no_baseline' | 'hooks_missing' {
  const currentHash = computeHookHash(settingsPath);
  if (currentHash === null) return 'hooks_missing';

  const canonical = canonicalPath(settingsPath);
  const key = `hook:${canonical}`;
  const store = loadTrustStore();
  const entry = store.entries[key];
  if (!entry) return 'no_baseline';

  return currentHash === entry.hash ? 'verified' : 'tampered';
}
