#!/usr/bin/env bash
# session-persona-check.sh — SessionStart hook: checks for agent identity

PERSONA_FILE=".agentguard/persona.env"

if [ -f "$PERSONA_FILE" ]; then
  source "$PERSONA_FILE"
  echo "[AgentGuard] Identity loaded: ${AGENTGUARD_PERSONA_DRIVER:-?}:${AGENTGUARD_PERSONA_MODEL:-?}:${AGENTGUARD_PERSONA_ROLE:-?} (project: ${AGENTGUARD_PERSONA_PROJECT:-?})"
  exit 0
fi

# Auto-detect what we can
PROJECT=$(basename "$(git rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null || echo "unknown")
MODEL="${CLAUDE_MODEL:-unknown}"

echo "[AgentGuard] No agent identity set for this session."
echo "Project: $PROJECT | Model: $MODEL"
echo "Please ask the user:"
echo "  1. What role are you working in? (developer / reviewer / ops / security / planner)"
echo "  2. Who is driving this session? (human / claude-code / copilot / opencode / ci)"
echo "Then run: scripts/write-persona.sh <driver> <role>"
exit 0
