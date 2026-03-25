package decision_test

import (
	"sync"
	"testing"

	"github.com/AgentGuardHQ/agent-guard/go/internal/action"
	"github.com/AgentGuardHQ/agent-guard/go/internal/decision"
)

func makeDecision(dtype decision.DecisionType, sessionID string) decision.DecisionRecord {
	ctx := action.ActionContext{Action: "file.read"}
	switch dtype {
	case decision.Allow:
		d := decision.NewAllowDecision(ctx, sessionID, nil, "")
		return d
	case decision.Deny:
		return decision.NewDenyDecision(ctx, sessionID, "denied", "3", nil, "")
	case decision.Escalate:
		return decision.NewEscalateDecision(ctx, sessionID, "escalated", "HIGH")
	case decision.Intervene:
		return decision.NewInterveneDecision(ctx, sessionID, "intervened", "suggestion", "corrected")
	default:
		return decision.NewAllowDecision(ctx, sessionID, nil, "")
	}
}

func TestStoreRecordAndAll(t *testing.T) {
	s := decision.NewDecisionStore()

	if s.Count() != 0 {
		t.Errorf("expected 0 records, got %d", s.Count())
	}

	s.Record(makeDecision(decision.Allow, "s1"))
	s.Record(makeDecision(decision.Deny, "s1"))
	s.Record(makeDecision(decision.Allow, "s2"))

	all := s.All()
	if len(all) != 3 {
		t.Errorf("expected 3 records, got %d", len(all))
	}
	if s.Count() != 3 {
		t.Errorf("expected count 3, got %d", s.Count())
	}
}

func TestStoreAllReturnsCopy(t *testing.T) {
	s := decision.NewDecisionStore()
	s.Record(makeDecision(decision.Allow, "s1"))

	all := s.All()
	all[0].Reason = "mutated"

	// Original should be unchanged
	original := s.All()
	if original[0].Reason == "mutated" {
		t.Error("All() should return a copy, not a reference to internal data")
	}
}

func TestStoreBySession(t *testing.T) {
	s := decision.NewDecisionStore()
	s.Record(makeDecision(decision.Allow, "s1"))
	s.Record(makeDecision(decision.Deny, "s1"))
	s.Record(makeDecision(decision.Allow, "s2"))
	s.Record(makeDecision(decision.Deny, "s3"))

	s1 := s.BySession("s1")
	if len(s1) != 2 {
		t.Errorf("expected 2 records for s1, got %d", len(s1))
	}
	for _, d := range s1 {
		if d.SessionID != "s1" {
			t.Errorf("expected sessionID s1, got %s", d.SessionID)
		}
	}

	s2 := s.BySession("s2")
	if len(s2) != 1 {
		t.Errorf("expected 1 record for s2, got %d", len(s2))
	}

	empty := s.BySession("nonexistent")
	if len(empty) != 0 {
		t.Errorf("expected 0 records for nonexistent session, got %d", len(empty))
	}
}

func TestStoreByType(t *testing.T) {
	s := decision.NewDecisionStore()
	s.Record(makeDecision(decision.Allow, "s1"))
	s.Record(makeDecision(decision.Allow, "s1"))
	s.Record(makeDecision(decision.Deny, "s1"))
	s.Record(makeDecision(decision.Escalate, "s1"))
	s.Record(makeDecision(decision.Intervene, "s1"))

	allows := s.ByType(decision.Allow)
	if len(allows) != 2 {
		t.Errorf("expected 2 ALLOW records, got %d", len(allows))
	}
	denies := s.ByType(decision.Deny)
	if len(denies) != 1 {
		t.Errorf("expected 1 DENY record, got %d", len(denies))
	}
	escalates := s.ByType(decision.Escalate)
	if len(escalates) != 1 {
		t.Errorf("expected 1 ESCALATE record, got %d", len(escalates))
	}
	intervenes := s.ByType(decision.Intervene)
	if len(intervenes) != 1 {
		t.Errorf("expected 1 INTERVENE record, got %d", len(intervenes))
	}
}

func TestStoreDenyAndAllowCount(t *testing.T) {
	s := decision.NewDecisionStore()
	s.Record(makeDecision(decision.Allow, "s1"))
	s.Record(makeDecision(decision.Allow, "s1"))
	s.Record(makeDecision(decision.Deny, "s1"))
	s.Record(makeDecision(decision.Deny, "s1"))
	s.Record(makeDecision(decision.Deny, "s1"))
	s.Record(makeDecision(decision.Escalate, "s1"))

	if s.AllowCount() != 2 {
		t.Errorf("expected 2 allows, got %d", s.AllowCount())
	}
	if s.DenyCount() != 3 {
		t.Errorf("expected 3 denies, got %d", s.DenyCount())
	}
	if s.Count() != 6 {
		t.Errorf("expected 6 total, got %d", s.Count())
	}
}

func TestStoreEmptyQueries(t *testing.T) {
	s := decision.NewDecisionStore()

	if s.Count() != 0 {
		t.Errorf("expected 0, got %d", s.Count())
	}
	if s.DenyCount() != 0 {
		t.Errorf("expected 0, got %d", s.DenyCount())
	}
	if s.AllowCount() != 0 {
		t.Errorf("expected 0, got %d", s.AllowCount())
	}
	if len(s.All()) != 0 {
		t.Errorf("expected empty All(), got %d", len(s.All()))
	}
	if len(s.BySession("x")) != 0 {
		t.Errorf("expected empty BySession, got %d", len(s.BySession("x")))
	}
	if len(s.ByType(decision.Allow)) != 0 {
		t.Errorf("expected empty ByType, got %d", len(s.ByType(decision.Allow)))
	}
}

func TestStoreConcurrentSafety(t *testing.T) {
	s := decision.NewDecisionStore()
	var wg sync.WaitGroup

	// 10 goroutines each recording 100 decisions
	for g := 0; g < 10; g++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := 0; i < 100; i++ {
				s.Record(makeDecision(decision.Allow, "concurrent"))
			}
		}()
	}

	// Concurrent reads while writing
	for g := 0; g < 5; g++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := 0; i < 100; i++ {
				_ = s.All()
				_ = s.Count()
				_ = s.DenyCount()
				_ = s.AllowCount()
				_ = s.BySession("concurrent")
				_ = s.ByType(decision.Allow)
			}
		}()
	}

	wg.Wait()

	if s.Count() != 1000 {
		t.Errorf("expected 1000 records after concurrent writes, got %d", s.Count())
	}
}
