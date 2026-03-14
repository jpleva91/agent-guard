# System Architecture Diagram

## Four-Layer Execution Governance Model

```mermaid
flowchart TD
    subgraph reasoning["Agent Reasoning Layer"]
        LLM["LLM Planning & Code Generation"]
        TC["Tool Call Selection"]
        LLM --> TC
    end

    subgraph compilation["Intent Compilation"]
        NI["normalizeIntent()"]
        TAM["TOOL_ACTION_MAP"]
        DGA["detectGitAction()"]
        IDC["isDestructiveCommand()"]
        TC --> NI
        NI --> TAM
        NI --> DGA
        NI --> IDC
    end

    subgraph aab["Action Authorization Boundary"]
        PE["Policy Evaluation<br/>evaluate()"]
        IC["Invariant Checking<br/>checkAllInvariants()"]
        SI["Intervention Selection<br/>selectIntervention()"]
        EP["Evidence Pack<br/>createEvidencePack()"]
        NI --> PE
        NI --> IC
        PE --> SI
        IC --> SI
        SI --> EP
    end

    subgraph execution["Execution Adapters"]
        FS["Filesystem"]
        SH["Shell"]
        GT["Git"]
        CI["CI/CD"]
    end

    subgraph telemetry["Runtime Telemetry"]
        EB["EventBus"]
        ES["EventStore"]
        MN["Monitor (Escalation)"]
    end

    SI -->|allowed| execution
    SI -->|denied| EP
    EP --> EB
    EB --> ES
    EB --> MN

    style reasoning fill:#1a1a2e,color:#e0e0e0
    style compilation fill:#16213e,color:#e0e0e0
    style aab fill:#0f3460,color:#e0e0e0
    style execution fill:#1a1a2e,color:#e0e0e0
    style telemetry fill:#16213e,color:#e0e0e0
```

## ASCII Representation

```
┌─────────────────────────────────────────────┐
│          Agent Reasoning Layer               │
│  ┌──────────────┐  ┌─────────────────────┐  │
│  │ LLM Planning │──│ Tool Call Selection  │  │
│  └──────────────┘  └─────────┬───────────┘  │
└──────────────────────────────┼───────────────┘
                               │ raw tool call
                               ▼
┌─────────────────────────────────────────────┐
│          Intent Compilation                  │
│                                             │
│  normalizeIntent(rawAction)                 │
│    ├── TOOL_ACTION_MAP: tool → action type  │
│    ├── detectGitAction(): regex → git.*     │
│    └── isDestructiveCommand(): 11 patterns  │
│                                             │
│  Output: NormalizedIntent                   │
│    { action, target, agent, destructive }   │
└──────────────────────┬──────────────────────┘
                       │ NormalizedIntent
                       ▼
┌─────────────────────────────────────────────┐
│     Action Authorization Boundary (AAB)      │
│                                             │
│  1. evaluate(intent, policies)              │
│     ├── deny rules checked first            │
│     └── allow rules checked second          │
│                                             │
│  2. checkAllInvariants(invariants, state)    │
│     └── 6 default invariants                │
│                                             │
│  3. selectIntervention(maxSeverity)          │
│     ├── ≥5: DENY                            │
│     ├── ≥4: PAUSE                           │
│     ├── ≥3: ROLLBACK                        │
│     └── <3: TEST_ONLY                       │
│                                             │
│  4. createEvidencePack(intent, decision,     │
│     violations, events)                     │
└────────┬────────────────────────┬───────────┘
         │ allowed                │ denied
         ▼                       ▼
┌─────────────────┐  ┌───────────────────────┐
│ Execution       │  │ Runtime Telemetry      │
│ Adapters        │  │                       │
│ ├── Filesystem  │  │ EventBus → EventStore │
│ ├── Shell       │  │ Monitor (Escalation)  │
│ ├── Git         │  │ Evidence Packs        │
│ └── CI/CD       │  └───────────────────────┘
└─────────────────┘
```

## Source References

- Intent Compilation: `src/kernel/aab.ts`
- AAB Authorization: `src/kernel/aab.ts`
- Engine Evaluation: `src/kernel/decision.ts`
- Intervention Selection: `src/kernel/decision.ts`
- Evidence Packs: `src/kernel/evidence.ts`
- Monitor: `src/kernel/monitor.ts`
