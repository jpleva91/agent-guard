# Multi-Agent Engineering Pipeline

## Overview

The multi-agent pipeline provides structured orchestration for AI coding agents. Instead of multiple agents modifying code in parallel (which causes write conflicts, duplicated logic, and architectural drift), agents operate in defined phases with validation gates between each stage.

The pipeline follows the pattern:

```
spec → implementation → verification → optimization → review
```

Each stage acts as an Action Authorization Boundary (AAB), enforcing that agents stay within their role's permissions and the architect's declared file scope.

## Architecture

### Pipeline as Governance

The pipeline is a human-scale implementation of the AAB framework:

```
agent reasoning
↓
stage validation (input/output contracts)
↓
execution (role-scoped)
↓
gate check (output + file scope + invariants)
↓
next stage
```

Each stage produces canonical events (`PipelineStarted`, `StageCompleted`, `StageFailed`, etc.) that flow into the BugMon event model. Pipeline failures become gameplay encounters.

### Integration with BugMon

```
agent proposes action
↓
AAB validates action
↓
execution occurs
↓
BugMon records telemetry
↓
agents analyze outcomes
```

## Agent Roles

Five roles with strict permission boundaries:

| Role | Phase | Modify Files | Run Tests | Refactor |
|------|-------|-------------|-----------|----------|
| Architect | 0 | No | No | No |
| Builder | 1 | Yes | No | No |
| Tester | 2 | Yes | Yes | No |
| Optimizer | 3 | Yes | Yes | Yes |
| Auditor | 4 | No | Yes | No |

### 1. Architect Agent

Interprets specifications and produces an implementation plan. Defines which files may be modified and what invariants must hold. Cannot modify code directly.

**Output contract:**
```json
{
  "files": ["domain/pipeline/roles.js"],
  "constraints": ["no circular dependencies", "pure functions only"]
}
```

### 2. Builder Agent

Writes code following the architecture plan. May only modify files declared by the architect. Cannot run tests or refactor existing code.

**Constraint:** File scope enforcement prevents unauthorized modifications.

### 3. Tester Agent

Generates tests, identifies coverage gaps, and runs test scenarios. Reports missing coverage back to the pipeline for the builder to address.

**Output contract:**
```json
{
  "testResults": { "passed": 12, "failed": 0 },
  "gaps": ["missing edge case for empty input"]
}
```

### 4. Optimizer Agent

Refactors for clarity and performance. Must not change public interfaces or observable behavior. Has the broadest permissions but operates late in the pipeline when behavior is already verified by tests.

### 5. Auditor Agent

Final safety layer. Reviews architecture boundaries, enforces invariants, detects anti-patterns. Cannot modify files — can only report violations that block the pipeline.

**Output contract:**
```json
{
  "auditResult": "fail",
  "violations": ["game module imports filesystem API"]
}
```

## Pipeline Stages

Stages execute sequentially. Each stage validates inputs (from prior stages) and outputs (from the handler) before proceeding.

```
plan → build → test → optimize → audit
```

### Validation Gates

1. **Role Authorization** — Only the designated role can execute a stage
2. **Input Validation** — Required data from prior stages must exist in context
3. **Output Validation** — Stage must produce its required outputs
4. **File Scope Enforcement** — Build stage enforces architect's file list

If any gate fails, the pipeline halts and emits a `StageFailed` event.

## Canonical Events

The pipeline emits six event types into the domain event model:

| Event | Required Fields | Description |
|-------|----------------|-------------|
| `PipelineStarted` | runId, task | Pipeline run initiated |
| `StageCompleted` | runId, stageId, status | Stage passed validation |
| `StageFailed` | runId, stageId, errors | Stage failed a gate |
| `PipelineCompleted` | runId, result | All stages passed |
| `PipelineFailed` | runId, failedStage, errors | Pipeline halted on failure |
| `FileScopeViolation` | runId, files | Builder touched unauthorized files |

## Parallelism Strategy

Parallel agents should operate on **independent worktrees**, not on the same codebase:

```
worktree-feature-A  →  full pipeline  →  PR
worktree-feature-B  →  full pipeline  →  PR
worktree-feature-C  →  full pipeline  →  PR
```

Each worktree runs the complete 5-stage pipeline independently. This is N-version programming — humans choose the best result.

## Usage

```js
import { runPipeline } from './domain/pipeline/index.js';

const handlers = {
  plan: (ctx) => ({
    files: ['src/feature.js'],
    constraints: ['no side effects'],
  }),
  build: (ctx) => ({
    changes: { 'src/feature.js': '// implementation' },
  }),
  test: (ctx) => ({
    testResults: { passed: 3, failed: 0 },
  }),
  optimize: (ctx) => ({
    changes: ctx.changes,
  }),
  audit: (ctx) => ({
    auditResult: 'pass',
    violations: [],
  }),
};

const run = runPipeline('implement feature X', handlers);
// run.status === 'completed' | 'failed'
```

## Domain Layer Location

```
domain/pipeline/
├── index.js         # Public API re-exports
├── roles.js         # Agent role definitions and permission checks
├── stages.js        # Stage definitions, validation, file scope
└── orchestrator.js  # Pipeline run creation and sequential execution
```

All code is pure domain logic — no DOM, no Node.js-specific APIs, no external dependencies.

## Pre-Commit Audit Prompt

Reusable prompt for the auditor agent:

```
You are a senior software auditor.

Review the changes in this branch.

Verify:
1. No invariant violations
2. All tests pass
3. Architecture boundaries respected
4. No unnecessary dependencies introduced
5. Code complexity reduced where possible

Only report concrete issues.
Do not rewrite code unless required to fix a defect.
```
