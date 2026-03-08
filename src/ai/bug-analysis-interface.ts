/**
 * AI Bug Analysis Interface — Provider-agnostic contracts.
 *
 * Defines how AI models can analyze bugs detected by BugMon.
 * Consumers program against the BugAnalyzer interface; implementations
 * can be swapped without changing consuming code.
 *
 * The StubAnalyzer provides a no-op default for testing and development.
 *
 * TODO(roadmap): Phase 9 — Context-aware fix suggestions based on error type + stack trace
 * TODO(roadmap): Phase 9 — AI-suggested battle strategies based on error context
 * TODO(roadmap): Phase 9 — Automated fix verification (does the fix resolve the event?)
 * TODO(roadmap): Phase 9 — AI pattern detection (recurring error clusters across sessions)
 * TODO(roadmap): Phase 9 — Team observability (aggregate Grimoire across a dev team)
 */

import type { BugAnalysis, BugAnalyzer, BugEvent } from '../core/types.js';

/**
 * StubAnalyzer — Default no-op implementation.
 *
 * Returns generic suggestions. Replace with a real AI provider
 * (OpenAI, Anthropic, local model) by implementing BugAnalyzer.
 */
export class StubAnalyzer implements BugAnalyzer {
  async analyzeBug(bug: BugEvent): Promise<BugAnalysis> {
    return {
      suggestedFix: `Review the ${bug.type} error in ${bug.file ?? 'unknown file'}: ${bug.errorMessage}`,
      confidence: 0.1,
      category: bug.type,
      relatedPatterns: [],
    };
  }
}

/**
 * Compose multiple analyzers. Runs all in parallel, returns
 * the result with the highest confidence.
 */
export async function analyzeWithBest(
  analyzers: BugAnalyzer[],
  bug: BugEvent
): Promise<BugAnalysis> {
  const results = await Promise.all(analyzers.map((a) => a.analyzeBug(bug)));
  return results.reduce((best, current) => (current.confidence > best.confidence ? current : best));
}

// Re-export types for convenience
export type { BugAnalyzer, BugAnalysis } from '../core/types.js';
