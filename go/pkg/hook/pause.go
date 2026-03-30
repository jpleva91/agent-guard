package hook

import (
	"bufio"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/AgentGuardHQ/agentguard/go/internal/confidence"
)

// PausePrompt describes a paused action awaiting human resolution.
type PausePrompt struct {
	ActionID   string
	Action     string
	Confidence float64
	Breakdown  confidence.Breakdown
	Reason     string
	Timeout    time.Duration
}

// PauseResolution is the human's response to a pause prompt.
type PauseResolution struct {
	Approved   bool
	ResolvedBy string
	TimedOut   bool
}

// RenderPauseAndWait prints the pause prompt to stderr and waits for stdin y/n.
func RenderPauseAndWait(p PausePrompt) PauseResolution {
	timeoutSec := int(p.Timeout.Seconds())
	if timeoutSec <= 0 {
		timeoutSec = 300
	}

	fmt.Fprintf(os.Stderr, "\n  \033[33m⚠ AgentGuard — Low Confidence (%.2f)\033[0m\n", p.Confidence)
	fmt.Fprintf(os.Stderr, "    Action:  %s\n", p.Action)
	fmt.Fprintf(os.Stderr, "    Risk:    action_risk=%.1f, retry_count=%.1f, state=%.1f, blast=%.1f\n",
		p.Breakdown.ActionRisk.Value,
		p.Breakdown.RetryCount.Value,
		p.Breakdown.EscalationState.Value,
		p.Breakdown.BlastRadius.Value,
	)
	fmt.Fprintf(os.Stderr, "    Reason:  %s\n", p.Reason)
	fmt.Fprintf(os.Stderr, "\n    [y] Approve   [n] Deny   (auto-deny in %d:%02d)\n\n", timeoutSec/60, timeoutSec%60)
	fmt.Fprintf(os.Stderr, "    > ")

	resultCh := make(chan string, 1)
	go func() {
		scanner := bufio.NewScanner(os.Stdin)
		if scanner.Scan() {
			resultCh <- strings.TrimSpace(strings.ToLower(scanner.Text()))
		} else {
			resultCh <- ""
		}
	}()

	select {
	case input := <-resultCh:
		if input == "y" || input == "yes" {
			fmt.Fprintf(os.Stderr, "    \033[32m✓ Approved\033[0m\n\n")
			return PauseResolution{Approved: true, ResolvedBy: "human:cli"}
		}
		fmt.Fprintf(os.Stderr, "    \033[31m✗ Denied\033[0m\n\n")
		return PauseResolution{Approved: false, ResolvedBy: "human:cli"}

	case <-time.After(p.Timeout):
		fmt.Fprintf(os.Stderr, "\n    \033[31m✗ Timed out — auto-denied\033[0m\n\n")
		return PauseResolution{Approved: false, ResolvedBy: "human:cli", TimedOut: true}
	}
}
