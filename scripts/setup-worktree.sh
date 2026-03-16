#!/usr/bin/env bash
#
# setup-worktree.sh
# Copies .env files from the main worktree into the current worktree.
# Git worktrees don't include gitignored files, so this bridges the gap.
#
# Usage: Run from anywhere inside a worktree.

set -euo pipefail

ENV_FILES=(".env" ".env.local" ".env.vercel")

# Find the repo root of the current worktree
CURRENT_ROOT="$(git rev-parse --show-toplevel)"

# The main worktree is always the first entry in `git worktree list`
MAIN_ROOT="$(git worktree list --porcelain | head -1 | sed 's/^worktree //')"

if [ "$CURRENT_ROOT" = "$MAIN_ROOT" ]; then
  echo "Already in the main worktree — nothing to do."
  exit 0
fi

echo "Main worktree:    $MAIN_ROOT"
echo "Current worktree: $CURRENT_ROOT"
echo ""

# Detect platform: on Windows (Git Bash / MSYS2) use cp since symlinks need admin
use_copy=false
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) use_copy=true ;;
esac

for f in "${ENV_FILES[@]}"; do
  src="$MAIN_ROOT/$f"
  dest="$CURRENT_ROOT/$f"

  if [ ! -f "$src" ]; then
    echo "SKIP $f (not found in main worktree)"
    continue
  fi

  if [ -f "$dest" ]; then
    echo "SKIP $f (already exists in current worktree)"
    continue
  fi

  if $use_copy; then
    cp "$src" "$dest"
    echo "COPY $f"
  else
    ln -s "$src" "$dest"
    echo "LINK $f -> $src"
  fi
done

echo ""
echo "Done."
