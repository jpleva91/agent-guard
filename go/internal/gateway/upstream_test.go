package gateway

import (
	"encoding/json"
	"fmt"
	"testing"
)

func TestNewUpstreamManager(t *testing.T) {
	defs := []UpstreamDef{
		{Name: "filesystem", Transport: "stdio", Command: []string{"npx", "fs-server"}},
		{Name: "github", Transport: "sse", URL: "http://localhost:3101/sse"},
	}

	mgr := NewUpstreamManager(defs)

	if len(mgr.upstreams) != 2 {
		t.Fatalf("upstream count = %d, want 2", len(mgr.upstreams))
	}
	if mgr.upstreams["filesystem"] == nil {
		t.Error("missing filesystem upstream")
	}
	if mgr.upstreams["github"] == nil {
		t.Error("missing github upstream")
	}
}

func TestUpstreamManager_RegisterTools(t *testing.T) {
	defs := []UpstreamDef{
		{Name: "filesystem", Transport: "stdio"},
		{Name: "github", Transport: "sse"},
	}
	mgr := NewUpstreamManager(defs)

	// Register tools for each upstream
	fsTools := []ToolDef{
		{Name: "read_file", Description: "Read a file"},
		{Name: "write_file", Description: "Write a file"},
	}
	ghTools := []ToolDef{
		{Name: "create_issue", Description: "Create an issue"},
		{Name: "list_prs", Description: "List pull requests"},
	}

	mgr.RegisterTools("filesystem", fsTools)
	mgr.RegisterTools("github", ghTools)

	// Verify tool routing
	up, ok := mgr.RouteToolCall("read_file")
	if !ok {
		t.Fatal("read_file not routed")
	}
	if up != "filesystem" {
		t.Errorf("read_file routed to %q, want filesystem", up)
	}

	up, ok = mgr.RouteToolCall("create_issue")
	if !ok {
		t.Fatal("create_issue not routed")
	}
	if up != "github" {
		t.Errorf("create_issue routed to %q, want github", up)
	}

	// Unknown tool
	_, ok = mgr.RouteToolCall("nonexistent")
	if ok {
		t.Error("nonexistent tool should not be routed")
	}
}

func TestUpstreamManager_MergedToolList(t *testing.T) {
	defs := []UpstreamDef{
		{Name: "fs", Transport: "stdio"},
		{Name: "gh", Transport: "sse"},
	}
	mgr := NewUpstreamManager(defs)

	mgr.RegisterTools("fs", []ToolDef{
		{Name: "read_file", Description: "Read"},
		{Name: "write_file", Description: "Write"},
	})
	mgr.RegisterTools("gh", []ToolDef{
		{Name: "create_issue", Description: "Create issue"},
	})

	merged := mgr.MergedToolList()
	if len(merged) != 3 {
		t.Fatalf("merged tool count = %d, want 3", len(merged))
	}

	names := make(map[string]bool)
	for _, tool := range merged {
		names[tool.Name] = true
	}
	for _, expected := range []string{"read_file", "write_file", "create_issue"} {
		if !names[expected] {
			t.Errorf("missing tool %q in merged list", expected)
		}
	}
}

func TestUpstreamManager_ForwardCall(t *testing.T) {
	defs := []UpstreamDef{
		{Name: "mock", Transport: "stdio"},
	}
	mgr := NewUpstreamManager(defs)
	mgr.RegisterTools("mock", []ToolDef{
		{Name: "test_tool", Description: "Test"},
	})

	// Set a mock connector
	mockResult := json.RawMessage(`{"content":[{"type":"text","text":"hello"}]}`)
	mgr.upstreams["mock"].connector = &mockConnector{result: mockResult}

	call := MCPToolCall{
		Method: "tools/call",
		Params: MCPCallParams{
			Name:      "test_tool",
			Arguments: map[string]any{"key": "value"},
		},
	}

	result, err := mgr.ForwardCall("mock", call)
	if err != nil {
		t.Fatalf("ForwardCall: %v", err)
	}
	if string(result) != string(mockResult) {
		t.Errorf("result = %s, want %s", result, mockResult)
	}
}

func TestUpstreamManager_ForwardCall_NoConnector(t *testing.T) {
	defs := []UpstreamDef{
		{Name: "unconnected", Transport: "stdio"},
	}
	mgr := NewUpstreamManager(defs)

	call := MCPToolCall{
		Method: "tools/call",
		Params: MCPCallParams{Name: "some_tool"},
	}

	_, err := mgr.ForwardCall("unconnected", call)
	if err == nil {
		t.Fatal("expected error for unconnected upstream")
	}
}

func TestUpstreamManager_ForwardCall_UnknownUpstream(t *testing.T) {
	mgr := NewUpstreamManager(nil)

	call := MCPToolCall{
		Method: "tools/call",
		Params: MCPCallParams{Name: "some_tool"},
	}

	_, err := mgr.ForwardCall("nonexistent", call)
	if err == nil {
		t.Fatal("expected error for unknown upstream")
	}
}

// mockConnector implements UpstreamConnector for testing.
type mockConnector struct {
	result json.RawMessage
	err    error
}

func (m *mockConnector) Call(call MCPToolCall) (json.RawMessage, error) {
	if m.err != nil {
		return nil, m.err
	}
	return m.result, nil
}

func (m *mockConnector) ListTools() ([]ToolDef, error) {
	return nil, fmt.Errorf("not implemented")
}

func (m *mockConnector) Close() error {
	return nil
}
