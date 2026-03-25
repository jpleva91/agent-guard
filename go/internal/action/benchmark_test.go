package action_test

import (
	"testing"

	"github.com/AgentGuardHQ/agent-guard/go/internal/action"
	"github.com/AgentGuardHQ/agent-guard/go/internal/config"
)

func setupNormalizer(b *testing.B) *action.Normalizer {
	b.Helper()
	return config.NewDefaultNormalizer()
}

// BenchmarkNormalize_ShellExec benchmarks normalizing a shell.exec command (most complex path).
func BenchmarkNormalize_ShellExec(b *testing.B) {
	n := setupNormalizer(b)
	raw := action.RawAction{
		Tool:    "Bash",
		Command: "git push origin feat/my-feature --force",
		Agent:   "claude-code:opus:kernel:senior",
	}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		n.Normalize(raw, "benchmark")
	}
}

// BenchmarkNormalize_FileWrite benchmarks normalizing a simple file write (fast path).
func BenchmarkNormalize_FileWrite(b *testing.B) {
	n := setupNormalizer(b)
	raw := action.RawAction{
		Tool:  "Write",
		File:  "/home/user/project/src/main.ts",
		Agent: "claude-code:opus:kernel:senior",
	}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		n.Normalize(raw, "benchmark")
	}
}

// BenchmarkNormalize_GitCompound benchmarks normalizing a compound git command.
func BenchmarkNormalize_GitCompound(b *testing.B) {
	n := setupNormalizer(b)
	raw := action.RawAction{
		Tool:    "Bash",
		Command: "git add . && git commit -m 'fix: something' && git push origin main",
		Agent:   "claude-code:opus:kernel:senior",
	}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		n.Normalize(raw, "benchmark")
	}
}

// BenchmarkNormalize_DestructiveCommand benchmarks normalizing a destructive command.
func BenchmarkNormalize_DestructiveCommand(b *testing.B) {
	n := setupNormalizer(b)
	raw := action.RawAction{
		Tool:    "Bash",
		Command: "rm -rf /tmp/build && docker system prune -af",
		Agent:   "claude-code:opus:kernel:senior",
	}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		n.Normalize(raw, "benchmark")
	}
}

// BenchmarkNormalize_GithubCLI benchmarks normalizing a GitHub CLI command.
func BenchmarkNormalize_GithubCLI(b *testing.B) {
	n := setupNormalizer(b)
	raw := action.RawAction{
		Tool:    "Bash",
		Command: "gh pr create --title 'feat: add thing' --body 'description'",
		Agent:   "claude-code:opus:kernel:senior",
	}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		n.Normalize(raw, "benchmark")
	}
}
