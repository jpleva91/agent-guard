# Skill: Release Prepare

Prepare a new release: validate the codebase, generate a changelog from merged PRs, bump the version, and create a release-candidate issue for human approval. Designed for manual invocation when the maintainer decides to release.

## Prerequisites

Run `start-governance-runtime` first. All release operations must be governed.

## Steps

### 1. Start Governance Runtime

Invoke the `start-governance-runtime` skill to ensure the AgentGuard kernel is active. If governance cannot be activated, STOP.

### 2. Determine Current Version

```bash
node -e "console.log(require('./package.json').version)"
```

### 3. Determine Version Bump

Check merged PRs since the last release to determine the appropriate semver bump:

```bash
gh release list --limit 1 --json tagName --jq '.[0].tagName'
```

```bash
gh pr list --state merged --base main --json title,labels,mergedAt --limit 50 --jq '[.[] | select(.mergedAt > "<last-release-date>")]'
```

Determine bump type from PR titles/labels:
- Any PR with `breaking` label or title containing "BREAKING" → **major**
- Any PR with `feat` prefix or `enhancement` label → **minor**
- All else (fix, chore, docs, refactor) → **patch**

### 4. Run Full Test Suite

Invoke the `full-test` skill. ALL 7 checks must pass. If any check fails, STOP — do not proceed with a broken release.

### 5. Generate Changelog

From the merged PRs since last release, generate a changelog:

```
## What's Changed

### Features
- <PR title> (#<number>) by @<author>

### Bug Fixes
- <PR title> (#<number>) by @<author>

### Maintenance
- <PR title> (#<number>) by @<author>

**Full Changelog**: <compare-url>
```

Group PRs by prefix: `feat` → Features, `fix` → Bug Fixes, everything else → Maintenance.

### 6. Bump Version

```bash
npm version <patch|minor|major> --no-git-tag-version
```

Stage the version change:

```bash
git add package.json package-lock.json
git commit -m "chore: bump version to <new-version>"
```

### 7. Create Release Branch

```bash
git checkout -b release/v<new-version>
git push -u origin release/v<new-version>
```

### 8. Create Release Candidate Issue

Ensure labels exist:

```bash
gh label create "source:release-agent" --color "0E8A16" --description "Auto-created by Release Agent" 2>/dev/null || true
gh label create "release-candidate" --color "FBCA04" --description "Pending human approval for release" 2>/dev/null || true
```

Create the tracking issue:

```bash
gh issue create \
  --title "Release v<new-version> — awaiting approval" \
  --body "<changelog + test results + release checklist>" \
  --label "source:release-agent" --label "release-candidate"
```

The issue body should include:
- Version: `<old-version>` → `<new-version>` (<bump-type>)
- Changelog (from step 5)
- Test results summary (from step 4)
- Release checklist:
  - [ ] Changelog reviewed
  - [ ] Version number correct
  - [ ] All tests passing
  - [ ] Ready to publish

### 9. Summary

Report:
- **Version**: `<old>` → `<new>` (<bump-type>)
- **PRs included**: N
- **Tests**: all passing / N failures
- **Branch**: `release/v<new-version>` pushed
- **Issue**: #<N> created — awaiting human approval
- **Next step**: Human approves → run `release-publish` skill

## Rules

- **Never create a GitHub Release directly** — that triggers npm publish. Only create the tracking issue.
- **Never publish to npm** — that is the `release-publish` skill's job after human approval.
- **Never force-push** the release branch.
- If the full test suite fails, STOP and report — do not prepare a broken release.
- If there are no merged PRs since the last release, report "Nothing to release" and STOP.
- If `gh` CLI is not authenticated, STOP — release preparation requires GitHub access.
- The release candidate issue MUST be reviewed and approved by a human before proceeding to `release-publish`.
