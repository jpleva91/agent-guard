// Policy composer — merges multiple policy sources with defined precedence.
// Supports layered policy composition: base → project → explicit overrides.
// Pure domain logic. No DOM, no process-specific APIs.

import type { LoadedPolicy } from './evaluator.js';

export interface CompositionSource {
  path: string;
  layer: 'user' | 'project' | 'explicit';
  policy: LoadedPolicy;
}

export interface CompositionResult {
  policies: LoadedPolicy[];
  sources: CompositionSource[];
  layers: {
    user: number;
    project: number;
    explicit: number;
  };
}

/**
 * Compose multiple policy sources into a single ordered policy array.
 *
 * Precedence order (lowest to highest):
 * 1. User-level policies (`~/.agentguard/policy.yaml`) — org-wide defaults
 * 2. Project-level policies (`./agentguard.yaml`) — project-specific rules
 * 3. Explicit policies (`--policy` flags) — command-line overrides
 *
 * Within each layer, policies are ordered as provided. Later policies
 * in the final array have higher precedence during evaluation.
 *
 * The evaluator checks deny rules first across all policies (first match wins),
 * then allow rules (first match wins). This means deny is authoritative —
 * a deny in any layer blocks the action regardless of allows in higher layers.
 */
export function composePolicies(sources: CompositionSource[]): CompositionResult {
  const layerOrder: CompositionSource['layer'][] = ['user', 'project', 'explicit'];
  const sorted = [...sources].sort(
    (a, b) => layerOrder.indexOf(a.layer) - layerOrder.indexOf(b.layer)
  );

  const policies = sorted.map((s) => s.policy);
  const layers = {
    user: sorted.filter((s) => s.layer === 'user').length,
    project: sorted.filter((s) => s.layer === 'project').length,
    explicit: sorted.filter((s) => s.layer === 'explicit').length,
  };

  return { policies, sources: sorted, layers };
}

/**
 * Build a summary of the composed policy stack for audit/display purposes.
 */
export function describeComposition(result: CompositionResult): string {
  if (result.sources.length === 0) return 'No policies loaded (fail-open)';
  if (result.sources.length === 1) return result.sources[0].path;

  const lines: string[] = [];
  lines.push(`${result.sources.length} policies composed:`);

  for (const source of result.sources) {
    const label =
      source.layer === 'user' ? 'user' : source.layer === 'project' ? 'project' : 'override';
    lines.push(`  [${label}] ${source.path} (${source.policy.rules.length} rules)`);
  }

  return lines.join('\n');
}
