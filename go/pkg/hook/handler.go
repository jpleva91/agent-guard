package hook

import (
	"os"

	"github.com/AgentGuardHQ/agent-guard/go/internal/action"
	"github.com/AgentGuardHQ/agent-guard/go/internal/config"
	"github.com/AgentGuardHQ/agent-guard/go/internal/engine"
)

// Handler evaluates hook requests against loaded policies.
// It owns a Normalizer (for RawAction -> ActionContext) and the set of
// policies to evaluate against.
type Handler struct {
	normalizer *action.Normalizer
	policies   []*action.LoadedPolicy
}

// NewHandler creates a Handler by loading policies from the given file paths.
// Returns an error if any policy file cannot be read or parsed.
func NewHandler(policyPaths []string) (*Handler, error) {
	normalizer := config.NewDefaultNormalizer()
	var policies []*action.LoadedPolicy

	for _, p := range policyPaths {
		data, err := os.ReadFile(p)
		if err != nil {
			return nil, err
		}
		policy, err := config.LoadYamlPolicy(data)
		if err != nil {
			return nil, err
		}
		policies = append(policies, policy)
	}

	return &Handler{
		normalizer: normalizer,
		policies:   policies,
	}, nil
}

// Handle evaluates a hook input against loaded policies and returns a response.
//
// For PreToolUse events, the handler:
//  1. Builds a RawAction from the HookInput.
//  2. Normalizes via the Normalizer (tool -> canonical action type).
//  3. Evaluates via engine.Evaluate (deny-first, then allow, then default).
//  4. Converts the EvalResult into a HookResponse.
//
// For PostToolUse events, the handler returns an allow response (audit only).
func (h *Handler) Handle(input HookInput) HookResponse {
	// PostToolUse: always allow (audit/logging phase, no enforcement).
	if input.Event == PostToolUse {
		return HookResponse{Decision: "allow"}
	}

	// Build RawAction from HookInput
	raw := buildRawAction(input)

	// Normalize to ActionContext
	ctx := h.normalizer.Normalize(raw, sourceFromInput(input))

	// Evaluate against policies (default-deny for hook enforcement)
	result := engine.Evaluate(ctx, h.policies, &engine.EvalOptions{DefaultDeny: true})

	// Convert EvalResult to HookResponse
	return resultToResponse(result)
}

// buildRawAction converts a HookInput into a RawAction for normalization.
func buildRawAction(input HookInput) action.RawAction {
	fields := input.InputFields()
	raw := action.RawAction{
		Tool:  input.Tool,
		Agent: agentFromSession(input.SessionID),
	}

	if fields != nil {
		if cmd, ok := fields["command"].(string); ok {
			raw.Command = cmd
		}
		if fp, ok := fields["file_path"].(string); ok {
			raw.File = fp
		}
		if tgt, ok := fields["target"].(string); ok {
			raw.Target = tgt
		}
		if content, ok := fields["content"].(string); ok {
			raw.Content = content
		}
		if pattern, ok := fields["pattern"].(string); ok && raw.Target == "" {
			raw.Target = pattern
		}
		if url, ok := fields["url"].(string); ok && raw.Target == "" {
			raw.Target = url
		}
		if query, ok := fields["query"].(string); ok && raw.Target == "" {
			raw.Target = query
		}
	}

	return raw
}

// sourceFromInput returns the adapter source identifier.
// Defaults to "claude-code" since that's the primary hook consumer.
func sourceFromInput(input HookInput) string {
	// Could be extended to detect copilot vs claude via env or input fields
	_ = input
	return "claude-code"
}

// agentFromSession returns an agent identity string from the session ID.
// If no session ID is available, returns "claude-code".
func agentFromSession(sessionID string) string {
	if sessionID == "" {
		return "claude-code"
	}
	return "claude-code:" + sessionID
}

// resultToResponse converts an engine EvalResult into a HookResponse.
func resultToResponse(result action.EvalResult) HookResponse {
	if result.Allowed {
		return HookResponse{
			Decision: "allow",
			Reason:   result.Reason,
		}
	}
	resp := HookResponse{
		Decision: "deny",
		Reason:   result.Reason,
	}
	if result.Suggestion != "" {
		resp.Suggestion = result.Suggestion
	}
	if result.CorrectedCommand != "" {
		resp.CorrectedCommand = result.CorrectedCommand
	}
	return resp
}
