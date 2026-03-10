// Plugin discovery — search for available AgentGuard plugins.
//
// Supports two discovery sources:
// 1. npm registry — search for packages with "agentguard-plugin" keyword
// 2. Local directory — scan a directory for plugin manifests
//
// Discovery is read-only — it finds plugins but does not install them.
// Use the PluginRegistry to install discovered plugins.

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { PluginType } from './types.js';

/** A discovered plugin that has not yet been installed */
export interface DiscoveredPlugin {
  /** Package or directory name */
  readonly name: string;
  /** Plugin version */
  readonly version: string;
  /** Brief description */
  readonly description: string;
  /** Plugin type if determinable */
  readonly type?: PluginType;
  /** Where this plugin was discovered */
  readonly source: 'npm' | 'local';
  /** Source-specific identifier (npm package name or file path) */
  readonly sourceId: string;
}

/** Options for npm registry search */
export interface NpmSearchOptions {
  /** npm registry URL (default: https://registry.npmjs.org) */
  readonly registryUrl?: string;
  /** Search keyword (default: "agentguard-plugin") */
  readonly keyword?: string;
  /** Maximum results to return (default: 20) */
  readonly limit?: number;
}

/** Options for local directory search */
export interface LocalSearchOptions {
  /** Directory to scan for plugins */
  readonly directory: string;
}

/**
 * Search the npm registry for AgentGuard plugins.
 *
 * Searches for packages with the "agentguard-plugin" keyword.
 * Uses the npm registry search API (/-/v1/search).
 */
export async function searchNpmPlugins(
  query?: string,
  options?: NpmSearchOptions
): Promise<readonly DiscoveredPlugin[]> {
  const registryUrl = options?.registryUrl ?? 'https://registry.npmjs.org';
  const keyword = options?.keyword ?? 'agentguard-plugin';
  const limit = options?.limit ?? 20;

  const searchTerms = query ? `${keyword} ${query}` : keyword;
  const url = `${registryUrl}/-/v1/search?text=keywords:${encodeURIComponent(searchTerms)}&size=${limit}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as NpmSearchResponse;
    return (data.objects ?? []).map((obj) => ({
      name: obj.package.name,
      version: obj.package.version,
      description: obj.package.description ?? '',
      source: 'npm' as const,
      sourceId: obj.package.name,
    }));
  } catch {
    // Network error or invalid response — return empty
    return [];
  }
}

/** npm search API response shape */
interface NpmSearchResponse {
  objects?: Array<{
    package: {
      name: string;
      version: string;
      description?: string;
      keywords?: string[];
    };
  }>;
}

/**
 * Search a local directory for AgentGuard plugins.
 *
 * Scans subdirectories for package.json files that contain
 * an "agentguard" field with plugin manifest data.
 */
export function searchLocalPlugins(options: LocalSearchOptions): readonly DiscoveredPlugin[] {
  const { directory } = options;

  if (!existsSync(directory)) {
    return [];
  }

  const results: DiscoveredPlugin[] = [];

  try {
    const entries = readdirSync(directory);

    for (const entry of entries) {
      const entryPath = join(directory, entry);
      const stat = statSync(entryPath);
      if (!stat.isDirectory()) continue;

      const pkgPath = join(entryPath, 'package.json');
      if (!existsSync(pkgPath)) continue;

      try {
        const raw = readFileSync(pkgPath, 'utf8');
        const pkg = JSON.parse(raw) as LocalPackageJson;

        // Check for agentguard manifest in package.json
        if (pkg.agentguard) {
          results.push({
            name: pkg.name ?? entry,
            version: pkg.version ?? '0.0.0',
            description: pkg.description ?? '',
            type: pkg.agentguard.type as PluginType | undefined,
            source: 'local',
            sourceId: entryPath,
          });
        }
      } catch {
        // Invalid package.json — skip
      }
    }
  } catch {
    // Directory read error — return what we have
  }

  return results;
}

/** Shape of a local package.json with agentguard metadata */
interface LocalPackageJson {
  name?: string;
  version?: string;
  description?: string;
  agentguard?: {
    type?: string;
  };
}
