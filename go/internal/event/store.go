package event

import "sync"

// Store is a thread-safe, append-only in-memory event store.
// It provides query methods for filtering events by kind and time range.
type Store struct {
	mu     sync.RWMutex
	events []Event
}

// NewStore creates an empty event store.
func NewStore() *Store {
	return &Store{}
}

// Append adds an event to the store. Thread-safe.
func (s *Store) Append(e Event) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.events = append(s.events, e)
}

// All returns a copy of all events. Thread-safe.
func (s *Store) All() []Event {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]Event, len(s.events))
	copy(out, s.events)
	return out
}

// Len returns the number of events. Thread-safe.
func (s *Store) Len() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.events)
}

// QueryByKind returns all events of a given kind. Thread-safe.
func (s *Store) QueryByKind(kind Kind) []Event {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var out []Event
	for _, e := range s.events {
		if e.Kind == kind {
			out = append(out, e)
		}
	}
	return out
}

// QueryByKinds returns all events matching any of the given kinds. Thread-safe.
func (s *Store) QueryByKinds(kinds ...Kind) []Event {
	s.mu.RLock()
	defer s.mu.RUnlock()
	kindSet := make(map[Kind]bool, len(kinds))
	for _, k := range kinds {
		kindSet[k] = true
	}
	var out []Event
	for _, e := range s.events {
		if kindSet[e.Kind] {
			out = append(out, e)
		}
	}
	return out
}

// QuerySince returns events with timestamp >= since. Thread-safe.
func (s *Store) QuerySince(sinceMs int64) []Event {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var out []Event
	for _, e := range s.events {
		if e.Timestamp >= sinceMs {
			out = append(out, e)
		}
	}
	return out
}

// QueryByKindSince returns events of a kind with timestamp >= since. Thread-safe.
func (s *Store) QueryByKindSince(kind Kind, sinceMs int64) []Event {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var out []Event
	for _, e := range s.events {
		if e.Kind == kind && e.Timestamp >= sinceMs {
			out = append(out, e)
		}
	}
	return out
}

// QueryByKindsSince returns events matching any kind with timestamp >= since. Thread-safe.
func (s *Store) QueryByKindsSince(sinceMs int64, kinds ...Kind) []Event {
	s.mu.RLock()
	defer s.mu.RUnlock()
	kindSet := make(map[Kind]bool, len(kinds))
	for _, k := range kinds {
		kindSet[k] = true
	}
	var out []Event
	for _, e := range s.events {
		if kindSet[e.Kind] && e.Timestamp >= sinceMs {
			out = append(out, e)
		}
	}
	return out
}

// Clear removes all events from the store. Thread-safe.
func (s *Store) Clear() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.events = nil
}
