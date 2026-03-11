// Renderer plugin system — re-exports for public API.

export type {
  GovernanceRenderer,
  PolicyTracePayload,
  RendererConfig,
  RunSummary,
} from './types.js';

export { createRendererRegistry } from './registry.js';
export type { RendererRegistry } from './registry.js';

export { createTuiRenderer } from './tui-renderer.js';
export type { TuiRendererOptions } from './tui-renderer.js';
