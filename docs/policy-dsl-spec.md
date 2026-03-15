# Declarative Policy Language Specification — AgentGuard

This document specifies the AgentGuard policy DSL: a declarative language for expressing governance policies, positioned as "OPA for Agents."

## Motivation

The current YAML policy format (`agentguard.yaml`) works well for simple rules but becomes unwieldy for complex, multi-condition policies. A declarative DSL provides:

- **Composability** — package system for reusable policy modules
- **Expressiveness** — conditionals, built-in functions, variable binding
- **Testability** — unit test policies against mock actions
- **Readability** — intent is clearer than nested YAML

## Language Overview

### File Extension

`.guard` — AgentGuard policy files

### Basic Structure

```
package agentguard.policies.<name>

# Default rule (applied when no explicit rule matches)
default allow = false

# Allow rules — any matching allow rule grants access
allow {
  <condition>
  <condition>
  ...
}

# Deny rules — any matching deny rule blocks access (deny overrides allow)
deny {
  <condition>
  <condition>
  ...
}

# Escalate rules — trigger escalation level change
escalate {
  <condition>
  <condition>
  ...
}
```

### Conditions

All conditions within a rule block are AND-ed. Multiple rule blocks of the same type are OR-ed.

```
# This allows file reads to src/ OR test reads anywhere
allow {
  input.action.class == "file"
  input.action.type == "file.read"
  glob.match("src/**", input.action.target)
}

allow {
  input.action.class == "test"
  input.action.type == "test.run"
}
```

### Input Object

The `input` object is available in all conditions:

```
input {
  action {
    class: string       # Action class (file, git, shell, etc.)
    type: string        # Full action type (file.read, git.push, etc.)
    target: string      # Target path, branch, command, etc.
    metadata: object    # Framework-specific metadata
  }
  agent {
    id: string          # Agent identifier
    name: string        # Agent display name
    capabilities: []    # Agent's capability tokens
    trust_level: string # Agent trust level
  }
  session {
    id: string          # Session identifier
    denials: number     # Count of denials in this session
    violations: number  # Count of invariant violations
    actions: number     # Count of total actions
  }
  monitor {
    level: string       # Current escalation level (NORMAL, ELEVATED, HIGH, LOCKDOWN)
  }
  environment {
    branch: string      # Current git branch
    time: number        # Current timestamp
    ci: boolean         # Running in CI environment
  }
}
```

## Language Features

### Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `==` | Equality | `input.action.class == "file"` |
| `!=` | Inequality | `input.action.type != "git.push"` |
| `<`, `>`, `<=`, `>=` | Comparison | `input.session.denials > 5` |
| `in` | Set membership | `input.action.target in ["main", "master"]` |
| `not` | Negation | `not input.agent.capabilities contains "git:push:*"` |
| `contains` | String/array contains | `input.agent.capabilities contains "file:read:*"` |
| `startswith` | String prefix | `input.action.target startswith "src/"` |
| `endswith` | String suffix | `input.action.target endswith ".env"` |
| `matches` | Regex match | `input.action.target matches "\\.(key|pem|crt)$"` |

### Built-in Functions

| Function | Description | Example |
|----------|-------------|---------|
| `glob.match(pattern, value)` | Glob pattern matching | `glob.match("src/**/*.ts", input.action.target)` |
| `time.now()` | Current Unix timestamp | `time.now() > 1700000000` |
| `time.hour()` | Current hour (0-23) | `time.hour() >= 9` and `time.hour() <= 17` |
| `time.weekday()` | Current day (0=Sun, 6=Sat) | `time.weekday() >= 1` and `time.weekday() <= 5` |
| `count(array)` | Array length | `count(input.session.denials) > 5` |
| `any(array, condition)` | Any element matches | `any(input.agent.capabilities, cap: cap startswith "git:")` |
| `all(array, condition)` | All elements match | `all(targets, t: glob.match("src/**", t))` |

## Examples

### Production Protection

```
package agentguard.policies.production

default allow = false

# Read-only access to all files
allow {
  input.action.type == "file.read"
}

# Write only to src/ and tests/
allow {
  input.action.type == "file.write"
  glob.match("src/**", input.action.target)
}

allow {
  input.action.type == "file.write"
  glob.match("tests/**", input.action.target)
}

# Allow test execution
allow {
  input.action.class == "test"
}

# Allow git commit and push to feature branches
allow {
  input.action.type == "git.commit"
}

allow {
  input.action.type == "git.push"
  input.action.target startswith "feature/"
}

# Deny push to protected branches
deny {
  input.action.type == "git.push"
  input.action.target in ["main", "master", "release/*"]
}

# Deny all deploys outside business hours
deny {
  input.action.class == "deploy"
  time.hour() < 9
}

deny {
  input.action.class == "deploy"
  time.hour() > 17
}

# Escalate on repeated denials
escalate {
  count(input.session.denials) > 5
  input.monitor.level < "LOCKDOWN"
}
```

### CI-Safe Policy

```
package agentguard.policies.ci

default allow = false

# Allow all reads
allow {
  input.action.type == "file.read"
}

# Allow test and build commands only
allow {
  input.action.class == "test"
}

allow {
  input.action.type == "shell.exec"
  input.action.target startswith "npm run"
}

# Deny any network egress
deny {
  input.action.class == "http"
}

# Deny any git push
deny {
  input.action.type == "git.push"
}
```

## Policy Testing Framework

### Test File Format

```
package agentguard.policies.production_test

import agentguard.policies.production

test_allow_file_read {
  production.allow with input as {
    "action": { "class": "file", "type": "file.read", "target": "src/index.ts" }
  }
}

test_deny_push_to_main {
  production.deny with input as {
    "action": { "class": "git", "type": "git.push", "target": "main" }
  }
}

test_deny_deploy_after_hours {
  production.deny with input as {
    "action": { "class": "deploy", "type": "deploy.trigger", "target": "production" },
    "environment": { "time": 1700000000 }
  } with time.hour() as 22
}
```

### Test Commands

```bash
agentguard policy test policies/*.guard       # Run all policy tests
agentguard policy test --coverage             # Show rule coverage report
agentguard policy test --regression old.guard  # Compare against baseline
```

### Coverage Reporting

- Which rules were evaluated (hit/miss)
- Which conditions within rules were tested
- Untested rules flagged as warnings
- Coverage percentage per policy file

## Migration from YAML

### Conversion Tool

```bash
agentguard policy convert agentguard.yaml --output policies/main.guard
```

The converter:
1. Parses existing YAML policy
2. Translates each `action_rule` to a `allow` or `deny` block
3. Maps scope patterns to `glob.match()` conditions
4. Maps branch conditions to `input.environment.branch` checks
5. Preserves comments as DSL comments

### Backward Compatibility

- YAML policies continue to work alongside `.guard` files
- Policy loader auto-detects format by extension
- `src/policy/loader.ts` routes `.yaml`/`.json` to existing loader, `.guard` to DSL compiler

## Implementation Architecture

```
src/policy/dsl/
├── parser.ts       # Tokenize and parse .guard files to AST
├── compiler.ts     # Compile AST to evaluation plan
├── runtime.ts      # Execute evaluation plan against action context
├── stdlib.ts       # Built-in functions (glob.match, time.now, etc.)
└── testing.ts      # Policy test runner and coverage reporter
```

### Compilation Pipeline

```
.guard source → Tokenizer → Parser → AST → Compiler → EvaluationPlan → Runtime
```

The `EvaluationPlan` is a serializable, optimized representation that:
- Pre-compiles regex and glob patterns
- Orders conditions for short-circuit evaluation
- Caches intermediate results within a session

## Key Files to Modify

| File | Change |
|------|--------|
| `src/policy/evaluator.ts` | Support DSL-compiled evaluation plans alongside YAML rules |
| `src/policy/loader.ts` | Detect `.guard` extension and route to DSL compiler |
| `src/cli/commands/policy.ts` | Add `policy compile`, `policy test`, `policy convert` subcommands |

## Verification

- DSL policies produce identical results to equivalent YAML on a test corpus
- Parser handles all language features (operators, functions, nested conditions)
- Coverage reporting accurately reflects rule evaluation
- YAML-to-DSL conversion produces equivalent policies
- Performance: compilation < 100ms for 1000-rule policy, evaluation < 1ms per action

## References

- [Open Policy Agent (OPA)](https://www.openpolicyagent.org/) — design inspiration
- [Unified Architecture](unified-architecture.md)
