package event

import "sync"

// Store is an in-memory event store.
// It is safe for concurrent use.
type Store struct {
	mu     sync.RWMutex
	events []Event
}

// NewStore creates a new in-memory event store.
func NewStore() *Store {
	return &Store{}
}

// Append adds an event to the store.
func (s *Store) Append(e Event) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.events = append(s.events, e)
}

// All returns a copy of all events in the store.
func (s *Store) All() []Event {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]Event, len(s.events))
	copy(out, s.events)
	return out
}

// Len returns the number of events in the store.
func (s *Store) Len() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.events)
}
