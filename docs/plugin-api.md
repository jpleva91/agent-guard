# Plugin API

The system supports extension through five plugin categories: event sources, content packs, renderers, policy packs, and replay processors. Each category has a defined contract and integration point.

## Plugin Categories

### 1. Event Sources

Event sources feed raw signals into the normalization pipeline. Any system that produces error output, failure notifications, or action traces can be an event source.

**Contract:** An event source must implement `{ name, start(onRawSignal), stop() }`. The `onRawSignal(rawText)` callback feeds raw text into the ingestion pipeline.

**Implementation:** `domain/source-registry.js` — the `SourceRegistry` class manages source lifecycle.

**Quick Start:**

```javascript
import { SourceRegistry } from '../domain/source-registry.js';
import { EventBus } from '../domain/event-bus.js';
import { ingest } from '../domain/ingestion/pipeline.js';

const registry = new SourceRegistry({ eventBus: new EventBus(), ingest });

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
| stderr (watch mode) | Watch source | `core/sources/watch-source.js` |
| Claude Code errors | Claude hook source | `core/sources/claude-hook-source.js` |
| Project scan | Scan source | `core/sources/scan-source.js` |

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

### 2. Content Packs

Content packs add new BugMon creatures, moves, evolution chains, and type matchups to the game. The existing community submission workflow is the first content pack system.

**Contract:** Content packs provide JSON data conforming to the existing data schemas (see [ARCHITECTURE.md](../ARCHITECTURE.md) for schema definitions).

**Integration point:** Add entries to `ecosystem/data/` JSON files. Run `npm run sync-data` to regenerate JS modules.

**Built-in content:**
- 31 BugMon creatures (`ecosystem/data/monsters.json`)
- 72 moves (`ecosystem/data/moves.json`)
- 7 types with effectiveness chart (`ecosystem/data/types.json`)
- 7 evolution chains with 10 evolved forms (`ecosystem/data/evolutions.json`)

**Community submission workflow:**
1. Open a GitHub Issue using the BugMon submission template
2. Automated validation checks schema, stat ranges, and move references
3. Battle preview bot generates matchup analysis
4. Maintainer approval triggers automatic PR creation
5. Merge adds the BugMon to the game

**Planned content pack features:**
| Feature | Description |
|---------|-------------|
| Governance BugMon | Creatures themed around agent governance violations |
| Environment-specific packs | Different BugMon for Python, Go, Rust ecosystems |
| Boss content packs | Custom boss encounters with unique mechanics |
| Achievement packs | New achievement sets tied to specific error types |

### 3. Renderers

Renderers subscribe to events and display encounters, battles, and progression to the developer.

**Contract:** A renderer subscribes to EventBus events and presents the appropriate UI for each event type.

**Integration point:** Subscribe to events via `domain/event-bus.js`.

**Built-in renderers:**
| Renderer | Platform | Path |
|----------|----------|------|
| Terminal (ANSI) | CLI / terminal | `core/cli/renderer.js`, `core/cli/encounter.js` |
| Browser (Canvas 2D) | Web browser | `game/` directory |

**Planned renderers:**
| Renderer | Platform |
|----------|----------|
| Mobile | Mobile web (responsive Canvas) |
| VS Code sidebar | VS Code extension webview |
| JetBrains tool window | IntelliJ/WebStorm plugin |
| Minimal / headless | CI environments (text-only output) |

**Implementing a custom renderer:**

```javascript
import { EventBus } from '../domain/event-bus.js';
import { Events } from '../domain/events.js';

const bus = new EventBus();

// Subscribe to encounter events
bus.on(Events.ENCOUNTER_STARTED, (event) => {
  // Render encounter UI
});

bus.on(Events.MOVE_USED, (event) => {
  // Render battle action
});

bus.on(Events.BATTLE_ENDED, (event) => {
  // Render battle result
});
```

### 4. Policy Packs

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

### 5. Replay Processors

Replay processors transform event streams for analysis, visualization, or testing.

**Contract:** A replay processor takes an ordered event stream as input and produces a transformed output.

**Integration point:** Consumes persisted event streams from the event store.

**Planned replay processors:**
| Processor | Description |
|-----------|-------------|
| Session summarizer | Aggregate session events into a summary report |
| Difficulty analyzer | Compute difficulty curve across a session |
| Error pattern detector | Identify recurring error patterns across sessions |
| Encounter replayer | Regenerate encounters from stored events for testing |
| Governance auditor | Extract and format governance decisions for review |

## Extension Guidelines

1. **Zero runtime dependencies.** Plugins must not introduce runtime dependencies. This is a hard constraint inherited from the project's architecture.

2. **Event-driven integration.** Plugins communicate through the EventBus. No direct function calls between plugins and core systems.

3. **Schema compliance.** Content packs must conform to existing JSON schemas. The validation workflow enforces this for community submissions.

4. **Deterministic behavior.** Policy packs and replay processors must be deterministic. Given the same input, they must produce the same output.

5. **Independent operation.** Each plugin must work in isolation. Removing a plugin must not break the core system or other plugins.
