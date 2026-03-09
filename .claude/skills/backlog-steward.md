# Skill: Backlog Steward

Scan the codebase for TODO/FIXME/HACK annotations and unchecked ROADMAP items, cross-reference against open GitHub issues, and create new issues only for undiscovered work items. Designed for periodic scheduled execution.

## Prerequisites

Run `start-governance-runtime` first. All scheduled skills must operate under governance.

## Steps

### 1. Start Governance Runtime

Invoke the `start-governance-runtime` skill to ensure the AgentGuard kernel is active and intercepting all tool calls. If governance cannot be activated, STOP — do not proceed without governance.

### 2. Scan Code Annotations

Search the codebase for TODO, FIXME, and HACK comments:

```bash
grep -rn "TODO\|FIXME\|HACK" src/ tests/ --include="*.ts" --include="*.js" | head -50
```

For each match, extract:
- **File path** and **line number**
- **Annotation type** (TODO, FIXME, or HACK)
- **Description text** (the rest of the line after the annotation keyword)

### 3. Scan ROADMAP Unchecked Items

Read `ROADMAP.md` and extract all unchecked items:

```bash
grep -n "\- \[ \]" ROADMAP.md
```

For each match, extract the item description and its parent section (Phase name).

### 4. Fetch Open Issues

Retrieve all open issues to use as a deduplication reference:

```bash
gh issue list --state open --limit 100 --json number,title,body,labels
```

Also check for issues previously created by this skill:

```bash
gh issue list --state open --label "source:backlog-steward" --json number,title
```

### 5. Deduplicate

For each discovered annotation or ROADMAP item, check whether an open issue already covers it:

- Compare the annotation description against each open issue title and body
- A match exists if the issue title or body contains the key phrase from the annotation (case-insensitive substring match)
- Also match if the file path and line reference appear in any open issue body
- If a match is found, skip the item — do NOT create a duplicate

### 6. Create Issues for New Items

For each unmatched item (up to **5 per run**), create a GitHub issue:

```bash
gh issue create \
  --title "<type>: <description>" \
  --body "## Source

- **Type**: <TODO|FIXME|HACK|ROADMAP>
- **Location**: \`<file>:<line>\` (or ROADMAP.md section)
- **Original text**: <annotation text>

## Task Description

<Expanded description of what needs to be done based on the annotation context>

## Labels

Created automatically by the Backlog Steward skill.

---
*Discovered by backlog-steward on $(date -u +%Y-%m-%dT%H:%M:%SZ)*" \
  --label "source:backlog-steward" --label "status:pending"
```

Add a task type label based on the annotation:
- `FIXME` → also add `task:bug-fix`
- `TODO` → also add `task:implementation`
- `HACK` → also add `task:refactor`
- ROADMAP items → also add `task:implementation`

Ensure the `source:backlog-steward` label exists before using it:

```bash
gh label create "source:backlog-steward" --color "C5DEF5" --description "Auto-created by Backlog Steward skill" 2>/dev/null || true
```

### 7. Summary

Report:
- **Annotations found**: N TODO, N FIXME, N HACK
- **ROADMAP unchecked items**: N
- **Already tracked**: N (matched to existing issues)
- **New issues created**: N (list issue numbers and titles)
- **Skipped (cap reached)**: N (if more than 5 unmatched items exist)

## Rules

- Create a maximum of **5 new issues per run** — if more unmatched items exist, report the overflow count but do not create them
- **Never close, modify, or comment on existing issues** — this skill is create-only
- **Never create duplicate issues** — always check against open issues first
- If `gh` CLI is not authenticated, report the error and STOP
- If no annotations or unchecked ROADMAP items are found, report "Backlog clean — no new items discovered" and STOP
- Prioritize FIXME and HACK annotations over TODO annotations when the cap is reached
- Do not scan `node_modules/`, `dist/`, or `.git/` directories
