package monitor_test

import (
	"sync"
	"testing"
	"time"

	"github.com/AgentGuardHQ/agent-guard/go/internal/monitor"
)

// fakeClock returns a controllable clock for testing.
func fakeClock(start time.Time) (func() time.Time, func(d time.Duration)) {
	now := start
	return func() time.Time {
			return now
		}, func(d time.Duration) {
			now = now.Add(d)
		}
}

func TestInitialStateIsNormal(t *testing.T) {
	m := monitor.NewMonitor(monitor.DefaultConfig())

	if m.Level() != monitor.Normal {
		t.Errorf("expected NORMAL, got %s", m.Level())
	}
	if m.ShouldBlock() {
		t.Error("should not block at NORMAL")
	}

	state := m.State()
	if state.DenyCount != 0 {
		t.Errorf("expected 0 deny count, got %d", state.DenyCount)
	}
	if len(state.DenyWindow) != 0 {
		t.Errorf("expected empty deny window, got %d", len(state.DenyWindow))
	}
}

func TestDenialsEscalateNormalToElevated(t *testing.T) {
	cfg := monitor.DefaultConfig()
	now, advance := fakeClock(time.Now())
	cfg.Now = now
	m := monitor.NewMonitor(cfg)

	// Default elevated threshold is 3
	for i := 0; i < 2; i++ {
		level := m.RecordDenial()
		if level != monitor.Normal {
			t.Errorf("denial %d: expected NORMAL, got %s", i+1, level)
		}
		advance(time.Second)
	}

	// Third denial should escalate to ELEVATED
	level := m.RecordDenial()
	if level != monitor.Elevated {
		t.Errorf("expected ELEVATED after 3 denials, got %s", level)
	}
}

func TestDenialsEscalateToHigh(t *testing.T) {
	cfg := monitor.DefaultConfig()
	now, advance := fakeClock(time.Now())
	cfg.Now = now
	m := monitor.NewMonitor(cfg)

	// Default high threshold is 5
	for i := 0; i < 4; i++ {
		m.RecordDenial()
		advance(time.Second)
	}

	level := m.RecordDenial()
	if level != monitor.High {
		t.Errorf("expected HIGH after 5 denials, got %s", level)
	}
}

func TestDenialsEscalateToLockdown(t *testing.T) {
	cfg := monitor.DefaultConfig()
	now, advance := fakeClock(time.Now())
	cfg.Now = now
	m := monitor.NewMonitor(cfg)

	// Default lockdown threshold is 10
	for i := 0; i < 9; i++ {
		m.RecordDenial()
		advance(time.Second)
	}

	level := m.RecordDenial()
	if level != monitor.Lockdown {
		t.Errorf("expected LOCKDOWN after 10 denials, got %s", level)
	}

	if !m.ShouldBlock() {
		t.Error("should block at LOCKDOWN")
	}
}

func TestAllowsDoNotEscalate(t *testing.T) {
	m := monitor.NewMonitor(monitor.DefaultConfig())

	for i := 0; i < 100; i++ {
		m.RecordAllow()
	}

	if m.Level() != monitor.Normal {
		t.Errorf("expected NORMAL after allows, got %s", m.Level())
	}
}

func TestSlidingWindowExpiration(t *testing.T) {
	cfg := monitor.DefaultConfig()
	cfg.WindowDuration = 2 * time.Second
	cfg.ElevatedThreshold = 3
	cfg.HighThreshold = 5
	cfg.LockdownThreshold = 10

	now, advance := fakeClock(time.Now())
	cfg.Now = now
	m := monitor.NewMonitor(cfg)

	// Record 3 denials to reach ELEVATED
	for i := 0; i < 3; i++ {
		m.RecordDenial()
		advance(100 * time.Millisecond)
	}
	if m.Level() != monitor.Elevated {
		t.Errorf("expected ELEVATED, got %s", m.Level())
	}

	// Advance past the window so old denials expire
	advance(3 * time.Second)

	// A single new denial should be below threshold -> NORMAL
	level := m.RecordDenial()
	if level != monitor.Normal {
		t.Errorf("expected NORMAL after window expiration + 1 denial, got %s", level)
	}
}

func TestCooldownDeescalation(t *testing.T) {
	cfg := monitor.DefaultConfig()
	cfg.WindowDuration = 1 * time.Second
	cfg.CooldownDuration = 2 * time.Second
	cfg.ElevatedThreshold = 2
	cfg.HighThreshold = 4
	cfg.LockdownThreshold = 8

	now, advance := fakeClock(time.Now())
	cfg.Now = now
	m := monitor.NewMonitor(cfg)

	// Escalate to ELEVATED
	m.RecordDenial()
	advance(100 * time.Millisecond)
	m.RecordDenial()
	if m.Level() != monitor.Elevated {
		t.Fatalf("expected ELEVATED, got %s", m.Level())
	}

	// Advance past both window and cooldown
	advance(3 * time.Second)

	// Tick should de-escalate since denials have expired from the window
	m.Tick()
	if m.Level() != monitor.Normal {
		t.Errorf("expected NORMAL after cooldown tick, got %s", m.Level())
	}
}

func TestCooldownDoesNotDeescalateEarly(t *testing.T) {
	cfg := monitor.DefaultConfig()
	cfg.WindowDuration = 10 * time.Second
	cfg.CooldownDuration = 5 * time.Second
	cfg.ElevatedThreshold = 2
	cfg.HighThreshold = 4
	cfg.LockdownThreshold = 8

	now, advance := fakeClock(time.Now())
	cfg.Now = now
	m := monitor.NewMonitor(cfg)

	// Escalate to ELEVATED
	m.RecordDenial()
	advance(100 * time.Millisecond)
	m.RecordDenial()
	if m.Level() != monitor.Elevated {
		t.Fatalf("expected ELEVATED, got %s", m.Level())
	}

	// Advance less than cooldown
	advance(2 * time.Second)
	m.Tick()

	// Still ELEVATED because cooldown hasn't elapsed
	if m.Level() != monitor.Elevated {
		t.Errorf("expected ELEVATED before cooldown elapses, got %s", m.Level())
	}
}

func TestShouldBlockOnlyAtLockdown(t *testing.T) {
	cfg := monitor.DefaultConfig()
	now, advance := fakeClock(time.Now())
	cfg.Now = now
	m := monitor.NewMonitor(cfg)

	if m.ShouldBlock() {
		t.Error("should not block at NORMAL")
	}

	// Reach ELEVATED
	for i := 0; i < cfg.ElevatedThreshold; i++ {
		m.RecordDenial()
		advance(time.Millisecond)
	}
	if m.ShouldBlock() {
		t.Error("should not block at ELEVATED")
	}

	// Reach HIGH
	for i := 0; i < cfg.HighThreshold-cfg.ElevatedThreshold; i++ {
		m.RecordDenial()
		advance(time.Millisecond)
	}
	if m.ShouldBlock() {
		t.Error("should not block at HIGH")
	}

	// Reach LOCKDOWN
	for i := 0; i < cfg.LockdownThreshold-cfg.HighThreshold; i++ {
		m.RecordDenial()
		advance(time.Millisecond)
	}
	if !m.ShouldBlock() {
		t.Error("should block at LOCKDOWN")
	}
}

func TestReset(t *testing.T) {
	cfg := monitor.DefaultConfig()
	now, advance := fakeClock(time.Now())
	cfg.Now = now
	m := monitor.NewMonitor(cfg)

	// Escalate to LOCKDOWN
	for i := 0; i < cfg.LockdownThreshold; i++ {
		m.RecordDenial()
		advance(time.Millisecond)
	}
	if m.Level() != monitor.Lockdown {
		t.Fatalf("expected LOCKDOWN, got %s", m.Level())
	}

	m.Reset()

	if m.Level() != monitor.Normal {
		t.Errorf("expected NORMAL after reset, got %s", m.Level())
	}
	if m.ShouldBlock() {
		t.Error("should not block after reset")
	}
	state := m.State()
	if state.DenyCount != 0 {
		t.Errorf("expected 0 deny count after reset, got %d", state.DenyCount)
	}
	if len(state.DenyWindow) != 0 {
		t.Errorf("expected empty deny window after reset, got %d", len(state.DenyWindow))
	}
}

func TestStateSnapshot(t *testing.T) {
	cfg := monitor.DefaultConfig()
	now, advance := fakeClock(time.Now())
	cfg.Now = now
	m := monitor.NewMonitor(cfg)

	m.RecordDenial()
	advance(time.Second)
	m.RecordDenial()

	state := m.State()
	if state.DenyCount != 2 {
		t.Errorf("expected deny count 2, got %d", state.DenyCount)
	}
	if len(state.DenyWindow) != 2 {
		t.Errorf("expected 2 entries in deny window, got %d", len(state.DenyWindow))
	}
	if state.Level != monitor.Normal {
		t.Errorf("expected NORMAL (2 < threshold 3), got %s", state.Level)
	}
	if state.Cooldown != cfg.CooldownDuration {
		t.Errorf("expected cooldown %v, got %v", cfg.CooldownDuration, state.Cooldown)
	}
}

func TestStateWindowSnapshotIsCopy(t *testing.T) {
	m := monitor.NewMonitor(monitor.DefaultConfig())
	m.RecordDenial()

	s1 := m.State()
	s1.DenyWindow[0] = time.Time{} // mutate the snapshot

	s2 := m.State()
	if s2.DenyWindow[0].IsZero() {
		t.Error("State() should return a copy of the deny window")
	}
}

func TestCustomThresholds(t *testing.T) {
	cfg := monitor.EscalationConfig{
		ElevatedThreshold: 1,
		HighThreshold:     2,
		LockdownThreshold: 3,
		WindowDuration:    time.Minute,
		CooldownDuration:  time.Minute,
	}
	now, advance := fakeClock(time.Now())
	cfg.Now = now
	m := monitor.NewMonitor(cfg)

	level := m.RecordDenial()
	if level != monitor.Elevated {
		t.Errorf("expected ELEVATED at 1, got %s", level)
	}

	advance(time.Millisecond)
	level = m.RecordDenial()
	if level != monitor.High {
		t.Errorf("expected HIGH at 2, got %s", level)
	}

	advance(time.Millisecond)
	level = m.RecordDenial()
	if level != monitor.Lockdown {
		t.Errorf("expected LOCKDOWN at 3, got %s", level)
	}
}

func TestTickAtNormalIsNoop(t *testing.T) {
	m := monitor.NewMonitor(monitor.DefaultConfig())
	m.Tick() // Should not panic or change state
	if m.Level() != monitor.Normal {
		t.Errorf("expected NORMAL, got %s", m.Level())
	}
}

func TestConcurrentSafety(t *testing.T) {
	m := monitor.NewMonitor(monitor.DefaultConfig())
	var wg sync.WaitGroup

	// Writers: record denials
	for g := 0; g < 5; g++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := 0; i < 50; i++ {
				m.RecordDenial()
			}
		}()
	}

	// Writers: record allows
	for g := 0; g < 5; g++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := 0; i < 50; i++ {
				m.RecordAllow()
			}
		}()
	}

	// Readers
	for g := 0; g < 5; g++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := 0; i < 50; i++ {
				_ = m.Level()
				_ = m.State()
				_ = m.ShouldBlock()
				m.Tick()
			}
		}()
	}

	wg.Wait()

	// Just verify it didn't panic and state is consistent
	state := m.State()
	if state.DenyCount != 250 {
		t.Errorf("expected 250 denials from concurrent writes, got %d", state.DenyCount)
	}
}
