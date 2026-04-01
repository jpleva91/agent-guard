package gateway

import (
	"context"
	"net/http"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestBuildGateway(t *testing.T) {
	dir := t.TempDir()
	policyPath := filepath.Join(dir, "policy.yaml")
	policy := `
id: test-policy
name: Test Policy
severity: 1
rules:
  - action: "*"
    effect: allow
    reason: "allow all"
`
	if err := os.WriteFile(policyPath, []byte(policy), 0644); err != nil {
		t.Fatal(err)
	}

	cfg := &GatewayConfig{
		Listen: ListenConfig{
			Transport: "sse",
			Address:   "localhost:0",
		},
		Upstream: []UpstreamDef{
			{Name: "mock", Transport: "stdio", Command: []string{"echo"}},
		},
		Policy: PolicyConfig{
			Paths:       []string{policyPath},
			DefaultDeny: true,
		},
		Session: SessionConfig{
			MaxBlastRadius:      50.0,
			MaxActionsPerMinute: 30,
			MaxDenials:          10,
			BudgetTokens:        100000,
		},
		Telemetry: TelemetryConfig{
			Shipper: "stdout",
		},
	}

	gw, cleanup, err := BuildGateway(cfg)
	if err != nil {
		t.Fatalf("BuildGateway: %v", err)
	}
	defer cleanup()

	if gw == nil {
		t.Fatal("gateway is nil")
	}
}

func TestBuildGateway_FileShipper(t *testing.T) {
	dir := t.TempDir()
	policyPath := filepath.Join(dir, "policy.yaml")
	eventsPath := filepath.Join(dir, "events.jsonl")
	policy := `
id: test-policy
name: Test Policy
severity: 1
rules:
  - action: "*"
    effect: allow
    reason: "allow all"
`
	if err := os.WriteFile(policyPath, []byte(policy), 0644); err != nil {
		t.Fatal(err)
	}

	cfg := &GatewayConfig{
		Listen: ListenConfig{
			Transport: "sse",
			Address:   "localhost:0",
		},
		Policy: PolicyConfig{
			Paths:       []string{policyPath},
			DefaultDeny: true,
		},
		Session: SessionConfig{
			MaxBlastRadius:      50.0,
			MaxActionsPerMinute: 30,
			MaxDenials:          10,
			BudgetTokens:        100000,
		},
		Telemetry: TelemetryConfig{
			Shipper: "file",
			Path:    eventsPath,
		},
	}

	gw, cleanup, err := BuildGateway(cfg)
	if err != nil {
		t.Fatalf("BuildGateway: %v", err)
	}
	defer cleanup()

	if gw == nil {
		t.Fatal("gateway is nil")
	}
}

func TestBuildGateway_BadPolicy(t *testing.T) {
	cfg := &GatewayConfig{
		Policy: PolicyConfig{
			Paths: []string{"/nonexistent/policy.yaml"},
		},
	}

	_, _, err := BuildGateway(cfg)
	if err == nil {
		t.Fatal("expected error for bad policy path")
	}
}

func TestRunGateway_GracefulShutdown(t *testing.T) {
	dir := t.TempDir()
	policyPath := filepath.Join(dir, "policy.yaml")
	policy := `
id: test-policy
name: Test Policy
severity: 1
rules:
  - action: "*"
    effect: allow
    reason: "allow all"
`
	if err := os.WriteFile(policyPath, []byte(policy), 0644); err != nil {
		t.Fatal(err)
	}

	cfg := &GatewayConfig{
		Listen: ListenConfig{
			Transport: "sse",
			Address:   "localhost:0", // random port
		},
		Policy: PolicyConfig{
			Paths:       []string{policyPath},
			DefaultDeny: true,
		},
		Session: SessionConfig{
			MaxBlastRadius:      50.0,
			MaxActionsPerMinute: 30,
			MaxDenials:          10,
			BudgetTokens:        100000,
		},
		Telemetry: TelemetryConfig{
			Shipper: "stdout",
		},
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	// Run in a goroutine and cancel immediately
	errCh := make(chan error, 1)
	go func() {
		errCh <- Run(ctx, cfg)
	}()

	// Give the server a moment to start
	time.Sleep(100 * time.Millisecond)
	cancel()

	select {
	case err := <-errCh:
		if err != nil && err != http.ErrServerClosed && err != context.Canceled {
			t.Fatalf("Run: %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("Run did not shut down gracefully")
	}
}

func TestCreateShipper_Stdout(t *testing.T) {
	cfg := TelemetryConfig{Shipper: "stdout"}
	s, err := createShipper(cfg)
	if err != nil {
		t.Fatalf("createShipper: %v", err)
	}
	if s == nil {
		t.Fatal("shipper is nil")
	}
}

func TestCreateShipper_File(t *testing.T) {
	dir := t.TempDir()
	cfg := TelemetryConfig{
		Shipper: "file",
		Path:    filepath.Join(dir, "events.jsonl"),
	}
	s, err := createShipper(cfg)
	if err != nil {
		t.Fatalf("createShipper: %v", err)
	}
	if s == nil {
		t.Fatal("shipper is nil")
	}
	s.Close()
}

func TestCreateShipper_None(t *testing.T) {
	cfg := TelemetryConfig{}
	s, err := createShipper(cfg)
	if err != nil {
		t.Fatalf("createShipper: %v", err)
	}
	if s != nil {
		t.Error("expected nil shipper for empty config")
	}
}
