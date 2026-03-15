# Skill: Progress Controller

Track roadmap phase completion, validate milestone criteria, detect phase transition readiness, and prevent endless backlog expansion. This agent ensures the swarm converges toward roadmap goals rather than creating unbounded work. Designed for daily scheduled execution.

## Autonomy Directive

This skill runs as an **unattended scheduled task**. No human is present to answer questions.

- **NEVER pause to ask for clarification or confirmation** — make your best judgment and proceed
- **NEVER use AskUserQuestion or any interactive prompt** — all decisions must be made autonomously
- If governance activation fails, log the failure and **STOP**
- If `gh` CLI fails, log the error and **STOP**
- Default to the **safest option** in every ambiguous situation

## Prerequisites

Run `start-governance-runtime` first. All scheduled skills must operate under governance.

## Steps

### 1. Start Governance Runtime

Invoke the `start-governance-runtime` skill to ensure the AgentGuard kernel is active and intercepting all tool calls. If governance cannot be activated, STOP — do not proceed without governance.

### 2. Read <%= paths.roadmap %>

```bash
cat <%= paths.roadmap %>
```

Parse the roadmap to extract:
- **All phases** with their status (`STABLE`, `IN PROGRESS`, `NEXT`, `PLANNED`)
- **Per-phase items**: Each `- [x]` (completed) and `- [ ]` (incomplete) checkbox item
- **Current active phase**: The first phase that is NOT `STABLE` / `COMPLETE`
- **Next phase**: The phase after the current active one

### 3. Map Issues to Phases

Fetch all open issues:

```bash
gh issue list --state open --limit 100 --json number,title,labels,body
```

For each issue, determine its phase alignment:
- Match by title keywords or explicit phase references in the body
- Match by label (e.g., labels containing phase numbers or theme names)
- Match by file scope references (e.g., issues touching `packages/policy/src/` → Phase 8 Policy Ecosystem)

Build a phase-issue map:
```
Phase 5 (Editor Integrations): issues #A, #B — 2 open
Phase 6 (Reference Monitor Hardening): issues #C, #D, #E — 3 open
Phase 6.5 (Invariant Expansion): issues #F, #G — 2 open
...
```

### 5. Calculate Phase Completion

For each phase (starting from the current active phase):

```
completion_ratio = checked_items / total_items  (from <%= paths.roadmap %> checkboxes)
open_issues = count of issues mapped to this phase
closed_issues = count of recently closed issues mapped to this phase
```

**Phase completion criteria** (ALL must be true):
1. `completion_ratio >= 0.90` (90% of ROADMAP checkboxes checked)
2. `open_issues <= 1` (at most 1 remaining issue)
3. No open PRs targeting this phase's items
4. No `priority:critical` issues in this phase

### 6. Detect Phase Transition Readiness

If the current active phase meets completion criteria:

1. Log: "Phase N (<theme>) meets completion criteria"
2. Check if the next phase has prerequisites:
   - Are there dependency items from the current phase that must complete first?
   - Does the next phase require infrastructure not yet in place?
3. If ready for transition, create a phase transition issue:

```bash
gh issue create \
  --title "milestone: Phase N (<theme>) ready for completion" \
  --body "## Phase Transition Assessment

**Phase:** N — <theme>
**ROADMAP completion:** <X>/<Y> items checked (<ratio>%)
**Open issues:** <count>
**Open PRs:** <count>

### Completion Evidence
<list of completed ROADMAP items>

### Remaining Items
<list of unchecked items, if any — note why they don't block completion>

### Next Phase
Phase <N+1> — <theme>
**Readiness:** Ready / Blocked by <dependency>

### Recommendation
- [ ] Mark Phase N as STABLE in <%= paths.roadmap %>
- [ ] Begin Phase <N+1> work

---
*Auto-created by progress-controller on $(date -u +%Y-%m-%dT%H:%M:%SZ)*" \
  --label "source:progress-controller" --label "<%= labels.pending %>"
```

### 7. Detect Backlog Expansion

Compare issue creation rate vs. closure rate:

```bash
# Issues created in last 7 days
gh issue list --state all --json number,createdAt --limit 100 --jq '[.[] | select(.createdAt > "'$(date -u -d '7 days ago' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-7d +%Y-%m-%dT%H:%M:%SZ)'")]' 2>/dev/null

# Issues closed in last 7 days
gh issue list --state closed --json number,closedAt --limit 100 --jq '[.[] | select(.closedAt > "'$(date -u -d '7 days ago' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-7d +%Y-%m-%dT%H:%M:%SZ)'")]' 2>/dev/null
```

**Condition: Backlog expanding** — Issues created (7d) > 2x issues closed (7d) AND total open issues > 30.

**Response:**
1. Log the expansion rate in the progress report
2. Check which agent is creating the most issues:
   ```bash
   gh issue list --state open --label "source:backlog-steward" --json number --jq length
   ```
3. If Backlog Steward is the primary source and expansion is >2x, recommend pausing issue creation in the progress report

### 8. Detect Stale Phases

For phases marked `IN PROGRESS` or `NEXT`:

**Condition: Phase stalled** — No ROADMAP checkboxes changed AND no issues closed for this phase in 14+ days.

**Response:**
1. Log the stall in the progress report
2. Analyze why:
   - Are all issues for this phase blocked?
   - Is the Coder Agent working on unrelated issues?
   - Has the Planning Agent deprioritized this phase?

### 9. Update Swarm State

Read current swarm-state.json:

```bash
cat <%= paths.swarmState %> 2>/dev/null || echo '{}'
```

Update with phase tracking data:
- `currentPhase`: the active phase name/number derived from <%= paths.roadmap %>
- `phaseCompletion`: object with `{ phase: string, checked: number, total: number, ratio: number }`
- `nextPhase`: the next phase name/number
- `backlogHealth`: `{ openIssues: number, createdLast7d: number, closedLast7d: number, expansionRate: number }`
- `lastProgressRun`: current ISO timestamp

Preserve all other fields.

```bash
mkdir -p .agentguard
# Write updated swarm-state.json
```

### 10. Generate Progress Report

Check if a previous progress report exists:

```bash
gh issue list --state open --label "source:progress-controller" --json number --jq '.[0].number' 2>/dev/null
```

If a previous report exists (and is NOT a milestone issue), close it:

```bash
gh issue close <PREV_NUMBER> --comment "Superseded by new progress report."
```

Create the new report:

```bash
gh issue create \
  --title "Progress Report — $(date +%Y-%m-%d)" \
  --body "<progress report markdown>" \
  --label "source:progress-controller" --label "<%= labels.pending %>"
```

**Report format:**

```markdown
## Progress Controller Report

**Timestamp:** <UTC>
**Active Phase:** Phase N — <theme>

### Phase Completion Matrix

| Phase | Status | Checked | Total | Completion | Open Issues |
|-------|--------|---------|-------|------------|-------------|
| Phase 5 | IN PROGRESS | X | Y | Z% | N |
| Phase 6 | NEXT | X | Y | Z% | N |
| ... | | | | | |

### Phase Transition Readiness

- Phase N: <Ready for completion / Not ready — X items remaining>

### Backlog Health

| Metric | Value | Status |
|--------|-------|--------|
| Total open issues | N | HEALTHY/WARNING |
| Created (7d) | N | |
| Closed (7d) | N | |
| Expansion rate | Nx | HEALTHY/WARNING/CRITICAL |

### Stalled Phases

<list any phases with no progress in 14+ days>

### Recommendations

1. <top recommendation>
2. <second recommendation>
```

### 11. Summary

Report:
- **Active phase**: Phase N — <theme> (<completion>% complete)
- **Phase transition ready**: Yes/No
- **Backlog expansion rate**: Nx (healthy/warning/critical)
- **Stalled phases**: N
- **Progress report created**: #N
- **Milestone issues created**: N
- **Top recommendation**: Brief statement

## Rules

- Create a maximum of **1 progress report per run**
- Create a maximum of **1 milestone/transition issue per run**
- **NEVER modify <%= paths.roadmap %>** — only report findings and create milestone issues
- **NEVER modify CLAUDE.md** — that is the Documentation Maintainer's job
- **NEVER close issues** — only close previous progress report issues labeled `source:progress-controller`
- **NEVER create work issues** — that is the Backlog Steward's job
- If `gh` CLI is not authenticated, report the error and STOP
- Phase completion assessment should be conservative — only declare ready when clearly met
- Backlog expansion warnings should consider the ROADMAP scope — some expansion is natural during phase transitions
