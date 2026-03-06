#!/usr/bin/env bash
set -euo pipefail

# Prune remote branches that have no diff against the base branch (main).
# Dry-run by default — pass --execute to actually delete branches.

REMOTE="origin"
BASE="main"
EXECUTE=false
YES=false

# Color support
if [ -t 1 ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[0;33m'
    BOLD='\033[1m'
    RESET='\033[0m'
else
    RED='' GREEN='' YELLOW='' BOLD='' RESET=''
fi

usage() {
    cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Find and delete remote branches with no diff against the base branch.

Options:
  --execute       Actually delete branches (default is dry-run)
  --yes           Skip confirmation prompt (use with --execute)
  --remote NAME   Remote to operate on (default: origin)
  --base BRANCH   Base branch to compare against (default: main)
  -h, --help      Show this help message

Examples:
  $(basename "$0")                  # Dry-run: show what would be pruned
  $(basename "$0") --execute        # Delete with confirmation prompt
  $(basename "$0") --execute --yes  # Delete without prompt
EOF
    exit 0
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --execute) EXECUTE=true; shift ;;
        --yes) YES=true; shift ;;
        --remote) REMOTE="$2"; shift 2 ;;
        --base) BASE="$2"; shift 2 ;;
        -h|--help) usage ;;
        *) echo "Unknown option: $1"; usage ;;
    esac
done

# --- Preflight checks ---

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "Error: not inside a git repository." >&2
    exit 1
fi

if ! git remote | grep -qx "$REMOTE"; then
    echo "Error: remote '$REMOTE' not found." >&2
    exit 1
fi

echo "Fetching latest refs from $REMOTE..."
git fetch "$REMOTE" --prune

if ! git rev-parse --verify "$REMOTE/$BASE" >/dev/null 2>&1; then
    echo "Error: base branch '$REMOTE/$BASE' not found." >&2
    exit 1
fi

# --- Scan branches ---

prune_list=()
keep_list=()

while IFS= read -r ref; do
    # Strip leading whitespace and the remote prefix
    branch="${ref#"${REMOTE}/"}"

    # Skip protected branches
    case "$branch" in
        main|master|HEAD|"$BASE") continue ;;
        *" -> "*) continue ;;  # skip symbolic refs like HEAD -> origin/main
    esac

    if git diff "$REMOTE/$BASE"..."$REMOTE/$branch" --quiet 2>/dev/null; then
        prune_list+=("$branch")
    else
        keep_list+=("$branch")
    fi
done < <(git branch -r --list "${REMOTE}/*" --format='%(refname:short)')

# --- Report ---

echo ""
echo -e "${BOLD}Branch scan results:${RESET}"
echo ""

for branch in "${prune_list[@]+"${prune_list[@]}"}"; do
    echo -e "  ${RED}[PRUNE]${RESET} $REMOTE/$branch"
done
for branch in "${keep_list[@]+"${keep_list[@]}"}"; do
    echo -e "  ${GREEN}[KEEP]${RESET}  $REMOTE/$branch"
done

echo ""
echo "${#prune_list[@]} branch(es) to prune, ${#keep_list[@]} branch(es) to keep."

if [[ ${#prune_list[@]} -eq 0 ]]; then
    echo "Nothing to prune."
    exit 0
fi

# --- Execute or dry-run ---

if [[ "$EXECUTE" != true ]]; then
    echo ""
    echo -e "${YELLOW}Dry-run mode.${RESET} Run with --execute to delete these branches."
    exit 0
fi

# Confirmation prompt
if [[ "$YES" != true ]]; then
    echo ""
    read -rp "Delete ${#prune_list[@]} branch(es) from $REMOTE? [y/N] " confirm
    if [[ "$confirm" != [yY] ]]; then
        echo "Aborted."
        exit 0
    fi
fi

echo ""
deleted=0
failed=0
for branch in "${prune_list[@]}"; do
    if git push "$REMOTE" --delete "$branch" 2>/dev/null; then
        echo -e "  ${GREEN}Deleted${RESET} $REMOTE/$branch"
        ((deleted++))
    else
        echo -e "  ${RED}Failed${RESET}  $REMOTE/$branch" >&2
        ((failed++))
    fi
done

echo ""
echo "Done. Deleted $deleted branch(es), $failed failure(s)."

if [[ $failed -gt 0 ]]; then
    exit 2
fi
