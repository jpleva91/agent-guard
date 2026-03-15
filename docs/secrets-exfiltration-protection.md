# Secrets & Exfiltration Protection — AgentGuard

This document describes the enhanced secret detection, egress monitoring, and redaction capabilities for preventing data exfiltration through agent tool calls.

## Context

AgentGuard currently has:
- `no-secret-exposure` invariant (severity 5) — basic pattern matching for known secret formats
- `no-credential-file-creation` invariant (severity 5) — blocks creation of common credential files

These catch obvious cases but miss encoded secrets, unknown token formats, and network-based exfiltration. This plan addresses those gaps.

## Content-Aware Secret Scanner

### Detection Methods

| Method | Description | Example |
|--------|-------------|---------|
| Regex patterns | Known API key formats for major providers | `AKIA[0-9A-Z]{16}` (AWS) |
| Entropy detection | High-entropy strings that may be unknown tokens | Base64 strings with Shannon entropy > 4.5 |
| Base64 scanning | Decode Base64 content and check inner payload | `echo QUtJQTEyMzQ...` → decoded contains AWS key |
| Custom patterns | User-defined patterns via policy | Configurable in `agentguard.yaml` |

### Provider-Specific Patterns

| Provider | Pattern Description |
|----------|-------------------|
| AWS | Access key (`AKIA...`), secret key (40-char base64) |
| GCP | Service account key JSON, API key (`AIza...`) |
| Azure | Client secret, storage account key, connection strings |
| GitHub | Personal access token (`ghp_`), fine-grained token (`github_pat_`) |
| GitLab | Personal access token (`glpat-`) |
| Stripe | Secret key (`sk_live_`, `sk_test_`) |
| Slack | Bot token (`xoxb-`), user token (`xoxp-`) |
| OpenAI | API key (`sk-`) |
| Anthropic | API key (`sk-ant-`) |
| Generic | Private keys (PEM headers), JWT tokens, high-entropy hex/base64 |

### Entropy-Based Detection

For unknown token formats, use Shannon entropy as a heuristic:

```
entropy(s) = -Σ p(c) × log2(p(c))  for each character c
```

Thresholds:
- Strings > 20 characters with entropy > 4.5: **flag as potential secret**
- Strings > 40 characters with entropy > 5.0: **flag as likely secret**
- Configurable thresholds and minimum length via policy

### Configuration

```yaml
# agentguard.yaml
secrets:
  providers: [aws, gcp, azure, github, stripe, slack, openai, anthropic]
  entropy:
    enabled: true
    threshold: 4.5
    minLength: 20
  custom_patterns:
    - name: "internal-api-key"
      pattern: "MYCOMPANY_[A-Za-z0-9]{32}"
      severity: 5
```

## Egress Monitoring

Track outbound network activity through `http.request` and `shell.exec` (curl/wget) actions.

### Domain Tracking

```
EgressMonitor {
  allowlist: string[]      // Approved domains
  denylist: string[]       // Blocked domains
  firstSeen: Map<string, number>  // First time each domain was contacted
  volumeByDomain: Map<string, number>  // Bytes sent per domain
}
```

### Rules

| Rule | Trigger |
|------|---------|
| Domain denylist | Action targets a blocked domain → DENY |
| Domain allowlist | Action targets an unlisted domain → WARN or DENY (configurable) |
| First-seen domain | Action targets a never-before-seen domain → ALERT |
| Volume threshold | Cumulative data sent to a domain exceeds limit → DENY |
| DNS exfiltration | Shell command contains DNS lookup to unusual domain → ALERT |

### Configuration

```yaml
# agentguard.yaml
egress:
  mode: allowlist          # "allowlist" (deny by default) or "denylist" (allow by default)
  allowed_domains:
    - "*.github.com"
    - "registry.npmjs.org"
    - "api.anthropic.com"
  denied_domains:
    - "*.pastebin.com"
    - "*.requestbin.com"
  volume_limit_bytes: 1048576  # 1MB per domain per session
  alert_on_first_seen: true
```

### New Event Kind

| Event | Trigger |
|-------|---------|
| `DataExfiltrationAttempt` | Egress rule triggered (denylist match, volume exceeded, etc.) |

## Redaction Engine

Redact secrets from event payloads before persistence, preventing credential leakage in audit trails.

### Behavior

1. Before an event is written to JSONL, scan all string fields in the payload
2. Replace detected secrets with redaction markers: `[REDACTED:aws-key:a]` (type + first char)
3. Optionally store the original value in a separate encrypted redaction vault (for incident response)

### Redaction Modes

| Mode | Behavior |
|------|----------|
| `replace` | Replace secret with `[REDACTED:<type>]` — irreversible |
| `vault` | Replace and store original in encrypted vault — reversible with admin key |
| `hash` | Replace with `[REDACTED:<type>:sha256:<first-8-chars>]` — verifiable but irreversible |

### Configuration

```yaml
# agentguard.yaml
redaction:
  enabled: true
  mode: replace            # replace | vault | hash
  vault_key_path: ~/.agentguard/redaction.key  # Only for vault mode
  scan_fields:
    - command
    - content
    - input
    - arguments
```

## Target Directory Structure

```
src/invariants/
├── secret-scanner.ts     # Content-aware secret scanning with multiple detection methods
└── egress-monitor.ts     # Outbound network tracking with domain rules

src/core/
└── redaction.ts          # Redaction engine for event payloads
```

## Key Files to Modify

| File | Change |
|------|--------|
| `src/invariants/definitions.ts` | Enhance secret detection patterns, integrate scanner |
| `src/events/schema.ts` | Add `DataExfiltrationAttempt` event kind |
| `src/kernel/kernel.ts` | Integrate egress monitoring into governance loop |
| `src/events/jsonl.ts` | Apply redaction before writing events |

## Verification

- Secret scanner detects all patterns in test corpus (100% coverage of listed providers)
- Entropy detection flags high-entropy strings above threshold
- Base64-encoded secrets are detected after decoding
- Egress monitoring blocks requests to denied domains
- First-seen domain alerts fire correctly
- Volume threshold enforcement prevents data exfiltration
- Redaction removes secrets from persisted events
- Vault mode allows recovery with admin key

## References

- [Threat Model — T2: Data Exfiltration](threat-model.md)
- [Unified Architecture](unified-architecture.md)
