# Skill: Discover Next Issue

Find the next GitHub issue to work on from the project's issue queue. Issues are selected by the `status:pending` label and sorted by priority.

## Prerequisites

Run `start-governance-runtime` first.

## Steps

### 1. Query Pending Issues

```bash
gh issue list --label "status:pending" --state open --json number,title,labels,body --limit 20
```

If no issues are returned, report "No work available" and STOP.

### 2. Filter by Role

From the returned issues, select only those with at least one of these labels:
- `role:developer`
- `task:implementation`
- `task:bug-fix`
- `task:refactor`
- `task:test-generation`
- `task:documentation`

Exclude issues labeled `role:architect` or `role:auditor` (those require different capability bundles).

### 3. Sort by Priority

Order the filtered issues by priority label:

1. `priority:critical` (highest)
2. `priority:high`
3. `priority:medium`
4. `priority:low` (lowest)

Issues without a priority label are treated as `priority:low`.

Select the highest-priority issue.

### 4. Check Dependencies

If the selected issue body contains a `## Dependencies` section with issue references (e.g., `#41, #39`), verify each dependency is closed:

```bash
gh issue view <DEP_NUMBER> --json state --jq '.state'
```

If any dependency is still `OPEN`:
- Report: "Issue #N has unresolved dependencies: #X (open)"
- Skip this issue and select the next highest-priority issue
- Repeat until an issue with no blocking dependencies is found

### 5. Display Issue Details

For the selected issue, output:

- **Issue number** and **title**
- **Labels** (all)
- **Task Description** section from the body
- **Acceptance Criteria** section from the body
- **File Scope** section from the body (if present)
- **Dependencies** section (if present, with status of each)

## Rules

- If no pending issues exist, report "No work available" and STOP
- If all pending issues have unresolved dependencies, report "All pending issues blocked by dependencies" and STOP
- Do not select issues that are already `status:in-progress` or `status:assigned`
- Output the selected issue number clearly — it is needed by `claim-issue`
