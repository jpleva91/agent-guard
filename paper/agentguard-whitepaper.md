# Deterministic Governance for Autonomous Software Agents: An Execution-Layer Architecture

**Authors:** [Jared G. Pleva]
**Date:** March 2026
**Status:** Draft

---

## Abstract

As AI agents evolve from passive code assistants to autonomous system operators, the primary risk in software development shifts from incorrect reasoning to unsafe execution. Agents now modify source code, execute shell commands, manipulate infrastructure, and interact with external services. Current safety mechanisms --- reinforcement learning from human feedback (RLHF), prompt engineering, and sandboxing --- operate at the model or environment layer and cannot provide deterministic guarantees about execution behavior.

This paper proposes that agent safety should be enforced at the **execution layer** via deterministic governance, rather than at the model or prompt layer. We introduce three architectural contributions:

1. **Canonical Action Representation (CAR)** --- a normalized action schema that transforms unstructured agent tool calls into typed, validated action objects amenable to deterministic evaluation.

2. **Action Authorization Boundary (AAB)** --- a reference monitor (Anderson, 1972) that mediates all agent actions against declared policies and system invariants, producing structured evidence for every decision.

3. **Invariant-Based Safety** --- a system of runtime invariants that enforce state constraints (secret protection, blast radius limits, branch safety) on every action evaluation, with severity-based intervention selection.

We demonstrate the feasibility of this architecture through **AgentGuard**, a reference implementation comprising a policy engine, invariant checker, evidence pack generator, and escalation monitor. Four evaluation scenarios show that the system deterministically blocks unsafe operations while preserving full observability through canonical events and audit trails.

---

## 1. Introduction

The capabilities of AI coding agents have expanded rapidly. Systems like Claude Code, GitHub Copilot Workspace, Cursor, and Devin no longer merely suggest code --- they execute file operations, run shell commands, manage git workflows, install dependencies, and trigger deployments. This transition from *text generation* to *environmental action* creates a fundamentally different safety challenge.

When an agent generates text, the worst outcome is incorrect information. When an agent executes actions, the worst outcome is irreversible system damage: deleted production databases, exposed secrets, force-pushed branches, or unauthorized deployments.

The surface area of agent execution is substantial. A typical development agent may invoke actions across 8 distinct classes and 23+ action types:

| Class | Actions | Risk Level |
|-------|---------|------------|
| `file` | read, write, delete, move | Medium |
| `test` | run, run.unit, run.integration | Low |
| `git` | diff, commit, push, branch.create, branch.delete, checkout, reset, merge | High |
| `shell` | exec | Critical |
| `npm` | install, script.run, publish | High |
| `http` | request | Medium |
| `deploy` | trigger | Critical |
| `infra` | apply, destroy | Critical |

> *Source: `packages/core/src/actions.ts` --- 23 action types across 8 classes defined in the reference implementation.*

The core thesis of this paper is:

> **Agent safety should be enforced at the execution layer via deterministic governance, rather than at the model or prompt layer.**

This is not a claim that model-level safety is unimportant. It is a claim that model-level safety is *insufficient* for execution governance, and that a complementary deterministic layer is required.

### 1.1 Contributions

This paper makes three contributions:

1. A **Canonical Action Representation** that normalizes agent tool calls into a structured vocabulary suitable for deterministic evaluation (Section 4).

2. An **Action Authorization Boundary** that implements the reference monitor concept (Anderson, 1972) for agent execution, providing complete mediation, tamper-resistance, and verifiability (Section 5).

3. An **invariant enforcement model** that defines system safety as a set of runtime invariants with severity-based intervention selection (Section 6).

We provide a reference implementation (AgentGuard) and evaluate it against four scenarios that exercise the full governance pipeline (Section 9).

---

## 2. Limitations of Existing Approaches

Current approaches to agent safety operate at three layers: the model layer, the prompt layer, and the environment layer. None of them satisfy the requirements of execution governance.

### 2.1 Model-Layer Safety (RLHF / Constitutional AI)

Reinforcement learning from human feedback (RLHF) and constitutional AI train models to prefer safe outputs. These techniques are effective for reducing harmful text generation but are fundamentally probabilistic. They cannot guarantee that an agent will never execute `rm -rf /` or `git push --force origin main`. A model that is 99.9% safe still fails catastrophically at scale --- a single unsafe action among thousands can cause irreversible damage.

Model-layer safety also lacks *action-level granularity*. RLHF operates on token distributions, not on structured action semantics. It cannot distinguish between `file.write` to `src/auth.ts` (likely safe) and `file.write` to `.env` (likely dangerous) because both are sequences of tokens to the model.

### 2.2 Prompt-Layer Safety (System Prompts / Tool Restrictions)

Prompt engineering and system instructions can constrain agent behavior within a conversation. However, prompts are:

- **Fragile**: susceptible to prompt injection and jailbreaking
- **Non-deterministic**: the same prompt may produce different behaviors across runs
- **Unauditable**: no structured record of what was allowed or denied, or why
- **Bypassable**: a sufficiently capable model may reason around prompt constraints

Tool restrictions (e.g., only exposing certain tools to the agent) provide coarse-grained control but cannot enforce semantic policies. Exposing a `Bash` tool grants access to every possible shell command --- the tool restriction cannot distinguish between `ls` and `rm -rf /`.

### 2.3 Environment-Layer Safety (Sandboxing / Containers)

Sandboxing and containerization restrict what the execution environment can do. Docker containers, chroot jails, and virtual machines provide isolation but operate at the wrong level of abstraction for development agents:

- **No semantic understanding**: A sandbox cannot distinguish between a safe file write and a dangerous one based on the file's role in the project.
- **Coarse granularity**: Filesystem permissions are per-directory, not per-action-type.
- **No observability**: Sandboxes enforce boundaries but do not record *why* an action was attempted or *what policy* it violated.
- **Incompatible with development**: Developers need agents to read and write files, run tests, and interact with git. A sandbox restrictive enough to prevent all unsafe actions also prevents productive work.

### 2.4 The Reference Monitor Gap

None of these approaches satisfy the three properties of a reference monitor (Anderson, 1972):

| Property | RLHF | Prompts | Sandboxing |
|----------|------|---------|------------|
| **Complete mediation** (every action checked) | No --- operates on token probabilities, not actions | Partial --- only constrains tool selection | Partial --- kernel-level, no semantic checks |
| **Tamper-proof** (cannot be bypassed by subject) | No --- model can reason around RLHF training | No --- prompt injection is well-documented | Yes --- but at wrong abstraction level |
| **Verifiable** (small enough to analyze) | No --- billions of parameters | No --- natural language is ambiguous | Partial --- OS kernel is large and complex |

This gap motivates the architecture presented in this paper: a deterministic, action-level governance layer that satisfies all three reference monitor properties.

---

## 3. Execution Governance Model

### 3.1 Core Thesis

The architecture separates the AI reasoning layer from the execution environment. Probabilistic reasoning never directly controls real-world execution. Instead, all agent actions pass through a deterministic authorization boundary.

```
Agent Reasoning Layer
(LLM planning, code generation, tool selection)
        |
        v
Intent Compilation
(raw tool calls --> normalized action objects)
        |
        v
Action Authorization Boundary
(deterministic policy + invariant enforcement)
        |
        v
Execution Adapters
(filesystem, shell, git, CI, APIs)
        |
        v
Runtime Telemetry
(canonical events, evidence packs, audit trail)
```

> *See diagram: `paper/diagrams/system-architecture.md`*
> *Implementation: `packages/kernel/src/decision.ts` --- the `evaluate()` method is the central entry point where all layers converge.*

### 3.2 Design Principles

The governance layer operates under six principles:

1. **Deterministic**: Same action + same policy = same decision. No inference, no heuristics, no randomness.
2. **Fail-closed**: If evaluation fails for any reason, the action is denied. The system never defaults to permissive.
3. **Zero runtime dependencies**: The governance engine is pure logic with no external dependencies. It runs identically in Node.js and browser environments.
4. **Observable**: Every decision produces structured events. Every denial produces an evidence pack with full context.
5. **Composable**: Multiple policies can apply to the same action. Deny rules take precedence (fail-closed composition).
6. **No AI in governance**: The governance layer must not contain any probabilistic reasoning. Determinism is the entire point.

### 3.3 The Evaluation Pipeline

When an agent requests an action, the engine executes the following pipeline:

1. **Normalize intent** --- Convert the raw tool call into a `NormalizedIntent` with typed action, target, agent, and metadata fields.
2. **Destructive check** --- Pattern-match the command against known destructive operations (`rm -rf`, `DROP DATABASE`, `dd if=`, etc.). If destructive, immediately deny with severity 5.
3. **Policy evaluation** --- Match the intent against all loaded policy rules. Deny rules are checked first (fail-closed). If any deny rule matches, the action is denied with the policy's severity level.
4. **Invariant checking** --- Evaluate all system invariants against the current state. Each violated invariant produces an `INVARIANT_VIOLATION` event.
5. **Intervention selection** --- Based on the maximum severity across policy decisions and invariant violations, select an intervention: `DENY` (severity >= 5), `PAUSE` (severity >= 4), `ROLLBACK` (severity >= 3), or `TEST_ONLY` (severity < 3).
6. **Evidence pack generation** --- If the action was denied or any events were produced, generate an `EvidencePack` containing the full decision context: intent, evaluation result, violation details, event IDs, summary, and severity.
7. **Event emission** --- Emit all canonical events (policy denials, invariant violations, evidence packs) to the event bus and event store.

> *Implementation: `packages/kernel/src/decision.ts` (evaluate method), `packages/kernel/src/aab.ts` (authorize function)*
> *See diagram: `paper/diagrams/aab-decision-flow.md`*

---

## 4. Canonical Action Representation (CAR)

### 4.1 The Problem of Unstructured Actions

AI agents interact with their environment through tool calls. These tool calls are unstructured and tool-specific:

```json
{ "tool": "Bash", "command": "git push --force origin main" }
{ "tool": "Write", "file": "src/auth.ts", "content": "..." }
{ "tool": "Edit", "file": ".env", "old_string": "...", "new_string": "..." }
```

These raw representations are unsuitable for deterministic policy evaluation because:

- The same semantic action (e.g., "write to a file") can come from different tools (`Write`, `Edit`, `Bash` with `echo >`)
- The risk level depends on the target, not the tool (`Write` to `src/auth.ts` vs. `Write` to `.env`)
- Git operations are embedded inside shell commands and must be extracted
- There is no uniform schema for matching actions against policies

### 4.2 The Canonical Action Schema

CAR defines a vocabulary of **23 action types** across **8 action classes**. Every agent tool call is mapped to exactly one canonical action type:

```typescript
// 8 action classes
ACTION_CLASS: { FILE, TEST, GIT, SHELL, NPM, HTTP, DEPLOY, INFRA }

// 23 action types (subset shown)
'file.read'    // Read file contents
'file.write'   // Write or create a file
'file.delete'  // Delete a file
'git.commit'   // Create a git commit
'git.push'     // Push to remote
'git.merge'    // Merge branches
'shell.exec'   // Execute a shell command
'deploy.trigger' // Trigger deployment
'infra.destroy'  // Destroy infrastructure
```

> *Full definition: `packages/core/src/actions.ts` --- `ACTION_TYPES` object with 23 entries.*

### 4.3 Intent Normalization

The `normalizeIntent()` function converts raw tool calls into `NormalizedIntent` objects:

```typescript
interface NormalizedIntent {
  action: string;        // Canonical action type (e.g., 'git.force-push')
  target: string;        // Target resource (e.g., 'main')
  agent: string;         // Agent identifier
  branch?: string;       // Git branch (extracted from command)
  command?: string;      // Original command (for shell actions)
  filesAffected?: number; // Blast radius metric
  destructive: boolean;  // Destructive command flag
}
```

The normalization pipeline:

1. **Tool mapping**: `TOOL_ACTION_MAP` maps tool names to canonical action types (`Write` -> `file.write`, `Bash` -> `shell.exec`).
2. **Git detection**: For shell commands, `detectGitAction()` uses regex patterns to identify git operations and extract the specific sub-action (`git push --force` -> `git.force-push`).
3. **Destructive detection**: `isDestructiveCommand()` matches against 11 destructive patterns (rm -rf, DROP DATABASE, dd if=, chmod 777, etc.).
4. **Branch extraction**: `extractBranch()` parses the target branch from git push commands.

> *Implementation: `packages/kernel/src/aab.ts` --- `normalizeIntent()` function.*
> *See diagram: `paper/diagrams/canonical-action-pipeline.md`*

### 4.4 Key Insight: Actions as Data

The fundamental insight of CAR is that **actions are data, not commands**. Once an agent's intent is compiled into a `NormalizedIntent`, it can be:

- **Evaluated** against policies without execution
- **Validated** for required fields and known types
- **Fingerprinted** for deduplication (`fingerprintAction()` in `packages/core/src/actions.ts`)
- **Recorded** as canonical events for audit and replay
- **Compared** across agents, sessions, and time

This separation of representation from execution is what enables deterministic governance.

---

## 5. Action Authorization Boundary (AAB)

### 5.1 Reference Monitor Properties

The AAB implements the classical reference monitor concept (Anderson, 1972) with three properties:

**Complete mediation.** Every agent action passes through the `authorize()` function. The `TOOL_ACTION_MAP` ensures that all recognized tools (Write, Edit, Read, Bash, Glob, Grep) are mapped to canonical action types. Unrecognized tools are mapped to `unknown`, which can be denied by policy.

**Tamper-proof.** The AAB operates as a deterministic runtime *outside* the AI reasoning layer. The agent cannot modify its own constraints because the policy evaluation logic is not part of the LLM's context or tool set. The agent can only submit raw actions; it cannot access or alter the governance engine.

**Verifiable.** The policy evaluation logic (`packages/policy/src/evaluator.ts`) is pure functions operating on data. There is no inference, no heuristics, no neural network in the evaluation path. The entire authorization codebase is under 500 lines of TypeScript and can be fully analyzed and tested.

> *Implementation: `packages/kernel/src/aab.ts`, `packages/policy/src/evaluator.ts`*

### 5.2 Policy Model

Policies are structured rules that map action patterns to decisions:

```typescript
interface PolicyRule {
  action: string | string[];  // Action pattern (e.g., 'git.force-push', 'file.*')
  effect: 'allow' | 'deny';   // Decision
  conditions?: {
    scope?: string[];          // File/path patterns
    limit?: number;            // Blast radius cap
    branches?: string[];       // Protected branches
    requireTests?: boolean;    // Test gate
  };
  reason?: string;             // Human-readable explanation
}
```

The evaluation algorithm is deterministic and ordered:

1. **Deny rules first**: All deny rules across all policies are checked first. If any deny rule matches, the action is denied. This ensures fail-closed composition.
2. **Allow rules second**: If no deny rule matches, allow rules are checked. The first matching allow rule determines the decision.
3. **Default allow**: If no rules match at all, the action is allowed by default. (This default can be overridden by adding a catch-all deny rule.)

Pattern matching supports wildcards: `*` matches all actions, `file.*` matches all file actions, `git.*` matches all git actions.

Scope matching supports glob-like patterns: `src/**` matches all files under `src/`, `*.ts` matches all TypeScript files.

> *Implementation: `packages/policy/src/evaluator.ts` --- `evaluate()` function.*

### 5.3 Capability-Based Permissions

The policy model follows the capability-based security paradigm (Dennis & Van Horn, 1966). Agents do not receive ambient authority --- broad permissions inherited from the user's environment. Instead, each agent receives an explicit **capability set** that defines exactly what actions it may perform.

This is the **Principle of Least Authority (POLA)** applied to AI agents. The reference implementation ships with a default capability configuration:

```
Allowed: file.read, file.write, file.create, test.run, lint.run,
         git.diff, git.status, git.commit, git.push, build.run,
         simulate.run, sync-data.run

Restricted: shell.exec.arbitrary, network.call.external,
            git.push.force, git.rebase.interactive, git.reset.hard,
            file.delete.bulk, dependency.add/remove, ci.modify
```

> *Configuration: `policy/capabilities.json` --- production capability boundaries.*

---

## 6. Invariant Enforcement

### 6.1 Invariants vs. Rules

Policies define what actions are allowed. Invariants define what *system states* must be maintained. The distinction is critical:

- A **policy** says: "deny `git.force-push`"
- An **invariant** says: "the protected branch must not receive direct pushes, regardless of which action is used"

Invariants are checked on every action evaluation, not just at boundaries. They operate on the `SystemState` --- a structured representation of the current system context:

```typescript
interface SystemState {
  modifiedFiles?: string[];
  targetBranch?: string;
  directPush?: boolean;
  forcePush?: boolean;
  isPush?: boolean;
  testsPass?: boolean;
  filesAffected?: number;
  blastRadiusLimit?: number;
  protectedBranches?: string[];
}
```

### 6.2 Default System Invariants

The reference implementation ships with 20 default invariants spanning six categories: secret protection, branch safety, blast radius control, supply chain integrity, governance self-protection, and environmental enforcement.

**Core safety invariants:**

| ID | Name | Severity | Condition |
|----|------|----------|-----------|
| `no-secret-exposure` | No Secret Exposure | 5 (critical) | No modified files match `.env`, `credentials`, `.pem`, `.key`, `secret`, `token` |
| `protected-branch` | Protected Branch Safety | 4 (high) | No direct push to `main` or `master` |
| `blast-radius-limit` | Blast Radius Limit | 3 (medium) | At most 20 files modified per operation |
| `test-before-push` | Tests Before Push | 3 (medium) | Tests must pass before any push |
| `no-force-push` | No Force Push | 4 (high) | Force push is forbidden |
| `lockfile-integrity` | Lockfile Integrity | 2 (low) | Lockfile must update when manifest changes |

**Agent containment invariants:**

| ID | Severity | Condition |
|----|----------|-----------|
| `no-skill-modification` | 5 (critical) | Agent cannot modify its own skill definitions |
| `no-scheduled-task-modification` | 5 (critical) | Agent cannot modify scheduled task configurations |
| `no-credential-file-creation` | 4 (high) | Agent cannot create credential or key files |
| `no-governance-self-modification` | 5 (critical) | Agent cannot modify governance policy or invariant source |
| `no-permission-escalation` | 4 (high) | Agent cannot escalate its own permissions |

**Supply chain and infrastructure invariants:**

| ID | Severity | Condition |
|----|----------|-----------|
| `no-package-script-injection` | 4 (high) | No injection of scripts into package.json |
| `no-cicd-config-modification` | 3 (medium) | CI/CD configuration files are protected |
| `no-container-config-modification` | 3 (medium) | Container configuration files are protected |
| `no-env-var-modification` | 3 (medium) | Environment variable files are protected |
| `no-destructive-migration` | 4 (high) | Database migrations cannot contain destructive operations |

**Operational safety invariants:**

| ID | Severity | Condition |
|----|----------|-----------|
| `recursive-operation-guard` | 3 (medium) | Detects recursive or self-referential operations |
| `large-file-write` | 2 (low) | Flags writes exceeding size thresholds |
| `transitive-effect-analysis` | 2 (low) | Analyzes cascading effects of file modifications |
| `no-network-egress` | 3 (medium) | Blocks unauthorized outbound network requests |

> *Implementation: `packages/invariants/src/definitions.ts` --- `DEFAULT_INVARIANTS` array (20 invariants).*

### 6.3 Severity-Based Intervention

Each invariant has a severity level (1-5). When invariants are violated, the maximum severity across all violations determines the intervention:

| Severity | Intervention | Behavior |
|----------|-------------|----------|
| >= 5 | `DENY` | Action is blocked immediately |
| >= 4 | `PAUSE` | Action is escalated; a `PauseHandler` callback is invoked for human-in-the-loop approval. If no handler is provided or the handler times out, the action is auto-denied. If approved, execution proceeds normally. |
| >= 3 | `ROLLBACK` | Action executes under a snapshot safety net. A `SnapshotProvider` captures pre-execution state. If execution fails or post-execution invariant checks fail, the snapshot is restored. If no provider is configured, execution proceeds without rollback capability (best-effort). |
| < 3 | `TEST_ONLY` | Action is allowed but flagged for testing |

Policy rules may also specify an explicit `intervention` field that overrides the severity-based default (e.g., a rule with severity 5 can specify `intervention: pause` to require human review instead of immediate denial). The `MODIFY` intervention type is also supported: a `ModifyHandler` callback rewrites the action, which is then re-evaluated through the full policy/invariant pipeline before execution.

> *Implementation: `packages/kernel/src/decision.ts` --- `selectIntervention()` function; `packages/kernel/src/kernel.ts` --- `PauseHandler`, `SnapshotProvider`, `ModifyHandler` interfaces.*

### 6.4 Invariant Checking Pipeline

The `checkAllInvariants()` function iterates through all registered invariants and evaluates each against the current `SystemState`. For each violation, it:

1. Records the invariant check result (expected vs. actual state)
2. Emits an `INVARIANT_VIOLATION` canonical event with full metadata (invariant name, severity, description)
3. Adds the violation to the evidence pack

> *Implementation: `packages/invariants/src/checker.ts` --- `checkAllInvariants()` function.*
> *See diagram: `paper/diagrams/invariant-enforcement.md`*

---

## 7. Observability: Evidence, Escalation, and Audit

### 7.1 Evidence Packs

Every denied action produces an **evidence pack** --- a structured audit record that captures the complete decision context:

```typescript
interface EvidencePack {
  packId: string;              // Deterministic hash of timestamp + intent
  timestamp: number;           // When the decision was made
  intent: NormalizedIntent;    // What the agent tried to do
  decision: EvalResult;        // Policy evaluation result
  violations: Array<{         // Invariant violations
    invariantId: string;
    name: string;
    severity: number;
    expected: string;
    actual: string;
  }>;
  events: string[];           // IDs of related canonical events
  summary: string;            // Human-readable summary
  severity: number;           // Maximum severity across all violations
}
```

Evidence packs serve three purposes:

1. **Audit**: A complete record of why an action was denied, sufficient for post-hoc review.
2. **Debugging**: Developers can inspect the evidence pack to understand what policy or invariant was triggered.
3. **Compliance**: Evidence packs provide the structured documentation needed for governance auditing.

> *Implementation: `packages/kernel/src/evidence.ts` --- `createEvidencePack()` function.*

### 7.2 Escalation Monitor

The runtime monitor tracks denial and violation patterns over time, implementing a **closed-loop escalation system**:

| Level | Name | Trigger | Behavior |
|-------|------|---------|----------|
| 0 | `NORMAL` | Default | Standard evaluation |
| 1 | `ELEVATED` | Denials >= threshold/2 | Increased logging |
| 2 | `HIGH` | Denials >= threshold OR violations >= threshold | Alert generation |
| 3 | `LOCKDOWN` | Denials >= 2x threshold OR violations >= 2x threshold | All actions auto-denied; human intervention required |

The escalation model prevents persistent agents from gradually overwhelming the governance system through repeated attempts. Once in `LOCKDOWN`, no actions are processed until a human explicitly calls `resetEscalation()`.

The monitor tracks statistics per-agent and per-invariant, enabling targeted analysis of which agents are most frequently denied and which invariants are most frequently violated.

> *Implementation: `packages/kernel/src/monitor.ts` --- `createMonitor()` function with 4-level escalation.*
> *See diagram: `paper/diagrams/escalation-model.md`*

### 7.3 Canonical Event Model

All system activity is captured as immutable canonical events. The event model defines 49 event kinds across 10 categories:

- **Governance** (6): `POLICY_DENIED`, `UNAUTHORIZED_ACTION`, `INVARIANT_VIOLATION`, `BLAST_RADIUS_EXCEEDED`, `MERGE_GUARD_FAILURE`, `EVIDENCE_PACK_GENERATED`
- **Reference Monitor** (6): `ACTION_REQUESTED`, `ACTION_ALLOWED`, `ACTION_DENIED`, `ACTION_ESCALATED`, `ACTION_EXECUTED`, `ACTION_FAILED`
- **Decision & Simulation** (2): `DECISION_RECORDED`, `SIMULATION_COMPLETED`
- **Policy Composition** (2): `POLICY_COMPOSED`, `POLICY_TRACE_RECORDED`
- **Pipeline** (6): `PIPELINE_STARTED`, `STAGE_COMPLETED`, `STAGE_FAILED`, `PIPELINE_COMPLETED`, `PIPELINE_FAILED`, `FILE_SCOPE_VIOLATION`
- **Session** (4): `RUN_STARTED`, `RUN_ENDED`, `CHECKPOINT_REACHED`, `STATE_CHANGED`
- **Developer Signals** (7): `FILE_SAVED`, `TEST_COMPLETED`, `BUILD_COMPLETED`, `COMMIT_CREATED`, `CODE_REVIEWED`, `DEPLOY_COMPLETED`, `LINT_COMPLETED`
- **Agent Liveness** (3): `HEARTBEAT_EMITTED`, `HEARTBEAT_MISSED`, `AGENT_UNRESPONSIVE`
- **Ingestion** (4): `ERROR_OBSERVED`, `BUG_CLASSIFIED`, `ACTIVITY_RECORDED`, `EVOLUTION_TRIGGERED`
- **Battle Lifecycle** (9): `ENCOUNTER_STARTED`, `MOVE_USED`, `DAMAGE_DEALT`, `HEALING_APPLIED`, `PASSIVE_ACTIVATED`, `BUGMON_FAINTED`, `CACHE_ATTEMPTED`, `CACHE_SUCCESS`, `BATTLE_ENDED`

Events are immutable, fingerprinted for deduplication, and stored in an append-only event store that supports query, replay, and filtering.

> *Implementation: `packages/events/src/schema.ts` --- event kind definitions and `createEvent()` factory.*

---

## 8. Reference Implementation: AgentGuard

### 8.1 Architecture

AgentGuard is a TypeScript implementation of the execution governance architecture. It compiles to both Node.js (CLI) and browser (game mode) targets. The governance engine is pure domain logic with zero runtime dependencies.

### 8.2 Component Mapping

| Paper Concept | Source File | Key Export |
|---|---|---|
| Canonical Action Representation | `packages/core/src/actions.ts` | `ACTION_TYPES` (23 types), `createAction()`, `validateAction()` |
| Intent Normalization | `packages/kernel/src/aab.ts` | `normalizeIntent()`, `detectGitAction()`, `isDestructiveCommand()` |
| Action Authorization Boundary | `packages/kernel/src/aab.ts` | `authorize()`, `DESTRUCTIVE_PATTERNS` |
| RTA Decision Engine | `packages/kernel/src/decision.ts` | `createEngine()`, `evaluate()`, `INTERVENTION` |
| Policy Evaluation | `packages/policy/src/evaluator.ts` | `evaluate()`, `matchAction()`, `matchScope()` |
| Policy Loading & Validation | `packages/policy/src/loader.ts` | `loadPolicies()`, `validatePolicy()` |
| System Invariants | `packages/invariants/src/definitions.ts` | `DEFAULT_INVARIANTS` (20 invariants) |
| Invariant Checking | `packages/invariants/src/checker.ts` | `checkAllInvariants()`, `buildSystemState()` |
| Evidence Packs | `packages/kernel/src/evidence.ts` | `createEvidencePack()`, `ExplainableEvidencePack` |
| Escalation Monitor | `packages/kernel/src/monitor.ts` | `createMonitor()`, `ESCALATION` (4 levels) |
| Canonical Events | `packages/events/src/schema.ts` | 49 event kinds, `createEvent()`, `validateEvent()` |
| Blast Radius Engine | `packages/kernel/src/blast-radius.ts` | Weighted blast radius computation |
| Governed Action Kernel | `packages/kernel/src/kernel.ts` | `propose()`, lifecycle orchestration |
| Impact Simulation | `packages/kernel/src/simulation/` | Pre-execution impact simulation (filesystem, git, package) |
| Storage Backend | `packages/storage/src/` | SQLite event/decision persistence |

### 8.3 Code Characteristics

- **Pure domain logic**: Core governance components (kernel, policy evaluator, invariant checker) have zero DOM dependencies and minimal Node.js-specific API usage.
- **Deterministic**: All evaluation functions are pure --- same input always produces same output.
- **Modular architecture**: The governance runtime spans kernel, policy, invariants, events, and adapters across `packages/` and `apps/`, with an optional SQLite storage backend.
- **Fully tested**: 105 TypeScript test files (vitest) and 14 JavaScript test files cover policy evaluation, invariant checking, evidence generation, escalation logic, storage backends, CLI commands, MCP server, plugins, renderers, and simulation.

### 8.4 Multi-Agent Pipeline

For multi-agent scenarios, AgentGuard enforces governance through the kernel pipeline with stage-based event tracking. Pipeline lifecycle events (`PipelineStarted`, `StageCompleted`, `StageFailed`, `PipelineCompleted`, `PipelineFailed`) and file scope violations (`FileScopeViolation`) are emitted through the canonical event model.

The governance kernel enforces authorization at each stage:

| Governance Layer | Enforcement Mechanism | Key Component |
|-------|----------------|-----------------|
| Action Authorization | AAB normalization + policy rules | `packages/kernel/src/aab.ts` |
| File Scope | `FileScopeViolation` events + invariant checks | `packages/invariants/src/checker.ts` |
| Blast Radius | Weighted impact computation | `packages/kernel/src/blast-radius.ts` |
| Escalation | State machine (NORMAL → LOCKDOWN) | `packages/kernel/src/monitor.ts` |
| Impact Simulation | Pre-execution prediction | `packages/kernel/src/simulation/` |

The file scope enforcement prevents agents from modifying files outside their declared scope --- a common vector for unintended changes in multi-agent systems.

> *Implementation: `packages/kernel/src/kernel.ts` --- `propose()` with policy evaluation, invariant checks, and simulation.*

---

## 9. Evaluation

We evaluate the architecture against four scenarios that exercise the governance pipeline end-to-end. Each scenario demonstrates a different aspect of the system: destructive command detection, policy enforcement, invariant checking, and escalation progression.

> *Detailed walkthroughs: `paper/scenarios/`*
> *Runnable examples: `examples/governance/`*

### 9.1 Scenario: Destructive Command

**Input**: Agent executes `rm -rf /` via the Bash tool.

**Result**: The AAB's `isDestructiveCommand()` matches the `rm -rf` pattern. The intent is normalized with `destructive: true`. The action is immediately denied with severity 5 (`DENY` intervention). An `UNAUTHORIZED_ACTION` event is emitted with full context. An evidence pack is generated.

**Key property demonstrated**: Pattern-based detection of destructive commands bypasses policy evaluation entirely. Severity 5 = immediate denial, no appeal.

### 9.2 Scenario: Policy Violation

**Input**: Agent executes `git push --force origin main`.

**Result**: `detectGitAction()` identifies this as `git.force-push` targeting branch `main`. The policy deny rule for `git.force-push` fires. Additionally, the `no-force-push` invariant (severity 4) and `protected-branch` invariant (severity 4) both fire. Three events are emitted: `POLICY_DENIED`, `INVARIANT_VIOLATION` (no-force-push), `INVARIANT_VIOLATION` (protected-branch). Intervention: `PAUSE`. Evidence pack contains all three violations.

**Key property demonstrated**: Multiple governance layers (policy + invariants) can fire simultaneously for the same action, producing a comprehensive violation report.

### 9.3 Scenario: Invariant Failure (Blast Radius)

**Input**: Agent modifies 25 files in a single operation.

**Result**: The `blast-radius-limit` invariant (severity 3, default limit: 20) fires. An `INVARIANT_VIOLATION` event is emitted with `expected: "At most 20 files modified"`, `actual: "25 files modified"`. Additionally, a `BLAST_RADIUS_EXCEEDED` event is emitted. Intervention: `ROLLBACK`.

**Key property demonstrated**: Invariants enforce state constraints that are independent of the specific action type. The blast radius limit fires regardless of whether the files were modified via `file.write`, `git.merge`, or any other action.

### 9.4 Scenario: Escalation Progression

**Input**: A sequence of 10 policy-violating actions by the same agent.

**Result**: The monitor tracks denial counts and violation counts. With default thresholds (denialThreshold: 5, violationThreshold: 3):

| Action # | Denials | Escalation Level |
|----------|---------|-----------------|
| 1-2 | 1-2 | NORMAL (0) |
| 3 | 3 | ELEVATED (1) --- denials >= threshold/2 |
| 5 | 5 | HIGH (2) --- denials >= threshold |
| 10 | 10 | LOCKDOWN (3) --- denials >= 2x threshold |

Once in LOCKDOWN, all subsequent actions are auto-denied with reason "Session in LOCKDOWN --- human intervention required". The agent cannot proceed until `resetEscalation()` is called by a human operator.

**Key property demonstrated**: The escalation model prevents persistent agents from gradually overwhelming governance through repeated attempts.

---

## 10. Future Work

Several extensions of this architecture merit investigation:

1. **Automated policy synthesis**: Analyzing repository history to automatically generate policy rules based on observed safe/unsafe patterns.

2. **Invariant learning**: Using historical event streams to discover implicit invariants that the development team maintains but has not explicitly declared.

3. **Formal verification of invariant sets**: Proving that a set of invariants is consistent (no contradictions) and complete (covers all critical state transitions).

4. **Agent debugging replay**: Using the canonical event stream to replay agent sessions, enabling post-hoc analysis of agent decision-making and governance interactions.

5. **Distributed agent governance**: Extending the architecture to multi-agent systems where agents operate across different repositories, services, and infrastructure boundaries.

6. **Enterprise control planes**: Building organization-level governance dashboards that aggregate evidence packs and escalation events across teams and projects.

7. **Regulatory compliance mapping**: Mapping evidence packs and audit trails to specific regulatory requirements (SOC 2, ISO 27001, GDPR data processing).

8. **Non-coding agent domains**: Applying the CAR/AAB/invariant model to agents operating in non-software domains: financial transactions, medical record access, infrastructure management.

---

## References

See `paper/references/bibliography.md` for the full bibliography.

Key references:

- Anderson, J. P. (1972). *Computer Security Technology Planning Study*. ESD-TR-73-51.
- Dennis, J. B., & Van Horn, E. C. (1966). Programming semantics for multiprogrammed computations. *Communications of the ACM*, 9(3), 143--155.
- Vernon, V. (2013). *Implementing Domain-Driven Design*. Addison-Wesley.
- Young, G. (2010). CQRS Documents.

---

## Appendix A: Repository Structure

```
agent-guard/
  packages/
    core/src/                       # @red-codes/core — Shared utilities
      actions.ts                    # 23 canonical action types across 8 classes
      types.ts                      # Shared TypeScript type definitions
      governance-data.ts            # Governance data loader (typed access to shared JSON data)
      data/                         # JSON governance data (actions, blast-radius, patterns)
      hash.ts                       # Content hashing utilities
      rtk.ts                        # RTK token optimization integration
      adapters.ts                   # Adapter registry interface
      rng.ts                        # Seeded random number generator
      trust-store.ts                # Trust store for policy and hook verification
      persona.ts                    # Agent persona definitions
      execution-log/                # Execution audit log (bridge, event-log, projections, schema)
    events/src/                     # @red-codes/events — Canonical event model
      schema.ts                     # 46 event kinds, factory, validation
      bus.ts                        # Typed EventBus
      store.ts                      # In-memory event store
      session-context.ts            # Session context tracking
    policy/src/                     # @red-codes/policy — Policy system
      evaluator.ts                  # Rule matching engine
      loader.ts                     # Policy validation + loading
      composer.ts                   # Policy composition (multi-file merging)
      pack-loader.ts                # Policy pack loader (community policy sets)
      yaml-loader.ts                # YAML policy parser
      policy-trust.ts               # Policy trust verification
    invariants/src/                 # @red-codes/invariants — Invariant system
      definitions.ts                # 21 built-in invariant definitions
      checker.ts                    # Invariant evaluation engine
    kernel/src/                     # @red-codes/kernel — Governed action kernel
      kernel.ts                     # Orchestrator (propose → evaluate → execute → emit)
      aab.ts                        # Action Authorization Boundary (normalization)
      decision.ts                   # Runtime assurance engine (RTA)
      monitor.ts                    # Escalation state machine
      evidence.ts                   # Evidence pack generation
      blast-radius.ts               # Weighted blast radius computation
      contract.ts                   # Kernel contract definitions
      heartbeat.ts                  # Agent heartbeat monitor
      intent.ts                     # Intent tracking
      enforcement-audit.ts          # Enforcement audit trail
      replay-comparator.ts          # Replay outcome comparison
      replay-engine.ts              # Deterministic replay engine
      replay-processor.ts           # Replay event processor
      decisions/                    # Typed decision records (factory, types)
      simulation/                   # Pre-execution impact simulation
        filesystem-simulator.ts     # File system impact simulation
        git-simulator.ts            # Git operation simulation
        package-simulator.ts        # Package change simulation
        plan-simulator.ts           # Plan simulation
        dependency-graph-simulator.ts # Dependency graph simulation
        forecast.ts                 # Impact forecast builder
        registry.ts                 # Simulator registry
    adapters/src/                   # @red-codes/adapters — Execution adapters
      registry.ts                   # Adapter registry (action class → handler)
      file.ts                       # File action handler
      shell.ts                      # Shell action handler
      git.ts                        # Git action handler
      claude-code.ts                # Claude Code hook adapter
      copilot-cli.ts                # Copilot CLI adapter
      hook-integrity.ts             # Hook integrity verification
    storage/src/                    # @red-codes/storage — SQLite backend (opt-in)
      sqlite-store.ts               # SQLite event store implementation
      sqlite-sink.ts                # SQLite event/decision sink
      sqlite-session.ts             # SQLite session lifecycle
      migrations.ts                 # Schema migrations (version-based)
      adoption-analytics.ts         # Adoption analytics engine
      denial-learner.ts             # Denial pattern learning
      factory.ts                    # Storage bundle factory
    plugins/src/                    # @red-codes/plugins — Plugin ecosystem
      discovery.ts                  # Plugin discovery mechanism
      registry.ts                   # Plugin registry
      sandbox.ts                    # Plugin sandboxing
      simulator-loader.ts           # Simulator plugin loader
      validator.ts                  # Plugin validation
    renderers/src/                  # @red-codes/renderers — Renderer plugin system
      registry.ts                   # Renderer registry
      tui-renderer.ts               # TUI renderer implementation
      tui-formatters.ts             # TUI formatting helpers
    swarm/src/                      # @red-codes/swarm — Agent swarm templates
      config.ts                     # Swarm configuration
      manifest.ts                   # Swarm manifest parsing
      scaffolder.ts                 # Swarm scaffolding
    telemetry/src/                  # @red-codes/telemetry — Runtime telemetry and logging
      cloud-sink.ts                 # Cloud telemetry sink
      event-mapper.ts               # Event mapping
      agent-event-queue.ts          # Agent event queue
      agent-event-sender.ts         # Agent event sender
      tracer.ts                     # Distributed tracing
    telemetry-client/src/           # @red-codes/telemetry-client — Telemetry client
      client.ts                     # Telemetry client
      identity.ts                   # Identity management
      signing.ts                    # Payload signing
      queue.ts                      # Queue abstraction
      sender.ts                     # Telemetry sender
    invariant-data-protection/src/  # @red-codes/invariant-data-protection — Data protection plugin
      invariants.ts                 # Data protection invariant definitions
      patterns.ts                   # Data protection patterns
  apps/
    cli/src/                        # @red-codes/agentguard — CLI (published npm package)
      bin.ts                        # CLI entry point
      tui.ts                        # TUI renderer (terminal action stream)
      commands/                     # 30+ CLI commands (guard, inspect, replay, simulate, ...)
    mcp-server/src/                 # @red-codes/mcp-server — MCP governance server
      server.ts                     # MCP server implementation
      tools/                        # Governance MCP tools (governance, policy, monitoring, analytics)
      backends/                     # Storage backends (local, remote)
    vscode-extension/src/           # agentguard-vscode — VS Code extension
      extension.ts                  # Extension entry point
      providers/                    # Tree data providers (run status, history, events)
      services/                     # Event reader, notifications, diagnostics, violation mapper
  tests/                            # JS test files (custom zero-dependency harness)
  policy/                           # Policy configuration (JSON)
  policies/                         # Policy packs (YAML: ci-safe, enterprise, hipaa, soc2, ...)
  templates/                        # Policy templates (ci-only, development, permissive, strict)
  paper/                            # This research artifact
  examples/                         # Example governance scenarios
  docs/                             # System documentation (architecture, event model, specs)
  scripts/                          # Build and utility scripts
```
