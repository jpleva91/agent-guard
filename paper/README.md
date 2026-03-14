# Research Artifact: AgentGuard White Paper

This directory contains the research artifact for the AgentGuard project.

AgentGuard is positioned as a **reference implementation** for deterministic agent governance, following the pattern of established systems research (Kubernetes/Borg, MapReduce/Hadoop, OPA/policy research).

## Structure

```
paper/
  agentguard-whitepaper.md           # Main white paper (10 sections)
  diagrams/                          # Architecture and flow diagrams (Mermaid)
  scenarios/                         # Evaluation walkthroughs (4 scenarios)
  references/                        # Bibliography and citations
```

## Reference Implementation

The governance runtime lives in the main codebase:

| Component | Source |
|-----------|--------|
| Action Authorization Boundary | `src/kernel/aab.ts` |
| RTA Decision Engine | `src/kernel/decision.ts` |
| Policy Evaluation | `src/policy/evaluator.ts` |
| System Invariants | `src/invariants/definitions.ts` |
| Evidence Packs | `src/kernel/evidence.ts` |
| Escalation Monitor | `src/kernel/monitor.ts` |
| Canonical Actions | `src/core/actions.ts` |
| Canonical Events | `src/events/schema.ts` |
| Governed Action Kernel | `src/kernel/kernel.ts` |
| Storage Backends | `src/storage/` |

Runnable examples that demonstrate each scenario: `examples/governance/`

## Relationship to Existing Documentation

The existing `docs/agent-sdlc-architecture.md` is a proto-paper that provides the architectural foundation. This white paper formalizes that work into a structured research contribution with evaluation scenarios and a concrete mapping to the reference implementation.
