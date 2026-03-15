#!/usr/bin/env node
// Example: Wire AgentGuard into Claude Code as a PreToolUse hook.
//
// In your .claude/settings.json:
//   "hooks": {
//     "PreToolUse": [{ "command": "node examples/claude-code-hook.js" }]
//   }
//
// The hook reads the tool call from stdin, evaluates it through the kernel,
// and exits non-zero to block denied actions.

import { createKernel } from '../dist/agentguard/kernel.js';
import { normalizeClaudeCodeAction } from '../dist/agentguard/adapters/claude-code.js';
import { loadYamlPolicy } from '../dist/agentguard/policies/yaml-loader.js';
import { readFileSync, existsSync } from 'node:fs';

// Load policy from repo root (auto-discovered by the guard command too)
const policyPath = 'agentguard.yaml';
const policyDefs = existsSync(policyPath) ? [loadYamlPolicy(readFileSync(policyPath, 'utf8'))] : [];

const kernel = createKernel({ dryRun: true, policyDefs });

// Read hook payload from stdin
let input = '';
for await (const chunk of process.stdin) {
  input += chunk;
}

const payload = JSON.parse(input);
const rawAction = normalizeClaudeCodeAction({
  hook: 'PreToolUse',
  tool_name: payload.tool_name,
  tool_input: payload.tool_input,
});

const result = await kernel.propose(rawAction);

if (!result.allowed) {
  const reason = result.decision.decision.reason;
  console.error(`AgentGuard DENIED: ${reason}`);
  process.exit(1);
}
