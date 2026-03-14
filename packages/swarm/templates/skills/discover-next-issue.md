# Skill: Discover Next Issue

Find the next GitHub issue to work on from the project's issue queue. Issues are selected by the `status:pending` label, sorted by priority, and assessed for governance risk level. Escalation context is checked to avoid high-risk work during elevated governance states.

## Autonomy Directive

This skill runs as an **unattended scheduled task**. No human is present to answer questions.

- **NEVER pause to ask for clarification or confirmation** — make your best judgment and proceed
- **NEVER use AskUserQuestion or any interactive prompt** — all decisions must be made autonomously
- If no issues match criteria, report cleanly and **STOP**
- If governance activation fails, log the failure and **STOP**
- If `gh` CLI fails, log the error and **STOP**
- Default to the **safest option** in every ambiguous situation

## Prerequisites

Run `start-governance-runtime` first.

## Steps

### 0. Read Swarm State (if available)

Check for shared swarm state to inform issue selection:

```bash
cat <%= paths.swarmState %> 2>/dev/null
```

If the file exists and is valid JSON, extract:
- **mode**: if `safe`, output "System in SAFE MODE — skipping issue discovery" and STOP immediately. If `conservative`, reduce to smallest-scope issues only (< 5 files in scope)
- **prQueueHealthy**: if `false`, output "PR queue unhealthy — skipping issue discovery" and STOP
- **currentPhase**: prefer issues aligned with this ROADMAP phase
- **priorities**: if present, prefer issues listed in the priorities array

If the file does not exist or is invalid, proceed with standard discovery.

### 1. Query Pending Issues

```bash
gh issue list --label "<%= labels.pending %>" --state open --json number,title,labels,body --limit 20
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

### 5. Check Escalation Context

Before finalizing issue selection, check the current governance escalation level:

```bash
cat <%= paths.logs %> 2>/dev/null | grep -i "escalat\|StateChanged" | tail -5
```

Determine the current escalation state:
- **NORMAL** (level 0): all issues eligible
- **ELEVATED** (level 1): prefer issues with smaller File Scope (fewer files)
- **HIGH** (level 2): only select issues with explicit File Scope of 5 files or fewer
- **LOCKDOWN** (level 3): report "Governance LOCKDOWN active — deferring new work" and STOP

If telemetry data is unavailable, assume NORMAL and proceed.

### 6. Estimate Blast Radius

For the selected issue, estimate the governance risk:

If the issue body contains a `## File Scope` section, count the listed files. Then simulate:

```bash
<%= paths.cli %> simulate --action file.write --target <first-file-in-scope> --policy <%= paths.policy %> --json 2>/dev/null
```

Classify the estimated blast radius:
- **1-5 files**: low risk
- **6-15 files**: medium risk
- **16+ files**: high risk

If escalation is ELEVATED and the estimated blast radius is high, prefer the next lower-risk issue.

If the simulate command is not available, skip this step.

### 7. Display Issue Details

For the selected issue, output:

- **Issue number** and **title**
- **Labels** (all)
- **Estimated risk level**: low / medium / high (from blast radius estimate)
- **Current escalation**: NORMAL / ELEVATED / HIGH
- **Task Description** section from the body
- **Acceptance Criteria** section from the body
- **File Scope** section from the body (if present)
- **Dependencies** section (if present, with status of each)

## Rules

- If no pending issues exist, report "No work available" and STOP
- If all pending issues have unresolved dependencies, report "All pending issues blocked by dependencies" and STOP
- If governance is in LOCKDOWN, report and STOP — do not select any issue
- If escalation is HIGH, only select issues with small file scope (5 files or fewer)
- Do not select issues that are already `status:in-progress` or `status:assigned`
- Output the selected issue number clearly — it is needed by `claim-issue`
