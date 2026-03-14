# Skill: Policy Effectiveness Review

Analyze the effectiveness of governance policies and invariants. Identify rules that never trigger, detect policy gaps, assess invariant coverage, recommend policy packs, and suggest governance evolution. This is the Governance Agent's unique capability — focused on policy quality, not operational telemetry (which is the Observability Agent's domain). Designed for periodic scheduled execution.

## Autonomy Directive

This skill runs as an **unattended scheduled task**. No human is present to answer questions.

- **NEVER pause to ask for clarification or confirmation** — make your best judgment and proceed
- **NEVER use AskUserQuestion or any interactive prompt** — all decisions must be made autonomously
- If data is unavailable or ambiguous, proceed with available data and note limitations
- If governance activation fails, log the failure and **STOP**
- If `gh` CLI fails, log the error and **STOP**
- Default to the **safest option** in every ambiguous situation

## Prerequisites

Run `start-governance-runtime` first. All scheduled skills must operate under governance.

## Steps

### 1. Start Governance Runtime

Invoke the `start-governance-runtime` skill to ensure the AgentGuard kernel is active. If governance cannot be activated, STOP.

### 2. Read Active Policy

```bash
cat <%= paths.policy %> 2>/dev/null
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

### 3. Validate Policy Quality

Run automated policy validation with strict best-practice checks:

```bash
<%= paths.cli %> policy validate --strict --json 2>/dev/null
```

Parse the validation output for:
- **Errors**: Invalid rules, syntax issues
- **Warnings**: Unrecognized action types, missing descriptions, overlapping rules, rule shadowing
- **Best-practice violations**: No deny rules, missing blast radius limits

If the validate command is not available, skip this step and rely on manual analysis.

### 4. Read Invariant Definitions

```bash
cat packages/invariants/src/definitions.ts
```

Extract the 8 built-in invariant names and their trigger conditions:
1. No secret exposure (severity 5)
2. Protected branches (severity 4)
3. Blast radius limit (severity 3)
4. Test-before-push (severity 3)
5. No force push (severity 4)
6. No skill modification (severity 4)
7. No scheduled task modification (severity 5)
8. Lockfile integrity (severity 2)

### 5. Analyze Policy Rule Usage

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

### 6. Analyze Invariant Effectiveness

From governance logs:

```bash
cat .agentguard/events/*.jsonl 2>/dev/null | grep "InvariantViolation" | head -100
```

For each of the 8 invariants:
- Count violation frequency
- Identify invariants that have **never** been violated (may indicate: well-behaved agents OR overly broad invariant that catches nothing real)
- Identify invariants that are violated repeatedly (may indicate: agents don't understand the boundary OR the invariant is too strict)
- Check if violations lead to denials or warnings

### 7. Detect Policy Gaps

Analyze action patterns that pass all policy checks but might be concerning:

```bash
cat .agentguard/events/*.jsonl 2>/dev/null | grep "ActionAllowed" | head -100
```

Look for:
- **Unscoped actions**: Actions on paths not covered by any specific policy rule (falls through to default)
- **Novel action types**: Action types that appear in logs but have no dedicated policy rule
- **High-frequency allows**: Actions that are always allowed — should any of them be restricted?
- **Uncovered branches**: Git branches where actions occur but no branch-specific policy exists

Also run simulation against common risky patterns to detect coverage gaps:

```bash
<%= paths.cli %> simulate --action file.write --target .env.production --policy <%= paths.policy %> --json 2>/dev/null
<%= paths.cli %> simulate --action git.push --branch main --policy <%= paths.policy %> --json 2>/dev/null
<%= paths.cli %> simulate --action shell.exec --command "rm -rf /" --policy <%= paths.policy %> --json 2>/dev/null
```

If any of these simulations show "allowed", flag as a policy gap.

### 8. Analyze Available Policy Packs

Read the available policy packs to recommend composition strategies:

```bash
ls policies/*/agentguard-pack.yaml 2>/dev/null
```

For each policy pack found, read its description and rules:

```bash
head -10 policies/ci-safe/agentguard-pack.yaml 2>/dev/null
head -10 policies/enterprise/agentguard-pack.yaml 2>/dev/null
head -10 policies/strict/agentguard-pack.yaml 2>/dev/null
head -10 policies/open-source/agentguard-pack.yaml 2>/dev/null
```

Compare the active policy against available packs:
- If the active policy lacks CI safety rules → recommend `ci-safe` pack
- If the active policy lacks enterprise controls (blast radius limits, credential protection) → recommend `enterprise` pack
- If the active policy has permissive defaults → recommend `strict` pack
- If the project is open-source → recommend `open-source` pack

### 9. Cross-Reference with Architecture

Compare policy coverage against the architectural layers:

- Does the policy cover all workspace packages? (kernel, events, policy, invariants, adapters, cli, core)
- Are protected paths (`packages/kernel/src/`, `packages/invariants/src/`) reflected in policy rules?
- Does the blast radius invariant align with the actual module structure?
- Are there action types in `packages/core/src/actions.ts` with no corresponding policy rule?

### 10. Generate Effectiveness Report

```
## Policy Effectiveness Report

**Date**: <timestamp>
**Policy file**: <path>
**Total rules**: N
**Total invariants**: 8
**Policy validation**: <pass/N errors/N warnings>

### Automated Validation Results

<Output from `agentguard policy validate --strict` if available>

### Rule Usage Summary

| Rule | Matches | Denials | Allows | Status |
|------|---------|---------|--------|--------|
| <rule-name/pattern> | N | N | N | ACTIVE/DEAD/HOT |

### Dead Rules (never triggered)

<List of rules that have never matched any action — candidates for removal or revision>

### Hot Rules (most triggered)

<Top 5 most frequently triggered rules — verify they are working as intended>

### Invariant Effectiveness

| Invariant | Severity | Violations | Status |
|-----------|----------|-----------|--------|
| no-secret-exposure | 5 | N | ACTIVE/DORMANT |
| protected-branch | 4 | N | ACTIVE/DORMANT |
| blast-radius-limit | 3 | N | ACTIVE/DORMANT |
| test-before-push | 3 | N | ACTIVE/DORMANT |
| no-force-push | 4 | N | ACTIVE/DORMANT |
| no-skill-modification | 4 | N | ACTIVE/DORMANT |
| no-scheduled-task-modification | 5 | N | ACTIVE/DORMANT |
| lockfile-integrity | 2 | N | ACTIVE/DORMANT |

### Policy Gaps

<List of detected coverage gaps with evidence>

### Policy Pack Recommendations

| Pack | Relevance | Reason |
|------|-----------|--------|
| ci-safe | HIGH/MEDIUM/LOW | <why this pack would help> |
| enterprise | HIGH/MEDIUM/LOW | <why this pack would help> |
| strict | HIGH/MEDIUM/LOW | <why this pack would help> |
| open-source | HIGH/MEDIUM/LOW | <why this pack would help> |

### Governance Evolution Recommendations

<Prioritized list of policy/invariant changes:>
1. Rules to add (fill gaps)
2. Rules to remove (dead rules)
3. Rules to tighten (too permissive)
4. Rules to relax (too restrictive)
5. Policy packs to compose
6. New invariants to consider
```

### 11. Create or Update Issue (if recommendations exist)

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
  --label "source:governance-agent" --label "<%= labels.medium %>"
```

### 12. Summary

Report:
- **Rules analyzed**: N total, N active, N dead
- **Invariants**: N of 8 active, N dormant
- **Policy validation**: pass / N errors / N warnings
- **Policy gaps**: N detected
- **Policy pack recommendations**: N packs suggested
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
