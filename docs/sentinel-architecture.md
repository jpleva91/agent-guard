# Sentinel AG-01 Architecture — AgentGuard

This document describes the Sentinel AG-01 edge node: a physical proof of concept that validates the AgentGuard governance kernel's universality by extending it to hardware systems.

## Strategic Framing

Sentinel is **NOT a robotics product**. It is a "governed autonomous edge node" that validates the kernel's universality. The ARSG guardrail applies: "Do not add robotics too early." Sentinel avoids this trap by treating hardware as just another adapter surface, not a new domain.

**Core insight:** The adapter pattern (`src/adapters/registry.ts`) already abstracts execution substrates. The kernel is substrate-agnostic — it evaluates actions, not implementations. A `gpio.write` action passes through the same propose → evaluate → execute → emit loop as a `file.write` action.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Control Plane                      │
│              (TypeScript/Node — existing)             │
│                                                      │
│  CLI    Policy Authoring    Integration Management   │
└──────────────────────┬───────────────────────────────┘
                       │ WebSocket/IPC
                       ▼
┌─────────────────────────────────────────────────────┐
│               Governance Kernel                      │
│           (TypeScript now → Rust long-term)           │
│                                                      │
│  AAB → Policy Eval → Invariant Check → Decision     │
│                                                      │
│  Physical invariants:                                │
│  - thermal-limit                                     │
│  - battery-threshold                                 │
│  - rate-limit-actuator                               │
│  - spatial-boundary                                  │
│  - safety-interlock                                  │
└──────────────────────┬───────────────────────────────┘
                       │
          ┌────────────┼────────────┐
          │            │            │
          ▼            ▼            ▼
┌──────────────┐ ┌──────────┐ ┌──────────────┐
│ Software     │ │ Hardware │ │ Hardware     │
│ Adapters     │ │ Adapters │ │ Simulator    │
│              │ │          │ │              │
│ file, shell, │ │ gpio,    │ │ Predict      │
│ git          │ │ sensor,  │ │ thermal,     │
│              │ │ actuator,│ │ power,       │
│              │ │ power,   │ │ position     │
│              │ │ motion   │ │ impact       │
└──────────────┘ └────┬─────┘ └──────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│            Sentinel Edge Runtime                     │
│                (Python v1 — RPi 5)                   │
│                                                      │
│  TypeScript ↔ Python Bridge (IPC/WebSocket)          │
│                                                      │
│  Hardware:                                           │
│  ├── Camera module                                   │
│  ├── RGB LEDs (governance state feedback)            │
│  ├── Speaker/buzzer (alerts)                         │
│  ├── Servo/fan (actuator demo)                       │
│  └── Physical kill switch button                     │
└─────────────────────────────────────────────────────┘
```

## Expanded Canonical Action Taxonomy

New action classes follow the existing `<class>.<verb>` pattern from `src/core/actions.ts`:

| Class | Action Types | Description |
|-------|-------------|-------------|
| `gpio` | `gpio.read`, `gpio.write`, `gpio.pwm` | General-purpose I/O pin operations |
| `sensor` | `sensor.read`, `sensor.subscribe` | Sensor data acquisition (temperature, distance, light) |
| `actuator` | `actuator.move`, `actuator.stop`, `actuator.set` | Servo, motor, fan control |
| `power` | `power.state`, `power.shutdown`, `power.reboot` | Device power management |
| `motion` | `motion.drive`, `motion.rotate`, `motion.stop` | Locomotion commands (wheeled/tracked platforms) |

These integrate with the existing 10 action classes (file, test, git, shell, npm, http, deploy, infra, github, mcp) to give 15 total classes.

## Physical Invariants

New invariants follow the same pattern as existing definitions in `src/invariants/definitions.ts`:

### thermal-limit

**Severity:** 4
**Trigger:** Deny actions if device temperature exceeds configurable threshold.
**Rationale:** Prevent hardware damage from thermal runaway (e.g., servo stall, CPU overload).
**Data source:** `sensor.read` on thermal sensor before actuator/compute actions.

### battery-threshold

**Severity:** 3
**Trigger:** Deny non-critical actions when battery level drops below threshold.
**Rationale:** Reserve remaining power for safe shutdown and telemetry.
**Data source:** `power.state` reading.

### rate-limit-actuator

**Severity:** 3
**Trigger:** Deny actuator commands exceeding max operations per time window.
**Rationale:** Prevent mechanical wear and potential damage from rapid cycling.
**Data source:** Action history within sliding time window.

### spatial-boundary

**Severity:** 5
**Trigger:** Deny motion commands that would move outside defined operational zone.
**Rationale:** Contain autonomous movement within safe boundaries.
**Data source:** Position tracking + proposed movement vector.

### safety-interlock

**Severity:** 5
**Trigger:** Deny all physical actions unless hardware safety switch is in READY state.
**Rationale:** Ensure human operator has physically enabled the system.
**Data source:** GPIO read on interlock pin.

## Hardware Adapters

Each hardware adapter implements the same `ActionHandler` interface as `file.ts`, `shell.ts`, and `git.ts`:

```
src/adapters/hardware/
├── gpio.ts       # GPIO pin read/write via adapter interface
├── sensor.ts     # Sensor data acquisition
├── actuator.ts   # Servo/motor/fan control
└── power.ts      # Power state management
```

**Key design:** These adapters are thin bridges to the Sentinel edge runtime. The TypeScript adapter translates the `RawAgentAction` into a command, sends it to the Python runtime via IPC/WebSocket, and receives the result. The actual hardware interaction happens in Python (using RPi.GPIO, gpiozero, etc.).

## Hardware Simulators

Extend `src/kernel/simulation/` with physical impact prediction:

```
src/kernel/simulation/
├── filesystem-simulator.ts   # Existing
├── git-simulator.ts          # Existing
├── package-simulator.ts      # Existing
└── hardware-simulator.ts     # NEW: physical impact simulation
```

**Simulation capabilities:**
- "If servo moves to position X, thermal will reach Y°C in Z seconds"
- "If motor runs at speed V for T seconds, battery will drop to B%"
- "If drive command issued, final position will be at coordinates (X, Y)"

## Sentinel Edge Runtime

The edge runtime is a separate package (`sentinel/`) that runs on the Raspberry Pi 5:

```
sentinel/
├── runtime.ts        # Python v1 edge runtime bootstrap
├── bridge.ts         # TypeScript ↔ Python bridge (IPC/WebSocket)
├── feedback.ts       # LED status display
├── kill-switch.ts    # Physical push-button kill switch
└── requirements.txt  # Python dependencies
```

### LED Feedback Protocol

| Color | State | Meaning |
|-------|-------|---------|
| White (steady) | IDLE | System ready, no active actions |
| Yellow (pulse) | EVALUATING | Action proposed, governance kernel evaluating |
| Green (flash) | ALLOWED | Action approved and executing |
| Red (flash) | DENIED | Action denied by policy or invariant |
| Red (steady) | LOCKDOWN | Escalation reached LOCKDOWN state |

### Physical Kill Switch

A hardware push-button that immediately triggers the escalation state machine to LOCKDOWN:
- All active actions are halted
- All pending proposals are denied
- Actuators are sent to safe positions
- Event emitted: `KillSwitchActivated`
- Requires manual reset (physical button hold + CLI confirmation)

## Hardware Bill of Materials

| Component | Purpose | Interface |
|-----------|---------|-----------|
| Raspberry Pi 5 | Edge compute | Primary platform |
| Camera module | Visual sensor input | CSI |
| RGB LED strip (WS2812B) | Governance state feedback | GPIO (data pin) |
| Piezo buzzer | Audio alerts | GPIO (PWM) |
| SG90 servo | Actuator demo | GPIO (PWM) |
| 5V fan | Thermal management demo | GPIO (on/off or PWM) |
| Push button | Physical kill switch | GPIO (input with pull-up) |
| Temperature sensor (DS18B20) | Thermal monitoring | GPIO (1-Wire) |

## Key Files to Modify

| File | Change |
|------|--------|
| `src/core/actions.ts` | Add physical action classes (gpio, sensor, actuator, power, motion) |
| `src/invariants/definitions.ts` | Add 5 physical invariants |
| `src/adapters/registry.ts` | Register hardware adapters |
| `src/kernel/simulation/registry.ts` | Register hardware simulator |

## Verification

- Physical invariants trigger on simulated thermal/battery/spatial violations
- Hardware adapters pass through governance loop identically to software adapters
- LED feedback matches governance state (White → Yellow → Green/Red)
- Physical kill switch immediately triggers LOCKDOWN
- `agentguard init sentinel` scaffolds edge runtime

## References

- [Unified Architecture](unified-architecture.md)
- [Rust Kernel Migration](rust-kernel-migration.md)
