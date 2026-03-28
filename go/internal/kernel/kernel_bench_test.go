package kernel_test

// Benchmarks for the Go governance kernel.
// Goal: sub-millisecond enforcement latency (< 1ms p50 for the synchronous evaluation path).
//
// Run with: go test -bench=. -benchmem ./internal/kernel/

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/AgentGuardHQ/agentguard/go/internal/action"
	"github.com/AgentGuardHQ/agentguard/go/internal/event"
	"github.com/AgentGuardHQ/agentguard/go/internal/kernel"
)

// writeTempPolicyB writes a YAML policy to a temp file for benchmarks.
func writeTempPolicyB(b *testing.B, content string) string {
	b.Helper()
	dir := b.TempDir()
	path := filepath.Join(dir, "policy.yaml")
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		b.Fatalf("write temp policy: %v", err)
	}
	return path
}

// sharedKernel creates a reusable kernel for benchmarks (policy loading not benched).
func sharedKernel(b *testing.B) *kernel.Kernel {
	b.Helper()
	path := writeTempPolicyB(b, testPolicyYAML)
	k, err := kernel.NewKernel(kernel.KernelConfig{
		PolicyPaths: []string{path},
		DefaultDeny: true,
		AgentName:   "bench-agent",
	})
	if err != nil {
		b.Fatalf("NewKernel: %v", err)
	}
	return k
}

func BenchmarkPropose_FileRead_Allow(b *testing.B) {
	k := sharedKernel(b)
	defer k.Close()

	raw := action.RawAction{Tool: "Read", File: "src/main.ts"}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = k.Propose(raw)
	}
}

func BenchmarkPropose_GitPush_Deny(b *testing.B) {
	k := sharedKernel(b)
	defer k.Close()

	raw := action.RawAction{Tool: "Bash", Command: "git push origin main"}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = k.Propose(raw)
	}
}

func BenchmarkPropose_ShellExec_Allow(b *testing.B) {
	k := sharedKernel(b)
	defer k.Close()

	raw := action.RawAction{Tool: "Bash", Command: "npm test"}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = k.Propose(raw)
	}
}

func BenchmarkPropose_WithEventBus_Allow(b *testing.B) {
	bus := event.NewBus()
	path := writeTempPolicyB(b, testPolicyYAML)
	k, err := kernel.NewKernel(kernel.KernelConfig{
		PolicyPaths: []string{path},
		DefaultDeny: true,
		AgentName:   "bench-agent",
		EventBus:    bus,
	})
	if err != nil {
		b.Fatalf("NewKernel: %v", err)
	}
	defer k.Close()

	raw := action.RawAction{Tool: "Read", File: "src/main.ts"}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = k.Propose(raw)
	}
}

func BenchmarkPropose_WithEventBus_Deny(b *testing.B) {
	bus := event.NewBus()
	path := writeTempPolicyB(b, testPolicyYAML)
	k, err := kernel.NewKernel(kernel.KernelConfig{
		PolicyPaths: []string{path},
		DefaultDeny: true,
		AgentName:   "bench-agent",
		EventBus:    bus,
	})
	if err != nil {
		b.Fatalf("NewKernel: %v", err)
	}
	defer k.Close()

	raw := action.RawAction{Tool: "Bash", Command: "git push origin main"}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = k.Propose(raw)
	}
}

func BenchmarkPropose_Sequential10Actions(b *testing.B) {
	k := sharedKernel(b)
	defer k.Close()

	actions := []action.RawAction{
		{Tool: "Read", File: "src/a.ts"},
		{Tool: "Write", File: "src/b.ts", Content: "x"},
		{Tool: "Bash", Command: "npm test"},
		{Tool: "Bash", Command: "git push origin feature/abc"},
		{Tool: "Read", File: "src/c.ts"},
		{Tool: "Bash", Command: "npm run lint"},
		{Tool: "Write", File: "src/d.ts", Content: "y"},
		{Tool: "Read", File: "src/e.ts"},
		{Tool: "Bash", Command: "git status"},
		{Tool: "Read", File: "src/f.ts"},
	}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		for _, raw := range actions {
			_, _ = k.Propose(raw)
		}
	}
}

func BenchmarkKernelCreation(b *testing.B) {
	path := writeTempPolicyB(b, testPolicyYAML)
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		k, err := kernel.NewKernel(kernel.KernelConfig{
			PolicyPaths: []string{path},
			DefaultDeny: true,
		})
		if err != nil {
			b.Fatalf("NewKernel: %v", err)
		}
		_ = k.Close()
	}
}

// BenchmarkPropose_SubMsValidation runs a quick latency check.
// Prints the p50 estimate and fails if enforcement exceeds 1ms.
func BenchmarkPropose_SubMsValidation(b *testing.B) {
	k := sharedKernel(b)
	defer k.Close()

	raw := action.RawAction{Tool: "Read", File: "src/main.ts"}

	// Warmup
	for i := 0; i < 10; i++ {
		_, _ = k.Propose(raw)
	}

	b.ResetTimer()
	start := time.Now()
	for i := 0; i < b.N; i++ {
		_, _ = k.Propose(raw)
	}
	elapsed := time.Since(start)

	nsPerOp := elapsed.Nanoseconds() / int64(b.N)
	msPerOp := float64(nsPerOp) / 1e6
	b.ReportMetric(msPerOp, "ms/op")

	// Sub-millisecond target — enforcement must not exceed 1ms p50.
	if msPerOp > 1.0 {
		b.Errorf("enforcement latency %.3fms exceeds 1ms sub-ms target (ns/op=%d)", msPerOp, nsPerOp)
	} else {
		b.Logf("enforcement latency: %.3fms/op — sub-ms target met (%s)", msPerOp, formatNs(nsPerOp))
	}
}

func formatNs(ns int64) string {
	if ns < 1000 {
		return fmt.Sprintf("%dns", ns)
	}
	if ns < 1_000_000 {
		return fmt.Sprintf("%.1fµs", float64(ns)/1000)
	}
	return fmt.Sprintf("%.3fms", float64(ns)/1e6)
}
