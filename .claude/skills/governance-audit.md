---
name: governance-audit
description: "Analyze governance logs for violations and trends"
---
# Governance Audit

## Agent Identity

```bash
source scripts/agent-identity-bridge.sh "governance-audit" standard semi-autonomous
```

## Steps

1. Check for governance log files: `ls .agentguard/events/*.jsonl`
2. Count events by type (ActionDenied, PolicyDenied, InvariantViolation)
3. Compute denial rate and risk score trends
4. If violations found, create a GitHub issue with findings
5. Report "Governance logs nominal" if no actionable findings
