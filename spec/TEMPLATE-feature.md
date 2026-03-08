# Feature Spec: [Feature Name]

> Fill this template before writing any implementation code.
> Each section constrains what the builder agent can produce.

## Summary

One-paragraph description of what this feature does and why it exists.

## Requirements

- [ ] Requirement 1
- [ ] Requirement 2
- [ ] Requirement 3

## Events Produced

List canonical events this feature emits (from `domain/events.js`):

| Event Kind | When Emitted | Required Data |
|------------|-------------|---------------|
| `EVENT_NAME` | Description | `{ field1, field2 }` |

## Events Consumed

List canonical events this feature listens to:

| Event Kind | Reaction |
|------------|----------|
| `EVENT_NAME` | What happens when received |

## Interface Contract

```js
// Public API this module exposes
// Define function signatures, parameters, return types

/**
 * @param {Type} param - Description
 * @returns {Type} Description
 */
export function featureFunction(param) {}
```

## Dependencies

| Module | Why Needed |
|--------|-----------|
| `domain/events.js` | Event creation |

## Layer Placement

Which architectural layer does this belong in?

- [ ] `domain/` — Pure logic, no environment dependencies
- [ ] `core/` — Node.js CLI
- [ ] `game/` — Browser only
- [ ] `ecosystem/` — Shared content/data

## Constraints

- Must remain zero-dependency
- Must not exceed size budget impact of X bytes
- Must be deterministic when RNG is injected (if applicable)

## Verification

How to verify this feature works:

```bash
# Test command
npm test -- --grep "feature-name"

# Manual verification
npm run serve  # then do X in browser
```

## Open Questions

1. Question that needs resolution before implementation
