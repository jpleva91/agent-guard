package kernel_test

// Telemetry wiring tests — KE-3 GovernanceEvent emission from the kernel.
// Validates that Propose() emits ActionRequested + ActionAllowed/Denied events,
// and that telemetry failures never block enforcement decisions.

import (
	"sync"
	"testing"

	"github.com/AgentGuardHQ/agentguard/go/internal/action"
	"github.com/AgentGuardHQ/agentguard/go/internal/event"
	"github.com/AgentGuardHQ/agentguard/go/internal/kernel"
)

// captureEvents subscribes to a bus and collects all published events.
func captureEvents(bus *event.Bus) *[]event.Event {
	var mu sync.Mutex
	collected := make([]event.Event, 0, 8)
	bus.Subscribe(func(e event.Event) {
		mu.Lock()
		collected = append(collected, e)
		mu.Unlock()
	})
	return &collected
}

func newTestKernelWithBus(t *testing.T, bus *event.Bus) *kernel.Kernel {
	t.Helper()
	path := writeTempPolicy(t, testPolicyYAML)
	k, err := kernel.NewKernel(kernel.KernelConfig{
		PolicyPaths: []string{path},
		DefaultDeny: true,
		AgentName:   "test-agent",
		EventBus:    bus,
		SessionID:   "test-session",
	})
	if err != nil {
		t.Fatalf("NewKernel: %v", err)
	}
	return k
}

func TestTelemetry_AllowEmitsRequestedAndAllowed(t *testing.T) {
	bus := event.NewBus()
	events := captureEvents(bus)
	k := newTestKernelWithBus(t, bus)
	defer k.Close()

	_, err := k.Propose(action.RawAction{Tool: "Read", File: "README.md"})
	if err != nil {
		t.Fatal(err)
	}

	if len(*events) < 2 {
		t.Fatalf("expected at least 2 events (ActionRequested + ActionAllowed), got %d", len(*events))
	}

	if (*events)[0].Kind != event.ActionRequested {
		t.Errorf("events[0]: expected ActionRequested, got %s", (*events)[0].Kind)
	}
	if (*events)[1].Kind != event.ActionAllowed {
		t.Errorf("events[1]: expected ActionAllowed, got %s", (*events)[1].Kind)
	}
}

func TestTelemetry_DenyEmitsRequestedAndDenied(t *testing.T) {
	bus := event.NewBus()
	events := captureEvents(bus)
	k := newTestKernelWithBus(t, bus)
	defer k.Close()

	_, err := k.Propose(action.RawAction{
		Tool:    "Bash",
		Command: "git push origin main",
	})
	if err != nil {
		t.Fatal(err)
	}

	if len(*events) < 2 {
		t.Fatalf("expected at least 2 events (ActionRequested + ActionDenied), got %d", len(*events))
	}

	if (*events)[0].Kind != event.ActionRequested {
		t.Errorf("events[0]: expected ActionRequested, got %s", (*events)[0].Kind)
	}
	if (*events)[1].Kind != event.ActionDenied {
		t.Errorf("events[1]: expected ActionDenied, got %s", (*events)[1].Kind)
	}
}

func TestTelemetry_EventPayloadMatchesKE3Schema(t *testing.T) {
	bus := event.NewBus()
	events := captureEvents(bus)
	k := newTestKernelWithBus(t, bus)
	defer k.Close()

	_, err := k.Propose(action.RawAction{Tool: "Read", File: "src/main.ts"})
	if err != nil {
		t.Fatal(err)
	}

	if len(*events) < 2 {
		t.Fatalf("expected 2 events, got %d", len(*events))
	}

	// Verify ActionRequested has required KE-3 fields: actionType, target, justification
	requested := (*events)[0]
	if requested.Data["actionType"] == "" || requested.Data["actionType"] == nil {
		t.Error("ActionRequested missing actionType")
	}
	if requested.Data["target"] == "" || requested.Data["target"] == nil {
		t.Error("ActionRequested missing target")
	}
	if requested.Data["justification"] == "" || requested.Data["justification"] == nil {
		t.Error("ActionRequested missing justification")
	}

	// Verify ActionAllowed has required KE-3 fields: actionType, target, capability
	allowed := (*events)[1]
	if allowed.Data["actionType"] == "" || allowed.Data["actionType"] == nil {
		t.Error("ActionAllowed missing actionType")
	}
	if allowed.Data["target"] == "" || allowed.Data["target"] == nil {
		t.Error("ActionAllowed missing target")
	}
	if allowed.Data["capability"] == "" || allowed.Data["capability"] == nil {
		t.Error("ActionAllowed missing capability")
	}

	// Verify sessionId propagation
	if requested.RunID != "test-session" {
		t.Errorf("ActionRequested RunID: expected test-session, got %s", requested.RunID)
	}
}

func TestTelemetry_DeniedPayloadMatchesKE3Schema(t *testing.T) {
	bus := event.NewBus()
	events := captureEvents(bus)
	k := newTestKernelWithBus(t, bus)
	defer k.Close()

	_, err := k.Propose(action.RawAction{Tool: "Bash", Command: "git push origin main"})
	if err != nil {
		t.Fatal(err)
	}

	denied := (*events)[1]
	// KE-3 required fields for ActionDenied: actionType, target, reason
	if denied.Data["actionType"] == "" || denied.Data["actionType"] == nil {
		t.Error("ActionDenied missing actionType")
	}
	if denied.Data["target"] == "" || denied.Data["target"] == nil {
		t.Error("ActionDenied missing target")
	}
	if denied.Data["reason"] == "" || denied.Data["reason"] == nil {
		t.Error("ActionDenied missing reason")
	}
}

func TestTelemetry_NoBusIsNoOp(t *testing.T) {
	// Kernel without a bus — Propose must still work correctly.
	k := newTestKernel(t)
	defer k.Close()

	result, err := k.Propose(action.RawAction{Tool: "Read", File: "README.md"})
	if err != nil {
		t.Fatal(err)
	}
	if result.Decision != "allow" {
		t.Errorf("expected allow, got %s", result.Decision)
	}
}

func TestTelemetry_PanicInHandlerDoesNotBlockEnforcement(t *testing.T) {
	// If a bus subscriber panics, Propose must still return a valid result.
	bus := event.NewBus()
	bus.Subscribe(func(e event.Event) {
		panic("simulated telemetry failure")
	})

	k := newTestKernelWithBus(t, bus)
	defer k.Close()

	result, err := k.Propose(action.RawAction{Tool: "Read", File: "README.md"})
	if err != nil {
		t.Fatal(err)
	}
	if result.Decision != "allow" {
		t.Errorf("expected allow even after panic in bus handler, got %s", result.Decision)
	}
}

func TestTelemetry_CloseEmitsRunEnded(t *testing.T) {
	bus := event.NewBus()
	events := captureEvents(bus)
	k := newTestKernelWithBus(t, bus)

	_, _ = k.Propose(action.RawAction{Tool: "Read", File: "README.md"})
	_ = k.Close()

	var runEnded *event.Event
	for i := range *events {
		if (*events)[i].Kind == event.RunEnded {
			runEnded = &(*events)[i]
			break
		}
	}
	if runEnded == nil {
		t.Fatal("expected RunEnded event after Close()")
	}
	if runEnded.Data["totalActions"] == nil {
		t.Error("RunEnded missing totalActions")
	}
}

func TestTelemetry_BusAccessor(t *testing.T) {
	bus := event.NewBus()
	k := newTestKernelWithBus(t, bus)
	defer k.Close()

	if k.Bus() != bus {
		t.Error("Bus() should return the configured event bus")
	}
}

func TestTelemetry_NilBusAccessor(t *testing.T) {
	k := newTestKernel(t)
	defer k.Close()

	if k.Bus() != nil {
		t.Error("Bus() should return nil when no bus configured")
	}
}

func TestTelemetry_ConcurrentProposesEmitCorrectEvents(t *testing.T) {
	bus := event.NewBus()

	var mu sync.Mutex
	var allowCount, denyCount int
	bus.Subscribe(func(e event.Event) {
		mu.Lock()
		defer mu.Unlock()
		switch e.Kind {
		case event.ActionAllowed:
			allowCount++
		case event.ActionDenied:
			denyCount++
		}
	})

	k := newTestKernelWithBus(t, bus)
	defer k.Close()

	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			var raw action.RawAction
			if i%2 == 0 {
				raw = action.RawAction{Tool: "Read", File: "README.md"}
			} else {
				raw = action.RawAction{Tool: "Bash", Command: "git push origin main"}
			}
			if _, err := k.Propose(raw); err != nil {
				t.Errorf("Propose: %v", err)
			}
		}(i)
	}
	wg.Wait()

	mu.Lock()
	defer mu.Unlock()
	if allowCount != 10 {
		t.Errorf("expected 10 allows, got %d", allowCount)
	}
	if denyCount != 10 {
		t.Errorf("expected 10 denies, got %d", denyCount)
	}
}
