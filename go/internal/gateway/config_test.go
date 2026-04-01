package gateway

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadConfig_Valid(t *testing.T) {
	yaml := `
listen:
  transport: sse
  address: "localhost:3100"
upstream:
  - name: filesystem
    transport: stdio
    command: ["npx", "@modelcontextprotocol/server-filesystem", "/workspace"]
  - name: github
    transport: sse
    url: "http://localhost:3101/sse"
policy:
  paths: ["./policies/strict.yaml"]
  default_deny: true
session:
  max_blast_radius: 50.0
  max_actions_per_minute: 30
  max_denials: 10
  budget_tokens: 100000
telemetry:
  shipper: file
  path: "./gateway-events.jsonl"
`
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "agentguard-gateway.yaml")
	if err := os.WriteFile(cfgPath, []byte(yaml), 0644); err != nil {
		t.Fatal(err)
	}

	cfg, err := LoadConfig(cfgPath)
	if err != nil {
		t.Fatalf("LoadConfig: %v", err)
	}

	// Listen
	if cfg.Listen.Transport != "sse" {
		t.Errorf("listen.transport = %q, want sse", cfg.Listen.Transport)
	}
	if cfg.Listen.Address != "localhost:3100" {
		t.Errorf("listen.address = %q, want localhost:3100", cfg.Listen.Address)
	}

	// Upstream
	if len(cfg.Upstream) != 2 {
		t.Fatalf("upstream count = %d, want 2", len(cfg.Upstream))
	}
	if cfg.Upstream[0].Name != "filesystem" {
		t.Errorf("upstream[0].name = %q, want filesystem", cfg.Upstream[0].Name)
	}
	if cfg.Upstream[0].Transport != "stdio" {
		t.Errorf("upstream[0].transport = %q, want stdio", cfg.Upstream[0].Transport)
	}
	if len(cfg.Upstream[0].Command) != 3 {
		t.Errorf("upstream[0].command len = %d, want 3", len(cfg.Upstream[0].Command))
	}
	if cfg.Upstream[1].Name != "github" {
		t.Errorf("upstream[1].name = %q, want github", cfg.Upstream[1].Name)
	}
	if cfg.Upstream[1].Transport != "sse" {
		t.Errorf("upstream[1].transport = %q, want sse", cfg.Upstream[1].Transport)
	}
	if cfg.Upstream[1].URL != "http://localhost:3101/sse" {
		t.Errorf("upstream[1].url = %q, want http://localhost:3101/sse", cfg.Upstream[1].URL)
	}

	// Policy
	if len(cfg.Policy.Paths) != 1 || cfg.Policy.Paths[0] != "./policies/strict.yaml" {
		t.Errorf("policy.paths = %v, want [./policies/strict.yaml]", cfg.Policy.Paths)
	}
	if !cfg.Policy.DefaultDeny {
		t.Error("policy.default_deny should be true")
	}

	// Session
	if cfg.Session.MaxBlastRadius != 50.0 {
		t.Errorf("session.max_blast_radius = %f, want 50.0", cfg.Session.MaxBlastRadius)
	}
	if cfg.Session.MaxActionsPerMinute != 30 {
		t.Errorf("session.max_actions_per_minute = %d, want 30", cfg.Session.MaxActionsPerMinute)
	}
	if cfg.Session.MaxDenials != 10 {
		t.Errorf("session.max_denials = %d, want 10", cfg.Session.MaxDenials)
	}
	if cfg.Session.BudgetTokens != 100000 {
		t.Errorf("session.budget_tokens = %d, want 100000", cfg.Session.BudgetTokens)
	}

	// Telemetry
	if cfg.Telemetry.Shipper != "file" {
		t.Errorf("telemetry.shipper = %q, want file", cfg.Telemetry.Shipper)
	}
	if cfg.Telemetry.Path != "./gateway-events.jsonl" {
		t.Errorf("telemetry.path = %q, want ./gateway-events.jsonl", cfg.Telemetry.Path)
	}
}

func TestLoadConfig_FileNotFound(t *testing.T) {
	_, err := LoadConfig("/nonexistent/path.yaml")
	if err == nil {
		t.Fatal("expected error for nonexistent file")
	}
}

func TestLoadConfig_InvalidYAML(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "bad.yaml")
	if err := os.WriteFile(cfgPath, []byte("{{invalid yaml"), 0644); err != nil {
		t.Fatal(err)
	}
	_, err := LoadConfig(cfgPath)
	if err == nil {
		t.Fatal("expected error for invalid YAML")
	}
}

func TestLoadConfig_Defaults(t *testing.T) {
	yaml := `
listen:
  transport: sse
upstream: []
`
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "minimal.yaml")
	if err := os.WriteFile(cfgPath, []byte(yaml), 0644); err != nil {
		t.Fatal(err)
	}

	cfg, err := LoadConfig(cfgPath)
	if err != nil {
		t.Fatalf("LoadConfig: %v", err)
	}

	if cfg.Listen.Address != "" {
		t.Errorf("default listen.address = %q, want empty", cfg.Listen.Address)
	}
	if cfg.Session.MaxBlastRadius != 0 {
		t.Errorf("default session.max_blast_radius = %f, want 0", cfg.Session.MaxBlastRadius)
	}
	if cfg.Telemetry.Shipper != "" {
		t.Errorf("default telemetry.shipper = %q, want empty", cfg.Telemetry.Shipper)
	}
}

func TestApplyDefaults(t *testing.T) {
	cfg := &GatewayConfig{}
	applyDefaults(cfg)

	if cfg.Listen.Address != "localhost:3100" {
		t.Errorf("default address = %q, want localhost:3100", cfg.Listen.Address)
	}
	if cfg.Listen.Transport != "sse" {
		t.Errorf("default transport = %q, want sse", cfg.Listen.Transport)
	}
	if cfg.Session.MaxBlastRadius != 50.0 {
		t.Errorf("default max_blast_radius = %f, want 50.0", cfg.Session.MaxBlastRadius)
	}
	if cfg.Session.MaxActionsPerMinute != 30 {
		t.Errorf("default max_actions_per_minute = %d, want 30", cfg.Session.MaxActionsPerMinute)
	}
	if cfg.Session.MaxDenials != 10 {
		t.Errorf("default max_denials = %d, want 10", cfg.Session.MaxDenials)
	}
	if cfg.Session.BudgetTokens != 100000 {
		t.Errorf("default budget_tokens = %d, want 100000", cfg.Session.BudgetTokens)
	}
}
