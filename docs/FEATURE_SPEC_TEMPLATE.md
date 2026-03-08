# Feature: [Name]

## Purpose

One sentence: what does this feature do and why is it needed.

## Contracts

Which modules are affected? List any new exports, shapes, or contract entries.

- **New shapes** (add to `domain/shapes.js`):
- **New contracts** (add to `domain/contracts.js`):
- **Modified modules**:

## Invariants

What must always be true after this feature is implemented?

- [ ] Invariant 1
- [ ] Invariant 2

## Data Changes

Any changes to `ecosystem/data/*.json`? New fields? New entries?
If yes, run `npm run sync-data` after changes.

## Verification

How do you know it works? List test files, commands, and expected outcomes.

```bash
npm test                    # All tests pass
npm run contracts:check     # Contract verification passes
npm run lint                # No lint errors
```
