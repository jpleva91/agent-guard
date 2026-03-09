# Architecture Specification

## Governed Action Kernel Model

```
┌─────────────────────────────────────────┐
│ kernel/  (Governance Runtime)           │
│   Kernel loop, AAB, decision engine,    │
│   monitor, evidence, simulation         │
└────────────────┬────────────────────────┘
                 │ imports ↓
┌────────────────┴────────────────────────┐
│ events/  │ policy/  │ invariants/       │
│ Schema,  │ Evaluator│ Checker,          │
│ bus,     │ loader,  │ definitions       │
│ store,   │ YAML     │                   │
│ JSONL    │ loader   │                   │
└────────────────┬────────────────────────┘
                 │ imports ↓
┌────────────────┴────────────────────────┐
│ core/  (Shared utilities)               │
│   Types, actions, hash, execution-log   │
└────────────────┬────────────────────────┘
                 │ imports ↓
┌────────────────┴────────────────────────┐
│ cli/  (Node.js CLI)                     │
│   guard, inspect, events, replay        │
└─────────────────────────────────────────┘
                 │ imports ↓
┌────────────────┴────────────────────────┐
│ adapters/  (Execution handlers)         │
│   file, shell, git, claude-code         │
└─────────────────────────────────────────┘
```

## Dependency Rules

- **kernel/** may import from events/, policy/, invariants/, adapters/, core/
- **events/** may import from core/ only
- **policy/** may import from core/ only
- **invariants/** may import from core/, events/ only
- **adapters/** may import from core/, kernel/ only
- **cli/** may import from kernel/, events/, policy/, core/
- **core/** has no project imports (leaf layer)

## Key Subsystems

### Governed Action Kernel (`kernel/kernel.ts`)

The orchestrator that connects all governance infrastructure:

```
propose(rawAction) →
  1. ACTION_REQUESTED event
  2. Monitor evaluates (AAB → policy → invariants → evidence)
  3. If denied: ACTION_DENIED + evidence pack + intervention
  4. If allowed: ACTION_ALLOWED → execute via adapter → ACTION_EXECUTED/FAILED
  5. Sink all events to JSONL
  → KernelResult { allowed, executed, decision, execution, events, runId }
```

### Action Authorization Boundary (`kernel/aab.ts`)

Normalizes raw tool calls into structured intents:
- Maps tool names to action types (Write → file.write, Bash → shell.exec)
- Detects git commands in shell (git push → git.push)
- Flags destructive commands (rm -rf, chmod 777, dd if=, DROP DATABASE)
- Computes blast radius from policy limits

### Policy Engine (`policy/`)

Declarative policy evaluation:
- JSON and YAML policy formats
- Pattern matching: exact, wildcard (`*`), prefix (`git.*`)
- Scope matching: exact, prefix, suffix (`*.env`)
- Branch conditions, file limits, test requirements
- Two-pass evaluation: deny rules first (highest severity), then allow rules, default allow

### Invariant Checker (`invariants/`)

6 default system invariants:
1. **no-secret-exposure** (sev 5) — blocks .env, credentials, .pem, .key, secret, token files
2. **protected-branch** (sev 4) — prevents direct push to main/master
3. **blast-radius-limit** (sev 3) — enforces file modification limit (default 20)
4. **test-before-push** (sev 3) — requires tests pass before push
5. **no-force-push** (sev 4) — forbids force push
6. **lockfile-integrity** (sev 2) — ensures package.json changes sync with lockfiles

### Execution Adapters (`adapters/`)

Action handlers registered by class:
- **file** — fs.readFile, fs.writeFile, fs.unlink, fs.rename
- **shell** — child_process.exec with timeout (30s default, 1MB buffer)
- **git** — git commit, push, branch, checkout, merge (validated shell wrappers)
- **claude-code** — normalizes PreToolUse/PostToolUse hook payloads

### Escalation System (`kernel/monitor.ts`)

Tracks cumulative denials and violations:
- NORMAL (0) — default state
- ELEVATED (1) — denials >= ceil(threshold/2)
- HIGH (2) — denials >= threshold OR violations >= threshold
- LOCKDOWN (3) — denials >= 2×threshold OR violations >= 2×threshold → all actions denied

### Event System (`events/schema.ts`, `events/bus.ts`)

50+ canonical event kinds. EventBus provides typed pub/sub. Event factory with auto-generated IDs and fingerprints.

## Data Flow

```
Claude Code Tool Call → Claude Code Adapter → Kernel → AAB → Policy → Invariants
                                                │                        │
                                                ├── Evidence Pack ◄──────┘
                                                │
                                                ├── Adapter (execute) → Result
                                                │
                                                ├── TUI Renderer → Terminal
                                                │
                                                └── JSONL Sink → .agentguard/events/
```
