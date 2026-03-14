# Plugin API

The system supports extension through four plugin categories: event sources, renderers, policy packs, and replay processors. Each category has a defined contract and integration point.

## Plugin Categories

### 1. Event Sources

Event sources feed raw signals into the normalization pipeline. Any system that produces error output, failure notifications, or action traces can be an event source.

**Contract:** An event source must implement `{ name, start(onRawSignal), stop() }`. The `onRawSignal(rawText)` callback feeds raw text into the ingestion pipeline.

**Implementation:** `packages/plugins/src/registry.ts` — the plugin registry manages source lifecycle.

**Quick Start:**

```typescript
import { EventBus } from '@red-codes/events';

const bus = new EventBus();

registry.register({
  name: 'my-custom-source',
  start(onRawSignal) {
    // onRawSignal(rawText) feeds into the pipeline
  },
  stop() {},
});

registry.start();
```

**Built-in sources:**
| Source | Adapter | Path |
|--------|---------|------|
| stderr (watch mode) | Watch source | `packages/adapters/src/` |
| Claude Code errors | Claude hook source | `packages/adapters/src/claude-code.ts` |
| Project scan | Scan source | `packages/plugins/src/discovery.ts` |

**SourceRegistry API:**

| Method | Description |
|--------|-------------|
| `register(config)` | Register a source. Returns an unregister function. |
| `start(name?)` | Start one source by name, or all if omitted. |
| `stop(name?)` | Stop one source by name, or all if omitted. |
| `list()` | Returns `[{ name, running, meta }]` for all sources. |
| `unregister(name)` | Remove a source. Stops it first if running. |

**Planned sources:**
| Source | Description |
|--------|-------------|
| GitHub Actions webhook | CI pipeline failure events |
| ESLint daemon | Real-time lint error streaming |
| Jest watch mode | Test failure events as they occur |
| Sentry webhook | Production error events |
| AgentGuard AAB | Governance violation events |
| VS Code diagnostics | Editor error interception |

**Implementing a custom event source:**

```javascript
// Example: GitHub Actions webhook source
export function createGitHubActionsSource(options) {
  let server = null;

  return {
    name: 'github-actions',

    start(onRawSignal) {
      // Start a webhook listener
      // When a workflow fails, call:
      // onRawSignal(failureOutput)
    },

    stop() {
      if (server) server.close();
    },

    meta: {
      description: 'Receives CI failure events from GitHub Actions webhooks',
    },
  };
}
```

### 2. Renderers

Renderers subscribe to governance events and present them to the developer in real time.

**Contract:** A renderer subscribes to EventBus events and presents the appropriate output for each event type.

**Integration point:** Subscribe to events via `@red-codes/events` (`EventBus`).

**Built-in renderers:**
| Renderer | Platform | Path |
|----------|----------|------|
| TUI renderer | CLI / terminal | `packages/renderers/src/tui-renderer.ts` |
| JSONL sink | Persistence | `packages/events/src/jsonl.ts` |

**Planned renderers:**
| Renderer | Platform |
|----------|----------|
| VS Code sidebar | VS Code extension webview |
| JetBrains tool window | IntelliJ/WebStorm plugin |
| Minimal / headless | CI environments (text-only output) |

**Implementing a custom renderer:**

```typescript
import { EventBus } from '@red-codes/events';
import { EventKind } from '@red-codes/events';

const bus = new EventBus();

// Subscribe to governance events
bus.on(EventKind.ACTION_REQUESTED, (event) => {
  // Display action proposal
});

bus.on(EventKind.ACTION_DENIED, (event) => {
  // Display denial with reason
});

bus.on(EventKind.ACTION_EXECUTED, (event) => {
  // Display execution result
});
```

### 3. Policy Packs

Policy packs define governance rules for AgentGuard. Each pack declares what actions are allowed, denied, or constrained for specific agent scopes.

**Contract:** A policy pack provides declarative policy definitions that AgentGuard evaluates deterministically.

**Integration point:** Loaded by the AgentGuard policy loader (planned).

**Planned policy packs:**
| Pack | Description |
|------|-------------|
| Default | Basic file scope, no force-push, no secret commits |
| Documentation-only | Agent limited to `.md` files and `docs/` directory |
| Test-safe | Agent can only modify test files and run tests |
| CI-aware | Agent can trigger CI but not modify CI config |
| Production-guard | Prevents modifications to production config and deployment files |

**Policy definition format (target):**

```yaml
policy:
  name: "test-safe"
  version: "1.0"
  scope:
    include:
      - "tests/**"
      - "**/*.test.js"
      - "**/*.spec.js"
    exclude:
      - "tests/fixtures/production/**"
  permissions:
    file_create: allow
    file_edit: allow
    file_delete: deny
    git_commit: allow
    git_push: deny
    ci_trigger: allow
  limits:
    max_files_per_action: 20
    max_lines_changed: 1000
  invariants:
    - "test_suite_passes_after_change"
```

### 4. Replay Processors

Replay processors transform event streams for analysis, visualization, or testing.

**Contract:** A replay processor takes an ordered event stream as input and produces a transformed output.

**Integration point:** Consumes persisted event streams from the event store.

**Planned replay processors:**
| Processor | Description |
|-----------|-------------|
| Session summarizer | Aggregate session events into a summary report |
| Error pattern detector | Identify recurring error patterns across sessions |
| Governance auditor | Extract and format governance decisions for review |

## Extension Guidelines

1. **Zero runtime dependencies.** Plugins must not introduce runtime dependencies. This is a hard constraint inherited from the project's architecture.

2. **Event-driven integration.** Plugins communicate through the EventBus. No direct function calls between plugins and core systems.

3. **Schema compliance.** Plugins must conform to existing event and policy schemas.

4. **Deterministic behavior.** Policy packs and replay processors must be deterministic. Given the same input, they must produce the same output.

5. **Independent operation.** Each plugin must work in isolation. Removing a plugin must not break the core system or other plugins.
