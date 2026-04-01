package gateway

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/AgentGuardHQ/agentguard/go/internal/event"
	"github.com/AgentGuardHQ/agentguard/go/internal/kernel"
)

// testPolicy creates a temporary strict policy file and returns its path.
func testPolicy(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	policyPath := filepath.Join(dir, "policy.yaml")
	policy := `
id: test-strict
name: Test Strict Policy
severity: 5
rules:
  - action: "*"
    effect: deny
    reason: "all actions denied by test policy"
  - action: "file.read"
    effect: allow
    reason: "read is allowed"
`
	if err := os.WriteFile(policyPath, []byte(policy), 0644); err != nil {
		t.Fatal(err)
	}
	return policyPath
}

// testPermissivePolicy creates a policy that allows everything.
func testPermissivePolicy(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	policyPath := filepath.Join(dir, "policy.yaml")
	policy := `
id: test-permissive
name: Test Permissive Policy
severity: 1
rules:
  - action: "*"
    effect: allow
    reason: "all actions allowed by test policy"
`
	if err := os.WriteFile(policyPath, []byte(policy), 0644); err != nil {
		t.Fatal(err)
	}
	return policyPath
}

func newTestGateway(t *testing.T, policyPath string) *Gateway {
	t.Helper()
	bus := event.NewBus()
	kcfg := kernel.KernelConfig{
		PolicyPaths: []string{policyPath},
		DefaultDeny: true,
		AgentName:   "test-gateway",
		EventBus:    bus,
	}
	k, err := kernel.NewKernel(kcfg)
	if err != nil {
		t.Fatalf("kernel init: %v", err)
	}

	sessionCfg := SessionConfig{
		MaxBlastRadius:      50.0,
		MaxActionsPerMinute: 100,
		MaxDenials:          10,
		BudgetTokens:        100000,
	}

	mgr := NewUpstreamManager([]UpstreamDef{
		{Name: "mock", Transport: "stdio"},
	})
	mgr.RegisterTools("mock", []ToolDef{
		{Name: "test_tool", Description: "A test tool"},
		{Name: "Bash", Description: "Run bash commands"},
		{Name: "Read", Description: "Read files"},
	})
	// Set a mock connector that returns success
	mockResult := json.RawMessage(`{"content":[{"type":"text","text":"ok"}]}`)
	mgr.SetConnector("mock", &mockConnector{result: mockResult})

	return NewGateway(k, bus, mgr, NewSessionState(sessionCfg))
}

func TestGateway_HandleToolsCall_Allowed(t *testing.T) {
	policyPath := testPermissivePolicy(t)
	gw := newTestGateway(t, policyPath)

	rpcReq := JSONRPCRequest{
		JSONRPC: "2.0",
		ID:      json.RawMessage(`1`),
		Method:  "tools/call",
		Params: json.RawMessage(`{
			"name": "Read",
			"arguments": {"file_path": "/tmp/test.txt"}
		}`),
	}
	body, _ := json.Marshal(rpcReq)

	req := httptest.NewRequest(http.MethodPost, "/message", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	gw.HandleMessage(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("status = %d, want 200", rr.Code)
	}

	var resp JSONRPCResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if resp.Error != nil {
		t.Errorf("unexpected error: code=%d message=%s", resp.Error.Code, resp.Error.Message)
	}
}

func TestGateway_HandleToolsCall_Denied(t *testing.T) {
	policyPath := testPolicy(t) // strict policy denies Bash
	gw := newTestGateway(t, policyPath)

	rpcReq := JSONRPCRequest{
		JSONRPC: "2.0",
		ID:      json.RawMessage(`2`),
		Method:  "tools/call",
		Params: json.RawMessage(`{
			"name": "Bash",
			"arguments": {"command": "rm -rf /"}
		}`),
	}
	body, _ := json.Marshal(rpcReq)

	req := httptest.NewRequest(http.MethodPost, "/message", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	gw.HandleMessage(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("status = %d, want 200", rr.Code)
	}

	var resp JSONRPCResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if resp.Error == nil {
		t.Fatal("expected denial error in response")
	}
	if resp.Error.Code != -32001 {
		t.Errorf("error code = %d, want -32001 (governance denial)", resp.Error.Code)
	}
}

func TestGateway_HandleToolsList(t *testing.T) {
	policyPath := testPermissivePolicy(t)
	gw := newTestGateway(t, policyPath)

	rpcReq := JSONRPCRequest{
		JSONRPC: "2.0",
		ID:      json.RawMessage(`3`),
		Method:  "tools/list",
	}
	body, _ := json.Marshal(rpcReq)

	req := httptest.NewRequest(http.MethodPost, "/message", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	gw.HandleMessage(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("status = %d, want 200", rr.Code)
	}

	var resp JSONRPCResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if resp.Error != nil {
		t.Fatalf("unexpected error: %s", resp.Error.Message)
	}

	// Parse result to verify tool list
	var result struct {
		Tools []ToolDef `json:"tools"`
	}
	if err := json.Unmarshal(resp.Result, &result); err != nil {
		t.Fatalf("unmarshal result: %v", err)
	}
	if len(result.Tools) != 3 {
		t.Errorf("tool count = %d, want 3", len(result.Tools))
	}
}

func TestGateway_HandleUnknownMethod(t *testing.T) {
	policyPath := testPermissivePolicy(t)
	gw := newTestGateway(t, policyPath)

	rpcReq := JSONRPCRequest{
		JSONRPC: "2.0",
		ID:      json.RawMessage(`4`),
		Method:  "unknown/method",
	}
	body, _ := json.Marshal(rpcReq)

	req := httptest.NewRequest(http.MethodPost, "/message", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	gw.HandleMessage(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("status = %d, want 200", rr.Code)
	}

	var resp JSONRPCResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if resp.Error == nil {
		t.Fatal("expected error for unknown method")
	}
	if resp.Error.Code != -32601 {
		t.Errorf("error code = %d, want -32601 (method not found)", resp.Error.Code)
	}
}

func TestGateway_HandleBadJSON(t *testing.T) {
	policyPath := testPermissivePolicy(t)
	gw := newTestGateway(t, policyPath)

	req := httptest.NewRequest(http.MethodPost, "/message", strings.NewReader("{bad json"))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	gw.HandleMessage(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("status = %d, want 200", rr.Code)
	}

	var resp JSONRPCResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if resp.Error == nil {
		t.Fatal("expected error for bad JSON")
	}
	if resp.Error.Code != -32700 {
		t.Errorf("error code = %d, want -32700 (parse error)", resp.Error.Code)
	}
}

func TestGateway_HandleToolsCall_UnknownTool(t *testing.T) {
	policyPath := testPermissivePolicy(t)
	gw := newTestGateway(t, policyPath)

	rpcReq := JSONRPCRequest{
		JSONRPC: "2.0",
		ID:      json.RawMessage(`5`),
		Method:  "tools/call",
		Params: json.RawMessage(`{
			"name": "nonexistent_tool",
			"arguments": {}
		}`),
	}
	body, _ := json.Marshal(rpcReq)

	req := httptest.NewRequest(http.MethodPost, "/message", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	gw.HandleMessage(rr, req)

	var resp JSONRPCResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if resp.Error == nil {
		t.Fatal("expected error for unknown tool")
	}
}

func TestGateway_HandleToolsCall_SessionInvariant(t *testing.T) {
	policyPath := testPermissivePolicy(t)
	gw := newTestGateway(t, policyPath)

	// Lock the session
	gw.session.Locked = true

	rpcReq := JSONRPCRequest{
		JSONRPC: "2.0",
		ID:      json.RawMessage(`6`),
		Method:  "tools/call",
		Params: json.RawMessage(`{
			"name": "Read",
			"arguments": {"file_path": "/tmp/test.txt"}
		}`),
	}
	body, _ := json.Marshal(rpcReq)

	req := httptest.NewRequest(http.MethodPost, "/message", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	gw.HandleMessage(rr, req)

	var resp JSONRPCResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if resp.Error == nil {
		t.Fatal("expected error for locked session")
	}
	if resp.Error.Code != -32002 {
		t.Errorf("error code = %d, want -32002 (session invariant)", resp.Error.Code)
	}
}

func TestGateway_EventEmission(t *testing.T) {
	policyPath := testPermissivePolicy(t)
	bus := event.NewBus()
	kcfg := kernel.KernelConfig{
		PolicyPaths: []string{policyPath},
		DefaultDeny: false,
		AgentName:   "test-gateway",
		EventBus:    bus,
	}
	k, err := kernel.NewKernel(kcfg)
	if err != nil {
		t.Fatalf("kernel init: %v", err)
	}

	sessionCfg := SessionConfig{
		MaxBlastRadius:      50.0,
		MaxActionsPerMinute: 100,
		MaxDenials:          10,
		BudgetTokens:        100000,
	}
	mgr := NewUpstreamManager([]UpstreamDef{
		{Name: "mock", Transport: "stdio"},
	})
	mgr.RegisterTools("mock", []ToolDef{
		{Name: "Read", Description: "Read files"},
	})
	mockResult := json.RawMessage(`{"content":[{"type":"text","text":"ok"}]}`)
	mgr.SetConnector("mock", &mockConnector{result: mockResult})

	gw := NewGateway(k, bus, mgr, NewSessionState(sessionCfg))

	// Collect events
	var events []event.Event
	bus.Subscribe(func(e event.Event) {
		events = append(events, e)
	})

	rpcReq := JSONRPCRequest{
		JSONRPC: "2.0",
		ID:      json.RawMessage(`1`),
		Method:  "tools/call",
		Params: json.RawMessage(`{
			"name": "Read",
			"arguments": {"file_path": "/tmp/test.txt"}
		}`),
	}
	body, _ := json.Marshal(rpcReq)

	req := httptest.NewRequest(http.MethodPost, "/message", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	gw.HandleMessage(rr, req)

	// The kernel publishes ActionRequested and ActionAllowed internally
	// Check that at least some events were published
	if len(events) == 0 {
		t.Error("expected events to be published")
	}

	hasRequested := false
	for _, e := range events {
		if e.Kind == event.ActionRequested {
			hasRequested = true
		}
	}
	if !hasRequested {
		t.Error("expected ActionRequested event")
	}
}

func TestGateway_HandleSSE(t *testing.T) {
	policyPath := testPermissivePolicy(t)
	gw := newTestGateway(t, policyPath)

	req := httptest.NewRequest(http.MethodGet, "/sse", nil)
	rr := httptest.NewRecorder()

	// HandleSSE should set correct headers (we test the initial response)
	gw.HandleSSE(rr, req)

	ct := rr.Header().Get("Content-Type")
	if ct != "text/event-stream" {
		t.Errorf("Content-Type = %q, want text/event-stream", ct)
	}

	body := rr.Body.String()
	if !strings.Contains(body, "event: endpoint") {
		t.Errorf("expected endpoint event in SSE stream, got: %s", body)
	}
}

func TestGateway_ForwardError(t *testing.T) {
	policyPath := testPermissivePolicy(t)
	bus := event.NewBus()
	kcfg := kernel.KernelConfig{
		PolicyPaths: []string{policyPath},
		DefaultDeny: false,
		AgentName:   "test-gateway",
		EventBus:    bus,
	}
	k, err := kernel.NewKernel(kcfg)
	if err != nil {
		t.Fatalf("kernel init: %v", err)
	}

	sessionCfg := SessionConfig{
		MaxBlastRadius:      50.0,
		MaxActionsPerMinute: 100,
		MaxDenials:          10,
		BudgetTokens:        100000,
	}
	mgr := NewUpstreamManager([]UpstreamDef{
		{Name: "mock", Transport: "stdio"},
	})
	mgr.RegisterTools("mock", []ToolDef{
		{Name: "Read", Description: "Read files"},
	})
	// Connector that returns an error
	mgr.SetConnector("mock", &mockConnector{err: fmt.Errorf("upstream failure")})

	gw := NewGateway(k, bus, mgr, NewSessionState(sessionCfg))

	rpcReq := JSONRPCRequest{
		JSONRPC: "2.0",
		ID:      json.RawMessage(`1`),
		Method:  "tools/call",
		Params: json.RawMessage(`{
			"name": "Read",
			"arguments": {"file_path": "/tmp/test.txt"}
		}`),
	}
	body, _ := json.Marshal(rpcReq)

	req := httptest.NewRequest(http.MethodPost, "/message", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	gw.HandleMessage(rr, req)

	var resp JSONRPCResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if resp.Error == nil {
		t.Fatal("expected error from upstream failure")
	}
}
