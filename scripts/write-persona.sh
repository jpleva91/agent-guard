#!/usr/bin/env bash
# write-persona.sh — Writes .agentguard/persona.env for session identity
# Usage: scripts/write-persona.sh <driver> <role> [trust-tier] [autonomy]
#
# driver: human | claude-code | copilot | opencode | ci
# role:   developer | reviewer | ops | security | planner

set -euo pipefail

DRIVER="${1:?Usage: write-persona.sh <driver> <role> [trust-tier] [autonomy]}"
ROLE="${2:?Usage: write-persona.sh <driver> <role> [trust-tier] [autonomy]}"

# Default trust tier based on driver
case "$DRIVER" in
  human)       DEFAULT_TRUST="standard"; DEFAULT_AUTONOMY="supervised" ;;
  claude-code) DEFAULT_TRUST="standard"; DEFAULT_AUTONOMY="semi-autonomous" ;;
  copilot)     DEFAULT_TRUST="limited";  DEFAULT_AUTONOMY="semi-autonomous" ;;
  opencode)    DEFAULT_TRUST="standard"; DEFAULT_AUTONOMY="semi-autonomous" ;;
  ci)          DEFAULT_TRUST="standard"; DEFAULT_AUTONOMY="autonomous" ;;
  *)           DEFAULT_TRUST="standard"; DEFAULT_AUTONOMY="supervised" ;;
esac

TRUST_TIER="${3:-$DEFAULT_TRUST}"
AUTONOMY="${4:-$DEFAULT_AUTONOMY}"

# Auto-detect project from git
PROJECT=$(basename "$(git rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null || echo "unknown")

# Auto-detect model
MODEL="${CLAUDE_MODEL:-unknown}"
# Simplify model name (e.g., "claude-opus-4-6" -> "opus")
case "$MODEL" in
  *opus*)   MODEL="opus" ;;
  *sonnet*) MODEL="sonnet" ;;
  *haiku*)  MODEL="haiku" ;;
esac

# Derive risk tolerance from autonomy
case "$AUTONOMY" in
  autonomous)      RISK_TOLERANCE="conservative" ;;
  semi-autonomous) RISK_TOLERANCE="moderate" ;;
  supervised)      RISK_TOLERANCE="moderate" ;;
  *)               RISK_TOLERANCE="moderate" ;;
esac

# Derive provider from model/driver
PROVIDER="anthropic"
case "$DRIVER" in
  copilot)  PROVIDER="github" ;;
  opencode) PROVIDER="opencode" ;;
esac

RUNTIME="claude-code"
case "$DRIVER" in
  copilot)  RUNTIME="copilot" ;;
  opencode) RUNTIME="opencode" ;;
  ci)       RUNTIME="github-actions" ;;
esac

# Ensure directory exists
mkdir -p .agentguard

# Write persona file
cat > .agentguard/persona.env << ENVEOF
AGENTGUARD_PERSONA_DRIVER=$DRIVER
AGENTGUARD_PERSONA_MODEL=$MODEL
AGENTGUARD_PERSONA_ROLE=$ROLE
AGENTGUARD_PERSONA_PROJECT=$PROJECT
AGENTGUARD_PERSONA_TRUST_TIER=$TRUST_TIER
AGENTGUARD_PERSONA_AUTONOMY=$AUTONOMY
AGENTGUARD_PERSONA_RISK_TOLERANCE=$RISK_TOLERANCE
AGENTGUARD_PERSONA_RUNTIME=$RUNTIME
AGENTGUARD_PERSONA_PROVIDER=$PROVIDER
AGENTGUARD_PERSONA_TAGS=$ROLE,$DRIVER
AGENTGUARD_AGENT_NAME=$DRIVER:$MODEL:$ROLE
ENVEOF

echo "[AgentGuard] Identity set: $DRIVER:$MODEL:$ROLE (project: $PROJECT, trust: $TRUST_TIER)"
