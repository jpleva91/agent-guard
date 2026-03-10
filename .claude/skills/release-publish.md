# Skill: Release Publish

Publish a release after human approval. Creates a GitHub Release (which triggers the `publish.yml` workflow for npm publication), posts release notes, and closes the tracking issue. Only run after `release-prepare` and human approval.

## Prerequisites

- Run `start-governance-runtime` first. All release operations must be governed.
- A release candidate issue with label `release-candidate` must exist and be approved by a human.
- The release branch `release/v<version>` must exist.

## Steps

### 1. Start Governance Runtime

Invoke the `start-governance-runtime` skill to ensure the AgentGuard kernel is active. If governance cannot be activated, STOP.

### 2. Verify Approval

Find the open release candidate issue:

```bash
gh issue list --state open --label "release-candidate" --json number,title --limit 1
```

If no open release candidate issue exists, STOP — nothing to publish.

Check that the issue has been approved (human has commented with approval or checked all checklist items):

```bash
gh issue view <ISSUE_NUMBER> --json body,comments
```

Look for:
- All checklist items checked (`[x]`)
- Or a comment containing "approved", "lgtm", or "ship it"

If not approved, report "Release candidate #<N> has not been approved yet" and STOP.

### 3. Verify Release Branch

```bash
git fetch origin
git checkout release/v<version>
git log --oneline -1
```

Verify the branch exists and the latest commit is the version bump.

### 4. Final Test Verification

Run the full test suite one more time on the release branch:

```bash
npm run build:ts && npm run ts:test && npm test
```

If any test fails, STOP — do not publish a broken release.

### 5. Merge Release Branch

Create a PR from the release branch to main and merge it:

```bash
gh pr create --base main --head release/v<version> --title "Release v<version>" --body "Merges release v<version>. See #<issue-number> for changelog."
```

Wait for CI to pass, then merge:

```bash
gh pr merge --squash --auto
```

### 6. Create GitHub Release

Extract the changelog from the release candidate issue body, then create the release:

```bash
gh release create v<version> --target main --title "v<version>" --notes "<changelog>"
```

This triggers the `publish.yml` GitHub Actions workflow which handles npm publication with provenance.

### 7. Close Tracking Issue

```bash
gh issue close <ISSUE_NUMBER> --comment "Released as v<version>. npm publish triggered via GitHub Actions."
```

### 8. Clean Up Release Branch

```bash
git checkout main
git pull origin main
git branch -d release/v<version>
git push origin --delete release/v<version>
```

### 9. Summary

Report:
- **Version published**: v<version>
- **GitHub Release**: <release-url>
- **npm publish**: triggered via `publish.yml` workflow
- **Issue**: #<N> closed
- **Branch**: `release/v<version>` cleaned up

## Rules

- **Never publish without human approval** — the release candidate issue must be approved first.
- **Never run `npm publish` directly** — always use `gh release create` which triggers the CI workflow with provenance.
- **Never force-push** to main or the release branch.
- If the release candidate issue is not approved, STOP immediately.
- If tests fail on the release branch, STOP — close the release candidate issue with a failure comment.
- If `gh` CLI is not authenticated, STOP — publishing requires GitHub access.
- If the `publish.yml` workflow fails after release creation, report the failure but do not retry — the maintainer should investigate.
