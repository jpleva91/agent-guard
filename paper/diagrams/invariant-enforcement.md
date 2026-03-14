# Invariant Enforcement Diagram

## System Invariants and Checking Flow

```mermaid
flowchart TD
    subgraph state["SystemState (built from context)"]
        S1["modifiedFiles: string[]"]
        S2["targetBranch: string"]
        S3["directPush: boolean"]
        S4["forcePush: boolean"]
        S5["isPush: boolean"]
        S6["testsPass: boolean"]
        S7["filesAffected: number"]
        S8["blastRadiusLimit: number"]
        S9["protectedBranches: string[]"]
    end

    subgraph check["checkAllInvariants()"]
        I1["no-secret-exposure (sev 5)<br/>modifiedFiles ∩ sensitive patterns = ∅"]
        I2["protected-branch (sev 4)<br/>¬(directPush ∧ targetBranch ∈ protected)"]
        I3["blast-radius-limit (sev 3)<br/>filesAffected ≤ blastRadiusLimit"]
        I4["test-before-push (sev 3)<br/>isPush → testsPass"]
        I5["no-force-push (sev 4)<br/>¬forcePush"]
        I6["lockfile-integrity (sev 2)<br/>manifestChanged → lockfileChanged"]
    end

    subgraph output["Output"]
        V["violations[]"]
        E["INVARIANT_VIOLATION events"]
        AH["allHold: boolean"]
    end

    state --> check
    I1 -->|violated| V
    I2 -->|violated| V
    I3 -->|violated| V
    I4 -->|violated| V
    I5 -->|violated| V
    I6 -->|violated| V
    V --> E
    V --> AH

    style I1 fill:#c0392b,color:#fff
    style I2 fill:#e67e22,color:#fff
    style I3 fill:#f39c12,color:#000
    style I4 fill:#f39c12,color:#000
    style I5 fill:#e67e22,color:#fff
    style I6 fill:#2ecc71,color:#000
```

## ASCII Representation

```
SYSTEM STATE ────────────────────────────────────
┌───────────────────────────────────────────────┐
│  buildSystemState(context)                    │
│                                               │
│  modifiedFiles:     ["src/auth.ts", ".env"]   │
│  targetBranch:      "main"                    │
│  directPush:        true                      │
│  forcePush:         true                      │
│  isPush:            true                      │
│  testsPass:         undefined                 │
│  filesAffected:     2                         │
│  blastRadiusLimit:  20 (default)              │
│  protectedBranches: ["main", "master"]        │
└───────────────────────┬───────────────────────┘
                        │
                        ▼
checkAllInvariants(DEFAULT_INVARIANTS, state)
┌───────────────────────────────────────────────┐
│                                               │
│  ┌─ no-secret-exposure ──────── severity 5 ─┐ │
│  │ Check: modifiedFiles vs sensitive patterns│ │
│  │ .env, credentials, .pem, .key, secret     │ │
│  │ Result: ✗ VIOLATED (.env detected)        │ │
│  │ → INVARIANT_VIOLATION event               │ │
│  └───────────────────────────────────────────┘ │
│                                               │
│  ┌─ protected-branch ───────── severity 4 ──┐ │
│  │ Check: directPush ∧ branch ∈ protected?  │ │
│  │ Result: ✗ VIOLATED (direct push to main)  │ │
│  │ → INVARIANT_VIOLATION event               │ │
│  └───────────────────────────────────────────┘ │
│                                               │
│  ┌─ blast-radius-limit ─────── severity 3 ──┐ │
│  │ Check: filesAffected ≤ 20?               │ │
│  │ Result: ✓ HOLDS (2 ≤ 20)                 │ │
│  └───────────────────────────────────────────┘ │
│                                               │
│  ┌─ test-before-push ──────── severity 3 ───┐ │
│  │ Check: isPush → testsPass?                │ │
│  │ Result: ✗ VIOLATED (tests not verified)   │ │
│  │ → INVARIANT_VIOLATION event               │ │
│  └───────────────────────────────────────────┘ │
│                                               │
│  ┌─ no-force-push ─────────── severity 4 ───┐ │
│  │ Check: ¬forcePush?                        │ │
│  │ Result: ✗ VIOLATED (force push detected)  │ │
│  │ → INVARIANT_VIOLATION event               │ │
│  └───────────────────────────────────────────┘ │
│                                               │
│  ┌─ lockfile-integrity ────── severity 2 ───┐ │
│  │ Check: manifestChanged → lockfileChanged? │ │
│  │ Result: ✓ HOLDS (no manifest changes)     │ │
│  └───────────────────────────────────────────┘ │
│                                               │
└───────────────────────┬───────────────────────┘
                        │
                        ▼
OUTPUT ──────────────────────────────────────────
┌───────────────────────────────────────────────┐
│  violations: [                                │
│    { invariant: no-secret-exposure, sev: 5 }, │
│    { invariant: protected-branch,   sev: 4 }, │
│    { invariant: test-before-push,   sev: 3 }, │
│    { invariant: no-force-push,      sev: 4 }  │
│  ]                                            │
│  events: [4 INVARIANT_VIOLATION events]       │
│  allHold: false                               │
│  maxSeverity: 5 → intervention: DENY          │
└───────────────────────────────────────────────┘
```

## Source References

- `SystemState`: `src/invariants/definitions.ts`
- `DEFAULT_INVARIANTS`: `src/invariants/definitions.ts`
- `buildSystemState()`: `src/invariants/checker.ts`
- `checkAllInvariants()`: `src/invariants/checker.ts`
- `selectIntervention()`: `src/kernel/decision.ts`
