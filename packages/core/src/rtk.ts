// RTK (rtk-ai/rtk) detection and integration utility.
// RTK is a CLI proxy that reduces LLM token consumption by 60-90%
// through intelligent command output filtering.
// All functions are safe to call when rtk is not installed — they return graceful defaults.

import { execSync } from 'node:child_process';

const RTK_DETECT_TIMEOUT = 2_000;

export interface RtkDetectionResult {
  readonly available: boolean;
  readonly version?: string;
}

export interface RtkRewriteResult {
  readonly rewritten: boolean;
  readonly command: string;
}

let cachedDetection: RtkDetectionResult | null = null;

/**
 * Detect whether rtk is installed and available on PATH.
 * Result is cached for the lifetime of the process.
 */
export function detectRtk(): RtkDetectionResult {
  if (cachedDetection !== null) return cachedDetection;

  try {
    const output = execSync('rtk --version', {
      encoding: 'utf8',
      timeout: RTK_DETECT_TIMEOUT,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

    // rtk --version outputs something like "rtk 0.30.0" or just "0.30.0"
    const versionMatch = output.match(/(\d+\.\d+\.\d+)/);
    cachedDetection = {
      available: true,
      version: versionMatch?.[1],
    };
  } catch {
    cachedDetection = { available: false };
  }

  return cachedDetection;
}

/**
 * Ask rtk to rewrite a command for token-optimized output.
 * If rtk has an equivalent (exit 0), returns the rewritten command.
 * If no equivalent (exit 1) or rtk is unavailable, returns the original command.
 */
export function rtkRewrite(command: string): RtkRewriteResult {
  const rtk = detectRtk();
  if (!rtk.available) return { rewritten: false, command };

  try {
    const rewritten = execSync(`rtk rewrite ${JSON.stringify(command)}`, {
      encoding: 'utf8',
      timeout: RTK_DETECT_TIMEOUT,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

    if (rewritten) {
      return { rewritten: true, command: rewritten };
    }
  } catch {
    // Exit code 1 = no rtk equivalent, or rtk error — use original
  }

  return { rewritten: false, command };
}

/** Reset the cached detection result. Exported for testing. */
export function resetRtkCache(): void {
  cachedDetection = null;
}
