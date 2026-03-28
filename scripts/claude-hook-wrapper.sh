#!/usr/bin/env bash
# claude-hook-wrapper.sh — Sources persona identity before running governance hook
# SECURITY: This script MUST fail closed. If the kernel binary cannot be found,
# it outputs a block response so Claude Code denies the action.

# Resolve project root (hook CWD may not match the project directory)
AGENTGUARD_WORKSPACE="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
export AGENTGUARD_WORKSPACE

# Source persona env vars if available (set -a exports all sourced vars)
if [ -f "$AGENTGUARD_WORKSPACE/.agentguard/persona.env" ]; then
  set -a
  source "$AGENTGUARD_WORKSPACE/.agentguard/persona.env"
  set +a
fi

AGENTGUARD_BIN="node apps/cli/dist/bin.js"

# Pass through to the actual hook
exec $AGENTGUARD_BIN claude-hook pre --store sqlite
