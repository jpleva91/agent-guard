# Intent Contract

## System Purpose

AgentGuard + BugMon is a unified platform with two layers connected by a single canonical event model.

**AgentGuard** is a deterministic governance runtime for AI coding agents. It evaluates agent actions against declared policies and invariants, producing canonical events when violations occur.

**BugMon** is a roguelike developer telemetry game. It consumes canonical events (developer errors, CI failures, governance violations) and renders them as interactive encounters. Coding sessions are dungeon runs. Bugs are enemies. CI failures are bosses.

## Primary Responsibilities

1. Detect software failures from stderr, test output, linter output, and runtime crashes
2. Normalize errors through a multi-stage ingestion pipeline (parse, fingerprint, classify, map)
3. Emit structured canonical events via the domain EventBus
4. Map events to BugMon creature encounters with rarity-weighted selection
5. Run turn-based battles with a deterministic combat engine
6. Track progression through a Bug Grimoire (defeated enemy compendium), XP, and evolution chains
7. Enforce governance policies on AI agent actions (AgentGuard layer)
8. Produce audit evidence packs for governance violations

## Scope Boundaries

Agents must not:

- Introduce features that violate the roguelike metaphor (coding = dungeon runs, bugs = enemies)
- Add external runtime dependencies (the system is zero-dependency at runtime)
- Blur the separation between governance producer (AgentGuard) and event consumer (BugMon)
- Add server-side components — the browser game is 100% client-side
- Replace synthesized audio with audio files
- Break the single canonical event schema that connects all systems
