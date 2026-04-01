package gateway

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/AgentGuardHQ/agentguard/go/internal/action"
	"github.com/AgentGuardHQ/agentguard/go/internal/event"
	"github.com/AgentGuardHQ/agentguard/go/internal/kernel"
)

// JSON-RPC error codes
const (
	ErrParseError      = -32700 // Invalid JSON
	ErrInvalidRequest  = -32600 // Not a valid JSON-RPC request
	ErrMethodNotFound  = -32601 // Method not found
	ErrGovernanceDeny  = -32001 // Action denied by governance
	ErrSessionInvariant = -32002 // Session invariant violation
	ErrUpstreamError   = -32003 // Upstream forwarding error
)

// JSONRPCRequest is a JSON-RPC 2.0 request.
type JSONRPCRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

// JSONRPCResponse is a JSON-RPC 2.0 response.
type JSONRPCResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *JSONRPCError   `json:"error,omitempty"`
}

// JSONRPCError is a JSON-RPC 2.0 error object.
type JSONRPCError struct {
	Code    int             `json:"code"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data,omitempty"`
}

// Gateway is the MCP-to-MCP governance proxy. It intercepts MCP tool calls,
// evaluates them through the AgentGuard kernel, and forwards allowed calls
// to upstream MCP servers.
type Gateway struct {
	kernel   *kernel.Kernel
	bus      *event.Bus
	upstream *UpstreamManager
	session  *SessionState
}

// NewGateway creates a new MCP governance gateway.
func NewGateway(k *kernel.Kernel, bus *event.Bus, upstream *UpstreamManager, session *SessionState) *Gateway {
	return &Gateway{
		kernel:   k,
		bus:      bus,
		upstream: upstream,
		session:  session,
	}
}

// HandleMessage handles POST /message — the JSON-RPC endpoint for MCP messages.
func (g *Gateway) HandleMessage(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		g.writeError(w, nil, ErrParseError, "failed to read request body")
		return
	}

	var req JSONRPCRequest
	if err := json.Unmarshal(body, &req); err != nil {
		g.writeError(w, nil, ErrParseError, "invalid JSON")
		return
	}

	switch req.Method {
	case "tools/call":
		g.handleToolsCall(w, req)
	case "tools/list":
		g.handleToolsList(w, req)
	case "initialize":
		g.handleInitialize(w, req)
	default:
		g.writeError(w, req.ID, ErrMethodNotFound, fmt.Sprintf("method not found: %s", req.Method))
	}
}

// HandleSSE handles GET /sse — the SSE endpoint for MCP connection initialization.
// In the MCP SSE transport, the server sends an endpoint event pointing clients
// to the /message URL for subsequent JSON-RPC messages.
func (g *Gateway) HandleSSE(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	// Send the endpoint event pointing to the message URL
	// In MCP SSE transport, the server sends: event: endpoint\ndata: /message\n\n
	fmt.Fprintf(w, "event: endpoint\ndata: /message\n\n")

	// Flush to ensure the client receives the endpoint event immediately
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}
}

// handleToolsCall processes a tools/call request through the governance pipeline.
func (g *Gateway) handleToolsCall(w http.ResponseWriter, req JSONRPCRequest) {
	// 1. Parse the call params
	var params MCPCallParams
	if err := json.Unmarshal(req.Params, &params); err != nil {
		g.writeError(w, req.ID, ErrParseError, "invalid tools/call params")
		return
	}

	call := MCPToolCall{
		Method: req.Method,
		Params: params,
	}

	// 2. Route — identify which upstream owns the tool
	upstreamName, ok := g.upstream.RouteToolCall(params.Name)
	if !ok {
		g.writeError(w, req.ID, ErrMethodNotFound, fmt.Sprintf("unknown tool: %s", params.Name))
		return
	}

	// 3. Compute fingerprint for session invariants
	fingerprint := ActionFingerprint(call)

	// 4. Check session-level invariants (runaway, velocity, budget, blast radius)
	sessResult := g.session.CheckInvariants(fingerprint)
	if !sessResult.OK {
		g.emitSessionDenial(call, sessResult)
		g.writeError(w, req.ID, ErrSessionInvariant, fmt.Sprintf("session invariant: %s — %s", sessResult.Reason, sessResult.Message))
		return
	}

	// 5. Normalize MCP tool call -> kernel RawAction
	rawAction := NormalizeMCPCall(call, g.kernel.SessionID())

	// 6. Propose via kernel (26 invariants + policy eval)
	result, err := g.kernel.Propose(rawAction)
	if err != nil {
		g.writeError(w, req.ID, ErrUpstreamError, fmt.Sprintf("kernel error: %v", err))
		return
	}

	// 7. Decision gate
	if result.Decision == "deny" {
		g.session.RecordDenial()
		g.session.RecordAction(fingerprint, result.BlastRadius, true)
		errData := g.marshalDenialData(result)
		g.writeErrorWithData(w, req.ID, ErrGovernanceDeny, result.Reason, errData)
		return
	}

	// 8. Forward allowed call to upstream
	upstreamResult, err := g.upstream.ForwardCall(upstreamName, call)
	if err != nil {
		g.writeError(w, req.ID, ErrUpstreamError, fmt.Sprintf("upstream %s: %v", upstreamName, err))
		return
	}

	// 9. Record the successful action
	g.session.RecordAction(fingerprint, result.BlastRadius, false)

	// 10. Return upstream result
	g.writeResult(w, req.ID, upstreamResult)
}

// handleToolsList returns the merged tool list from all upstreams.
func (g *Gateway) handleToolsList(w http.ResponseWriter, req JSONRPCRequest) {
	tools := g.upstream.MergedToolList()
	result := struct {
		Tools []ToolDef `json:"tools"`
	}{Tools: tools}

	data, err := json.Marshal(result)
	if err != nil {
		g.writeError(w, req.ID, ErrParseError, "failed to marshal tool list")
		return
	}
	g.writeResult(w, req.ID, data)
}

// handleInitialize handles the MCP initialize handshake.
func (g *Gateway) handleInitialize(w http.ResponseWriter, req JSONRPCRequest) {
	result := map[string]any{
		"protocolVersion": "2024-11-05",
		"serverInfo": map[string]any{
			"name":    "agentguard-gateway",
			"version": "0.1.0",
		},
		"capabilities": map[string]any{
			"tools": map[string]any{},
		},
	}
	data, _ := json.Marshal(result)
	g.writeResult(w, req.ID, data)
}

// emitSessionDenial publishes a governance event for session-level denials.
func (g *Gateway) emitSessionDenial(call MCPToolCall, result SessionCheckResult) {
	if g.bus == nil {
		return
	}
	g.bus.Publish(event.NewEvent(event.ActionDenied, g.kernel.SessionID(), map[string]any{
		"actionType": call.Params.Name,
		"reason":     result.Reason,
		"message":    result.Message,
		"source":     "session_invariant",
	}))
}

// marshalDenialData creates a JSON data payload for governance denial errors.
func (g *Gateway) marshalDenialData(result kernel.KernelResult) json.RawMessage {
	data := map[string]any{
		"decision":   result.Decision,
		"reason":     result.Reason,
		"suggestion": result.Suggestion,
		"corrected":  result.CorrectedCommand,
	}
	b, _ := json.Marshal(data)
	return b
}

// writeResult writes a successful JSON-RPC response.
func (g *Gateway) writeResult(w http.ResponseWriter, id json.RawMessage, result json.RawMessage) {
	resp := JSONRPCResponse{
		JSONRPC: "2.0",
		ID:      id,
		Result:  result,
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// writeError writes a JSON-RPC error response.
func (g *Gateway) writeError(w http.ResponseWriter, id json.RawMessage, code int, message string) {
	g.writeErrorWithData(w, id, code, message, nil)
}

// writeErrorWithData writes a JSON-RPC error response with optional data.
func (g *Gateway) writeErrorWithData(w http.ResponseWriter, id json.RawMessage, code int, message string, data json.RawMessage) {
	rpcErr := &JSONRPCError{
		Code:    code,
		Message: message,
		Data:    data,
	}
	resp := JSONRPCResponse{
		JSONRPC: "2.0",
		ID:      id,
		Error:   rpcErr,
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// ServeHTTP implements http.Handler by routing to /sse and /message endpoints.
func (g *Gateway) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	switch r.URL.Path {
	case "/sse":
		g.HandleSSE(w, r)
	case "/message":
		g.HandleMessage(w, r)
	default:
		http.NotFound(w, r)
	}
}

// processToolCall is the core governance pipeline for a single tool call.
// It returns the kernel result and an optional error. Exported for testing.
func (g *Gateway) processToolCall(call MCPToolCall) (kernel.KernelResult, error) {
	rawAction := NormalizeMCPCall(call, g.kernel.SessionID())
	return g.kernel.Propose(rawAction)
}

// unused but defined to satisfy interface expectations — the RawAction conversion
// for MCP-native tool names that don't map cleanly to kernel action types.
func mcpToolToAction(toolName string) action.RawAction {
	return action.RawAction{
		Tool: toolName,
	}
}
