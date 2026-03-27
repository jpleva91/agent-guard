package simulation

import (
	"fmt"
	"math"
	"strings"

	"github.com/AgentGuardHQ/agentguard/go/internal/action"
)

// Registry holds registered simulators and routes actions to them.
type Registry struct {
	simulators []Simulator
}

// NewDefaultRegistry creates a registry with the three built-in simulators:
// FilesystemSimulator, GitSimulator, and PackageSimulator.
func NewDefaultRegistry() *Registry {
	return &Registry{
		simulators: []Simulator{
			&FilesystemSimulator{},
			&GitSimulator{},
			&PackageSimulator{},
		},
	}
}

// NewRegistry creates an empty registry.
func NewRegistry() *Registry {
	return &Registry{}
}

// Register adds a simulator to the registry.
func (r *Registry) Register(sim Simulator) {
	r.simulators = append(r.simulators, sim)
}

// SimulateAll runs all registered simulators against the action context,
// aggregates the impacts, computes a risk score, and returns a Forecast.
func (r *Registry) SimulateAll(ctx action.ActionContext) Forecast {
	var allImpacts []Impact
	var warnings []string

	for _, sim := range r.simulators {
		impacts, err := sim.Simulate(ctx)
		if err != nil {
			warnings = append(warnings, fmt.Sprintf("Simulator error: %v", err))
			continue
		}
		if impacts != nil {
			allImpacts = append(allImpacts, impacts...)
		}
	}

	riskScore := computeRiskScore(allImpacts)
	warnings = append(warnings, generateWarnings(allImpacts, ctx)...)
	summary := buildSummary(allImpacts, riskScore)

	return Forecast{
		Impacts:   allImpacts,
		RiskScore: riskScore,
		Summary:   summary,
		Warnings:  warnings,
	}
}

// BuildForecast is a convenience function that creates a default registry
// and runs all simulators against the action context.
func BuildForecast(ctx action.ActionContext) Forecast {
	return NewDefaultRegistry().SimulateAll(ctx)
}

// computeRiskScore calculates a 0.0–1.0 risk score from the set of impacts.
// The score is the maximum severity mapped to a numeric value, with a small
// additive factor for impact count.
func computeRiskScore(impacts []Impact) float64 {
	if len(impacts) == 0 {
		return 0.0
	}

	maxSev := 0.0
	for _, imp := range impacts {
		sev := severityToScore(imp.Severity)
		if sev > maxSev {
			maxSev = sev
		}
	}

	// Add a small factor for the number of impacts (more impacts = slightly higher risk)
	countFactor := math.Min(0.2, float64(len(impacts))*0.02)

	return math.Min(1.0, maxSev+countFactor)
}

// severityToScore maps severity strings to numeric values.
func severityToScore(severity string) float64 {
	switch severity {
	case SeverityNone:
		return 0.0
	case SeverityLow:
		return 0.2
	case SeverityMedium:
		return 0.4
	case SeverityHigh:
		return 0.7
	case SeverityCritical:
		return 0.9
	default:
		return 0.3
	}
}

// generateWarnings produces human-readable warnings for notable risk patterns.
func generateWarnings(impacts []Impact, ctx action.ActionContext) []string {
	var warnings []string

	for _, imp := range impacts {
		if !imp.Reversible {
			warnings = append(warnings, fmt.Sprintf("Irreversible: %s", imp.Description))
		}
		if imp.Severity == SeverityCritical {
			warnings = append(warnings, fmt.Sprintf("Critical impact: %s", imp.Description))
		}
	}

	// Warn about destructive actions
	if ctx.Destructive {
		warnings = append(warnings, "Action is marked as destructive")
	}

	// Warn about protected branch operations
	branch := ctx.Branch
	if branch == "main" || branch == "master" || branch == "release" {
		hasGit := false
		for _, imp := range impacts {
			if imp.Type == TypeGit {
				hasGit = true
				break
			}
		}
		if hasGit {
			warnings = append(warnings, fmt.Sprintf("Operation targets protected branch: %s", branch))
		}
	}

	return warnings
}

// buildSummary creates a human-readable summary of the forecast.
func buildSummary(impacts []Impact, riskScore float64) string {
	if len(impacts) == 0 {
		return "No predicted impacts"
	}

	// Count by type
	typeCounts := make(map[string]int)
	for _, imp := range impacts {
		typeCounts[imp.Type]++
	}

	var parts []string
	for typ, count := range typeCounts {
		parts = append(parts, fmt.Sprintf("%d %s", count, typ))
	}

	level := "low"
	if riskScore >= 0.7 {
		level = "high"
	} else if riskScore >= 0.4 {
		level = "medium"
	}

	return fmt.Sprintf("%d impact(s) predicted (%s) — risk: %s",
		len(impacts), strings.Join(parts, ", "), level)
}
