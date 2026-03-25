package hook

import "github.com/AgentGuardHQ/agent-guard/go/internal/action"

// allowResult returns an EvalResult that allows the action.
func allowResult() action.EvalResult {
	return action.EvalResult{
		Allowed:  true,
		Decision: "allow",
		Reason:   "Action allowed",
	}
}

// denyResult returns an EvalResult that denies the action with a suggestion.
func denyResult() action.EvalResult {
	return action.EvalResult{
		Allowed:          false,
		Decision:         "deny",
		Reason:           "Action denied by policy",
		Suggestion:       "Try a different approach",
		CorrectedCommand: "safe-command --flag",
	}
}
