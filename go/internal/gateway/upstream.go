package gateway

import (
	"encoding/json"
	"fmt"
	"sync"
)

// ToolDef describes a single tool advertised by an upstream MCP server.
type ToolDef struct {
	Name        string         `json:"name"`
	Description string         `json:"description,omitempty"`
	InputSchema map[string]any `json:"inputSchema,omitempty"`
}

// UpstreamConnector is the interface for communicating with an upstream MCP server.
// Implementations handle stdio (process spawn) and SSE (HTTP) transports.
type UpstreamConnector interface {
	// Call sends a tools/call request to the upstream and returns the result.
	Call(call MCPToolCall) (json.RawMessage, error)
	// ListTools retrieves the tool list from the upstream.
	ListTools() ([]ToolDef, error)
	// Close shuts down the connection.
	Close() error
}

// Upstream represents a connected upstream MCP server.
type Upstream struct {
	def       UpstreamDef
	tools     []ToolDef
	connector UpstreamConnector
}

// UpstreamManager manages multiple upstream MCP servers and routes tool calls.
type UpstreamManager struct {
	mu        sync.RWMutex
	upstreams map[string]*Upstream
	toolIndex map[string]string // tool name -> upstream name
}

// NewUpstreamManager creates a manager from upstream definitions.
func NewUpstreamManager(defs []UpstreamDef) *UpstreamManager {
	m := &UpstreamManager{
		upstreams: make(map[string]*Upstream, len(defs)),
		toolIndex: make(map[string]string),
	}
	for _, d := range defs {
		m.upstreams[d.Name] = &Upstream{def: d}
	}
	return m
}

// RegisterTools registers the tool list for a given upstream and builds
// the routing index.
func (m *UpstreamManager) RegisterTools(upstreamName string, tools []ToolDef) {
	m.mu.Lock()
	defer m.mu.Unlock()

	up, ok := m.upstreams[upstreamName]
	if !ok {
		return
	}
	up.tools = tools
	for _, t := range tools {
		m.toolIndex[t.Name] = upstreamName
	}
}

// RouteToolCall returns the upstream name that owns the given tool.
func (m *UpstreamManager) RouteToolCall(toolName string) (upstreamName string, ok bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	name, ok := m.toolIndex[toolName]
	return name, ok
}

// MergedToolList returns the combined tool list from all upstreams.
func (m *UpstreamManager) MergedToolList() []ToolDef {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var all []ToolDef
	for _, up := range m.upstreams {
		all = append(all, up.tools...)
	}
	return all
}

// ForwardCall sends a tool call to the named upstream and returns the raw result.
func (m *UpstreamManager) ForwardCall(upstreamName string, call MCPToolCall) (json.RawMessage, error) {
	m.mu.RLock()
	up, ok := m.upstreams[upstreamName]
	m.mu.RUnlock()

	if !ok {
		return nil, fmt.Errorf("unknown upstream: %s", upstreamName)
	}
	if up.connector == nil {
		return nil, fmt.Errorf("upstream %s: not connected", upstreamName)
	}
	return up.connector.Call(call)
}

// SetConnector sets the connector for a given upstream (used during initialization).
func (m *UpstreamManager) SetConnector(upstreamName string, conn UpstreamConnector) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	up, ok := m.upstreams[upstreamName]
	if !ok {
		return fmt.Errorf("unknown upstream: %s", upstreamName)
	}
	up.connector = conn
	return nil
}

// Close shuts down all upstream connections.
func (m *UpstreamManager) Close() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	var firstErr error
	for name, up := range m.upstreams {
		if up.connector != nil {
			if err := up.connector.Close(); err != nil && firstErr == nil {
				firstErr = fmt.Errorf("close upstream %s: %w", name, err)
			}
		}
	}
	return firstErr
}

// --- Placeholder connector implementations ---

// StdioConnector is a placeholder for stdio-based upstream connections.
// In production, this would spawn a child process and communicate via stdin/stdout.
type StdioConnector struct {
	def UpstreamDef
}

// NewStdioConnector creates a stdio connector (placeholder).
func NewStdioConnector(def UpstreamDef) *StdioConnector {
	return &StdioConnector{def: def}
}

func (c *StdioConnector) Call(call MCPToolCall) (json.RawMessage, error) {
	return nil, fmt.Errorf("stdio connector for %q: not yet implemented (process spawn pending)", c.def.Name)
}

func (c *StdioConnector) ListTools() ([]ToolDef, error) {
	return nil, fmt.Errorf("stdio connector for %q: not yet implemented", c.def.Name)
}

func (c *StdioConnector) Close() error {
	return nil
}

// SSEConnector is a placeholder for SSE-based upstream connections.
// In production, this would connect to the upstream SSE endpoint.
type SSEConnector struct {
	def UpstreamDef
}

// NewSSEConnector creates an SSE connector (placeholder).
func NewSSEConnector(def UpstreamDef) *SSEConnector {
	return &SSEConnector{def: def}
}

func (c *SSEConnector) Call(call MCPToolCall) (json.RawMessage, error) {
	return nil, fmt.Errorf("SSE connector for %q: not yet implemented (HTTP SSE client pending)", c.def.Name)
}

func (c *SSEConnector) ListTools() ([]ToolDef, error) {
	return nil, fmt.Errorf("SSE connector for %q: not yet implemented", c.def.Name)
}

func (c *SSEConnector) Close() error {
	return nil
}
