# Policy Packs

Pre-built policy sets for common governance scenarios. Load a pack with:

```bash
agentguard guard --policy policies/<pack>/agentguard-pack.yaml
```

## Choosing a Pack

| Pack | Severity | Best for | Philosophy |
|------|----------|----------|------------|
| **open-source** | 2 | Community projects, personal repos | Permissive — protects main branch and credentials, allows most else |
| **engineering-standards** | 3 | Teams enforcing dev best practices | Disciplined — test-before-push, format checks, blast radius limits |
| **ci-safe** | 3 | CI/CD pipelines, automated runs | Read-only — forbids all mutations, allows read + test |
| **soc2** | 4 | SOC2-audited organizations | Audit-focused — change traceability, credential protection, blast radius controls |
| **enterprise** | 4 | Corporate environments, regulated codebases | Comprehensive — audit requirements, branch protection, deploy gates |
| **hipaa** | 5 | Healthcare, PHI-handling systems | Maximum protection — PHI file guards, network restrictions, strict integrity controls |
| **strict** | 5 | Security-critical systems, production infra | Maximum safety — denies most operations by default |

## Pack Details

### open-source
Balanced rules for open-source projects. Protects main/master branches and credential files while keeping development friction low. Good starting point for most projects.

### engineering-standards
Engineering best practices for development teams. Enforces test-before-push, format-before-push, branch protection for main/master, blast radius limits, and credential file protection. Does not include compliance-specific controls — pair with `soc2` or `hipaa` packs for regulated environments.

### ci-safe
Minimal attack surface for CI/CD. Blocks all write operations, shell mutations, and infrastructure changes. Allows file reads, test execution, and linting. Use this in automated pipelines where agents should observe but not modify.

### soc2
Rules aligned with SOC2 Trust Services Criteria (CC6, CC7, CC8). Enforces change management with test-before-push, audit trail integrity via force-push denial, credential protection, external threat mitigation (curl/wget blocking), and infrastructure change authorization. Each deny rule references the relevant SOC2 control.

### enterprise
Comprehensive rules for corporate environments. Includes `curl` blocking to prevent data exfiltration, strict branch protection, deploy gates, and audit-trail requirements. Suitable for teams with compliance needs.

### hipaa
Rules aligned with HIPAA Security Rule (164.312). Enforces PHI directory and file protection, transmission security (blocks HTTP requests and shell-based network access), integrity controls (no branch deletion, no force push, no file deletion), and strict blast radius limits. Suitable for healthcare applications and any system handling Protected Health Information.

### strict
Maximum safety for security-critical systems. Denies most operations by default and requires explicit allow rules for each action class. Use when the cost of an unauthorized action is very high.
