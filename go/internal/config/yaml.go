// Package config provides YAML policy loading for AgentGuard.
package config

import (
	"fmt"

	"github.com/AgentGuardHQ/agentguard/go/internal/action"
	"gopkg.in/yaml.v3"
)

// LoadYamlPolicy parses YAML bytes into a LoadedPolicy.
// It handles both structured conditions and flattened condition fields
// at the rule level (target, branches, limit, requireTests, etc.).
func LoadYamlPolicy(data []byte) (*action.LoadedPolicy, error) {
	var raw struct {
		ID                 string            `yaml:"id"`
		Name               string            `yaml:"name"`
		Description        string            `yaml:"description"`
		Severity           int               `yaml:"severity"`
		Mode               string            `yaml:"mode"`
		Pack               string            `yaml:"pack"`
		Version            string            `yaml:"version"`
		InvariantModes     map[string]string `yaml:"invariantModes"`
		DisabledInvariants []string          `yaml:"disabledInvariants"`
		Rules              []action.PolicyRule `yaml:"rules"`
	}

	if err := yaml.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("yaml parse error: %w", err)
	}

	// Normalize flattened condition fields into Conditions struct
	for i := range raw.Rules {
		r := &raw.Rules[i]
		if r.Target != "" || len(r.Branches) > 0 || r.Limit > 0 ||
			r.RequireTests || r.RequireFormat || r.RequireWorktree {
			if r.Conditions == nil {
				r.Conditions = &action.RuleConditions{}
			}
			if r.Target != "" && len(r.Conditions.Scope) == 0 {
				r.Conditions.Scope = []string{r.Target}
			}
			if len(r.Branches) > 0 && len(r.Conditions.Branches) == 0 {
				r.Conditions.Branches = r.Branches
			}
			if r.Limit > 0 && r.Conditions.Limit == 0 {
				r.Conditions.Limit = r.Limit
			}
			if r.RequireTests {
				r.Conditions.RequireTests = true
			}
			if r.RequireFormat {
				r.Conditions.RequireFormat = true
			}
			if r.RequireWorktree {
				r.Conditions.RequireWorktree = true
			}
		}
	}

	return &action.LoadedPolicy{
		ID:                 raw.ID,
		Name:               raw.Name,
		Description:        raw.Description,
		Severity:           raw.Severity,
		Mode:               raw.Mode,
		Pack:               raw.Pack,
		Version:            raw.Version,
		InvariantModes:     raw.InvariantModes,
		DisabledInvariants: raw.DisabledInvariants,
		Rules:              raw.Rules,
	}, nil
}
