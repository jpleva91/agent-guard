# Skill: Policy Effectiveness Review

Analyze the effectiveness of governance policies and invariants. Identify rules that never trigger, detect policy gaps, assess invariant coverage, and recommend governance evolution. This is the Governance Agent's unique capability — focused on policy quality, not operational telemetry (which is the Observability Agent's domain). Designed for periodic scheduled execution.

## Prerequisites

Run `start-governance-runtime` first. All scheduled skills must operate under governance.

## Steps

### 1. Start Governance Runtime

Invoke the `start-governance-runtime` skill to ensure the AgentGuard kernel is active. If governance cannot be activated, STOP.

### 2. Read Active Policy

```bash
cat agentguard.yaml 2>/dev/null
```

If no policy file exists, check for alternative formats:

```bash
cat agentguard.json 2>/dev/null
ls policy/*.json 2>/dev/null
```

Parse the policy to extract:
- **Total rules**: Count of policy rules
- **Rule types**: deny vs. allow rules
- **Scopes**: File patterns, branch patterns, action types covered
- **Conditions**: Branch conditions, environment conditions

### 3. Read Invariant Definitions

```bash
cat src/invariants/definitions.ts
```

Extract the 7 built-in invariant names and their trigger conditions:
1. Secret exposure
2. Protected branches
3. Blast radius
4. Test-before-push
5. No force push
6. No skill modification
7. Lockfile integrity

### 4. Analyze Policy Rule Usage

Read governance logs to determine which rules are actually triggered:

```bash
cat .agentguard/events/*.jsonl 2>/dev/null | grep "PolicyDenied\|ActionAllowed\|ActionDenied" | head -200
```

For each policy rule:
- Count how many times it matched (either allow or deny)
- Identify rules that have **never** been triggered ("dead rules")
- Identify rules that trigger most frequently ("hot rules")
- Identify rules that only deny (may be too restrictive)
- Identify rules that only allow (may be too permissive)

### 5. Analyze Invariant Effectiveness

From governance logs:

```bash
cat .agentguard/events/*.jsonl 2>/dev/null | grep "InvariantViolation" | head -100
```

For each invariant:
- Count violation frequency
- Identify invariants that have **never** been violated (may indicate: well-behaved agents OR overly broad invariant that catches nothing real)
- Identify invariants that are violated repeatedly (may indicate: agents don't understand the boundary OR the invariant is too strict)
- Check if violations lead to denials or warnings

### 6. Detect Policy Gaps

Analyze action patterns that pass all policy checks but might be concerning:

```bash
cat .agentguard/events/*.jsonl 2>/dev/null | grep "ActionAllowed" | head -100
```

Look for:
- **Unscoped actions**: Actions on paths not covered by any specific policy rule (falls through to default)
- **Novel action types**: Action types that appear in logs but have no dedicated policy rule
- **High-frequency allows**: Actions that are always allowed — should any of them be restricted?
- **Uncovered branches**: Git branches where actions occur but no branch-specific policy exists

### 7. Cross-Reference with Architecture

Compare policy coverage against the architectural layers:

- Does the policy cover all 7 `src/` layers? (kernel, events, policy, invariants, adapters, cli, core)
- Are protected paths (`src/kernel/`, `src/invariants/`) reflected in policy rules?
- Does the blast radius invariant align with the actual module structure?
- Are there action types in `src/core/actions.ts` with no corresponding policy rule?

### 8. Generate Effectiveness Report

```
## Policy Effectiveness Report

**Date**: <timestamp>
**Policy file**: <path>
**Total rules**: N
**Total invariants**: 7

### Rule Usage Summary

| Rule | Matches | Denials | Allows | Status |
|------|---------|---------|--------|--------|
| <rule-name/pattern> | N | N | N | ACTIVE/DEAD/HOT |

### Dead Rules (never triggered)

<List of rules that have never matched any action — candidates for removal or revision>

### Hot Rules (most triggered)

<Top 5 most frequently triggered rules — verify they are working as intended>

### Invariant Effectiveness

| Invariant | Violations | Status |
|-----------|-----------|--------|
| secret-exposure | N | ACTIVE/DORMANT |
| protected-branches | N | ACTIVE/DORMANT |
| blast-radius | N | ACTIVE/DORMANT |
| test-before-push | N | ACTIVE/DORMANT |
| no-force-push | N | ACTIVE/DORMANT |
| no-skill-modification | N | ACTIVE/DORMANT |
| lockfile-integrity | N | ACTIVE/DORMANT |

### Policy Gaps

<List of detected coverage gaps with evidence>

### Governance Evolution Recommendations

<Prioritized list of policy/invariant changes:>
1. Rules to add (fill gaps)
2. Rules to remove (dead rules)
3. Rules to tighten (too permissive)
4. Rules to relax (too restrictive)
5. New invariants to consider
```

### 9. Create or Update Issue (if recommendations exist)

```bash
gh issue list --state open --label "source:governance-agent" --json number,title --limit 1
```

Ensure label exists:

```bash
gh label create "source:governance-agent" --color "5319E7" --description "Auto-created by Governance Agent" 2>/dev/null || true
```

If actionable recommendations exist, create or update an issue:

```bash
gh issue create \
  --title "governance: policy effectiveness review — <N> recommendations" \
  --body "<full effectiveness report>" \
  --label "source:governance-agent" --label "priority:medium"
```

### 10. Summary

Report:
- **Rules analyzed**: N total, N active, N dead
- **Invariants**: N active, N dormant
- **Policy gaps**: N detected
- **Recommendations**: N governance evolution items
- **Issue**: created/updated/none needed
- If all healthy: "Governance policies effective — no changes recommended"

## Rules

- **Never modify policy files** — only analyze and recommend.
- **Never modify invariant definitions** — only assess effectiveness.
- **Never close existing governance issues** — only create or comment.
- This skill focuses on **policy quality** — leave operational metrics to the Observability Agent.
- If no governance logs exist, analyze the policy file statically (rules without usage data) and note the limitation.
- If `gh` CLI is not authenticated, still generate the report to console but skip issue creation.
- Cap log analysis at 200 events per category to keep processing bounded.
