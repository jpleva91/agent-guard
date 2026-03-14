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

### 3. Fetch Open Issues

Retrieve all open issues to use as a deduplication reference:

```bash
gh issue list --state open --limit 100 --json number,title,body,labels
```

Also check for issues previously created by this skill:

```bash
gh issue list --state open --label "source:backlog-steward" --json number,title
```

### 4. Deduplicate

For each discovered annotation or ROADMAP item, check whether an open issue already covers it:

- Compare the ROADMAP item description against each open issue title and body
- A match exists if the issue title or body contains the key phrase from the ROADMAP item (case-insensitive substring match)
- Also match if the ROADMAP checkbox text appears in any open issue title
- If a match is found, skip the item — do NOT create a duplicate

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
