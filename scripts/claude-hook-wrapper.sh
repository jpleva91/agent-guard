#!/usr/bin/env bash
# claude-hook-wrapper.sh — Sources persona identity before running governance hook

# Source persona env vars if available (set -a exports all sourced vars)
if [ -f .agentguard/persona.env ]; then
  set -a
  source .agentguard/persona.env
  set +a
fi

# Pass through to the actual hook
exec agentguard claude-hook pre --store sqlite
