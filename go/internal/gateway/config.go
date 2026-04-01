// Package gateway implements an MCP-to-MCP governance proxy that intercepts
// tool calls between agents and MCP tool servers, evaluating each call
// through the AgentGuard Go kernel.
package gateway

import (
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

// GatewayConfig is the top-level configuration for the MCP gateway.
type GatewayConfig struct {
	Listen    ListenConfig    `yaml:"listen"`
	Upstream  []UpstreamDef   `yaml:"upstream"`
	Policy    PolicyConfig    `yaml:"policy"`
	Session   SessionConfig   `yaml:"session"`
	Telemetry TelemetryConfig `yaml:"telemetry"`
}

// ListenConfig describes how the gateway listens for incoming MCP connections.
type ListenConfig struct {
	Transport string `yaml:"transport"` // "sse" (only supported transport for now)
	Address   string `yaml:"address"`   // e.g. "localhost:3100"
}

// UpstreamDef describes a single upstream MCP tool server.
type UpstreamDef struct {
	Name      string   `yaml:"name"`
	Transport string   `yaml:"transport"` // "stdio" or "sse"
	Command   []string `yaml:"command"`   // for stdio transport
	URL       string   `yaml:"url"`       // for sse transport
}

// PolicyConfig describes policy files and evaluation mode.
type PolicyConfig struct {
	Paths       []string `yaml:"paths"`
	DefaultDeny bool     `yaml:"default_deny"`
}

// SessionConfig holds session-level invariant thresholds.
type SessionConfig struct {
	MaxBlastRadius      float64 `yaml:"max_blast_radius"`
	MaxActionsPerMinute int     `yaml:"max_actions_per_minute"`
	MaxDenials          int     `yaml:"max_denials"`
	BudgetTokens        int     `yaml:"budget_tokens"`
}

// TelemetryConfig describes telemetry shipping.
type TelemetryConfig struct {
	Shipper string `yaml:"shipper"` // "file", "stdout", "http"
	Path    string `yaml:"path"`    // for file shipper
	URL     string `yaml:"url"`     // for http shipper
}

// LoadConfig reads and parses a gateway YAML config file.
func LoadConfig(path string) (*GatewayConfig, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read config %s: %w", path, err)
	}

	var cfg GatewayConfig
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parse config %s: %w", path, err)
	}

	return &cfg, nil
}

// applyDefaults fills in zero-value fields with sensible defaults.
func applyDefaults(cfg *GatewayConfig) {
	if cfg.Listen.Address == "" {
		cfg.Listen.Address = "localhost:3100"
	}
	if cfg.Listen.Transport == "" {
		cfg.Listen.Transport = "sse"
	}
	if cfg.Session.MaxBlastRadius == 0 {
		cfg.Session.MaxBlastRadius = 50.0
	}
	if cfg.Session.MaxActionsPerMinute == 0 {
		cfg.Session.MaxActionsPerMinute = 30
	}
	if cfg.Session.MaxDenials == 0 {
		cfg.Session.MaxDenials = 10
	}
	if cfg.Session.BudgetTokens == 0 {
		cfg.Session.BudgetTokens = 100000
	}
}
