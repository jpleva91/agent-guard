// TUI formatting functions are now in @red-codes/renderers
// Re-export for local CLI usage
export type {
  TuiConfig,
  PolicyTraceEvent,
} from '@red-codes/renderers';
export {
  renderBanner,
  renderAction,
  renderViolations,
  renderMonitorStatus,
  renderSimulation,
  renderDecisionRecord,
  renderDecisionTable,
  renderKernelResult,
  renderActionGraph,
  renderPolicyTraces,
  renderEventStream,
} from '@red-codes/renderers';
