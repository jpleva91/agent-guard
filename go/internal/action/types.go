// Package action defines the core types for the AgentGuard governed action kernel.
package action

import (
	"fmt"

	"gopkg.in/yaml.v3"
)

// StringOrSlice handles YAML fields that can be either a string or []string.
// In YAML policy files, `action: git.push` and `action: [git.push, git.commit]`
// are both valid; this type handles both forms transparently.
type StringOrSlice []string

// UnmarshalYAML implements yaml.Unmarshaler for StringOrSlice.
func (s *StringOrSlice) UnmarshalYAML(value *yaml.Node) error {
	switch value.Kind {
	case yaml.ScalarNode:
		*s = StringOrSlice{value.Value}
		return nil
	case yaml.SequenceNode:
		var slice []string
		if err := value.Decode(&slice); err != nil {
			return fmt.Errorf("StringOrSlice: failed to decode sequence: %w", err)
		}
		*s = StringOrSlice(slice)
		return nil
	default:
		return fmt.Errorf("StringOrSlice: expected string or sequence, got %v", value.Kind)
	}
}

// ActionContext is the vendor-neutral action representation (KE-2).
// This is the canonical type that flows through the kernel pipeline:
// propose -> normalize -> evaluate -> execute -> emit.
type ActionContext struct {
	Action      string          `json:"action"`
	ActionClass string          `json:"actionClass"`
	Target      string          `json:"target"`
	Actor       ActorIdentity   `json:"actor"`
	Args        ActionArguments `json:"args"`
	Destructive bool            `json:"destructive"`
	Source      string          `json:"source"`
	NormalizedAt int64          `json:"normalizedAt"`

	// NormalizedIntent-compatible fields
	Agent         string         `json:"agent"`
	Branch        string         `json:"branch,omitempty"`
	Command       string         `json:"command,omitempty"`
	FilesAffected int            `json:"filesAffected,omitempty"`
	Metadata      map[string]any `json:"metadata,omitempty"`
	Persona       *AgentPersona  `json:"persona,omitempty"`
}

// ActorIdentity identifies the agent performing an action.
type ActorIdentity struct {
	AgentID    string        `json:"agentId"`
	SessionID  string        `json:"sessionId,omitempty"`
	InWorktree bool          `json:"inWorktree,omitempty"`
	Persona    *AgentPersona `json:"persona,omitempty"`
}

// ActionArguments carries the tool-specific parameters of an action.
type ActionArguments struct {
	FilePath      string         `json:"filePath,omitempty"`
	Command       string         `json:"command,omitempty"`
	Branch        string         `json:"branch,omitempty"`
	Content       string         `json:"content,omitempty"`
	FilesAffected int            `json:"filesAffected,omitempty"`
	Metadata      map[string]any `json:"metadata,omitempty"`
}

// AgentPersona describes the trust and role attributes of an agent.
type AgentPersona struct {
	TrustTier     string   `json:"trustTier,omitempty" yaml:"trustTier,omitempty"`
	Autonomy      string   `json:"autonomy,omitempty" yaml:"autonomy,omitempty"`
	RiskTolerance string   `json:"riskTolerance,omitempty" yaml:"riskTolerance,omitempty"`
	Role          string   `json:"role,omitempty" yaml:"role,omitempty"`
	Tags          []string `json:"tags,omitempty" yaml:"tags,omitempty"`
}

// PolicyRule represents a single rule in an agentguard.yaml policy.
type PolicyRule struct {
	Action           StringOrSlice   `json:"action" yaml:"action"`
	Effect           string          `json:"effect" yaml:"effect"`
	Conditions       *RuleConditions `json:"conditions,omitempty" yaml:"conditions,omitempty"`
	Reason           string          `json:"reason,omitempty" yaml:"reason,omitempty"`
	Suggestion       string          `json:"suggestion,omitempty" yaml:"suggestion,omitempty"`
	CorrectedCommand string          `json:"correctedCommand,omitempty" yaml:"correctedCommand,omitempty"`
	Intervention     string          `json:"intervention,omitempty" yaml:"intervention,omitempty"`

	// Flattened condition fields (YAML allows these at rule level)
	Target          string   `json:"-" yaml:"target,omitempty"`
	Branches        []string `json:"-" yaml:"branches,omitempty"`
	Limit           int      `json:"-" yaml:"limit,omitempty"`
	RequireTests    bool     `json:"-" yaml:"requireTests,omitempty"`
	RequireFormat   bool     `json:"-" yaml:"requireFormat,omitempty"`
	RequireWorktree bool     `json:"-" yaml:"requireWorktree,omitempty"`
}

// RuleConditions holds the structured conditions for a policy rule.
type RuleConditions struct {
	Scope           []string           `json:"scope,omitempty" yaml:"scope,omitempty"`
	Limit           int                `json:"limit,omitempty" yaml:"limit,omitempty"`
	Branches        []string           `json:"branches,omitempty" yaml:"branches,omitempty"`
	RequireTests    bool               `json:"requireTests,omitempty" yaml:"requireTests,omitempty"`
	RequireFormat   bool               `json:"requireFormat,omitempty" yaml:"requireFormat,omitempty"`
	RequireWorktree bool               `json:"requireWorktree,omitempty" yaml:"requireWorktree,omitempty"`
	Persona         *PersonaCondition  `json:"persona,omitempty" yaml:"persona,omitempty"`
	Forecast        *ForecastCondition `json:"forecast,omitempty" yaml:"forecast,omitempty"`
}

// PersonaCondition matches rules against agent persona attributes.
type PersonaCondition struct {
	TrustTier     []string `json:"trustTier,omitempty" yaml:"trustTier,omitempty"`
	Role          []string `json:"role,omitempty" yaml:"role,omitempty"`
	Autonomy      []string `json:"autonomy,omitempty" yaml:"autonomy,omitempty"`
	RiskTolerance []string `json:"riskTolerance,omitempty" yaml:"riskTolerance,omitempty"`
	Tags          []string `json:"tags,omitempty" yaml:"tags,omitempty"`
}

// ForecastCondition matches rules against simulation forecast results.
type ForecastCondition struct {
	TestRiskScore      float64  `json:"testRiskScore,omitempty" yaml:"testRiskScore,omitempty"`
	BlastRadiusScore   float64  `json:"blastRadiusScore,omitempty" yaml:"blastRadiusScore,omitempty"`
	RiskLevel          []string `json:"riskLevel,omitempty" yaml:"riskLevel,omitempty"`
	PredictedFileCount int      `json:"predictedFileCount,omitempty" yaml:"predictedFileCount,omitempty"`
	DependencyCount    int      `json:"dependencyCount,omitempty" yaml:"dependencyCount,omitempty"`
}

// LoadedPolicy is a fully parsed policy file.
type LoadedPolicy struct {
	ID                 string            `json:"id" yaml:"id"`
	Name               string            `json:"name" yaml:"name"`
	Description        string            `json:"description,omitempty" yaml:"description,omitempty"`
	Rules              []PolicyRule      `json:"rules" yaml:"rules"`
	Severity           int               `json:"severity" yaml:"severity"`
	Mode               string            `json:"mode,omitempty" yaml:"mode,omitempty"`
	InvariantModes     map[string]string `json:"invariantModes,omitempty" yaml:"invariantModes,omitempty"`
	Pack               string            `json:"pack,omitempty" yaml:"pack,omitempty"`
	DisabledInvariants []string          `json:"disabledInvariants,omitempty" yaml:"disabledInvariants,omitempty"`
	Version            string            `json:"version,omitempty" yaml:"version,omitempty"`
}

// EvalResult is the output of policy evaluation.
type EvalResult struct {
	Allowed          bool          `json:"allowed"`
	Decision         string        `json:"decision"`
	MatchedRule      *PolicyRule   `json:"matchedRule,omitempty"`
	MatchedPolicy    *LoadedPolicy `json:"matchedPolicy,omitempty"`
	Reason           string        `json:"reason"`
	Severity         int           `json:"severity"`
	Suggestion       string        `json:"suggestion,omitempty"`
	CorrectedCommand string        `json:"correctedCommand,omitempty"`
	Intervention     string        `json:"intervention,omitempty"`
}

// Suggestion is a corrective suggestion for denied actions.
type Suggestion struct {
	Message          string `json:"message"`
	CorrectedCommand string `json:"correctedCommand,omitempty"`
}

// RawAction is the input from a tool call (before normalization).
type RawAction struct {
	Tool          string         `json:"tool,omitempty"`
	Command       string         `json:"command,omitempty"`
	File          string         `json:"file,omitempty"`
	Target        string         `json:"target,omitempty"`
	Content       string         `json:"content,omitempty"`
	Branch        string         `json:"branch,omitempty"`
	Agent         string         `json:"agent,omitempty"`
	FilesAffected int            `json:"filesAffected,omitempty"`
	Metadata      map[string]any `json:"metadata,omitempty"`
}
