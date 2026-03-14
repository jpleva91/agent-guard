# Canonical Action Pipeline Diagram

## From Raw Tool Call to NormalizedIntent

```mermaid
flowchart LR
    subgraph input["Raw Tool Call"]
        R1["{ tool: 'Bash',<br/>command: 'git push --force origin main' }"]
    end

    subgraph step1["Step 1: Tool Mapping"]
        TM["TOOL_ACTION_MAP"]
        TM1["Write → file.write"]
        TM2["Edit → file.write"]
        TM3["Read → file.read"]
        TM4["Bash → shell.exec"]
        TM5["Glob → file.read"]
        TM6["Grep → file.read"]
    end

    subgraph step2["Step 2: Git Detection"]
        GD["detectGitAction()"]
        G1["git push --force → git.force-push"]
        G2["git push → git.push"]
        G3["git branch -d → git.branch.delete"]
        G4["git merge → git.merge"]
        G5["git commit → git.commit"]
    end

    subgraph step3["Step 3: Destructive Check"]
        DC["isDestructiveCommand()"]
        D1["rm -rf"]
        D2["chmod 777"]
        D3["dd if="]
        D4["DROP DATABASE"]
        D5["sudo rm"]
    end

    subgraph output["NormalizedIntent"]
        NI["{ action: 'git.force-push',<br/>target: 'main',<br/>branch: 'main',<br/>destructive: false }"]
    end

    R1 --> TM
    TM --> GD
    GD --> DC
    DC --> NI

    style input fill:#1a1a2e,color:#e0e0e0
    style output fill:#0f3460,color:#e0e0e0
```

## ASCII Representation

```
RAW TOOL CALL
┌───────────────────────────────────────────────┐
│ { tool: "Bash",                               │
│   command: "git push --force origin main",    │
│   agent: "claude" }                           │
└───────────────────────┬───────────────────────┘
                        │
                        ▼
STEP 1: TOOL_ACTION_MAP ─────────────────────────
┌───────────────────────────────────────────────┐
│  "Write" ──→ "file.write"                     │
│  "Edit"  ──→ "file.write"                     │
│  "Read"  ──→ "file.read"                      │
│  "Bash"  ──→ "shell.exec"  ◄── this case     │
│  "Glob"  ──→ "file.read"                      │
│  "Grep"  ──→ "file.read"                      │
│  unknown ──→ "unknown"                        │
└───────────────────────┬───────────────────────┘
                        │ action = "shell.exec"
                        ▼
STEP 2: detectGitAction() ───────────────────────
┌───────────────────────────────────────────────┐
│  /git\s+push\s+--force/  → "git.force-push"  │ ◄── match!
│  /git\s+push/            → "git.push"         │
│  /git\s+branch\s+-[dD]/  → "git.branch.delete"│
│  /git\s+merge/           → "git.merge"        │
│  /git\s+commit/          → "git.commit"       │
│  else                    → null               │
└───────────────────────┬───────────────────────┘
                        │ action = "git.force-push"
                        │ branch = "main" (via extractBranch)
                        ▼
STEP 3: isDestructiveCommand() ──────────────────
┌───────────────────────────────────────────────┐
│  /rm\s+-rf/              no match             │
│  /chmod\s+777/           no match             │
│  /dd\s+if=/              no match             │
│  /mkfs/                  no match             │
│  /sudo\s+rm/             no match             │
│  /dropdb/                no match             │
│  /DROP\s+DATABASE/i      no match             │
│  /DROP\s+TABLE/i         no match             │
│                                               │
│  Result: destructive = false                  │
└───────────────────────┬───────────────────────┘
                        │
                        ▼
NORMALIZED INTENT ───────────────────────────────
┌───────────────────────────────────────────────┐
│ {                                             │
│   action: "git.force-push",                   │
│   target: "main",                             │
│   agent: "claude",                            │
│   branch: "main",                             │
│   command: "git push --force origin main",    │
│   destructive: false                          │
│ }                                             │
└───────────────────────────────────────────────┘
```

## Source References

- `TOOL_ACTION_MAP`: `src/kernel/aab.ts`
- `detectGitAction()`: `src/kernel/aab.ts`
- `isDestructiveCommand()`: `src/kernel/aab.ts`
- `extractBranch()`: `src/kernel/aab.ts`
- `normalizeIntent()`: `src/kernel/aab.ts`
