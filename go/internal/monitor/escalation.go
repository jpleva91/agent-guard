// Package monitor provides the escalation state machine for the AgentGuard kernel.
// The monitor tracks denial patterns using a sliding time window and automatically
// escalates through NORMAL -> ELEVATED -> HIGH -> LOCKDOWN as denial density increases.
package monitor

import (
	"sync"
	"time"
)

// EscalationLevel represents the current security posture of a governance session.
type EscalationLevel string

const (
	// Normal is the default escalation level — no unusual denial activity.
	Normal EscalationLevel = "NORMAL"
	// Elevated indicates moderate denial activity within the sliding window.
	Elevated EscalationLevel = "ELEVATED"
	// High indicates heavy denial activity within the sliding window.
	High EscalationLevel = "HIGH"
	// Lockdown indicates extreme denial activity — all actions are blocked
	// until a human resets the session.
	Lockdown EscalationLevel = "LOCKDOWN"
)

// EscalationState is a snapshot of the monitor's internal state.
type EscalationState struct {
	Level          EscalationLevel
	DenyCount      int
	DenyWindow     []time.Time
	LastEscalation time.Time
	Cooldown       time.Duration
}

// EscalationConfig controls the thresholds and timing of the escalation state machine.
type EscalationConfig struct {
	// ElevatedThreshold is the number of denials within the window to reach ELEVATED.
	ElevatedThreshold int
	// HighThreshold is the number of denials within the window to reach HIGH.
	HighThreshold int
	// LockdownThreshold is the number of denials within the window to reach LOCKDOWN.
	LockdownThreshold int
	// WindowDuration is the sliding window for counting recent denials.
	WindowDuration time.Duration
	// CooldownDuration is the time after the last escalation before de-escalation can occur.
	CooldownDuration time.Duration
	// Now is an injectable clock for testing. Defaults to time.Now.
	Now func() time.Time
}

// DefaultConfig returns an EscalationConfig with sensible defaults:
// ELEVATED at 3 denials, HIGH at 5, LOCKDOWN at 10, 5-minute window, 10-minute cooldown.
func DefaultConfig() EscalationConfig {
	return EscalationConfig{
		ElevatedThreshold: 3,
		HighThreshold:     5,
		LockdownThreshold: 10,
		WindowDuration:    5 * time.Minute,
		CooldownDuration:  10 * time.Minute,
		Now:               time.Now,
	}
}

// Monitor is the escalation state machine. It tracks denial events in a sliding
// time window and transitions between escalation levels based on configured thresholds.
// All methods are safe for concurrent use.
type Monitor struct {
	mu    sync.Mutex
	cfg   EscalationConfig
	state escalationInternal
}

type escalationInternal struct {
	level          EscalationLevel
	denyCount      int
	denyWindow     []time.Time
	lastEscalation time.Time
	lastAllow      time.Time
}

// NewMonitor creates a Monitor with the given configuration.
// Use DefaultConfig() for sensible defaults.
func NewMonitor(cfg EscalationConfig) *Monitor {
	if cfg.Now == nil {
		cfg.Now = time.Now
	}
	return &Monitor{
		cfg: cfg,
		state: escalationInternal{
			level:      Normal,
			denyWindow: make([]time.Time, 0),
		},
	}
}

// RecordDenial records a denied action and returns the new escalation level.
// The denial is added to the sliding window and thresholds are re-evaluated.
func (m *Monitor) RecordDenial() EscalationLevel {
	m.mu.Lock()
	defer m.mu.Unlock()

	now := m.cfg.Now()
	m.state.denyCount++
	m.state.denyWindow = append(m.state.denyWindow, now)
	m.pruneWindow(now)
	m.updateLevel(now)
	return m.state.level
}

// RecordAllow records an allowed action. This does not escalate but may
// contribute to cooldown-based de-escalation on subsequent Tick() calls.
func (m *Monitor) RecordAllow() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.state.lastAllow = m.cfg.Now()
}

// Level returns the current escalation level.
func (m *Monitor) Level() EscalationLevel {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.state.level
}

// State returns a snapshot of the full escalation state.
func (m *Monitor) State() EscalationState {
	m.mu.Lock()
	defer m.mu.Unlock()

	window := make([]time.Time, len(m.state.denyWindow))
	copy(window, m.state.denyWindow)

	return EscalationState{
		Level:          m.state.level,
		DenyCount:      m.state.denyCount,
		DenyWindow:     window,
		LastEscalation: m.state.lastEscalation,
		Cooldown:       m.cfg.CooldownDuration,
	}
}

// ShouldBlock returns true if the session is in LOCKDOWN and all actions
// should be denied until a human resets the monitor.
func (m *Monitor) ShouldBlock() bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.state.level == Lockdown
}

// Reset resets the monitor to NORMAL, clearing all denial history.
func (m *Monitor) Reset() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.state.level = Normal
	m.state.denyCount = 0
	m.state.denyWindow = make([]time.Time, 0)
	m.state.lastEscalation = time.Time{}
	m.state.lastAllow = time.Time{}
}

// Tick checks cooldown timers and may de-escalate if enough time has passed
// since the last escalation and there are few recent denials. Call this
// periodically (e.g., on each allow or on a timer) to enable recovery.
func (m *Monitor) Tick() {
	m.mu.Lock()
	defer m.mu.Unlock()

	now := m.cfg.Now()
	m.pruneWindow(now)

	// Don't de-escalate if we never escalated or are already NORMAL.
	if m.state.level == Normal || m.state.lastEscalation.IsZero() {
		return
	}

	// Check if cooldown has elapsed since last escalation.
	if now.Sub(m.state.lastEscalation) < m.cfg.CooldownDuration {
		return
	}

	// Re-evaluate level based on current window after pruning.
	m.updateLevel(now)
}

// pruneWindow removes deny timestamps outside the sliding window.
// Must be called with m.mu held.
func (m *Monitor) pruneWindow(now time.Time) {
	cutoff := now.Add(-m.cfg.WindowDuration)
	i := 0
	for i < len(m.state.denyWindow) && m.state.denyWindow[i].Before(cutoff) {
		i++
	}
	if i > 0 {
		m.state.denyWindow = m.state.denyWindow[i:]
	}
}

// updateLevel sets the escalation level based on current window size.
// Must be called with m.mu held.
func (m *Monitor) updateLevel(now time.Time) {
	windowCount := len(m.state.denyWindow)
	prevLevel := m.state.level

	switch {
	case windowCount >= m.cfg.LockdownThreshold:
		m.state.level = Lockdown
	case windowCount >= m.cfg.HighThreshold:
		m.state.level = High
	case windowCount >= m.cfg.ElevatedThreshold:
		m.state.level = Elevated
	default:
		m.state.level = Normal
	}

	if m.state.level != prevLevel {
		m.state.lastEscalation = now
	}
}
