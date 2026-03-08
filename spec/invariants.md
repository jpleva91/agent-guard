# System Invariants

These are structural guarantees that must never be violated. Agents and contributors must preserve all invariants when making changes.

## Layer Boundary Invariants

1. **Domain purity.** Functions in `domain/` must have no side effects, no DOM access, and no Node.js-specific APIs. All randomness is injected, never global.

2. **No cross-layer imports.** `core/` (Node.js) and `game/` (browser) must never import from each other. Both may import from `domain/` and `ecosystem/`.

3. **Ecosystem neutrality.** `ecosystem/` must not import from `core/` or `game/`. It provides shared content consumed by both environments.

## Event Model Invariants

4. **Event schema validity.** Every event must have a `kind` from the canonical `ALL_EVENT_KINDS` set and all required fields for that kind.

5. **Fingerprint stability.** The same error (type + message + file + line) must always produce the same fingerprint. Deduplication depends on this.

6. **Events are append-only.** Events are never modified after creation, except for the `resolved` flag. Event ordering is immutable.

7. **Event IDs are unique.** Within a session, no two events share the same ID.

8. **EventBus delivery order.** All subscribed listeners receive events in registration order. Listener exceptions must not prevent other listeners from firing.

## Battle Invariants

9. **Turn order determinism.** Turn order is determined solely by speed. Ties always go to the player. Turn order never changes mid-battle.

10. **Damage calculation purity.** `calcDamage()` is pure: same attacker/defender/move/rng always produces the same damage. Formula: `(power + attack - floor(defense/2) + random(1-3)) * typeMultiplier`.

11. **HP bounds.** `currentHP` is always in `[0, maxHP]`. Healing cannot exceed max HP. Damage cannot produce negative HP.

12. **Type effectiveness values.** Valid multipliers are 0.5x (not effective), 1.0x (neutral), 1.5x (super effective). Missing entries default to 1.0x.

## Progression Invariants

13. **Evolution eligibility.** A monster can only evolve if it has `evolvesTo` in its definition. Evolution requires the event count threshold to be met.

14. **Evolution atomicity.** Once triggered, evolution is committed fully. No partial evolution state.

## Encounter Invariants

15. **Encounter location constraint.** Encounters only trigger on tile type 2 (tall grass) at a fixed 10% probability per step.

16. **Rarity-weighted selection.** Enemy selection uses a deterministic roulette wheel algorithm with rarity weights.

## Severity Invariants

17. **Severity determinism.** An error type always maps to the same severity level (1-5). This mapping is static.

18. **Severity-to-gameplay mapping.** Severity 1-2: auto-resolve. Severity 3: standard encounter. Severity 4: boss. Severity 5: elite boss.

## Zero-Dependency Invariant

19. **No runtime dependencies.** The project has zero production dependencies. Build tools (esbuild, terser) are dev-only.
