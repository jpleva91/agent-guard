#!/usr/bin/env bash
# agent-identity-bridge.sh — Sets both cloud telemetry and hook persona identity
# Usage: source scripts/agent-identity-bridge.sh <agent-name> [trust-tier] [autonomy]
#
# Examples:
#   source scripts/agent-identity-bridge.sh "governance-log-audit"
#   source scripts/agent-identity-bridge.sh "security-scan" elevated autonomous

AGENT_NAME="${1:?Usage: source agent-identity-bridge.sh <agent-name> [trust-tier] [autonomy]}"
TRUST_TIER="${2:-standard}"
AUTONOMY="${3:-semi-autonomous}"

# Derive role from agent name
ROLE="developer"
case "$AGENT_NAME" in
  *review*|*pr-*|*audit*) ROLE="reviewer" ;;
  *security*|*scan*|*vulnerability*) ROLE="security" ;;
  *deploy*|*release*|*ops*|*ci*) ROLE="ops" ;;
  *test*|*qa*) ROLE="developer" ;;
esac

# Auto-detect model
_MODEL="${CLAUDE_MODEL:-unknown}"
case "$_MODEL" in
  *opus*) _MODEL="opus" ;;
  *sonnet*) _MODEL="sonnet" ;;
  *haiku*) _MODEL="haiku" ;;
esac

# Composite identity for telemetry: driver:model:role
export AGENTGUARD_AGENT_NAME="claude-code:${_MODEL}:${ROLE}"

# Derive risk tolerance from autonomy
RISK_TOLERANCE="moderate"
case "$AUTONOMY" in
  autonomous) RISK_TOLERANCE="conservative" ;;
  supervised) RISK_TOLERANCE="moderate" ;;
esac

# Hook persona identity
export AGENTGUARD_PERSONA_ROLE="$ROLE"
export AGENTGUARD_PERSONA_TRUST_TIER="$TRUST_TIER"
export AGENTGUARD_PERSONA_AUTONOMY="$AUTONOMY"
export AGENTGUARD_PERSONA_RISK_TOLERANCE="$RISK_TOLERANCE"
export AGENTGUARD_PERSONA_RUNTIME="claude-code"
export AGENTGUARD_PERSONA_PROVIDER="anthropic"
export AGENTGUARD_PERSONA_MODEL="${CLAUDE_MODEL:-unknown}"
export AGENTGUARD_PERSONA_TAGS="$ROLE,$AGENT_NAME"

# Persist to file for hook subprocess access
mkdir -p .agentguard
cat > .agentguard/persona.env << ENVEOF
AGENTGUARD_PERSONA_DRIVER=claude-code
AGENTGUARD_PERSONA_MODEL=${AGENTGUARD_PERSONA_MODEL}
AGENTGUARD_PERSONA_ROLE=${ROLE}
AGENTGUARD_PERSONA_PROJECT=$(basename "$(git rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null || echo "unknown")
AGENTGUARD_PERSONA_TRUST_TIER=${TRUST_TIER}
AGENTGUARD_PERSONA_AUTONOMY=${AUTONOMY}
AGENTGUARD_PERSONA_RISK_TOLERANCE=${RISK_TOLERANCE}
AGENTGUARD_PERSONA_RUNTIME=claude-code
AGENTGUARD_PERSONA_PROVIDER=anthropic
AGENTGUARD_PERSONA_TAGS=${ROLE},${AGENT_NAME}
AGENTGUARD_AGENT_NAME=claude-code:${_MODEL}:${ROLE}
ENVEOF
