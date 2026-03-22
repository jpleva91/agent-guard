// apps/cli/src/templates/scripts.ts
// Embedded identity script templates — copied to user's project during claude-init

export const AGENT_IDENTITY_BRIDGE = `#!/usr/bin/env bash
# agent-identity-bridge.sh — Sets both cloud telemetry and hook persona identity
# Usage: source scripts/agent-identity-bridge.sh <agent-name> [trust-tier] [autonomy]
#
# Examples:
#   source scripts/agent-identity-bridge.sh "governance-log-audit"
#   source scripts/agent-identity-bridge.sh "security-scan" elevated autonomous

AGENT_NAME="\${1:?Usage: source agent-identity-bridge.sh <agent-name> [trust-tier] [autonomy]}"
TRUST_TIER="\${2:-standard}"
AUTONOMY="\${3:-semi-autonomous}"

# Derive role from agent name
ROLE="developer"
case "\$AGENT_NAME" in
  *review*|*pr-*|*audit*) ROLE="reviewer" ;;
  *security*|*scan*|*vulnerability*) ROLE="security" ;;
  *deploy*|*release*|*ops*|*ci*) ROLE="ops" ;;
  *test*|*qa*) ROLE="developer" ;;
esac

# Auto-detect model
_MODEL="\${CLAUDE_MODEL:-unknown}"
case "\$_MODEL" in
  *opus*) _MODEL="opus" ;;
  *sonnet*) _MODEL="sonnet" ;;
  *haiku*) _MODEL="haiku" ;;
esac

# Composite identity for telemetry: driver:model:role
export AGENTGUARD_AGENT_NAME="claude-code:\${_MODEL}:\${ROLE}"

# Derive risk tolerance from autonomy
RISK_TOLERANCE="moderate"
case "\$AUTONOMY" in
  autonomous) RISK_TOLERANCE="conservative" ;;
  supervised) RISK_TOLERANCE="moderate" ;;
esac

# Hook persona identity
export AGENTGUARD_PERSONA_ROLE="\$ROLE"
export AGENTGUARD_PERSONA_TRUST_TIER="\$TRUST_TIER"
export AGENTGUARD_PERSONA_AUTONOMY="\$AUTONOMY"
export AGENTGUARD_PERSONA_RISK_TOLERANCE="\$RISK_TOLERANCE"
export AGENTGUARD_PERSONA_RUNTIME="claude-code"
export AGENTGUARD_PERSONA_PROVIDER="anthropic"
export AGENTGUARD_PERSONA_MODEL="\${CLAUDE_MODEL:-unknown}"
export AGENTGUARD_PERSONA_TAGS="\$ROLE,\$AGENT_NAME"

# Persist to file for hook subprocess access
mkdir -p .agentguard
cat > .agentguard/persona.env << ENVEOF
AGENTGUARD_PERSONA_DRIVER=claude-code
AGENTGUARD_PERSONA_MODEL=\${AGENTGUARD_PERSONA_MODEL}
AGENTGUARD_PERSONA_ROLE=\${ROLE}
AGENTGUARD_PERSONA_PROJECT=\$(basename "\$(git rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null || echo "unknown")
AGENTGUARD_PERSONA_TRUST_TIER=\${TRUST_TIER}
AGENTGUARD_PERSONA_AUTONOMY=\${AUTONOMY}
AGENTGUARD_PERSONA_RISK_TOLERANCE=\${RISK_TOLERANCE}
AGENTGUARD_PERSONA_RUNTIME=claude-code
AGENTGUARD_PERSONA_PROVIDER=anthropic
AGENTGUARD_PERSONA_TAGS=\${ROLE},\${AGENT_NAME}
AGENTGUARD_AGENT_NAME=claude-code:\${_MODEL}:\${ROLE}
ENVEOF
`;

export const WRITE_PERSONA = `#!/usr/bin/env bash
# write-persona.sh — Writes .agentguard/persona.env for session identity
# Usage: scripts/write-persona.sh <driver> <role> [trust-tier] [autonomy]
#
# driver: human | claude-code | copilot | ci
# role:   developer | reviewer | ops | security | planner

set -euo pipefail

DRIVER="\${1:?Usage: write-persona.sh <driver> <role> [trust-tier] [autonomy]}"
ROLE="\${2:?Usage: write-persona.sh <driver> <role> [trust-tier] [autonomy]}"

# Default trust tier based on driver
case "\$DRIVER" in
  human)       DEFAULT_TRUST="standard"; DEFAULT_AUTONOMY="supervised" ;;
  claude-code) DEFAULT_TRUST="standard"; DEFAULT_AUTONOMY="semi-autonomous" ;;
  copilot)     DEFAULT_TRUST="limited";  DEFAULT_AUTONOMY="semi-autonomous" ;;
  ci)          DEFAULT_TRUST="standard"; DEFAULT_AUTONOMY="autonomous" ;;
  *)           DEFAULT_TRUST="standard"; DEFAULT_AUTONOMY="supervised" ;;
esac

TRUST_TIER="\${3:-\$DEFAULT_TRUST}"
AUTONOMY="\${4:-\$DEFAULT_AUTONOMY}"

# Auto-detect project from git
PROJECT=\$(basename "\$(git rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null || echo "unknown")

# Auto-detect model
MODEL="\${CLAUDE_MODEL:-unknown}"
# Simplify model name (e.g., "claude-opus-4-6" -> "opus")
case "\$MODEL" in
  *opus*)   MODEL="opus" ;;
  *sonnet*) MODEL="sonnet" ;;
  *haiku*)  MODEL="haiku" ;;
esac

# Derive risk tolerance from autonomy
case "\$AUTONOMY" in
  autonomous)      RISK_TOLERANCE="conservative" ;;
  semi-autonomous) RISK_TOLERANCE="moderate" ;;
  supervised)      RISK_TOLERANCE="moderate" ;;
  *)               RISK_TOLERANCE="moderate" ;;
esac

# Derive provider from model/driver
PROVIDER="anthropic"
case "\$DRIVER" in
  copilot) PROVIDER="github" ;;
esac

RUNTIME="claude-code"
case "\$DRIVER" in
  copilot) RUNTIME="copilot" ;;
  ci)      RUNTIME="github-actions" ;;
esac

# Ensure directory exists
mkdir -p .agentguard

# Write persona file
cat > .agentguard/persona.env << ENVEOF
AGENTGUARD_PERSONA_DRIVER=\$DRIVER
AGENTGUARD_PERSONA_MODEL=\$MODEL
AGENTGUARD_PERSONA_ROLE=\$ROLE
AGENTGUARD_PERSONA_PROJECT=\$PROJECT
AGENTGUARD_PERSONA_TRUST_TIER=\$TRUST_TIER
AGENTGUARD_PERSONA_AUTONOMY=\$AUTONOMY
AGENTGUARD_PERSONA_RISK_TOLERANCE=\$RISK_TOLERANCE
AGENTGUARD_PERSONA_RUNTIME=\$RUNTIME
AGENTGUARD_PERSONA_PROVIDER=\$PROVIDER
AGENTGUARD_PERSONA_TAGS=\$ROLE,\$DRIVER
AGENTGUARD_AGENT_NAME=\$DRIVER:\$MODEL:\$ROLE
ENVEOF

echo "[AgentGuard] Identity set: \$DRIVER:\$MODEL:\$ROLE (project: \$PROJECT, trust: \$TRUST_TIER)"
`;

export const SESSION_PERSONA_CHECK = `#!/usr/bin/env bash
# session-persona-check.sh — SessionStart hook: checks for agent identity

PERSONA_FILE=".agentguard/persona.env"

if [ -f "\$PERSONA_FILE" ]; then
  source "\$PERSONA_FILE"
  echo "[AgentGuard] Identity loaded: \${AGENTGUARD_PERSONA_DRIVER:-?}:\${AGENTGUARD_PERSONA_MODEL:-?}:\${AGENTGUARD_PERSONA_ROLE:-?} (project: \${AGENTGUARD_PERSONA_PROJECT:-?})"
  exit 0
fi

# Auto-detect what we can
PROJECT=\$(basename "\$(git rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null || echo "unknown")
MODEL="\${CLAUDE_MODEL:-unknown}"

echo "[AgentGuard] No agent identity set for this session."
echo "Project: \$PROJECT | Model: \$MODEL"
echo "Please ask the user:"
echo "  1. What role are you working in? (developer / reviewer / ops / security / planner)"
echo "  2. Who is driving this session? (human / claude-code / copilot / ci)"
echo "Then run: scripts/write-persona.sh <driver> <role>"
exit 0
`;

/** Hook wrapper template — needs CLI prefix injected */
export function claudeHookWrapper(
  cliPrefix: string,
  storeSuffix: string,
  dbPathSuffix: string
): string {
  return `#!/usr/bin/env bash
# claude-hook-wrapper.sh — Sources persona identity before running governance hook

# Resolve project root (hook CWD may not match the project directory)
AGENTGUARD_WORKSPACE="\$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
export AGENTGUARD_WORKSPACE

# Source persona env vars if available (set -a exports all sourced vars)
if [ -f "\$AGENTGUARD_WORKSPACE/.agentguard/persona.env" ]; then
  set -a
  source "\$AGENTGUARD_WORKSPACE/.agentguard/persona.env"
  set +a
fi

# Pass through to the actual hook
exec ${cliPrefix} claude-hook pre${storeSuffix}${dbPathSuffix}
`;
}
