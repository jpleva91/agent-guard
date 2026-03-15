# Kill Switches & Circuit Breakers — AgentGuard

This document describes the runtime safety mechanisms that allow AgentGuard to automatically or manually halt agent actions in response to failures, anomalies, or human intervention.

## Context

AgentGuard currently has one runtime safety mechanism: the escalation state machine (`src/kernel/monitor.ts`) which tracks NORMAL → ELEVATED → HIGH → LOCKDOWN. When LOCKDOWN is reached, all actions are auto-denied. However, there is no graceful degradation, no automatic recovery, and no remote intervention capability.

## Circuit Breaker

The circuit breaker pattern prevents cascading failures by automatically halting action classes or agents that are producing errors.

### State Machine

```
          success             threshold exceeded
CLOSED ◄──────── HALF-OPEN ────────────────► OPEN
   │                ▲                          │
   │                │     cooldown expires      │
   │                └──────────────────────────┘
   │
   │  error rate exceeds threshold
   └──────────────────────────────────────────► OPEN
```

| State | Behavior |
|-------|----------|
| CLOSED | Normal operation. Actions evaluated and executed normally. Error rate tracked. |
| OPEN | All actions of the affected type/agent are denied immediately. No evaluation. |
| HALF-OPEN | A limited number of "test" actions are allowed through. If they succeed, transition to CLOSED. If they fail, transition back to OPEN. |

### Triggers

| Trigger | Description |
|---------|-------------|
| Error rate threshold | More than N% of actions failed in the last T seconds |
| Consecutive failures | N consecutive action failures |
| Manual trip | Human operator trips the circuit breaker via CLI or API |

### Granularity

Circuit breakers operate at two levels:
- **Per-agent:** All actions from a specific agent are halted
- **Per-action-class:** All actions of a specific class (e.g., `git.*`, `shell.*`) are halted across all agents

### Recovery

- **Automatic:** After a configurable cooldown period, the breaker transitions to HALF-OPEN and allows test actions
- **Manual:** Human operator resets via `agentguard circuit-breaker reset <id>`

### Target Location

```
src/kernel/circuit-breaker.ts
```

## Remote Kill Switch

An API endpoint that immediately halts all agent actions across all active sessions.

### Behavior

When activated:
1. All active governance kernels receive the kill signal
2. All pending action proposals are immediately denied
3. All in-flight executions are interrupted where possible
4. `KillSwitchActivated` event emitted to all sessions
5. Webhook notification sent to configured endpoints
6. Audit trail records who activated the switch and when

### Scope Levels

| Scope | Effect |
|-------|--------|
| Organization-wide | All agents, all sessions, all nodes |
| Team-wide | All agents within a team's sessions |
| Agent-specific | Single agent halted across all its sessions |

### Activation & Reset

- **Activate:** API call, CLI command, or physical button (Sentinel)
- **Reset:** Requires explicit human confirmation (CLI or API with auth token)
- **Cooldown:** Optional minimum lockdown duration before reset is allowed

### Target Location

```
src/kernel/kill-switch.ts
```

## Graceful Degradation

Progressive restriction of agent capabilities as error conditions accumulate, without full shutdown.

### Degradation Levels

```
FULL ──► RESTRICTED ──► READ_ONLY ──► NOTIFICATION_ONLY ──► HALTED
```

| Level | Allowed Actions | Denied Actions |
|-------|----------------|---------------|
| FULL | All (per policy) | None (per policy) |
| RESTRICTED | file.read, git.diff, test.run | file.write, file.delete, git.push, shell.exec |
| READ_ONLY | file.read, git.diff | All writes, all executions |
| NOTIFICATION_ONLY | None (all denied) | All actions denied but with warning notifications |
| HALTED | None | All actions denied silently |

### Triggers

Degradation level increases when:
- Error count exceeds threshold within time window
- Escalation level reaches HIGH
- Resource limits approached (memory, disk, CPU)
- External signal received (kill switch, circuit breaker)

### Target Location

```
src/kernel/degradation.ts
```

## New Event Kinds

| Event | Trigger |
|-------|---------|
| `CircuitBreakerTripped` | Circuit breaker transitions from CLOSED to OPEN |
| `CircuitBreakerReset` | Circuit breaker transitions back to CLOSED |
| `CircuitBreakerHalfOpen` | Circuit breaker enters test mode |
| `KillSwitchActivated` | Kill switch engaged (with scope and activator) |
| `KillSwitchReset` | Kill switch disengaged |
| `DegradationLevelChanged` | Graceful degradation level changed |

## Integration with Existing Systems

### Escalation State Machine

The circuit breaker and kill switch complement the existing escalation system:

```
Escalation (monitor.ts)        Circuit Breaker              Kill Switch
─────────────────────         ─────────────────            ──────────────
NORMAL                        CLOSED (per-agent/class)     Inactive
  │ violations accumulate       │ errors accumulate          │
ELEVATED                      (unchanged)                  (unchanged)
  │ more violations             │ error threshold hit        │
HIGH                          OPEN (specific scope)        (unchanged)
  │ continued violations        │                           │ human activates
LOCKDOWN ◄──────────────────── OPEN triggers escalation    HALTED (immediate)
```

### Key Files to Modify

| File | Change |
|------|--------|
| `src/kernel/kernel.ts` | Circuit breaker and kill switch integration into governance loop |
| `src/kernel/monitor.ts` | Coordinate with circuit breaker states |
| `src/events/schema.ts` | Add circuit breaker and kill switch event kinds |

## Verification

- Circuit breaker state transitions: CLOSED → OPEN on threshold, OPEN → HALF-OPEN after cooldown, HALF-OPEN → CLOSED on success
- Kill switch immediately halts all actions across active sessions
- Graceful degradation progressively restricts action types
- Recovery requires explicit human action (no auto-recover from kill switch)
- All state transitions produce audit events

## References

- [Sentinel Architecture — Physical Kill Switch](sentinel-architecture.md)
- [Unified Architecture](unified-architecture.md)
