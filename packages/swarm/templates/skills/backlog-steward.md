# Skill: Backlog Steward

Expand ROADMAP items into GitHub issues. Cross-reference against open issues to avoid duplicates. Designed for daily scheduled execution.

**Scope**: ROADMAP expansion ONLY. Code annotation scanning (TODO/FIXME/HACK) is handled by the Repo Hygiene Agent — do NOT scan annotations here to avoid duplicate issue creation.

## Prerequisites

Run `start-governance-runtime` first. All scheduled skills must operate under governance.

## Steps

### 1. Start Governance Runtime

Invoke the `start-governance-runtime` skill to ensure the AgentGuard kernel is active and intercepting all tool calls. If governance cannot be activated, STOP — do not proceed without governance.

### 1b. Check System Mode

```bash
cat <%= paths.swarmState %> 2>/dev/null | grep -o '"mode":"[^"]*"' 2>/dev/null
```

- If mode is `safe`: output "System in SAFE MODE — skipping backlog expansion" and **STOP immediately**
- If mode is `conservative`: reduce cap to **1 issue per run** instead of 3

### 2. Scan ROADMAP Unchecked Items

Read `<%= paths.roadmap %>` and extract all unchecked items:

```bash
grep -n "\- \[ \]" <%= paths.roadmap %>
```

For each match, extract the item description and its parent section (Phase name).

### 3. Fetch Issues for Deduplication

Retrieve ALL open issues (any source agent) as the deduplication reference:

```bash
gh issue list --state open --limit 200 --json number,title,body,labels
```

Also retrieve recently closed issues (last 30 days) to avoid re-filing resolved work:

```bash
gh issue list --state closed --limit 100 --json number,title,labels,closedAt
```

Filter closed issues to only those closed within the last 30 days.

### 4. Deduplicate (Strict Multi-Signal Matching)

For each ROADMAP item, check whether an existing issue (open OR recently closed) already covers it. Use ALL of the following matching signals — a match on ANY signal means SKIP:

**Signal 1 — Substring match**: The ROADMAP checkbox text appears as a substring in any issue title (case-insensitive).

**Signal 2 — Keyword overlap**: Extract the 3-5 most distinctive keywords from the ROADMAP item (nouns and verbs, excluding common words like "add", "implement", "support", "the", "for", "with"). Extract the same from each issue title. If ≥60% of the ROADMAP item's keywords appear in an issue title, it is a match.

**Signal 3 — Cross-agent label check**: Check issues with ANY `source:*` label, not just `source:backlog-steward`. Issues created by `source:roadmap-agent`, `source:planning-agent`, `source:test-agent`, or any other agent count as existing coverage.

**Signal 4 — Closed issue recency**: If an issue matching Signals 1-3 was closed in the last 30 days, treat it as covered. Do NOT re-file work that was recently completed or intentionally closed.

### 4b. Batch Dedup Verification

Before creating ANY issues, compile the full list of proposed new issues (titles only). Review them as a batch and remove any that:
- Are semantically equivalent to each other (two proposed issues covering the same work)
- Are semantically equivalent to any existing open or recently-closed issue identified in Step 4
- Describe work that is clearly a subset of an existing open issue

Only the de-duplicated list proceeds to Step 5.

### 5. Create Issues for New Items

For each unmatched item (up to **3 per run**), create a GitHub issue:

```bash
gh issue create \
  --title "<type>: <description>" \
  --body "## Source

- **Type**: <TODO|FIXME|HACK|ROADMAP>
- **Location**: \`<file>:<line>\` (or <%= paths.roadmap %> section)
- **Original text**: <annotation text>

## Task Description

<Expanded description of what needs to be done based on the annotation context>

## Labels

Created automatically by the Backlog Steward skill.

---
*Discovered by backlog-steward on $(date -u +%Y-%m-%dT%H:%M:%SZ)*" \
  --label "source:backlog-steward" --label "<%= labels.pending %>"
```

Add task type label for ROADMAP items → `task:implementation`

Ensure the `source:backlog-steward` label exists before using it:

```bash
gh label create "source:backlog-steward" --color "C5DEF5" --description "Auto-created by Backlog Steward skill" 2>/dev/null || true
```

### 6. Summary

Report:
- **ROADMAP unchecked items**: N
- **Already tracked**: N (matched to existing issues)
- **New issues created**: N (list issue numbers and titles)
- **Skipped (cap reached)**: N (if more than 3 unmatched items exist)

## Rules

- Create a maximum of **3 new issues per run** — if more unmatched items exist, report the overflow count but do not create them
- **Never close, modify, or comment on existing issues** — this skill is create-only
- **Never create duplicate issues** — always check against open issues first (title substring match)
- **Do NOT scan code annotations** (TODO/FIXME/HACK) — that is the Repo Hygiene Agent's job
- If `gh` CLI is not authenticated, report the error and STOP
- If no unchecked ROADMAP items are found, report "Backlog clean — no new items discovered" and STOP
- Only create issues relevant to the current active ROADMAP phase and the next phase
