#!/usr/bin/env bash
set -euo pipefail

# prepare-release.sh — Automate the correct release ordering.
#
# Usage:
#   ./scripts/prepare-release.sh [--dry-run]
#
# This script:
#   1. Reads the version from apps/cli/package.json
#   2. Verifies the version hasn't already been tagged
#   3. Creates the git tag (vX.Y.Z)
#   4. Pushes the tag
#   5. Creates a GitHub release (triggers the publish workflow)
#
# This ensures the tag always points to a commit that has the
# matching version in package.json (fixes #1239).

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
fi

# Must be run from repo root
if [[ ! -f "apps/cli/package.json" ]]; then
  echo "Error: must be run from the agent-guard repo root" >&2
  exit 1
fi

# Read version from package.json
VERSION=$(node -p "require('./apps/cli/package.json').version")
TAG="v${VERSION}"

echo "Version from apps/cli/package.json: ${VERSION}"
echo "Tag: ${TAG}"

# Check working tree is clean
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Error: working tree is dirty. Commit or stash changes first." >&2
  exit 1
fi

# Verify we're on main
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$BRANCH" != "main" ]]; then
  echo "Warning: not on main branch (currently on ${BRANCH})"
  read -rp "Continue anyway? [y/N] " confirm
  if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    exit 1
  fi
fi

# Check tag doesn't already exist
if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "Error: tag ${TAG} already exists" >&2
  echo "If you need to re-release, delete the tag first:" >&2
  echo "  git tag -d ${TAG} && git push origin :refs/tags/${TAG}" >&2
  exit 1
fi

if $DRY_RUN; then
  echo ""
  echo "[dry-run] Would create tag ${TAG} at $(git rev-parse --short HEAD)"
  echo "[dry-run] Would push tag to origin"
  echo "[dry-run] Would create GitHub release '${TAG}'"
  exit 0
fi

# Create and push tag
echo ""
echo "Creating tag ${TAG}..."
git tag -a "$TAG" -m "Release ${VERSION}"

echo "Pushing tag to origin..."
git push origin "$TAG"

# Create GitHub release (triggers publish workflow)
echo "Creating GitHub release..."
gh release create "$TAG" \
  --title "${TAG}" \
  --generate-notes

echo ""
echo "Done! Release ${TAG} created."
echo "The 'Publish to npm' workflow should trigger automatically."
echo "Monitor: gh run list --workflow=publish.yml"
