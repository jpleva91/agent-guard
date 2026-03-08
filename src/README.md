# BugMon TypeScript System

A lightweight CLI system that detects software bugs and converts them into roguelike game encounters.

## Architecture

BugMon follows a strict event-driven architecture. Every module communicates through a strongly typed event bus — no direct coupling between systems.

```
┌─────────────┐     ┌───────────┐     ┌────────────┐     ┌─────────────┐
│   Watchers   │────▶│ Event Bus │────▶│ Bug Engine  │────▶│ Game Engine  │
│ (detection)  │     │ (backbone)│     │ (lifecycle) │     │ (encounters) │
└─────────────┘     └───────────┘     └────────────┘     └─────────────┘
  console              BugDetected       MonsterSpawned      battle
  test                 BugResolved       MonsterDefeated     victory
  build                PlayerDamage      BugAnalyzed         defeat
```

## Event Flow

1. **Watchers** observe the development environment (console errors, test failures, build errors)
2. Watchers emit `BugDetected` events on the **Event Bus**
3. The **Bug Engine** receives events, registers bugs, and emits `MonsterSpawned`
4. The **Game Engine** receives monster events and manages encounters
5. When bugs are resolved, `MonsterDefeated` is emitted with XP rewards

## Module Responsibilities

| Module | Path | Purpose |
|--------|------|---------|
| **Types** | `src/core/types.ts` | All shared type definitions |
| **EventBus** | `src/core/event-bus.ts` | Strongly typed pub/sub backbone |
| **BugRegistry** | `src/core/bug-registry.ts` | In-memory bug storage |
| **BugEngine** | `src/core/bug-engine.ts` | Bug lifecycle management |
| **ConsoleWatcher** | `src/watchers/console-watcher.ts` | Runtime error detection |
| **TestWatcher** | `src/watchers/test-watcher.ts` | Test failure detection |
| **BuildWatcher** | `src/watchers/build-watcher.ts` | Build error detection |
| **GameEngine** | `src/game/engine.ts` | Game state machine & combat |
| **Renderer** | `src/game/renderer.ts` | HTML5 Canvas 2D rendering |
| **GameLoop** | `src/game/loop.ts` | requestAnimationFrame loop |
| **AI Interface** | `src/ai/bug-analysis-interface.ts` | Provider-agnostic AI contracts |
| **CLI** | `src/cli/index.ts` | Commander-based CLI entry point |

## Getting Started

```bash
# Install dependencies
pnpm install

# Type check
pnpm run ts:check

# Run tests
pnpm run ts:test

# CLI commands
pnpm exec tsx src/cli/index.ts watch        # Start watchers
pnpm exec tsx src/cli/index.ts demo         # Run demo encounter
pnpm exec tsx src/cli/index.ts status       # Show status
```

## Extension Points

### Custom Watchers

Implement the `Watcher` interface from `src/core/types.ts`:

```typescript
import type { Watcher, EventMap } from './core/types';
import type { EventBus } from './core/event-bus';

class MyWatcher implements Watcher {
  constructor(private eventBus: EventBus<EventMap>) {}

  start() {
    // Observe your source, emit BugDetected events
    this.eventBus.emit('BugDetected', { bug: { ... } });
  }

  stop() { /* cleanup */ }
}
```

### AI Analyzers

Implement the `BugAnalyzer` interface:

```typescript
import type { BugAnalyzer, BugEvent, BugAnalysis } from './core/types';

class MyAIAnalyzer implements BugAnalyzer {
  async analyzeBug(bug: BugEvent): Promise<BugAnalysis> {
    // Call your AI provider
    return { suggestedFix: '...', confidence: 0.9, category: '...', relatedPatterns: [] };
  }
}
```

## Design Principles

- **Deterministic**: All core logic is pure and deterministic (RNG injected)
- **No global state**: All state lives in class instances, wired at startup
- **Dependency injection**: Constructors accept dependencies, never import singletons
- **Small functions**: Each function does one thing
- **Strong typing**: Full TypeScript strict mode, discriminated unions for events
- **AI-friendly**: Explicit contracts, small modules, predictable patterns
