# Autonomous SDLC Architecture

> AgentGuard as a self-governing agent execution kernel: a capability-secured syscall runtime for autonomous software development.

## 1. Architectural Thesis

AgentGuard is a governed action runtime for AI coding agents. This document describes how it becomes a **self-governing autonomous SDLC testbed** — where AI agents develop AgentGuard itself, governed by AgentGuard's own runtime.

### The Reflexive Property

```
AgentGuard
    ↑
developed by agents
    ↑
governed by AgentGuard itself
```

This is structurally identical to:
- Compilers compiling themselves
- Operating systems building themselves
- Kubernetes managing Kubernetes

The system becomes a **live laboratory for agent safety**. Instead of theorizing about agent governance, we observe real agent behavior: failure modes, policy violations, unsafe tool usage, CI breakage patterns, drift between intent and execution. That produces empirical data, not theoretical models.

### The OS Analogy

In an operating system, programs cannot access hardware directly:

```
program → syscall → kernel → hardware
```

The kernel enforces permissions, memory safety, resource limits, and auditing. The same model applies to agents:

```
agent → syscall → AgentGuard kernel → system resources
```

Agents cannot directly access the filesystem, git, shell, or CI. Everything flows through AgentGuard's syscall interface. AgentGuard decides: **ALLOW**, **DENY**, or **REQUIRE_APPROVAL**.

### Three-Layer Security Model

Every syscall passes through three independent evaluation layers:

```
Layer 1: Capabilities    →  Can this agent even attempt this class of action?
Layer 2: Policies        →  Is this action allowed under current governance rules?
Layer 3: Invariants      →  Would this action violate system correctness constraints?
```

Each layer answers a different question. Each layer's decision is recorded separately in the audit trail. This separation prevents the system from collapsing into a single pile of allow/deny logic.

**Default posture**: closed unless explicitly granted. No capability = no attempt possible.

### Design Goals

1. **Self-governing**: AgentGuard governs its own development. Every agent action on AgentGuard's codebase passes through AgentGuard's kernel.
2. **Syscall-mediated**: Agents interact with the system through 5 primitive operations. No direct access to filesystem, git, or shell.
3. **Capability-secured**: Agents possess specific, bounded, time-limited authority tokens. Default-deny, not default-allow.
4. **Minimal viable first**: 1 planner agent + 1 coder agent + governance runtime. No swarm until the narrow loop works.
5. **Experimentally grounded**: Every governance decision produces structured telemetry. Agent failure patterns become research data.

---

## 2. Agent Syscall Interface

### The 5 SDLC Primitives

Everything agents do in a development lifecycle reduces to five operations:

| Syscall | Purpose | Examples |
|---------|---------|---------|
| **`read_resource`** | Inspect system state | Read source files, view git diff, read issue descriptions, check test results |
| **`write_resource`** | Modify files | Write source code, edit tests, update configuration |
| **`run_task`** | Execute deterministic processes | Run tests, lint, build, type-check |
| **`create_artifact`** | Produce task outputs | Generate test results, coverage reports, lint reports |
| **`propose_change`** | Submit work for review | Create commits, open pull requests |

Agents cannot perform anything outside this set. That gives deterministic governance over a small, auditable surface.

### Mapping to AgentGuard's Action Types

AgentGuard already defines 41 canonical action types across 10 classes (`packages/core/src/data/actions.json`). The 5 SDLC syscalls are a higher-level abstraction over these implementation-level types:

| Syscall | AgentGuard Action Types |
|---------|------------------------|
| `read_resource` | `file.read`, `git.diff` |
| `write_resource` | `file.write`, `file.delete`, `file.move` |
| `run_task` | `test.run`, `test.run.unit`, `test.run.integration`, `npm.script.run` |
| `create_artifact` | `file.write` (to artifact output paths) |
| `propose_change` | `git.commit`, `git.branch.create` + external PR creation |

The AAB (`src/kernel/aab.ts`) is the syscall router. It already normalizes Claude Code tool calls into canonical action types via `TOOL_ACTION_MAP`:

```
Claude Code Tool    →  AAB normalization  →  Action Type (syscall)
Write               →  normalizeIntent()  →  file.write (write_resource)
Edit                →  normalizeIntent()  →  file.write (write_resource)
Read                →  normalizeIntent()  →  file.read (read_resource)
Bash                →  detectGitAction()  →  git.* or shell.exec
Glob                →  normalizeIntent()  →  file.read (read_resource)
Grep                →  normalizeIntent()  →  file.read (read_resource)
```

For `Bash` tool calls, `detectGitAction()` further classifies git commands (e.g., `git push` → `git.push`, `git commit` → `git.commit`).

### Syscall Wire Format

Every syscall carries this structure (evolved from the Canonical Action Representation):

```json
{
  "syscall": "write_resource",
  "target": "src/kernel/monitor.ts",
  "agent_id": "agent_dev_1a2b",
  "capability_id": "cap_0192",
  "payload": {
    "content": "...",
    "diff_lines": 42
  },
  "context": {
    "task_id": "issue_42",
    "role": "developer",
    "run_id": "run_1709913400_abc",
    "pipeline_stage": "implementation"
  }
}
```

This maps to `RawAgentAction` (`src/kernel/aab.ts:17-27`) with context injected via `metadata`:

```typescript
const raw: RawAgentAction = {
  tool: 'Edit',
  file: 'src/kernel/monitor.ts',
  content: '...',
  agent: 'agent_dev_1a2b',
  metadata: {
    role: 'developer',
    taskId: 42,
    capabilityId: 'cap_0192',
    pipelineStage: 'implementation',
    hook: 'PreToolUse',
  },
};
```

### The Critical Rule

**Agents must not be able to bypass the syscall interface.**

This is enforced by registering AgentGuard as a **PreToolUse** hook for all Claude Code tools. The hook intercepts every tool call before execution and routes it through `kernel.propose()`. If the kernel denies the action, the tool call is blocked.

Without PreToolUse enforcement, the capability model is advisory, not real.

---

## 3. Capability Model

### What a Capability Is

A capability is a **signed grant of authority** to perform a bounded class of actions. Not role-based labels like "coder agent = can code." Instead, concrete, scoped, time-limited authority:

```json
{
  "id": "cap_0192",
  "subject": "agent_dev_1a2b",
  "operation": "write_resource",
  "scopes": [
    "repo://agent-guard/src/**",
    "repo://agent-guard/tests/**"
  ],
  "constraints": {
    "deny": [
      "repo://agent-guard/src/kernel/**",
      "repo://agent-guard/src/policy/**",
      "repo://agent-guard/src/invariants/**"
    ],
    "max_files": 20,
    "max_diff_lines": 500
  },
  "issued_to": "agent_dev_1a2b",
  "issued_by": "agentguard-scheduler",
  "issued_at": "2026-03-09T10:00:00Z",
  "expires_at": "2026-03-09T10:30:00Z",
  "task_id": "issue_42"
}
```

This means:
- The agent **can** write files in `src/**` and `tests/**`
- The agent **cannot** write to `src/kernel/**`, `src/policy/**`, or `src/invariants/**` (self-modification protection)
- The agent **cannot** modify more than 20 files or 500 diff lines
- The authority **expires** after 30 minutes
- The authority is **scoped to a single task**

### Why Capabilities, Not Just Policies

Pure policy says: "any agent may ask, the system decides every time." The default is open-unless-denied.

Capabilities say: "the agent can only even attempt actions for which it holds authority." The default is **closed-unless-explicitly-granted**.

That is the correct default for autonomous systems. It changes the failure mode from "the system forgot to deny something" to "the system must explicitly grant everything."

### The 5 Core Capabilities

Each maps to one of the 5 syscalls:

**A. Read Capability**
```json
{
  "operation": "read_resource",
  "scopes": ["repo://agent-guard/src/**", "repo://agent-guard/docs/**", "artifact://test-results/**"]
}
```

**B. Write Capability**
```json
{
  "operation": "write_resource",
  "scopes": ["repo://agent-guard/src/**", "repo://agent-guard/tests/**"],
  "constraints": {
    "deny": ["repo://agent-guard/src/kernel/**", "repo://agent-guard/src/policy/**"],
    "max_files": 20
  }
}
```

**C. Task Capability**
```json
{
  "operation": "run_task",
  "scopes": ["task://test", "task://lint", "task://build", "task://ts:check"]
}
```

**D. Artifact Capability**
```json
{
  "operation": "create_artifact",
  "scopes": ["artifact://test-results/**", "artifact://coverage/**", "artifact://lint-report/**"]
}
```

**E. Change Proposal Capability**
```json
{
  "operation": "propose_change",
  "scopes": ["branch://agent/issue-42/*"],
  "constraints": {
    "requires_artifacts": ["test-results", "coverage"],
    "requires_tests_passing": true
  }
}
```

### Capability Validation Flow

For each syscall, the kernel validates in order:

1. **Authentic?** — Is the token genuine (signature check)?
2. **Expired?** — Is the token still valid?
3. **Subject match?** — Does the token belong to this agent?
4. **Operation match?** — Does the token authorize this syscall type?
5. **Scope match?** — Does the target fall within the granted scopes?
6. **Constraints satisfied?** — Are constraint limits (max_files, deny patterns) met?

Only after capability validation does the syscall proceed to Layer 2 (policies) and Layer 3 (invariants).

### Roles as Capability Bundles

Roles are an ergonomic layer. A "developer" role expands into a set of capability grants:

```
developer role → [
  read_resource(repo://**),
  write_resource(repo://src/**, repo://tests/**),
  run_task(task://test, task://lint, task://build),
  create_artifact(artifact://test-results/**, artifact://coverage/**),
  propose_change(branch://agent/*)
]
```

This keeps role-based thinking for humans while maintaining precise authority for governance.

### Capability Lifecycle

Capabilities are:
- **Short-lived**: Issued per task, expire when the task completes or times out
- **Task-scoped**: Each GitHub Issue gets a fresh authority envelope
- **Revocable**: The scheduler can revoke capabilities if escalation level rises
- **Non-transferable**: An agent cannot pass its capability to another agent (delegation requires the scheduler)

### Delegation

A planner agent does not directly issue capabilities. Instead, the scheduler observes the planner's output (file scope declarations, task assignments) and mints appropriately scoped capabilities for downstream agents:

```
Planner (via propose_change) → "Task: add rate limiting to monitor.ts"
  → Scheduler reads planner output
  → Scheduler mints capability for coder:
      write_resource(src/kernel/monitor.ts, tests/ts/monitor.test.ts)
      run_task(test, lint)
      propose_change(branch://agent/issue-42)
  → Coder receives bounded capability
```

This prevents agents from minting arbitrary authority.

---

## 4. Three-Layer Security Model

### Layer 1 — Capabilities: Authority

**Question**: Can this agent even attempt this class of action?

**Implementation**: Capability token validation (new — to be built).

**Behavior**: Default-deny. If no valid capability exists for the requested syscall + scope, the action is immediately rejected before policy evaluation begins.

**Example**:
```
Agent: agent_qa_3c4d
Syscall: write_resource
Target: src/kernel/kernel.ts
Capability: write_resource(tests/**)

Result: DENIED (target outside capability scope)
```

### Layer 2 — Policies: Governance

**Question**: Is this action allowed under current governance rules?

**Implementation**: Existing `PolicyRule` evaluation in `src/policy/evaluator.ts`. The `evaluate()` function matches actions against loaded policy rules, checking action patterns, scope conditions, branch conditions, and limits.

**Behavior**: Rules can allow or deny. Deny rules from any source take priority (the evaluator checks denies first at `evaluator.ts:107`).

**Example**:
```
Agent: agent_dev_1a2b
Syscall: write_resource
Target: .github/workflows/ci.yml
Capability: write_resource(src/**, tests/**) — PASSES (different check)
Policy: deny file.write scope:[.github/**] — DENIED

Result: DENIED (policy denial, reason: "CI config changes require human approval")
```

### Layer 3 — Invariants: Correctness

**Question**: Would this action violate system correctness constraints?

**Implementation**: Existing `DEFAULT_INVARIANTS` in `src/invariants/definitions.ts`. Six built-in invariants checked via `InvariantChecker`:

1. **`no-secret-exposure`** (severity 5): No `.env`, credentials, `.pem`, `.key` files committed
2. **`protected-branch`** (severity 5): No direct push to main/master
3. **`blast-radius`** (severity 4): File modification count within limits
4. **`test-before-push`** (severity 3): Tests must pass before push
5. **`no-force-push`** (severity 5): No `git push --force`
6. **`lockfile-integrity`** (severity 3): Lock file consistency

**Example**:
```
Agent: agent_dev_1a2b
Syscall: propose_change
Target: branch://main
Capability: propose_change(branch://agent/*) — DENIED (scope mismatch)

But even if capability passed:
Invariant: protected-branch — DENIED (direct push to main forbidden)
```

### Combined Evaluation Flow

```
Agent proposes tool call
  ↓
PreToolUse hook fires
  ↓
normalizeClaudeCodeAction() → RawAgentAction
  ↓
AAB.normalizeIntent() → NormalizedIntent (action type, target, destructive)
  ↓
┌─────────────────────────────────────────────────┐
│ Layer 1: Capability Validation                   │
│   Is capability token valid?                     │
│   Does operation match?                          │
│   Is target within scope?                        │
│   Are constraints satisfied?                     │
│                                                  │
│   → If DENIED: emit CapabilityDenied, return     │
└─────────────────────────┬───────────────────────┘
                          ↓
┌─────────────────────────────────────────────────┐
│ Layer 2: Policy Evaluation                       │
│   evaluate(intent, policies) → EvalResult        │
│   Match rules by action pattern, scope, branch   │
│                                                  │
│   → If DENIED: emit PolicyDenied, return         │
└─────────────────────────┬───────────────────────┘
                          ↓
┌─────────────────────────────────────────────────┐
│ Layer 3: Invariant Checking                      │
│   checkInvariants(systemState) → violations[]    │
│   Verify correctness constraints hold            │
│                                                  │
│   → If VIOLATED: emit InvariantViolation, return │
└─────────────────────────┬───────────────────────┘
                          ↓
┌─────────────────────────────────────────────────┐
│ Monitor: Escalation Check                        │
│   Track denial rate, adjust escalation level     │
│   NORMAL → ELEVATED → HIGH → LOCKDOWN            │
│   LOCKDOWN = all actions denied                  │
└─────────────────────────┬───────────────────────┘
                          ↓
                     EXECUTE action
                          ↓
              Emit lifecycle events to JSONL
```

### Audit Semantics

Each layer's decision is recorded separately in the `GovernanceDecisionRecord`:

```json
{
  "recordId": "dec_1709913600_a1b2",
  "runId": "run_1709913400_abc",
  "timestamp": 1709913600000,
  "action": {
    "type": "file.write",
    "target": "src/kernel/monitor.ts",
    "agent": "agent_dev_1a2b",
    "destructive": false
  },
  "capability": {
    "id": "cap_0192",
    "operation": "write_resource",
    "scope_match": true,
    "constraints_satisfied": true
  },
  "policy": {
    "matchedPolicyId": "sdlc-developer-policy",
    "matchedPolicyName": "Developer Agent Policy",
    "severity": 4,
    "decision": "allow",
    "reason": "Developer may modify source and tests"
  },
  "invariants": {
    "allHold": true,
    "violations": []
  },
  "monitor": {
    "escalationLevel": 0,
    "totalEvaluations": 47,
    "totalDenials": 2
  },
  "outcome": "allow",
  "execution": {
    "executed": true,
    "success": true,
    "durationMs": 12
  }
}
```

Now you can answer for any action:
- **What authority did the agent have?** → `capability`
- **Who issued it?** → `capability.issued_by`
- **Was it within scope?** → `capability.scope_match`
- **Which governance rule applied?** → `policy.matchedPolicyId`
- **Were correctness constraints maintained?** → `invariants.allHold`
- **What was the escalation level?** → `monitor.escalationLevel`

---

## 5. System Topology

```
┌────────────────────────────────────────────────────────────────┐
│                      GitHub (Cloud)                             │
│                                                                 │
│  ┌──────────────┐  ┌───────────────┐  ┌─────────────────────┐ │
│  │ Issues        │  │ Pull Requests  │  │ Actions Workflows   │ │
│  │ (Task Queue)  │  │ (Agent Output) │  │ (Scheduler Trigger) │ │
│  └──────┬───────┘  └───────▲───────┘  └──────────┬──────────┘ │
└─────────┼──────────────────┼─────────────────────┼─────────────┘
          │ poll             │ create PR            │ trigger
          ▼                  │                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                   External Scheduler                             │
│                                                                  │
│  ┌──────────┐  ┌──────────────┐  ┌──────────┐  ┌────────────┐  │
│  │ Issue     │  │ Capability   │  │ Worktree │  │ PR         │  │
│  │ Poller    │→ │ Minter       │→ │ Manager  │→ │ Creator    │  │
│  └──────────┘  └──────┬───────┘  └──────────┘  └────────────┘  │
│                        │ mint caps + spawn                       │
└────────────────────────┼────────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│            Agent Worktree (isolated git worktree)                │
│                                                                  │
│  ┌──────────────────┐                                           │
│  │ Claude Code Agent │   Every tool call is a syscall:          │
│  │ (capability-bound)│                                          │
│  └────────┬─────────┘                                           │
│           │ PreToolUse hook                                      │
│           ▼                                                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              AgentGuard Kernel (syscall handler)           │   │
│  │                                                           │   │
│  │  RawAgentAction → AAB (syscall router) → NormalizedIntent │   │
│  │       ↓                                                   │   │
│  │  Layer 1: Capability validation                           │   │
│  │       ↓                                                   │   │
│  │  Layer 2: Policy evaluation                               │   │
│  │       ↓                                                   │   │
│  │  Layer 3: Invariant checking                              │   │
│  │       ↓                                                   │   │
│  │  Monitor (escalation)                                     │   │
│  │       ↓                                                   │   │
│  │  Execute or Deny → JSONL audit trail                      │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Agent Roles as Capability Bundles

### Role Definitions

7 roles, each defined as a bundle of capabilities:

| Role | Capability Bundle |
|------|------------------|
| **research** | `read_resource(repo://**)` |
| **product** | `read_resource(repo://**)` + `write_resource(docs/product/**, spec/**)` |
| **architect** | `read_resource(repo://**)` + `write_resource(docs/**, spec/**, *.md)` |
| **developer** | `read_resource(repo://**)` + `write_resource(src/**, tests/**, package.json)` + `run_task(test, lint, build, ts:check)` + `create_artifact(test-results, coverage)` + `propose_change(branch://agent/*)` |
| **qa** | `read_resource(repo://**)` + `write_resource(tests/**)` + `run_task(test, test:unit, test:integration, lint)` + `create_artifact(test-results, coverage, lint-report)` + `propose_change(branch://agent/*)` |
| **documentation** | `read_resource(repo://**)` + `write_resource(docs/**, *.md, examples/**)` + `propose_change(branch://agent/*)` |
| **auditor** | `read_resource(repo://**)` + `run_task(test, lint)` + `create_artifact(audit-report)` |

### Self-Modification Protection

When AgentGuard governs its own development, certain paths must be protected from agent modification:

| Protected Path | Reason |
|---------------|--------|
| `src/kernel/**` | Core governance logic — agent modifications could weaken enforcement |
| `src/policy/**` | Policy engine — agents must not modify their own governance rules |
| `src/invariants/**` | Invariant definitions — agents must not weaken correctness constraints |
| `agentguard.yaml` | Default policy — changing this changes what agents can do |
| `.claude/settings.json` | Hook configuration — agents must not disable governance hooks |

These paths are excluded from all write capabilities via `constraints.deny`. Only human commits can modify governance-critical code.

### CLAUDE.md Role Templates

Each agent receives a role-specific CLAUDE.md in its worktree:

```markdown
# Agent Role: Developer
# Task: #{issue_number} — {issue_title}

## Authority
You hold capabilities for: read_resource, write_resource, run_task, propose_change.
Your write scope is limited to: {allowed_paths}
Protected paths (will be denied): src/kernel/**, src/policy/**, src/invariants/**

## Constraints
- Do NOT attempt to modify files outside your scope (the syscall will be denied)
- Do NOT push directly to any branch — commit to your worktree branch only
- Run `npm run ts:check` and `npm run ts:test` before committing
- Write tests for new functionality

## Task Description
{issue_body}

## Acceptance Criteria
{acceptance_criteria}
```

---

## 7. Task Lifecycle via GitHub Issues

GitHub Issues serve as the task registry. State is encoded in labels.

### Label Schema

| Category | Labels |
|----------|--------|
| **Status** | `status:pending`, `status:assigned`, `status:in-progress`, `status:review`, `status:completed`, `status:failed` |
| **Type** | `task:implementation`, `task:test-generation`, `task:documentation`, `task:bug-fix`, `task:refactor`, `task:architecture`, `task:research`, `task:review` |
| **Priority** | `priority:critical`, `priority:high`, `priority:medium`, `priority:low` |
| **Role** | `role:developer`, `role:qa`, `role:architect`, `role:documentation`, `role:auditor` |
| **Retry** | `retry:0`, `retry:1`, `retry:2`, `retry:3` |
| **Governance** | `governance:clean`, `governance:violations`, `governance:lockdown` |

### State Machine

```
┌─────────┐   ┌──────────┐   ┌─────────────┐   ┌──────────┐
│ pending  │──→│ assigned │──→│ in-progress │──→│  review  │
└─────────┘   └──────────┘   └──────┬──────┘   └────┬─────┘
                                     │                │
                                     ▼                ▼
                               ┌──────────┐    ┌───────────┐
                               │  failed  │    │ completed │
                               └────┬─────┘    └───────────┘
                                    │
                                    ▼ (if retries remain)
                               ┌─────────┐
                               │ pending  │
                               └─────────┘
```

### Issue Body Template

```markdown
## Task Description
[What needs to be done]

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2

## File Scope
Allowed paths for this task:
- `src/adapters/**`
- `tests/ts/adapter-*.test.ts`

## Protected Paths
These paths must NOT be modified (enforced by capabilities):
- `src/kernel/**`
- `src/policy/**`
- `src/invariants/**`

## Dependencies
Depends on: #41, #39

## Branch
`agent/implementation/issue-42`

## Priority
high

## Max Retries
3
```

### Assignment Comment

```markdown
**AgentGuard Scheduler** assigned this task.

- **Agent**: `agent_dev_1a2b`
- **Role**: developer
- **Capabilities**: read_resource(repo://), write_resource(src/**, tests/**), run_task(test, lint, build), propose_change(branch://agent/issue-42/*)
- **Protected**: src/kernel/**, src/policy/**, src/invariants/**
- **Max Actions**: 200
- **Timeout**: 30m
- **Run ID**: `run_1709913400_abc`
```

### Completion Comment

```markdown
**AgentGuard Scheduler** — task completed.

- **PR**: #87
- **Actions**: 142 proposed, 138 allowed, 4 denied
- **Capability denials**: 1 (attempted write to src/kernel/)
- **Policy denials**: 2 (scope violations)
- **Invariant violations**: 1 (blast radius exceeded, resolved after split)
- **Escalation**: NORMAL
- **Duration**: 18m 32s

<details>
<summary>Governance Summary</summary>

| Layer | Evaluations | Denials |
|-------|------------|---------|
| Capabilities | 142 | 1 |
| Policies | 141 | 2 |
| Invariants | 139 | 1 |

</details>
```

---

## 8. Minimal Viable Architecture

### Phase 1: One Planner + One Coder + Governance

The minimal loop that produces useful experiments:

```
roadmap.md (human-written)
      ↓
planner agent (read_resource only)
      ↓
GitHub Issue (task definition + file scope)
      ↓
coder agent (capability-bound)
      ↓
every tool call → AgentGuard kernel
      ↓
policy checks + invariant checks
      ↓
allow / deny
      ↓
commit → PR → human review → merge
      ↓
CI
```

### What Already Exists in AgentGuard

| Component | Status | Location |
|-----------|--------|----------|
| Action type normalization (AAB) | Exists | `src/kernel/aab.ts` |
| Policy evaluation | Exists | `src/policy/evaluator.ts` |
| 24 invariant checks | Exists | `packages/invariants/src/definitions.ts` |
| Escalation monitor (4 levels) | Exists | `src/kernel/monitor.ts` |
| JSONL event persistence | Exists | `src/events/jsonl.ts` |
| GovernanceDecisionRecord | Exists | `src/kernel/decisions/` |
| Pre-execution simulation | Exists | `src/kernel/simulation/` |
| Evidence pack generation | Exists | `src/kernel/evidence.ts` |
| Claude Code adapter | Exists | `src/adapters/claude-code.ts` |
| `claude-init` (hook setup) | Exists | `src/cli/commands/claude-init.ts` |
| `claude-hook` (PostToolUse/Bash) | Partial | `src/cli/commands/claude-hook.ts` |

### What Needs to Be Built

| Component | Priority | Description |
|-----------|----------|-------------|
| **PreToolUse hook for all tools** | P0 | Extend `claude-hook` to intercept all tools via PreToolUse, run `kernel.propose()`, block unauthorized actions. This is the syscall enforcement layer. |
| **Capability token schema** | P1 | JSON token format with id, subject, operation, scopes, constraints, expiry. Validated before policy evaluation. |
| **Capability validator in kernel** | P1 | New validation step in `kernel.propose()` between AAB normalization and policy evaluation. |
| **External scheduler** | P1 | Standalone process: poll GitHub Issues, mint capabilities, create worktrees, spawn claude CLI, monitor agents, create PRs. |
| **Role-to-capability mapping** | P2 | Expand role assignment into concrete capability tokens per task. |

### Concrete End-to-End Flow

**Setup (one-time)**:
```bash
# Install AgentGuard hook in Claude Code
npx agentguard claude-init

# Configure policies
cp policies/developer.yaml .agentguard/active-policy.yaml
```

**Per-task flow**:

1. **Human creates GitHub Issue** with `agentguard-task` + `task:implementation` + `priority:high` labels
2. **Scheduler polls** and finds the pending issue
3. **Scheduler mints capabilities** based on issue's file scope section
4. **Scheduler creates worktree**: `git worktree add ../worktrees/issue-42 -b agent/implementation/issue-42`
5. **Scheduler writes CLAUDE.md** with role template + task description
6. **Scheduler writes capability token** to `.agentguard/capabilities/current.json` in the worktree
7. **Scheduler spawns agent**: `claude --print -p "Complete the task described in CLAUDE.md"` in the worktree
8. **Agent works** — every tool call triggers PreToolUse hook → AgentGuard kernel
9. **Kernel evaluates**: capability check → policy check → invariant check → execute or deny
10. **Agent completes** — commits to worktree branch
11. **Scheduler creates PR** via `gh pr create`
12. **Scheduler posts completion comment** on the issue with governance summary
13. **Human reviews PR** — merges or requests changes
14. **Scheduler cleans up** worktree

---

## 9. Governance Integration

### Hook Architecture

The scheduler configures `.claude/settings.json` in each worktree:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "npx agentguard claude-hook --mode=pre --run-id=run_abc"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "npx agentguard claude-hook --mode=post --run-id=run_abc"
          }
        ]
      }
    ]
  }
}
```

### PreToolUse Flow (Syscall Enforcement)

```
Claude Code proposes tool call
  → PreToolUse hook fires
  → claude-hook reads ClaudeCodeHookPayload from stdin
  → normalizeClaudeCodeAction(payload) → RawAgentAction
  → Load capability token from .agentguard/capabilities/current.json
  → Inject capability + role + taskId into RawAgentAction.metadata
  → kernel.propose(rawAction) → KernelResult
  → If denied: write denial message to stdout (Claude Code shows it, skips tool call)
  → If allowed: exit 0 silently (tool call proceeds)
  → Decision persisted to .agentguard/events/<runId>.jsonl
```

### PostToolUse Flow (Telemetry)

```
Claude Code completes tool call
  → PostToolUse hook fires
  → Log execution result to JSONL
  → Increment action counter in .agentguard/state/counter.json
  → If action count exceeds max: write "Action limit reached" to stdout
```

### Environment Variables

| Variable | Example | Purpose |
|----------|---------|---------|
| `AGENTGUARD_ROLE` | `developer` | Agent's role |
| `AGENTGUARD_TASK_ID` | `42` | GitHub Issue number |
| `AGENTGUARD_RUN_ID` | `run_1709913400_abc` | Kernel run ID |
| `AGENTGUARD_POLICY` | `policies/developer.yaml` | Policy file |
| `AGENTGUARD_MAX_ACTIONS` | `200` | Action limit |
| `AGENTGUARD_CAP_FILE` | `.agentguard/capabilities/current.json` | Capability token path |

### Escalation Integration

The monitor (`src/kernel/monitor.ts`) tracks escalation:

| Level | Value | Behavior |
|-------|-------|----------|
| NORMAL | 0 | All clear |
| ELEVATED | 1 | Elevated denial rate, continue with caution |
| HIGH | 2 | Significant violations — scheduler pauses |
| LOCKDOWN | 3 | All actions denied |

When JSONL events show escalation reaching HIGH, the scheduler:
1. Terminates all active agent processes
2. Posts comments on all in-progress issues
3. Updates issue labels to `governance:lockdown`
4. Stops polling until human intervention

---

## 10. Execution Loop

### Minimal Scheduler Pseudocode

```
INITIALIZE:
  config = loadSchedulerConfig()
  github = createGitHubClient(config.github)

MAIN LOOP:
  while scheduler.running:

    // 1. POLL
    issues = github.listIssues({
      labels: ["agentguard-task", "status:pending"],
      sort: "created", direction: "asc"
    })
    .filter(i => allDependenciesMet(i))
    .sort(byPriority)

    if issues.length === 0 || activeAgents >= config.maxConcurrent:
      sleep(config.pollIntervalMs)
      continue

    issue = issues[0]

    // 2. DETERMINE ROLE
    role = mapTaskTypeToRole(extractLabel(issue, "task:"))
    //   task:implementation → developer
    //   task:test-generation → qa
    //   task:architecture → architect

    // 3. MINT CAPABILITIES
    filePaths = parseFileScope(issue.body)
    capabilities = mintCapabilityBundle(role, {
      taskId: issue.number,
      scopes: filePaths,
      protectedPaths: SELF_MODIFICATION_DENY_LIST,
      expiresIn: config.taskTimeoutMs,
    })

    // 4. CREATE WORKTREE
    branch = `agent/${taskType}/issue-${issue.number}`
    worktreePath = exec(`git worktree add ../worktrees/${branch} -b ${branch}`)

    // 5. PREPARE WORKTREE
    writeFile(`${worktreePath}/CLAUDE.md`, renderRoleTemplate(role, issue))
    writeFile(`${worktreePath}/.agentguard/capabilities/current.json`, capabilities)
    writeFile(`${worktreePath}/.claude/settings.json`, renderHookSettings(runId))
    copyFile(`policies/${role}.yaml`, `${worktreePath}/.agentguard/policy.yaml`)

    // 6. UPDATE ISSUE
    github.updateLabels(issue.number, { add: ["status:assigned", `role:${role}`] })
    github.postComment(issue.number, renderAssignmentComment({...}))

    // 7. SPAWN AGENT
    agentProcess = spawn("claude", ["--print", "-p", renderTaskPrompt(issue)], {
      cwd: worktreePath,
      env: { AGENTGUARD_ROLE: role, AGENTGUARD_TASK_ID: issue.number, ... },
      timeout: config.taskTimeoutMs,
    })

    github.updateLabels(issue.number, { add: ["status:in-progress"] })

    // 8. ON COMPLETION
    agentProcess.on("exit", async (code) => {
      summary = parseJsonlEvents(`${worktreePath}/.agentguard/events/${runId}.jsonl`)

      if code === 0 && summary.escalationLevel < HIGH:
        exec(`git push origin ${branch}`, { cwd: worktreePath })
        pr = github.createPR({
          title: `[${role}] ${issue.title}`,
          body: renderPRBody(issue, summary, capabilities),
          head: branch, base: "main",
        })
        github.updateLabels(issue.number, { add: ["status:review"] })
        github.postComment(issue.number, renderCompletionComment(pr, summary))
      else:
        retries = extractRetryCount(issue)
        if retries < config.maxRetries:
          github.updateLabels(issue.number, {
            add: ["status:pending", `retry:${retries + 1}`],
            remove: ["status:in-progress"]
          })
        else:
          github.updateLabels(issue.number, { add: ["status:failed"] })
        github.postComment(issue.number, renderFailureComment(summary))

      exec(`git worktree remove ${worktreePath} --force`)
    })
```

---

## 11. Policy Configuration

Role-scoped YAML policies using AgentGuard's existing `PolicyRule` format.

### Developer Policy (`policies/developer.yaml`)

```yaml
id: sdlc-developer-policy
name: Developer Agent Policy
description: Governs developer agents — allows src/ and tests/ modifications
severity: 4

rules:
  - action: file.write
    effect: allow
    conditions:
      scope: ["src/**", "tests/**", "package.json"]
    reason: Developer may modify source, tests, and package.json

  - action: file.write
    effect: deny
    conditions:
      scope: [".github/**", "Dockerfile", ".env*", "agentguard.yaml"]
    reason: CI, environment, and governance config require human approval

  - action: [file.write, file.delete]
    effect: deny
    conditions:
      scope: ["src/kernel/**", "src/policy/**", "src/invariants/**"]
    reason: Self-modification protection — governance code is human-only

  - action: [git.push, deploy.trigger, infra.apply, infra.destroy, npm.publish]
    effect: deny
    reason: Production-affecting actions require human authorization

  - action: file.read
    effect: allow
    reason: Reading is always safe

  - action: [shell.exec, git.commit, git.branch.create, npm.install]
    effect: allow
    reason: Development operations within worktree are safe
```

### QA Policy (`policies/qa.yaml`)

```yaml
id: sdlc-qa-policy
name: QA Agent Policy
severity: 4

rules:
  - action: file.write
    effect: allow
    conditions:
      scope: ["tests/**", "**/*.test.ts", "**/*.test.js", "**/*.spec.ts"]
    reason: QA writes test files

  - action: file.write
    effect: deny
    conditions:
      scope: ["src/**"]
    reason: QA agents do not modify production code

  - action: [test.run, test.run.unit, test.run.integration]
    effect: allow
    reason: Test execution is QA's primary function

  - action: [git.push, deploy.trigger, npm.publish]
    effect: deny
    reason: QA cannot push or deploy

  - action: [file.read, shell.exec, git.commit]
    effect: allow
    reason: Basic development operations
```

### Auditor Policy (`policies/auditor.yaml`)

```yaml
id: sdlc-auditor-policy
name: Auditor Agent Policy
severity: 5

rules:
  - action: [file.write, file.delete, file.move, git.commit, git.push, npm.install, deploy.trigger]
    effect: deny
    reason: Auditor is strictly read-only

  - action: [file.read, test.run, test.run.unit, test.run.integration]
    effect: allow
    reason: Auditor reads code and verifies tests
```

---

## 12. Telemetry & Observability

### What Already Exists

AgentGuard already logs every action as structured events. The `GovernanceDecisionRecord` (`src/kernel/decisions/types.ts`) captures:

- `action.type` — the syscall (e.g., `file.write`)
- `action.target` — the resource (e.g., `src/kernel/monitor.ts`)
- `action.agent` — the agent ID
- `outcome` — `allow` or `deny`
- `reason` — human-readable explanation
- `policy.matchedPolicyId` — which policy rule applied
- `invariants.violations[]` — which correctness checks failed
- `monitor.escalationLevel` — current escalation state
- `execution.success` — whether the action succeeded

Events are persisted to `.agentguard/events/<runId>.jsonl`, one JSON per line.

### Enhanced Telemetry for Autonomous SDLC

The autonomous loop adds capability context to each event (via `metadata`):

```json
{
  "id": "evt_1709913600_42",
  "kind": "ActionDenied",
  "timestamp": 1709913600000,
  "fingerprint": "a1b2c3d4",
  "actionType": "file.write",
  "target": "src/kernel/kernel.ts",
  "reason": "Self-modification protection — governance code is human-only",
  "metadata": {
    "agent_id": "agent_dev_1a2b",
    "role": "developer",
    "task_id": 42,
    "capability_id": "cap_0192",
    "capability_scope_match": false,
    "layer": "capability",
    "run_id": "run_1709913400_abc"
  }
}
```

### The Dogfooding Dividend

Running this on AgentGuard's own codebase produces empirical data on:

| Signal | What It Tells You |
|--------|------------------|
| Most-denied action types | Which operations agents attempt unsafely |
| Capability scope violations | Where agents exceed their authority |
| Policy denial patterns | Which governance rules produce the most friction |
| Invariant violation frequency | Which correctness constraints agents hit |
| Escalation triggers | What behavior patterns cause systemic denial rates |
| Self-modification attempts | How often agents try to weaken their own governance |
| Code quality drift | Whether agent-written code maintains standards |

This telemetry is the raw material for:
- Policy hardening (every violation → policy improvement)
- Agent safety research (real failure modes, not theoretical ones)
- Product evidence (AgentGuard's own development proves its governance model works)

---

## 13. Recommended AgentGuard Enhancements

Prioritized changes to AgentGuard's codebase to support the autonomous SDLC:

### Priority 0 — Extended `claude-hook` (Syscall Enforcement Layer)

**File**: `src/cli/commands/claude-hook.ts`

Currently: PostToolUse only, Bash only, reports errors.
Needed: PreToolUse for all tools, full `kernel.propose()` evaluation, deny messages to stdout.

This is the **critical enabler**. Without PreToolUse enforcement, agents can execute unauthorized actions before governance evaluates them.

**Changes**:
- Accept `--mode=pre|post` flag
- Accept `--policy=<file>` and `--run-id=<id>` flags
- In `pre` mode: load policy, load capability token, run `kernel.propose()`, write deny to stdout if blocked
- In `post` mode: log execution result, update action counter
- Process all tool types (not just Bash)

### Priority 1 — Capability Token Validation

**New file**: `src/kernel/capability.ts`

```typescript
interface CapabilityToken {
  id: string;
  subject: string;
  operation: string;
  scopes: string[];
  constraints?: {
    deny?: string[];
    max_files?: number;
    max_diff_lines?: number;
    requires_artifacts?: string[];
  };
  issued_to: string;
  issued_by: string;
  issued_at: string;
  expires_at: string;
  task_id: string;
}

function validateCapability(token: CapabilityToken, intent: NormalizedIntent): CapabilityResult;
```

**Modify**: `src/kernel/kernel.ts` — add capability validation before `monitor.process()` in `propose()`.

### Priority 2 — Role/Task as First-Class Fields

**Modify**: `src/kernel/aab.ts` — add `role?: string` and `taskId?: string` to `RawAgentAction`
**Modify**: `src/policy/evaluator.ts` — add `role?: string` and `taskId?: string` to `NormalizedIntent`

### Priority 3 — Role-Based Policy Conditions

**Modify**: `src/policy/evaluator.ts` — add `roles?: string[]` and `ownership?: string[]` to `PolicyRule.conditions`

### Priority 4 — New Invariants

**Modify**: `src/invariants/definitions.ts`:
- `architectural-boundary`: Files must be within role's owned paths
- `self-modification-guard`: Governance-critical paths cannot be modified by agents
- `build-must-succeed`: Build passing before commit/push

### Priority 5 — New Event Kinds

**Modify**: `src/core/types.ts` — add: `CapabilityDenied`, `CapabilityExpired`, `TaskAssigned`, `TaskCompleted`, `AgentRegistered`

---

## 14. Open Questions & Future Work

### Open Questions

1. **PreToolUse blocking semantics**: Does Claude Code's PreToolUse hook reliably block tool execution when stdout contains a denial message? This needs empirical verification for each tool type.

2. **Capability token signing**: For the minimal viable version, local JSON files are sufficient. For multi-machine deployments, capability tokens need cryptographic signing. What signing scheme? (HMAC is simplest, JWT is most portable.)

3. **Self-modification boundary**: Which files constitute "governance-critical" code? The current list (`src/kernel/**`, `src/policy/**`, `src/invariants/**`) may be too broad or too narrow.

4. **Dependency resolution**: When task A depends on task B's unmerged PR, should task A work against task B's branch? Or wait for merge?

5. **Cost management**: Each agent invocation consumes API tokens. Should the scheduler enforce a per-task or per-day token budget?

### Future Work

- **Capability delegation**: Planner agents issue scoped capabilities to downstream agents (requires trust model for the planner).
- **Capability revocation**: Real-time revocation when escalation level rises (currently capabilities have fixed expiry).
- **Parallel pipelines**: Independent tasks in separate worktrees, running concurrently.
- **Agent memory**: Persist learnings across tasks (common denial reasons, preferred patterns).
- **Automated review**: Auditor agent reviews PRs before human review.
- **Conflict detection**: Detect overlapping file modifications across concurrent worktrees.
- **Policy learning**: Analyze denial telemetry to suggest policy rule adjustments.
- **Safety benchmarks**: Publish agent failure telemetry as a reproducible safety benchmark.

### The Long-Term Vision

If the reflexive model works — AgentGuard governing its own development — the system demonstrates a concrete answer to the question: "How do you let AI agents do real work while maintaining deterministic control?"

The answer is not "trust the model" or "add guardrails." The answer is:

```
capability-secured syscall interface
  → deterministic policy evaluation
  → correctness invariant enforcement
  → structured audit trail
```

That is the architectural primitive. Everything else is scaffolding.
