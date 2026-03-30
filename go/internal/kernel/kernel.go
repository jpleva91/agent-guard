package kernel

import (
	"fmt"
	"os"
	"sync"
	"time"

	"github.com/AgentGuardHQ/agentguard/go/internal/action"
	"github.com/AgentGuardHQ/agentguard/go/internal/confidence"
	"github.com/AgentGuardHQ/agentguard/go/internal/config"
	"github.com/AgentGuardHQ/agentguard/go/internal/engine"
	"github.com/AgentGuardHQ/agentguard/go/internal/event"
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
	bus        *event.Bus
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
		bus:        cfg.EventBus,
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

	// 2. Emit ActionRequested — before evaluation, so denials are always auditable.
	// Telemetry failures never block enforcement (publish is best-effort).
	k.publishEvent(event.ActionRequested, map[string]any{
		"actionType":    ctx.Action,
		"target":        ctx.Target,
		"justification": "agent action proposal",
		"agentId":       ctx.Source,
		"sessionId":     k.sessionID,
	})

	// 3. Evaluate: run policy engine
	evalOpts := &engine.EvalOptions{
		DefaultDeny: k.config.DefaultDeny,
	}
	evalResult := engine.Evaluate(ctx, k.policies, evalOpts)

	// Confidence scoring
	var conf confidence.Result
	if k.confidenceEnabled() {
		conf = confidence.Compute(confidence.Input{
			ActionType:      ctx.Action,
			RetryCount:      0,
			EscalationLevel: 0,
			FilesAffected:   ctx.FilesAffected,
			MaxBlastRadius:  k.maxBlastRadius(),
		})
	} else {
		conf = confidence.Result{Score: 1.0}
	}
	baseSeverity := evalResult.Severity
	boost := confidence.SeverityBoost(conf.Score, k.maxBoost())
	effSeverity := confidence.EffectiveSeverity(baseSeverity, boost)

	// 4. Emit ActionAllowed or ActionDenied — KE-3 compatible envelope.
	switch evalResult.Decision {
	case "allow":
		k.publishEvent(event.ActionAllowed, map[string]any{
			"actionType": ctx.Action,
			"target":     ctx.Target,
			"capability": ctx.ActionClass,
			"reason":     evalResult.Reason,
			"agentId":    ctx.Source,
			"sessionId":  k.sessionID,
		})
	case "deny":
		k.publishEvent(event.ActionDenied, map[string]any{
			"actionType": ctx.Action,
			"target":     ctx.Target,
			"reason":     evalResult.Reason,
			"agentId":    ctx.Source,
			"sessionId":  k.sessionID,
		})
	case "escalate":
		k.publishEvent(event.ActionEscalated, map[string]any{
			"actionType": ctx.Action,
			"target":     ctx.Target,
			"reason":     evalResult.Reason,
			"agentId":    ctx.Source,
			"sessionId":  k.sessionID,
		})
	}

	// 5. Build result
	result := KernelResult{
		Decision:            evalResult.Decision,
		Reason:              evalResult.Reason,
		Action:              ctx,
		EvalResult:          evalResult,
		BlastRadius:         0, // placeholder — blast/ package built separately
		Confidence:          conf.Score,
		ConfidenceBreakdown: conf.Breakdown,
		EffectiveSeverity:   effSeverity,
		Suggestion:          evalResult.Suggestion,
		CorrectedCommand:    evalResult.CorrectedCommand,
		Duration:            time.Since(start),
		Timestamp:           start,
		DryRun:              k.config.DryRun,
		SessionID:           k.sessionID,
	}

	// 6. Update stats (thread-safe)
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

// publishEvent emits a governance event to the bus if one is configured.
// Errors are silently ignored — telemetry failures must never block enforcement.
func (k *Kernel) publishEvent(kind event.Kind, data map[string]any) {
	if k.bus == nil {
		return
	}
	evt := event.NewEvent(kind, k.sessionID, data)
	// Recover from any panic in bus handlers to guarantee enforcement is never blocked.
	defer func() { recover() }() //nolint:errcheck
	k.bus.Publish(evt)
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

// Bus returns the kernel's event bus, or nil if none was configured.
func (k *Kernel) Bus() *event.Bus {
	return k.bus
}

func (k *Kernel) confidenceEnabled() bool {
	if k.config.ConfidenceGating == nil {
		return false
	}
	return k.config.ConfidenceGating.Enabled
}

func (k *Kernel) maxBoost() int {
	if k.config.ConfidenceGating == nil || k.config.ConfidenceGating.MaxBoost == 0 {
		return 3
	}
	return k.config.ConfidenceGating.MaxBoost
}

func (k *Kernel) maxBlastRadius() int {
	if k.config.ConfidenceGating == nil || k.config.ConfidenceGating.MaxBlastRadius == 0 {
		return 50
	}
	return k.config.ConfidenceGating.MaxBlastRadius
}

// Close emits a RunEnded event and performs cleanup.
func (k *Kernel) Close() error {
	k.publishEvent(event.RunEnded, map[string]any{
		"sessionId":    k.sessionID,
		"totalActions": k.Stats().TotalActions,
		"allowed":      k.Stats().Allowed,
		"denied":       k.Stats().Denied,
	})
	return nil
}
