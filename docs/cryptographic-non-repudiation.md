# Cryptographic Non-Repudiation — AgentGuard

This document describes the cryptographic signing and tamper-evidence systems that provide non-repudiation for AgentGuard's governance records.

## Motivation

AgentGuard's JSONL audit trail is currently append-only but not cryptographically signed. An attacker with file system access could modify, delete, or reorder events without detection. For enterprise compliance and legal defensibility, governance records must be:

1. **Signed** — each event provably originated from the governance kernel
2. **Chained** — each event references the previous, making insertion/deletion detectable
3. **Verifiable** — third parties can verify the integrity of the audit trail

## Event Signing

### Signature Scheme

Each event envelope includes a cryptographic signature:

```
EventEnvelope {
  ...existing fields...
  signature: string          // Base64-encoded signature
  previousHash: string       // SHA-256 hash of previous event (hash chain)
  policyVersionHash: string  // Hash of the active policy at event time
}
```

**Supported algorithms:**
- **Ed25519** — default, fast, small signatures (64 bytes)
- **HMAC-SHA256** — alternative for environments without asymmetric key infrastructure

### Hash Chain

Events form a linked chain where each event includes the hash of the previous event:

```
Event 0: hash(content_0) = H0, previousHash = null (genesis)
Event 1: hash(content_1) = H1, previousHash = H0
Event 2: hash(content_2) = H2, previousHash = H1
...
Event N: hash(content_N) = HN, previousHash = H(N-1)
```

**Tamper detection:** If any event is modified, its hash changes, breaking the chain at every subsequent event. If an event is deleted, the gap in hashes is immediately detectable.

### Key Management

| Method | Use Case | Storage |
|--------|---------|---------|
| Local keyfile | Single developer, local governance | `~/.agentguard/signing-key.pem` |
| Environment variable | CI/CD pipelines | `AGENTGUARD_SIGNING_KEY` env var |
| KMS integration | Enterprise deployment | AWS KMS, GCP Cloud KMS, Azure Key Vault |

## Decision Record Signing

Governance decision records receive additional signing:

```
SignedDecisionRecord {
  ...existing decision fields...
  signature: string          // Signature over decision + policy hash
  policyVersionHash: string  // Hash of policy that produced this decision
  invariantHashes: string[]  // Hashes of invariant definitions checked
}
```

**Scope of signature:** The signature covers the decision outcome, the policy version hash, and the action that was evaluated. This provides verifiable proof that a specific policy was active when a specific decision was made.

## Attestation Artifacts

### Types

| Artifact | Content | Format |
|----------|---------|--------|
| Policy attestation | "Policy X (hash: H) was active from T1 to T2" | Signed JSON or PKCS#7 |
| Session summary | "Run R: N actions, M denials, K violations" | Signed JSON or JWS |
| Compliance attestation | "Controls C1–CN satisfied during period T1–T2" | Signed JSON or PKCS#7 |

### Export Formats

- **JWS (JSON Web Signature)** — portable, widely supported, suitable for API exchange
- **PKCS#7** — traditional format, compatible with enterprise PKI systems

## Tamper Detection

### On-Load Verification

When the event store loads events from JSONL:
1. Recompute hash of each event
2. Verify `previousHash` matches computed hash of prior event
3. Verify signature using the signing public key
4. Report any chain breaks, hash mismatches, or invalid signatures

### Periodic Integrity Checks

Configurable background verification at intervals:

```yaml
# agentguard.yaml
integrity:
  checkInterval: 3600  # seconds (1 hour)
  alertOnFailure: true
  haltOnFailure: false  # if true, activates kill switch on tampering
```

### Integrity Events

| Event | Trigger |
|-------|---------|
| `IntegrityCheckPassed` | Periodic check completed with no issues |
| `IntegrityViolationDetected` | Hash chain break, signature failure, or missing event |

## Target Directory Structure

```
src/events/signing.ts           # Event signature generation and verification
src/events/integrity.ts         # Hash chain verification and tamper detection
src/kernel/decisions/signing.ts # Decision record signing
src/compliance/attestation.ts   # Signed attestation artifact generation
```

## Key Files to Modify

| File | Change |
|------|--------|
| `src/events/jsonl.ts` | Integrate signing on write, verification on read |
| `src/events/schema.ts` | Add `signature`, `previousHash` fields to event envelope |
| `src/kernel/decisions/factory.ts` | Sign decision records on creation |

## Verification

- Hash chain integrity verification after 10K events
- Tampered event detected (modified content, deleted event, reordered events)
- Invalid signatures rejected on load
- Attestation artifacts validate with standard JWS/PKCS#7 libraries
- Performance: signing overhead < 1ms per event

## References

- [Compliance Framework](compliance-framework.md)
- [Unified Architecture](unified-architecture.md)
