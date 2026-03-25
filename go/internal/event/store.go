package event

import (
	"sync"
	"time"
)

// EventStore is a thread-safe in-memory event store.
// It supports appending events and querying by kind, session, or time range.
type EventStore struct {
	mu     sync.RWMutex
	events []Event
}

// NewEventStore creates an empty EventStore.
func NewEventStore() *EventStore {
	return &EventStore{}
}

// Append adds an event to the store.
func (s *EventStore) Append(event Event) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.events = append(s.events, event)
}

// Events returns a copy of all stored events.
func (s *EventStore) Events() []Event {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]Event, len(s.events))
	copy(out, s.events)
	return out
}

// ByKind returns all events matching the given kind.
func (s *EventStore) ByKind(kind EventKind) []Event {
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

// BySession returns all events matching the given session ID.
func (s *EventStore) BySession(sessionID string) []Event {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var out []Event
	for _, e := range s.events {
		if e.SessionID == sessionID {
			out = append(out, e)
		}
	}
	return out
}

// Since returns all events with a timestamp at or after t.
func (s *EventStore) Since(t time.Time) []Event {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var out []Event
	for _, e := range s.events {
		if !e.Timestamp.Before(t) {
			out = append(out, e)
		}
	}
	return out
}

// Count returns the number of stored events.
func (s *EventStore) Count() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.events)
}

// Clear removes all events from the store.
func (s *EventStore) Clear() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.events = nil
}
