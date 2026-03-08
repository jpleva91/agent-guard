# Feature Spec: Event-Driven Platform Architecture

> Phase 1 substrate: canonical event model, entity tracking, correlation, risk, and projections.

## Summary

Introduces the foundational platform layer that makes BugMon an event-driven incident and governance system. All developer signals, CI events, agent actions, and governance decisions flow through a canonical `DevEvent` envelope. Bugs and incidents become derived entities. Correlation clusters related events. Risk assessment maps signals to operational severity. Projections provide read models for dashboards, game loops, and CLI output.

This is the substrate that turns BugMon from a themed game wrapper into a real developer telemetry platform.

## Requirements

- [x] Canonical `DevEvent` envelope with source, actor, kind, repo context, fingerprint, severity, correlation IDs
- [x] `BugEntity` tracking individual bugs derived from error events
- [x] `IncidentEntity` clustering related bugs into actionable incidents
- [x] Correlation engine grouping events by fingerprint, commit, branch, file, agent run, CI job
- [x] Risk model mapping signals to operational risk levels (noise → critical breach)
- [x] Projection layer providing read models: active bug queue, hotspots, flaky test index, repo health, agent trust, timeline, developer streaks, fix-to-regression ratio
- [x] Platform store tying events, entities, correlation, and risk together
- [x] Bridge from DevEvent kinds to existing DomainEvent kinds (backward compat)
- [x] Validation for all DevEvents
- [x] All modules pure domain logic (no DOM, no Node.js APIs)

## Events Produced

| Event Kind | When Emitted | Required Data |
|------------|-------------|---------------|
| `error.detected` | New error ingested | `{ source, errorType, message, severity }` |
| `error.repeated` | Known error seen again | `{ fingerprint, occurrenceCount }` |
| `error.resolved` | Bug marked resolved | `{ fingerprint, resolvedCommit? }` |
| `test.failed` | Test failure | `{ testName, suite?, file? }` |
| `test.flaky` | Flaky test detected | `{ testName, flakyCount }` |
| `build.failed` | Build failure | `{ tool?, exitCode? }` |
| `agent.action.denied` | Agent action blocked | `{ actionType, target, reason }` |
| `governance.invariant.breached` | Invariant violated | `{ invariant, expected, actual }` |
| `incident.opened` | Auto-incident created | `{ title, bugIds, correlationKeys }` |

## Events Consumed

| Event Kind | Reaction |
|------------|----------|
| `error.detected` | Create/update BugEntity, correlate, assess risk |
| `error.repeated` | Increment occurrence count, reassess risk |
| `error.resolved` | Mark bug resolved, track for regression detection |
| All kinds | Append to event log, update projections |

## Interface Contract

### domain/dev-event.ts
```ts
createDevEvent(input: DevEventInput): DevEvent
validateDevEvent(event: unknown): DevEventValidationResult
resetDevEventCounter(): void
devEventKindToDomainKind(kind: DevEventKind): string | undefined
```

### domain/entities.ts
```ts
createBugEntity(input: BugEntityInput): BugEntity
recordOccurrence(bug: BugEntity, event: DevEvent): BugEntity
resolveBug(bug: BugEntity, commit?: string): BugEntity
createIncident(bugs: BugEntity[], correlationKeys: string[]): IncidentEntity
addBugToIncident(incident: IncidentEntity, bug: BugEntity): IncidentEntity
resolveIncident(incident: IncidentEntity, rootCause?: string): IncidentEntity
```

### domain/correlation.ts
```ts
createCorrelationEngine(options?): CorrelationEngine
extractCorrelationKeys(event: DevEvent): CorrelationKey[]
correlateByFile(bugs: BugEntity[]): Map<string, BugEntity[]>
correlateByErrorType(bugs: BugEntity[]): Map<string, BugEntity[]>
correlateByBranch(bugs: BugEntity[]): Map<string, BugEntity[]>
```

### domain/risk.ts
```ts
assessRisk(event: DevEvent, context?: RiskContext): RiskAssessment
assessBugRisk(bug: BugEntity): RiskAssessment
isSensitiveFile(filePath: string): boolean
riskToGameSeverity(level: RiskLevel): number
```

### domain/projections.ts
```ts
projectActiveBugs(bugs: BugEntity[]): ActiveBugQueue
projectHotspots(bugs: BugEntity[]): HotspotLeaderboard
projectFlakyTests(events: DevEvent[]): FlakyTestIndex
projectRepoHealth(bugs: BugEntity[], events: DevEvent[]): RepoHealthScore
projectAgentTrust(events: DevEvent[]): AgentTrustScore
projectTimeline(events: DevEvent[], limit?): TimelineEntry[]
projectIncidentSummary(incidents: IncidentEntity[]): IncidentSummary
projectFixRegressionRatio(events: DevEvent[]): FixRegressionRatio
projectDeveloperStreak(events: DevEvent[]): DeveloperStreak
```

### domain/platform-store.ts
```ts
createPlatformStore(options?): PlatformStore
```

## Dependencies

| Module | Why Needed |
|--------|-----------|
| `domain/hash.ts` | Fingerprint and ID generation |
| `domain/events.ts` | Backward compat bridge to DomainEvent |

## Layer Placement

- [x] `domain/` — Pure logic, no environment dependencies

## Constraints

- All modules pure — no DOM, no Node.js APIs
- No external dependencies
- Deterministic where RNG is injected
- Backward compatible with existing DomainEvent system
- Does not modify existing modules; extends alongside them

## Verification

```bash
npm run ts:test -- --grep "platform"
npm run ts:check
npm run lint
npm run contracts:check
```

## Open Questions

None — Phase 1 is self-contained. Future phases will wire CLI commands and game UI to these projections.
