package decision

import "sync"

// DecisionStore is a thread-safe in-memory store for decision records.
// It supports recording decisions and querying them by session or type.
type DecisionStore struct {
	mu      sync.RWMutex
	records []DecisionRecord
}

// NewDecisionStore creates an empty DecisionStore.
func NewDecisionStore() *DecisionStore {
	return &DecisionStore{
		records: make([]DecisionRecord, 0),
	}
}

// Record appends a decision record to the store.
func (s *DecisionStore) Record(d DecisionRecord) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.records = append(s.records, d)
}

// All returns a copy of all decision records.
func (s *DecisionStore) All() []DecisionRecord {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]DecisionRecord, len(s.records))
	copy(out, s.records)
	return out
}

// BySession returns all decision records matching the given session ID.
func (s *DecisionStore) BySession(sessionID string) []DecisionRecord {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var out []DecisionRecord
	for _, r := range s.records {
		if r.SessionID == sessionID {
			out = append(out, r)
		}
	}
	return out
}

// ByType returns all decision records matching the given decision type.
func (s *DecisionStore) ByType(t DecisionType) []DecisionRecord {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var out []DecisionRecord
	for _, r := range s.records {
		if r.Type == t {
			out = append(out, r)
		}
	}
	return out
}

// DenyCount returns the number of DENY decisions recorded.
func (s *DecisionStore) DenyCount() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	n := 0
	for _, r := range s.records {
		if r.Type == Deny {
			n++
		}
	}
	return n
}

// AllowCount returns the number of ALLOW decisions recorded.
func (s *DecisionStore) AllowCount() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	n := 0
	for _, r := range s.records {
		if r.Type == Allow {
			n++
		}
	}
	return n
}

// Count returns the total number of decision records.
func (s *DecisionStore) Count() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.records)
}
