# Interface Contract: [Module Name]

> Define module boundaries before implementation.
> This contract is the source of truth for what the module exposes.

## Module

- **Path**: `layer/module-name.js`
- **Layer**: domain | core | game | ecosystem
- **Environment**: universal | node-only | browser-only

## Exports

```js
/**
 * Brief description.
 * @param {Type} param - Description
 * @returns {Type} Description
 */
export function functionName(param) {}

/**
 * Brief description.
 */
export const CONSTANT_NAME = 'value';
```

## Types

```ts
// TypeScript-style type definitions for documentation
// (actual implementation is vanilla JS with JSDoc)

interface InputType {
  field: string;
  optional?: number;
}

interface OutputType {
  result: boolean;
  data: unknown;
}
```

## Events

### Emits
- `EVENT_KIND` — when condition is met

### Listens
- `EVENT_KIND` — reacts by doing X

## Invariants

1. This module never does X
2. Output is always Y when input is Z
3. Pure function — no side effects (if applicable)

## Dependencies

- `domain/events.js` — event factory
- (list all imports)

## Anti-Dependencies

This module must NOT import from:
- `game/` (if in domain layer)
- `core/` (if in domain layer)
- Any Node.js built-in (if universal)
