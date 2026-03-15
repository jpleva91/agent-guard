# Verification Strategy — AgentGuard

This document defines the verification criteria for each phase of the AgentGuard strategic roadmap. Each section specifies what must be true before a phase is considered complete.

## Continuous Verification (All Phases)

These checks must pass at all times, regardless of which phase is active:

```bash
npm run ts:test          # All vitest tests pass
npm run lint             # ESLint clean
npm run ts:check         # TypeScript type-check passes
npm run test:coverage    # ≥50% line coverage maintained
```

No phase may regress these baselines.

---

## Phase 0: Category Definition & The Open-Source Kernel

### 0.1 — Multi-Framework Adapters

| Criterion | Verification Method |
|-----------|-------------------|
| Each adapter has integration tests | `npm run ts:test -- --grep "adapter"` — all pass |
| `agentguard init <framework>` works for all supported frameworks | Manual test: init each framework in clean project |
| Framework payloads correctly translate to `RawAgentAction` | Unit tests with framework-specific payload fixtures |
| Existing tests continue to pass | `npm run ts:test` — zero regressions |

### 0.2 — Threat Model & Security Benchmarks

| Criterion | Verification Method |
|-----------|-------------------|
| Security benchmarks pass with 100% coverage of identified threat vectors | `npm run ts:test -- --grep "security"` — all pass |
| AAB normalization catches all tested evasion attempts | Normalization test corpus (≥50 patterns) |
| Default-deny policy option works correctly | Policy evaluation tests with `defaultEffect: deny` |
| Threat model document covers all 5 threat vectors | Document review |

### 0.3 — Developer Experience

| Criterion | Verification Method |
|-----------|-------------------|
| `agentguard` installs cleanly as npm dependency | `npm install agentguard` in clean project |
| Programmatic API exports kernel, evaluator, checker | `import { Kernel, PolicyEvaluator, InvariantChecker } from 'agentguard'` |
| Quick-start template works per framework | Manual test per framework |

---

## Phase 1: Developer Platform

### 1.1 — Cloud Policy Service

| Criterion | Verification Method |
|-----------|-------------------|
| Policy sync round-trip (push → pull → compare) | Integration test: push policy, pull from different client, byte-compare |
| Deny-wins merge produces correct result | Unit tests with conflicting policy pairs |
| RBAC permissions enforced | Permission check tests (editor can't deploy, viewer can't write) |
| Version rollback restores exact previous state | Push v1, push v2, rollback to v1, compare to original |

### 1.2 — Observability & Traces

| Criterion | Verification Method |
|-----------|-------------------|
| OTel spans visible in Jaeger/Zipkin | Integration test with local Jaeger container |
| Event streaming delivers events within 100ms | Latency measurement test |
| Trace builder reconstructs full action traces | Unit test with known span tree |

### 1.3 — Secrets & Exfiltration Protection

| Criterion | Verification Method |
|-----------|-------------------|
| Secret scanner detects all patterns in test corpus | Test corpus of ≥100 known secret formats |
| Entropy detection flags high-entropy strings | Statistical tests with known-good and known-bad strings |
| Egress monitoring blocks denied domains | Integration test with mock HTTP server |
| Redaction removes secrets from persisted events | Read-back test: write event with secret, read back, verify redacted |

---

## Phase 2: Enterprise Enforcement

### 2.1 — Sandboxed Execution

| Criterion | Verification Method |
|-----------|-------------------|
| Sandboxed shell cannot access files outside jail | Attempt file read outside sandbox, verify denial |
| Network fence blocks unauthorized connections | Attempt HTTP request from sandbox, verify block |
| Resource limits enforce CPU/memory/time caps | Run CPU-intensive command, verify timeout |

### 2.2 — Capability Tokens

| Criterion | Verification Method |
|-----------|-------------------|
| Token lifecycle: mint → use → expire → denied | Time-based test with short TTL |
| Token revocation: mint → use → revoke → denied | Revocation list test |
| Capability narrowing: policy allows, token denies → denied | Cross-check test |
| Invalid tokens produce clear error events | Malformed token test |

### 2.3 — Kill Switches & Circuit Breakers

| Criterion | Verification Method |
|-----------|-------------------|
| Circuit breaker state transitions under load | Stress test with controlled error injection |
| Kill switch immediately halts all actions | Multi-session test: activate switch, verify all sessions blocked |
| Graceful degradation progressively restricts | Incremental error injection, verify restriction levels |
| Recovery requires explicit human action | Attempt auto-recovery, verify it fails |

### 2.4 — Compliance Mapping

| Criterion | Verification Method |
|-----------|-------------------|
| Compliance report generates for each framework | `agentguard compliance audit --framework <x>` for SOC2, ISO, HIPAA |
| Control mappings are complete | Automated check: no unmapped AgentGuard features |
| Policy templates pass validation | `agentguard policy validate` for each compliance template |

### 2.5 — Cryptographic Non-Repudiation

| Criterion | Verification Method |
|-----------|-------------------|
| Hash chain integrity after 10K events | Generate 10K events, verify chain, tamper one, verify detection |
| Tampered event detected | Modify event content, verify integrity check fails |
| Attestation artifacts validate with JWS/PKCS#7 libraries | Third-party library verification |
| Signing overhead < 1ms per event | Performance benchmark |

### 2.6 — CI/CD Governance

| Criterion | Verification Method |
|-----------|-------------------|
| PR governance gate blocks merge on violations | GitHub Actions test with intentional violation |
| Dependency audit detects known vulnerabilities | Test with known-vulnerable package |
| Incident report generation includes causal chain | End-to-end test: trigger violation, generate report, verify chain |

### 2.7 — Sentinel AG-01

| Criterion | Verification Method |
|-----------|-------------------|
| Physical invariants trigger on simulated violations | Unit tests for thermal, battery, spatial, interlock invariants |
| Hardware adapters pass through governance loop identically | Same action through software and hardware adapter, compare decisions |
| LED feedback matches governance state | Integration test with mock LED controller |
| Physical kill switch immediately triggers LOCKDOWN | Simulated button press → verify LOCKDOWN event |
| `agentguard init sentinel` scaffolds edge runtime | Manual test in clean directory |

---

## Phase 3: Platform Lock-In & Standardization

### 3.1 — Agent Identity & Delegation

| Criterion | Verification Method |
|-----------|-------------------|
| DSL policies produce identical results to equivalent YAML | Conversion test: convert YAML → DSL, run both against corpus, compare |
| Delegation chain correctly narrows capabilities | Multi-level delegation test with capability checks at each level |
| Approval gate blocks until human responds | Integration test with mock approval channel |
| Approval timeout triggers denial and escalation | Time-based test with short timeout |

### 3.2 — Declarative Policy Language

| Criterion | Verification Method |
|-----------|-------------------|
| Parser handles all language features | Comprehensive parser test suite |
| Coverage reporting accurately reflects rule evaluation | Known policy with known input → verify coverage percentages |
| YAML-to-DSL conversion produces equivalent policies | Round-trip test on all existing policy packs |

### 3.3 — Protocol Standardization

| Criterion | Verification Method |
|-----------|-------------------|
| AGP event serialization round-trips without loss | Serialize → deserialize → compare |
| AGP policy validation rejects malformed documents | Corpus of valid and invalid documents |
| AGP audit trail verification detects tampering | Tamper test on exported audit trail |
| AgentGuard events convert to/from AGP without loss | Bidirectional conversion test |

---

## Phase 4–5: Kernel Hardening & Multi-Node

### 4.1 — Rust Kernel

| Criterion | Verification Method |
|-----------|-------------------|
| Rust kernel produces identical decisions on replay corpus | Side-by-side replay of 10K+ actions |
| < 1ms p99 action evaluation latency | Performance benchmark under load |
| Memory < 10MB resident | Memory profiling |
| N-API bindings maintain full TypeScript API compatibility | TypeScript wrapper test suite |
| Fallback to TypeScript on unsupported platform | Simulate missing native addon |

### 4.2 — Multi-Node Coordination

| Criterion | Verification Method |
|-----------|-------------------|
| Multi-node cluster maintains consistency under partition | Network partition simulation (deny-wins) |
| Policy consensus across nodes | Push policy to one node, verify all nodes converge |
| Event replication between nodes | Emit event on one node, verify receipt on all |

---

## Benchmark Infrastructure

### Performance Benchmarks

Run with every release:

```bash
agentguard benchmark --actions 10000    # Evaluate 10K actions, report p50/p95/p99
agentguard benchmark --concurrent 100   # 100 concurrent governance sessions
agentguard benchmark --signing          # Measure signing overhead
```

### Regression Detection

- Performance results stored in CI artifacts
- Alert if p99 latency increases by > 20% from baseline
- Alert if memory usage increases by > 30% from baseline

## References

- [Threat Model](threat-model.md)
- [Unified Architecture](unified-architecture.md)
