package hook

import (
	"fmt"
	"os"

	"github.com/AgentGuardHQ/agent-guard/go/internal/action"
	"github.com/AgentGuardHQ/agent-guard/go/internal/config"
	"github.com/AgentGuardHQ/agent-guard/go/internal/engine"
	"github.com/AgentGuardHQ/agent-guard/go/internal/invariant"
)

// readOnlyTools are tools that cannot mutate state.
// These get fail-open (DefaultDeny=false) so they aren't blocked by default-deny.
var readOnlyTools = map[string]bool{
	"Read":        true,
	"Glob":        true,
	"Grep":        true,
	"LS":          true,
	"NotebookRead": true,
	"WebSearch":   true,
	"WebFetch":    true,
}

// Handler evaluates hook requests against loaded policies and invariants.
type Handler struct {
	normalizer   *action.Normalizer
	policies     []*action.LoadedPolicy
	checker      *invariant.Checker
	mode         string // enforcement mode: enforce, monitor, guide, educate
	sessionState *SessionState
	identity     string
	workspace    string
}

// NewHandler creates a Handler by loading policies from the given file paths.
// Returns an error if any policy file cannot be read or parsed.
func NewHandler(policyPaths []string) (*Handler, error) {
	normalizer := config.NewDefaultNormalizer()
	var policies []*action.LoadedPolicy
	mode := "enforce" // default
	var disabledInvariants []invariant.InvariantID

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
		// Read mode from first policy that has one
		if policy.Mode != "" && mode == "enforce" {
			mode = policy.Mode
		}
		for _, id := range policy.DisabledInvariants {
			disabledInvariants = append(disabledInvariants, invariant.InvariantID(id))
		}
	}

	checker := invariant.NewChecker(disabledInvariants)

	return &Handler{
		normalizer: normalizer,
		policies:   policies,
		checker:    checker,
		mode:       mode,
	}, nil
}

// Handle evaluates a hook input against loaded policies and invariants.
//
// For PreToolUse events:
//  1. Builds a RawAction from the HookInput.
//  2. Normalizes via the Normalizer (tool -> canonical action type).
//  3. Checks invariants (hard safety boundaries).
//  4. Evaluates via engine.Evaluate (deny-first, then allow, then default).
//  5. Routes through enforcement mode (enforce blocks, monitor warns).
//  6. Converts the result into a HookResponse.
//
// For PostToolUse events, returns an allow response (audit only).
func (h *Handler) Handle(input HookInput) HookResponse {
	// PostToolUse: always allow (audit/logging phase, no enforcement).
	if input.Event == PostToolUse {
		return HookResponse{Decision: "allow"}
	}

	// Build RawAction from HookInput
	raw := buildRawAction(input)

	// Normalize to ActionContext
	ctx := h.normalizer.Normalize(raw, sourceFromInput(input))

	// Check invariants (hard safety boundaries — always enforced, even in monitor mode)
	invCtx := invariant.CheckContext{
		Action:    ctx,
		GitBranch: ctx.Branch,
	}
	if ctx.Args.FilePath != "" {
		invCtx.ModifiedFiles = []string{ctx.Args.FilePath}
	}
	failures := h.checker.Check(invCtx)
	if len(failures) > 0 {
		// Invariant violations are always enforced (no monitor mode bypass)
		reason := fmt.Sprintf("Invariant violation: %s — %s", failures[0].ID, failures[0].Message)
		return HookResponse{Decision: "deny", Reason: reason}
	}

	// Read-only tools get fail-open (DefaultDeny=false) to avoid blocking
	// harmless operations like reading files when no allow rule matches.
	isReadOnly := readOnlyTools[input.Tool]
	defaultDeny := len(h.policies) > 0 && !isReadOnly

	// Evaluate against policies
	result := engine.Evaluate(ctx, h.policies, &engine.EvalOptions{DefaultDeny: defaultDeny})

	// Enforcement mode routing
	if !result.Allowed {
		switch h.mode {
		case "monitor":
			// Monitor mode: warn to stderr but allow the action through
			fmt.Fprintf(os.Stderr, "⚠ agentguard: %s (monitor mode)\n", result.Reason)
			return HookResponse{Decision: "allow", Reason: result.Reason}

		case "educate":
			// Educate mode: allow + capture lesson for agent learning
			fmt.Fprintf(os.Stderr, "⚠ agentguard: %s (educate mode)\n", result.Reason)
			if h.workspace != "" {
				CaptureLesson(h.workspace, Lesson{
					Action:           ctx.Action,
					Tool:             input.Tool,
					Target:           ctx.Target,
					Rule:             result.Reason,
					Reason:           result.Reason,
					Suggestion:       result.Suggestion,
					CorrectedCommand: result.CorrectedCommand,
					AgentID:          h.identity,
					Squad:            SquadFromIdentity(h.identity),
				})
			}
			return HookResponse{Decision: "allow", Reason: result.Reason}

		case "guide":
			// Guide mode: block with retry tracking (max 3 attempts)
			retryKey := fmt.Sprintf("%s:%s", ctx.Action, result.Reason)
			count := IncrementRetry(input.SessionID, retryKey)
			const maxRetries = 3

			resp := HookResponse{
				Decision: "deny",
				Reason:   fmt.Sprintf("%s (attempt %d/%d)", result.Reason, count, maxRetries),
			}
			if result.Suggestion != "" {
				resp.Suggestion = result.Suggestion
			}
			if result.CorrectedCommand != "" {
				resp.CorrectedCommand = result.CorrectedCommand
			}

			if count >= maxRetries {
				resp.Reason = fmt.Sprintf("%s — max retries reached, hard block", result.Reason)
			}

			fmt.Fprintf(os.Stderr, "⚠ agentguard: %s (guide mode, attempt %d/%d)\n", result.Reason, count, maxRetries)
			return resp

		default:
			// Enforce mode (default): hard block
		}
	}

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
