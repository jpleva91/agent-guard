// Package config provides embedded governance data and configuration loading.
package config

import (
	"embed"
	"encoding/json"
	"sync"
)

//go:embed data/*.json
var embeddedData embed.FS

// DestructivePattern represents a pattern that identifies destructive commands.
type DestructivePattern struct {
	Pattern     string `json:"pattern"`
	Flags       string `json:"flags,omitempty"`
	Description string `json:"description"`
	RiskLevel   string `json:"riskLevel"`
	Category    string `json:"category"`
}

// ActionPattern maps regex patterns to a canonical action type.
type ActionPattern struct {
	Patterns   []string `json:"patterns"`
	ActionType string   `json:"actionType"`
}

var (
	toolActionMap     map[string]string
	toolActionMapOnce sync.Once

	destructivePatterns     []DestructivePattern
	destructivePatternsOnce sync.Once

	gitPatterns     []ActionPattern
	gitPatternsOnce sync.Once

	githubPatterns     []ActionPattern
	githubPatternsOnce sync.Once
)

// ToolActionMap returns the mapping from tool names to canonical action types.
// The map is lazily loaded from embedded JSON on first access and cached.
func ToolActionMap() map[string]string {
	toolActionMapOnce.Do(func() {
		data, err := embeddedData.ReadFile("data/tool-action-map.json")
		if err != nil {
			toolActionMap = make(map[string]string)
			return
		}
		toolActionMap = make(map[string]string)
		json.Unmarshal(data, &toolActionMap)
	})
	return toolActionMap
}

// DestructivePatterns returns the list of patterns that identify destructive commands.
// The list is lazily loaded from embedded JSON on first access and cached.
func DestructivePatterns() []DestructivePattern {
	destructivePatternsOnce.Do(func() {
		data, err := embeddedData.ReadFile("data/destructive-patterns.json")
		if err != nil {
			return
		}
		json.Unmarshal(data, &destructivePatterns)
	})
	return destructivePatterns
}

// GitActionPatterns returns the patterns that map git commands to canonical action types.
// The list is lazily loaded from embedded JSON on first access and cached.
func GitActionPatterns() []ActionPattern {
	gitPatternsOnce.Do(func() {
		data, err := embeddedData.ReadFile("data/git-action-patterns.json")
		if err != nil {
			return
		}
		json.Unmarshal(data, &gitPatterns)
	})
	return gitPatterns
}

// GithubActionPatterns returns the patterns that map GitHub CLI commands to canonical action types.
// The list is lazily loaded from embedded JSON on first access and cached.
func GithubActionPatterns() []ActionPattern {
	githubPatternsOnce.Do(func() {
		data, err := embeddedData.ReadFile("data/github-action-patterns.json")
		if err != nil {
			return
		}
		json.Unmarshal(data, &githubPatterns)
	})
	return githubPatterns
}
