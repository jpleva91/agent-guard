// Package invariant provides the invariant evaluation engine.
// The Checker runs all enabled invariants against a proposed action and
// returns the list of failures. Invariants are hard safety boundaries
// that apply independently of policy rules.
package invariant

import "fmt"

// Checker evaluates invariants against proposed actions.
// It holds the set of registered invariant definitions and a set of disabled IDs.
type Checker struct {
	invariants []InvariantDef
	disabled   map[InvariantID]bool
}

// NewChecker creates a Checker with all 22 default invariants minus the disabled set.
// Pass nil or an empty slice to enable all invariants.
func NewChecker(disabled []InvariantID) *Checker {
	disabledSet := make(map[InvariantID]bool, len(disabled))
	for _, id := range disabled {
		disabledSet[id] = true
	}

	var enabled []InvariantDef
	for _, def := range DefaultInvariants() {
		if !disabledSet[def.ID] {
			enabled = append(enabled, def)
		}
	}

	return &Checker{
		invariants: enabled,
		disabled:   disabledSet,
	}
}

// Check runs all enabled invariants and returns the list of failures.
// A nil or empty return means all invariants passed.
func (c *Checker) Check(ctx CheckContext) []InvariantResult {
	var failures []InvariantResult
	for _, def := range c.invariants {
		result := def.Check(ctx)
		// Ensure the result carries the correct ID and severity from the definition
		result.ID = def.ID
		result.Severity = def.Severity
		if !result.Passed {
			failures = append(failures, result)
		}
	}
	return failures
}

// CheckAll runs all enabled invariants and returns every result (pass and fail).
func (c *Checker) CheckAll(ctx CheckContext) []InvariantResult {
	results := make([]InvariantResult, 0, len(c.invariants))
	for _, def := range c.invariants {
		result := def.Check(ctx)
		result.ID = def.ID
		result.Severity = def.Severity
		results = append(results, result)
	}
	return results
}

// CheckOne runs a single invariant by ID and returns its result.
// Returns an error if the invariant ID is not found or is disabled.
func (c *Checker) CheckOne(id InvariantID, ctx CheckContext) (InvariantResult, error) {
	if c.disabled[id] {
		return InvariantResult{}, fmt.Errorf("invariant %q is disabled", id)
	}

	for _, def := range c.invariants {
		if def.ID == id {
			result := def.Check(ctx)
			result.ID = def.ID
			result.Severity = def.Severity
			return result, nil
		}
	}

	return InvariantResult{}, fmt.Errorf("invariant %q not found", id)
}

// EnabledCount returns the number of enabled invariants.
func (c *Checker) EnabledCount() int {
	return len(c.invariants)
}

// IsDisabled returns true if the given invariant ID is disabled.
func (c *Checker) IsDisabled(id InvariantID) bool {
	return c.disabled[id]
}
