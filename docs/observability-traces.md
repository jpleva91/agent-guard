# Observability & Action Traces — AgentGuard

This document describes the observability infrastructure: full action trace construction, real-time event streaming, OpenTelemetry integration, and enhanced TUI visualization.

## Context

AgentGuard already has: JSONL event persistence, decision records, TUI renderer, VS Code extension, analytics engine, and kernel-level tracing with pluggable backends (`src/telemetry/`). The existing `TraceSpan` type in `src/telemetry/tracepoint.ts` captures individual spans. The existing `TraceBackend` interface supports pluggable backends.

This plan builds on that foundation to provide full trace construction, real-time streaming, and industry-standard export.

## Action Trace Builder

Construct complete action traces from the span tree produced by the tracing system.

### Trace Structure

```
ActionTrace {
  traceId: string              // Unique trace identifier
  rootSpan: TraceSpan          // Top-level span (action proposal)
  childSpans: TraceSpan[]      // Ordered child spans (AAB, policy, invariant, execute)
  duration: number             // Total trace duration (ms)
  outcome: 'allowed' | 'denied' | 'failed'
  metadata: {
    agentId: string
    actionType: string
    target: string
    policyRulesEvaluated: number
    invariantsChecked: number
  }
}
```

### Span Hierarchy

A typical action trace contains these spans:

```
[action.proposal] ─── 12ms total
├── [aab.normalize] ─── 1ms
│   └── detect git command in shell call
├── [policy.evaluate] ─── 3ms
│   ├── [rule.match] deny "git.push to main" ─── 0.5ms
│   └── [rule.match] allow "git.push to feature/*" ─── 0.3ms
├── [invariant.check] ─── 2ms
│   ├── [invariant] no-secret-exposure ─── 0.5ms PASS
│   ├── [invariant] protected-branch ─── 0.3ms FAIL
│   └── [invariant] blast-radius ─── 0.8ms PASS
├── [decision.record] ─── 0.5ms
└── [event.emit] ─── 0.2ms
```

### Trace Query

```
TraceQuery {
  timeRange?: { from: number, to: number }
  agentId?: string
  actionType?: string
  outcome?: 'allowed' | 'denied' | 'failed'
  minDuration?: number      // Filter slow traces
  limit?: number
  offset?: number
}
```

## Real-Time Event Streaming

### Server

Live event consumption via WebSocket or Server-Sent Events (SSE):

```
EventStreamServer {
  start(port: number): void
  stop(): void
  addSubscriber(filter: EventFilter): Subscription
  removeSubscriber(id: string): void
}
```

### Subscriber Management

- **Backpressure:** If a subscriber falls behind, events are buffered up to a configurable limit, then oldest events are dropped
- **Filter subscriptions:** Subscribers can filter by event kind, agent ID, severity, or action class
- **Multiple subscribers:** Dashboard, external monitoring, CI pipelines can all subscribe simultaneously

### Event Filter

```
EventFilter {
  kinds?: string[]          // Event kinds to receive
  agentIds?: string[]       // Only events from these agents
  severityMin?: number      // Minimum severity threshold
  actionClasses?: string[]  // Only events for these action classes
}
```

## OpenTelemetry Integration

### Backend

Implement `TraceBackend` interface for OpenTelemetry:

```
src/telemetry/backends/otel.ts
```

### Span Mapping

| AgentGuard Span | OTel Span Attribute |
|----------------|-------------------|
| `TracepointKind` | `agentguard.span.kind` |
| Action type | `agentguard.action.type` |
| Decision outcome | `agentguard.decision.outcome` |
| Policy rule matched | `agentguard.policy.rule` |
| Invariant name | `agentguard.invariant.name` |
| Escalation level | `agentguard.escalation.level` |
| Agent ID | `agentguard.agent.id` |
| Blast radius score | `agentguard.blast_radius.score` |

### Export

Export spans to any OTLP-compatible collector (Jaeger, Zipkin, Grafana Tempo, Datadog, etc.):

```yaml
# agentguard.yaml
telemetry:
  backend: otel
  endpoint: "http://localhost:4317"  # OTLP gRPC endpoint
  serviceName: "agentguard"
  sampleRate: 1.0  # 100% sampling for governance traces
```

## Enhanced TUI

### Interactive Trace Exploration

```bash
agentguard traces --interactive    # Launch interactive trace explorer
```

Features:
- Navigate trace hierarchy (expand/collapse spans)
- Filter traces by outcome, duration, action type
- Drill into decision chains (which rule matched, why)
- Highlight slow spans and invariant failures

### Live Dashboard Mode

```bash
agentguard dashboard               # Launch live dashboard
```

Panels:
- **Event stream:** Real-time event flow with color-coded outcomes
- **Escalation status:** Current escalation level with history
- **Action statistics:** Allow/deny/fail counts, rolling averages
- **Top denied actions:** Most frequently denied action types
- **Active agents:** Currently active agent sessions

## Target Directory Structure

```
src/traces/
├── trace-builder.ts      # Construct ActionTrace from TraceSpan tree
├── trace-query.ts        # Query traces by criteria
└── trace-export.ts       # Export traces in OTel-compatible format

src/events/
├── stream.ts             # WebSocket/SSE event streaming server

src/telemetry/backends/
└── otel.ts               # OpenTelemetry trace backend
```

## Key Files to Modify

| File | Change |
|------|--------|
| `src/telemetry/tracer.ts` | Register OTel backend |
| `src/cli/tui.ts` | Interactive trace exploration and live dashboard |
| `src/events/bus.ts` | Support external streaming subscribers |

## Verification

- OTel spans visible in Jaeger/Zipkin test instance
- Event streaming delivers events within 100ms of emission
- Trace builder correctly reconstructs full action traces from span tree
- Dashboard updates in real-time as events are emitted
- Backpressure prevents subscriber overflow

## References

- [Event Model](event-model.md)
- [Unified Architecture](unified-architecture.md)
