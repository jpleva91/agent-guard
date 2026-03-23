# Backlog Triage Report — 2026-03-23

**Agent**: `claude-code:opus:planner` (backlog-hygiene--roadmap-triage-agent)
**Scope**: All open issues in AgentGuardHQ/agent-guard
**Before**: ~112 open issues | **After**: 90 open issues | **Net closed**: 22

---

## Actions Taken

### 1. Duplicate ROADMAP Issues Closed (6)

Issues created by multiple backlog-steward runs tracking the same ROADMAP line item:

| Closed | Kept | Topic |
|--------|------|-------|
| #83 | #328 | Team observability |
| #80 | #326 | Context-aware policy suggestions |
| #69 | #310 | JetBrains plugin |
| #70 | #331 | Claude Code deep integration |
| #747 | #751 | Pull-Based Runner main loop |
| #750 | #752 | Runner workspace manager |

### 2. Stale Ephemeral Agent Reports Closed (15)

Point-in-time reports from automated agents (risk-escalation, recovery-controller, observability, test-agent, product-agent, planning-agent, governance-monitor). These reports are consumed when generated and have no tracking value as open issues.

| Issue | Report Type | Date |
|-------|------------|------|
| #742 | Risk Assessment (ELEVATED 35/100) | 2026-03-22 |
| #737 | Test Health Report | 2026-03-22 |
| #736 | Recovery Report | 2026-03-22 |
| #734 | Observability Report | 2026-03-22 |
| #733 | Risk Assessment (ELEVATED 30/100) | 2026-03-22 |
| #732 | Product Health Report | 2026-03-22 |
| #730 | Sprint Plan | 2026-03-22 |
| #726 | Risk Assessment (NORMAL 8/100) | 2026-03-22 |
| #722 | Recovery Report | 2026-03-22 |
| #720 | Governance & Policy Report | 2026-03-22 |
| #695 | Risk Assessment (ELEVATED 45/100) | 2026-03-21 |
| #691 | Recovery Report (ELEVATED 22) | 2026-03-21 |
| #689 | Progress Report | 2026-03-21 |
| #684 | Risk Assessment (ELEVATED 48/100) | 2026-03-21 |
| #683 | Recovery Report (ELEVATED 33) | 2026-03-21 |

### 3. Outdated Hygiene Report Closed (1)

| Issue | Reason |
|-------|--------|
| #115 | Repo hygiene report from 2026-03-10 references old `src/` paths; codebase restructured to `packages/` + `apps/` monorepo |

### 4. Label Corrections (3)

Issues with `status:in-progress` or `in-progress` labels that have no active work:

| Issue | Old Label | New Label | Reason |
|-------|-----------|-----------|--------|
| #157 | `in-progress` | `status:pending` | AutoGen adapter — distant "Later" roadmap item, no work started |
| #208 | `status:in-progress` | `status:pending` | Enhanced telemetry — distant "Later" item, no work started |
| #310 | `status:in-progress` | `status:pending` | JetBrains plugin — "Next" Phase 9 item, no work started |

### 5. Bug Cluster Cross-Referenced (4)

Issues #646, #648, #649, #650 share a root cause: command-string matching treats path *mentions* as write *intents*. Added cross-reference comments linking them and identifying the shared root cause. No issue closed — all are valid distinct symptoms.

---

## Remaining Backlog Summary (90 open)

| Category | Count | Key Items |
|----------|-------|-----------|
| ROADMAP implementation | ~55 | KE-2 through KE-6, Phase 6/7/8/9 items |
| Bugs | 5 | #646/#648/#649/#650 (pattern matching cluster), #643 (test coverage) |
| Security | 5 | #637/#638 (HIGH), #639/#640 (MED), #579 (documentation) |
| Enhancement | ~10 | #642 (telemetry consolidation), #702 (no-verify block), etc. |
| Documentation | 2 | #654 (blog post), #579 (attack vectors doc) |
| Critical fix | 1 | #659 (Rust assertion — one-line fix) |

## Recommendations

1. **Fix #659 immediately** — One-line Rust test assertion update (`21` → `37`). Blocks CI on any PR touching Rust kernel.

2. **Address bug cluster #646/#648/#649/#650** — Shared root cause in command-string matching. A single architectural fix (parse operation vs. arguments separately) resolves all four bugs.

3. **Prioritize security issues #637 and #638** — HIGH severity. AAB regex bypass (#637) and policy fail-open (#638) are governance bypass vectors that contradict the Phase 6 "Reference Monitor Hardening" goal.

4. **Consider auto-closing agent reports** — Ephemeral reports (risk assessments, recovery reports, health reports) should either auto-close after 48 hours or not be created as issues. They add noise to the backlog.

5. **Backlog steward deduplication** — The backlog-steward creates issues each time it runs, without checking for existing issues on the same ROADMAP line. A deduplication check (search for `ROADMAP:` + topic before creating) would prevent future duplicates.
