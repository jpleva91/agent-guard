package kernel

import (
	"fmt"
	"os"
	"sync"
	"time"

	"github.com/AgentGuardHQ/agent-guard/go/internal/action"
	"github.com/AgentGuardHQ/agent-guard/go/internal/config"
	"github.com/AgentGuardHQ/agent-guard/go/internal/engine"
)

// Kernel is the governed action kernel — the central orchestrator.
// It loads policies, normalizes raw actions, evaluates them against
// the policy set, and returns governance decisions. Thread-safe.
type Kernel struct {
	normalizer *action.Normalizer
	policies   []*action.LoadedPolicy
	config     KernelConfig
	sessionID  string
	stats      KernelStats
	mu         sync.Mutex
}

// NewKernel creates a Kernel from the provided configuration.
// It loads all policies from the configured paths and initializes
// the normalizer from embedded governance data.
func NewKernel(cfg KernelConfig) (*Kernel, error) {
	// Load all policies
	policies := make([]*action.LoadedPolicy, 0, len(cfg.PolicyPaths))
	for _, path := range cfg.PolicyPaths {
		data, err := os.ReadFile(path)
		if err != nil {
			return nil, fmt.Errorf("read policy %s: %w", path, err)
		}
		policy, err := config.LoadYamlPolicy(data)
		if err != nil {
			return nil, fmt.Errorf("parse policy %s: %w", path, err)
		}
		policies = append(policies, policy)
	}

	// Create normalizer from embedded governance data
	normalizer := config.NewDefaultNormalizer()

	// Generate session ID if not provided
	sessionID := cfg.SessionID
	if sessionID == "" {
		sessionID = fmt.Sprintf("session_%d", time.Now().UnixMilli())
	}

	return &Kernel{
		normalizer: normalizer,
		policies:   policies,
		config:     cfg,
		sessionID:  sessionID,
	}, nil
}

// Propose is the main entry point for the governance pipeline.
// It normalizes a raw action, evaluates it against loaded policies,
// builds a KernelResult, and updates session statistics.
//
// Pipeline: raw -> normalize -> evaluate -> result
func (k *Kernel) Propose(raw action.RawAction) (KernelResult, error) {
	start := time.Now()

	// 1. Normalize: raw -> ActionContext
	source := raw.Agent
	if source == "" {
		source = k.config.AgentName
	}
	if source == "" {
		source = "cli"
	}
	ctx := k.normalizer.Normalize(raw, source)

	// 2. Evaluate: run policy engine
	evalOpts := &engine.EvalOptions{
		DefaultDeny: k.config.DefaultDeny,
	}
	evalResult := engine.Evaluate(ctx, k.policies, evalOpts)

	// 3. Build result
	result := KernelResult{
		Decision:         evalResult.Decision,
		Reason:           evalResult.Reason,
		Action:           ctx,
		EvalResult:       evalResult,
		BlastRadius:      0, // placeholder — blast/ package built separately
		Suggestion:       evalResult.Suggestion,
		CorrectedCommand: evalResult.CorrectedCommand,
		Duration:         time.Since(start),
		Timestamp:        start,
		DryRun:           k.config.DryRun,
		SessionID:        k.sessionID,
	}

	// 4. Update stats (thread-safe)
	k.mu.Lock()
	k.stats.TotalActions++
	switch evalResult.Decision {
	case "allow":
		k.stats.Allowed++
	case "deny":
		k.stats.Denied++
	case "escalate":
		k.stats.Escalated++
	default:
		k.stats.Errors++
	}
	k.mu.Unlock()

	return result, nil
}

// Stats returns a snapshot of the kernel's aggregate governance statistics.
func (k *Kernel) Stats() KernelStats {
	k.mu.Lock()
	defer k.mu.Unlock()
	return k.stats
}

// SessionID returns the kernel's session identifier.
func (k *Kernel) SessionID() string {
	return k.sessionID
}

// Policies returns the loaded policies (read-only slice).
func (k *Kernel) Policies() []*action.LoadedPolicy {
	return k.policies
}

// Close performs cleanup. Currently a no-op but provides a stable
// shutdown point for future resource management (event sinks, etc.).
func (k *Kernel) Close() error {
	return nil
}
