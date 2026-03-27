package action_test

import (
	"testing"

	"github.com/AgentGuardHQ/agentguard/go/internal/action"
	"github.com/AgentGuardHQ/agentguard/go/internal/config"
)

func normalize(raw action.RawAction, source string) action.ActionContext {
	n := config.NewDefaultNormalizer()
	return n.Normalize(raw, source)
}

func TestNormalizeBashGitPush(t *testing.T) {
	raw := action.RawAction{
		Tool:    "Bash",
		Command: "git push origin main",
		Agent:   "claude-code:opus:developer",
	}
	ctx := normalize(raw, "claude-code")
	if ctx.Action != "git.push" {
		t.Errorf("expected git.push, got %s", ctx.Action)
	}
	if ctx.ActionClass != "git" {
		t.Errorf("expected git class, got %s", ctx.ActionClass)
	}
	if ctx.Branch != "main" {
		t.Errorf("expected branch main, got %s", ctx.Branch)
	}
}

func TestNormalizeBashGhPrCreate(t *testing.T) {
	raw := action.RawAction{
		Tool:    "Bash",
		Command: "gh pr create --title 'fix'",
	}
	ctx := normalize(raw, "claude-code")
	if ctx.Action != "github.pr.create" {
		t.Errorf("expected github.pr.create, got %s", ctx.Action)
	}
	if ctx.ActionClass != "github" {
		t.Errorf("expected github class, got %s", ctx.ActionClass)
	}
}

func TestNormalizeFileWrite(t *testing.T) {
	raw := action.RawAction{
		Tool: "Write",
		File: "src/main.go",
	}
	ctx := normalize(raw, "claude-code")
	if ctx.Action != "file.write" {
		t.Errorf("expected file.write, got %s", ctx.Action)
	}
	if ctx.Target != "src/main.go" {
		t.Errorf("expected src/main.go, got %s", ctx.Target)
	}
}

func TestNormalizeFileRead(t *testing.T) {
	raw := action.RawAction{Tool: "Read", File: "/tmp/test.txt"}
	ctx := normalize(raw, "claude-code")
	if ctx.Action != "file.read" {
		t.Errorf("expected file.read, got %s", ctx.Action)
	}
}

func TestNormalizeDestructiveCommand(t *testing.T) {
	raw := action.RawAction{Tool: "Bash", Command: "rm -rf /"}
	ctx := normalize(raw, "claude-code")
	if !ctx.Destructive {
		t.Error("expected destructive=true for rm -rf")
	}
}

func TestNormalizeUnknownTool(t *testing.T) {
	raw := action.RawAction{Tool: "CustomTool"}
	ctx := normalize(raw, "test")
	if ctx.Action != "unknown" {
		t.Errorf("expected unknown, got %s", ctx.Action)
	}
	if ctx.ActionClass != "unknown" {
		t.Errorf("expected unknown class, got %s", ctx.ActionClass)
	}
}

func TestNormalizeSource(t *testing.T) {
	raw := action.RawAction{Tool: "Bash", Command: "ls"}
	ctx := normalize(raw, "copilot-cli")
	if ctx.Source != "copilot-cli" {
		t.Errorf("expected copilot-cli, got %s", ctx.Source)
	}
}

func TestNormalizeAgentPropagation(t *testing.T) {
	raw := action.RawAction{
		Tool:    "Bash",
		Command: "ls",
		Agent:   "my-agent",
	}
	ctx := normalize(raw, "claude-code")
	if ctx.Agent != "my-agent" {
		t.Errorf("expected my-agent, got %s", ctx.Agent)
	}
	if ctx.Actor.AgentID != "my-agent" {
		t.Errorf("expected actor.agentId my-agent, got %s", ctx.Actor.AgentID)
	}
}

func TestNormalizeAgentFallbackToSource(t *testing.T) {
	raw := action.RawAction{Tool: "Bash", Command: "ls"}
	ctx := normalize(raw, "copilot-cli")
	if ctx.Agent != "copilot-cli" {
		t.Errorf("expected agent to fall back to source copilot-cli, got %s", ctx.Agent)
	}
}

func TestNormalizeBashGitPushWithRefspec(t *testing.T) {
	raw := action.RawAction{
		Tool:    "Bash",
		Command: "git push origin HEAD:refs/heads/feature-branch",
	}
	ctx := normalize(raw, "cli")
	if ctx.Action != "git.push" {
		t.Errorf("expected git.push, got %s", ctx.Action)
	}
	if ctx.Branch != "feature-branch" {
		t.Errorf("expected branch feature-branch, got %s", ctx.Branch)
	}
}

func TestNormalizeEditTool(t *testing.T) {
	raw := action.RawAction{Tool: "Edit", File: "README.md"}
	ctx := normalize(raw, "claude-code")
	if ctx.Action != "file.write" {
		t.Errorf("expected file.write for Edit tool, got %s", ctx.Action)
	}
}

func TestNormalizeGlobTool(t *testing.T) {
	raw := action.RawAction{Tool: "Glob"}
	ctx := normalize(raw, "claude-code")
	if ctx.Action != "file.read" {
		t.Errorf("expected file.read for Glob tool, got %s", ctx.Action)
	}
}

func TestExtractBranch(t *testing.T) {
	tests := []struct {
		command  string
		expected string
	}{
		{"git push origin main", "main"},
		{"git push origin feature/my-branch", "feature/my-branch"},
		{"cd /repo && git push origin develop", "develop"},
		{"git push -u origin fix/bug-123", "fix/bug-123"},
		{"git push origin HEAD:refs/heads/feature", "feature"},
		{"git push origin +refs/heads/main:refs/heads/main", "main"},
		{"ls -la", ""},
		{"git push", ""},
	}
	for _, tt := range tests {
		t.Run(tt.command, func(t *testing.T) {
			got := action.ExtractBranch(tt.command)
			if got != tt.expected {
				t.Errorf("ExtractBranch(%q) = %q, want %q", tt.command, got, tt.expected)
			}
		})
	}
}

func TestResolveActionClass(t *testing.T) {
	tests := []struct {
		action   string
		expected string
	}{
		{"git.push", "git"},
		{"file.read", "file"},
		{"shell.exec", "shell"},
		{"github.pr.create", "github"},
		{"test.run.unit", "test"},
		{"deploy.trigger", "deploy"},
		{"unknown", "unknown"},
		{"mcp.call", "mcp"},
	}
	for _, tt := range tests {
		t.Run(tt.action, func(t *testing.T) {
			got := action.ResolveActionClass(tt.action)
			if got != tt.expected {
				t.Errorf("ResolveActionClass(%q) = %q, want %q", tt.action, got, tt.expected)
			}
		})
	}
}

func TestNormalizeNormalizedAtIsSet(t *testing.T) {
	raw := action.RawAction{Tool: "Read", File: "/tmp/test"}
	ctx := normalize(raw, "test")
	if ctx.NormalizedAt == 0 {
		t.Error("expected NormalizedAt to be set")
	}
}
