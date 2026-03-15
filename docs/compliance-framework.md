# Compliance Framework Mapping — AgentGuard

This document maps AgentGuard capabilities to compliance framework controls (SOC2, ISO 27001, HIPAA) and describes the compliance reporting infrastructure.

## Overview

AgentGuard's governance kernel generates auditable evidence of every agent action, decision, and policy evaluation. This evidence maps directly to compliance controls across multiple frameworks. The compliance system provides:

1. **Control definitions** per framework
2. **Capability-to-control mappings** showing which AgentGuard features satisfy which controls
3. **Attestation reports** generated from governance data
4. **Pre-built policy templates** per compliance framework

## Control Mappings

### SOC2 Trust Services Criteria

| AgentGuard Feature | SOC2 Control | Control Description |
|-------------------|-------------|-------------------|
| Action audit trail (JSONL events) | CC7.2 | System monitors and detects anomalies that are indicators of malicious acts |
| Action audit trail (JSONL events) | CC7.3 | System evaluates anomalies to determine if they represent security events |
| Policy enforcement (allow/deny) | CC6.1 | Logical and physical access controls restrict access to authorized users |
| Escalation/LOCKDOWN | CC7.4 | System responds to identified security incidents |
| Evidence packs | CC7.2 | Monitoring activities generate auditable evidence |
| Secret protection (invariants) | CC6.1 | Access to sensitive data is restricted |
| Secret protection (invariants) | CC6.7 | Data is protected during transmission |
| Capability tokens | CC6.3 | Role-based access is implemented |
| Blast radius computation | CC7.2 | Impact assessment for proposed changes |
| Invariant enforcement | CC8.1 | Change management controls |

### ISO 27001 Annex A Controls

| AgentGuard Feature | ISO Control | Control Description |
|-------------------|-------------|-------------------|
| Action audit trail | A.12.4 | Logging and monitoring |
| Policy enforcement | A.9.4 | System and application access control |
| Escalation/LOCKDOWN | A.16.1 | Management of information security incidents |
| Evidence packs | A.12.4 | Event logging |
| Secret protection | A.9.2 | User access management |
| Capability tokens | A.9.2 | User access provisioning |
| Policy composition | A.5.1 | Policies for information security |
| Blast radius computation | A.14.2 | Security in development and support processes |
| Invariant enforcement | A.14.1 | Security requirements of information systems |
| Decision records | A.12.4 | Protection of log information |

### HIPAA Security Rule

| AgentGuard Feature | HIPAA Section | Requirement |
|-------------------|--------------|-------------|
| Action audit trail | §164.312(b) | Audit controls — hardware, software, procedural mechanisms |
| Policy enforcement | §164.312(a) | Access control — restrict access to ePHI |
| Escalation/LOCKDOWN | §164.308(a)(6) | Security incident procedures |
| Evidence packs | §164.312(b) | Audit trail documentation |
| Secret protection | §164.312(d) | Person or entity authentication |
| Capability tokens | §164.312(d) | Unique user identification |
| Cryptographic signing | §164.312(c) | Integrity controls |
| Kill switches | §164.308(a)(7) | Contingency plan — emergency mode operation |

## Pre-Built Policy Templates

### SOC2 Policy (`policies/soc2.yaml`)

Focus areas:
- All actions logged (no silent execution)
- File writes to sensitive directories require elevated review
- Git pushes require test completion (test-before-push invariant)
- Secret exposure triggers immediate LOCKDOWN
- All shell commands audited with full command capture
- Default effect: deny (explicit allowlist)

### ISO 27001 Policy (`policies/iso27001.yaml`)

Focus areas:
- Access control per principle of least privilege
- Change management with blast radius limits
- Incident response escalation thresholds
- Comprehensive logging of all governance decisions
- Policy versioning with change tracking

### HIPAA Policy (`policies/hipaa.yaml`)

Focus areas:
- Strict access control on data-containing directories
- No external network access without explicit approval
- All file reads/writes logged with content hashing
- Credential and secret protection at maximum sensitivity
- Emergency shutdown capability (kill switch integration)

## Attestation Reports

### Report Types

| Report | Content | Use Case |
|--------|---------|----------|
| Session attestation | "Run R had N actions, M denials, 0 violations" | Per-session compliance evidence |
| Policy attestation | "Policy X was active from T1 to T2" | Policy enforcement verification |
| Period summary | Aggregate statistics across sessions within date range | Periodic compliance review |
| Control coverage | Which controls are covered by current policy + invariants | Gap analysis |

### Report Generation

```bash
agentguard compliance audit --framework soc2
agentguard compliance audit --framework iso27001
agentguard compliance audit --framework hipaa
agentguard compliance report --framework soc2 --from 2025-01-01 --to 2025-03-31
agentguard compliance controls --framework hipaa  # Show control coverage
```

## Target Directory Structure

```
src/compliance/
├── controls.ts       # Control definitions per framework
├── mapping.ts        # AgentGuard capability → control mapping
├── attestation.ts    # Attestation report generation
└── templates.ts      # Pre-built policy templates per framework

policies/
├── soc2.yaml         # SOC2-focused policy template
├── iso27001.yaml     # ISO 27001-focused policy template
└── hipaa.yaml        # HIPAA-focused policy template
```

## Key Files to Modify

| File | Change |
|------|--------|
| `src/cli/commands/` | Add `compliance.ts` command |
| `policies/` | Add compliance policy packs |

## Verification

- Compliance report generation for each framework produces valid output
- Control mappings are complete (no AgentGuard feature unmapped)
- Policy templates pass `agentguard policy validate`
- Attestation reports include all governance events within the specified period

## References

- [Cryptographic Non-Repudiation](cryptographic-non-repudiation.md)
- [Unified Architecture](unified-architecture.md)
