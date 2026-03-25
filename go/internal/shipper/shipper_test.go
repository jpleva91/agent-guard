package shipper_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/AgentGuardHQ/agent-guard/go/internal/event"
	"github.com/AgentGuardHQ/agent-guard/go/internal/shipper"
)

func testEvent(kind event.Kind) event.Event {
	return event.Event{
		ID:        fmt.Sprintf("test-%d", time.Now().UnixNano()),
		Kind:      kind,
		Timestamp: time.Now().UnixMilli(),
		RunID:     "run-1",
		Data:      map[string]any{"test": true},
	}
}

// ---------- StdoutShipper tests ----------

func TestStdoutShipperWritesJSON(t *testing.T) {
	var buf bytes.Buffer
	s := shipper.NewStdoutShipperTo(&buf)

	e := testEvent(event.ActionAllowed)
	if err := s.Ship(e); err != nil {
		t.Fatalf("Ship: %v", err)
	}

	// Should be valid JSONL
	line := strings.TrimSpace(buf.String())
	var decoded event.Event
	if err := json.Unmarshal([]byte(line), &decoded); err != nil {
		t.Fatalf("unmarshal output: %v", err)
	}
	if decoded.Kind != event.ActionAllowed {
		t.Errorf("expected kind %s, got %s", event.ActionAllowed, decoded.Kind)
	}
	if decoded.RunID != "run-1" {
		t.Errorf("expected runID run-1, got %s", decoded.RunID)
	}
}

func TestStdoutShipperMultipleEvents(t *testing.T) {
	var buf bytes.Buffer
	s := shipper.NewStdoutShipperTo(&buf)

	for i := 0; i < 3; i++ {
		if err := s.Ship(testEvent(event.ActionRequested)); err != nil {
			t.Fatalf("Ship %d: %v", i, err)
		}
	}

	lines := strings.Split(strings.TrimSpace(buf.String()), "\n")
	if len(lines) != 3 {
		t.Errorf("expected 3 lines, got %d", len(lines))
	}
}

func TestStdoutShipperFlushAndClose(t *testing.T) {
	s := shipper.NewStdoutShipperTo(io.Discard)
	if err := s.Flush(); err != nil {
		t.Errorf("Flush: %v", err)
	}
	if err := s.Close(); err != nil {
		t.Errorf("Close: %v", err)
	}
}

// ---------- FileShipper tests ----------

func TestFileShipperWritesJSONL(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "events.jsonl")

	s, err := shipper.NewFileShipper(shipper.FileShipperConfig{Path: path})
	if err != nil {
		t.Fatalf("NewFileShipper: %v", err)
	}
	defer s.Close()

	events := []event.Event{
		testEvent(event.ActionRequested),
		testEvent(event.PolicyDenied),
		testEvent(event.ActionExecuted),
	}
	for _, e := range events {
		if err := s.Ship(e); err != nil {
			t.Fatalf("Ship: %v", err)
		}
	}
	if err := s.Flush(); err != nil {
		t.Fatalf("Flush: %v", err)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}

	lines := strings.Split(strings.TrimSpace(string(data)), "\n")
	if len(lines) != 3 {
		t.Fatalf("expected 3 lines, got %d", len(lines))
	}

	for i, line := range lines {
		var decoded event.Event
		if err := json.Unmarshal([]byte(line), &decoded); err != nil {
			t.Fatalf("unmarshal line %d: %v", i, err)
		}
		if decoded.Kind != events[i].Kind {
			t.Errorf("line %d: expected kind %s, got %s", i, events[i].Kind, decoded.Kind)
		}
	}
}

func TestFileShipperRotation(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "events.jsonl")

	// Very small max to trigger rotation quickly
	s, err := shipper.NewFileShipper(shipper.FileShipperConfig{
		Path:     path,
		MaxBytes: 100, // ~100 bytes triggers rotation after first event
	})
	if err != nil {
		t.Fatalf("NewFileShipper: %v", err)
	}
	defer s.Close()

	// Ship enough events to trigger rotation
	for i := 0; i < 5; i++ {
		if err := s.Ship(testEvent(event.ActionRequested)); err != nil {
			t.Fatalf("Ship %d: %v", i, err)
		}
	}

	// Check that rotated file exists
	rotatedPath := path + ".1"
	if _, err := os.Stat(rotatedPath); os.IsNotExist(err) {
		t.Error("expected rotated file to exist")
	}

	// Current file should still exist and have events
	if _, err := os.Stat(path); os.IsNotExist(err) {
		t.Error("expected current file to exist after rotation")
	}
}

func TestFileShipperAppend(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "events.jsonl")

	// Write one event, close, reopen, write another
	s1, err := shipper.NewFileShipper(shipper.FileShipperConfig{Path: path})
	if err != nil {
		t.Fatalf("NewFileShipper 1: %v", err)
	}
	if err := s1.Ship(testEvent(event.RunStarted)); err != nil {
		t.Fatalf("Ship 1: %v", err)
	}
	s1.Close()

	s2, err := shipper.NewFileShipper(shipper.FileShipperConfig{Path: path})
	if err != nil {
		t.Fatalf("NewFileShipper 2: %v", err)
	}
	if err := s2.Ship(testEvent(event.RunEnded)); err != nil {
		t.Fatalf("Ship 2: %v", err)
	}
	s2.Close()

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	lines := strings.Split(strings.TrimSpace(string(data)), "\n")
	if len(lines) != 2 {
		t.Errorf("expected 2 lines after reopen, got %d", len(lines))
	}
}

// ---------- Batch tests ----------

func TestBatchFlushOnSize(t *testing.T) {
	b := shipper.NewBatch(3, 1*time.Hour) // Large maxAge so it won't trigger

	b.Add(testEvent(event.ActionRequested))
	b.Add(testEvent(event.ActionAllowed))

	if b.Full() {
		t.Error("batch should not be full with 2/3 events")
	}
	if b.ShouldFlush() {
		t.Error("batch should not flush with 2/3 events and large maxAge")
	}

	b.Add(testEvent(event.ActionExecuted))

	if !b.Full() {
		t.Error("batch should be full with 3/3 events")
	}
	if !b.ShouldFlush() {
		t.Error("batch should flush when full")
	}

	events := b.Drain()
	if len(events) != 3 {
		t.Errorf("expected 3 events from drain, got %d", len(events))
	}
	if b.Len() != 0 {
		t.Errorf("expected empty batch after drain, got %d", b.Len())
	}
}

func TestBatchFlushOnAge(t *testing.T) {
	b := shipper.NewBatch(100, 50*time.Millisecond) // Large maxSize so it won't trigger by size

	b.Add(testEvent(event.ActionRequested))

	if b.ShouldFlush() {
		t.Error("batch should not flush immediately")
	}

	// Wait for max age to pass
	time.Sleep(60 * time.Millisecond)

	if !b.ShouldFlush() {
		t.Error("batch should flush after maxAge")
	}

	events := b.Drain()
	if len(events) != 1 {
		t.Errorf("expected 1 event from drain, got %d", len(events))
	}
}

func TestBatchEmptyDrain(t *testing.T) {
	b := shipper.NewBatch(10, 1*time.Hour)
	events := b.Drain()
	if len(events) != 0 {
		t.Errorf("expected 0 events from empty drain, got %d", len(events))
	}
}

func TestBatchEmptyDoesNotFlush(t *testing.T) {
	b := shipper.NewBatch(10, 1*time.Millisecond)
	time.Sleep(5 * time.Millisecond)
	if b.ShouldFlush() {
		t.Error("empty batch should not need flushing even after maxAge")
	}
}

func TestBatchConcurrentAccess(t *testing.T) {
	b := shipper.NewBatch(1000, 1*time.Hour)
	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			b.Add(testEvent(event.ActionRequested))
		}()
	}
	wg.Wait()
	if b.Len() != 100 {
		t.Errorf("expected 100 events after concurrent adds, got %d", b.Len())
	}
}

// ---------- HTTPShipper tests ----------

func TestHTTPShipperSendsBatch(t *testing.T) {
	var received []event.Event
	var mu sync.Mutex

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("expected POST, got %s", r.Method)
		}
		if r.Header.Get("Content-Type") != "application/json" {
			t.Errorf("expected application/json, got %s", r.Header.Get("Content-Type"))
		}
		var events []event.Event
		if err := json.NewDecoder(r.Body).Decode(&events); err != nil {
			t.Errorf("decode body: %v", err)
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		mu.Lock()
		received = append(received, events...)
		mu.Unlock()
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	s := shipper.NewHTTPShipper(shipper.HTTPShipperConfig{
		URL:       srv.URL,
		BatchSize: 3,
		MaxAge:    1 * time.Hour, // Won't trigger by age
	})

	// Ship 3 events to fill batch and trigger flush
	for i := 0; i < 3; i++ {
		if err := s.Ship(testEvent(event.ActionRequested)); err != nil {
			t.Fatalf("Ship %d: %v", i, err)
		}
	}

	// Give HTTP request time to complete
	time.Sleep(50 * time.Millisecond)

	mu.Lock()
	count := len(received)
	mu.Unlock()

	if count != 3 {
		t.Errorf("expected 3 events received by server, got %d", count)
	}

	if err := s.Close(); err != nil {
		t.Errorf("Close: %v", err)
	}
}

func TestHTTPShipperFlush(t *testing.T) {
	var received int32

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var events []event.Event
		if err := json.NewDecoder(r.Body).Decode(&events); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		atomic.AddInt32(&received, int32(len(events)))
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	s := shipper.NewHTTPShipper(shipper.HTTPShipperConfig{
		URL:       srv.URL,
		BatchSize: 100, // Won't fill up
		MaxAge:    1 * time.Hour,
	})

	if err := s.Ship(testEvent(event.PolicyDenied)); err != nil {
		t.Fatalf("Ship: %v", err)
	}

	// Explicit flush
	if err := s.Flush(); err != nil {
		t.Fatalf("Flush: %v", err)
	}

	if n := atomic.LoadInt32(&received); n != 1 {
		t.Errorf("expected 1 event after flush, got %d", n)
	}

	if err := s.Close(); err != nil {
		t.Errorf("Close: %v", err)
	}
}

func TestHTTPShipperRetry(t *testing.T) {
	var attempts int32

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := atomic.AddInt32(&attempts, 1)
		if n == 1 {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	s := shipper.NewHTTPShipper(shipper.HTTPShipperConfig{
		URL:        srv.URL,
		BatchSize:  1,
		MaxRetries: 1,
		MaxAge:     1 * time.Hour,
	})

	if err := s.Ship(testEvent(event.ActionFailed)); err != nil {
		t.Fatalf("Ship: %v", err)
	}

	time.Sleep(50 * time.Millisecond)

	if n := atomic.LoadInt32(&attempts); n != 2 {
		t.Errorf("expected 2 attempts (1 initial + 1 retry), got %d", n)
	}

	if err := s.Close(); err != nil {
		t.Errorf("Close: %v", err)
	}
}

func TestHTTPShipperCustomHeaders(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-API-Key") != "secret" {
			t.Errorf("expected X-API-Key: secret, got %s", r.Header.Get("X-API-Key"))
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	s := shipper.NewHTTPShipper(shipper.HTTPShipperConfig{
		URL:       srv.URL,
		BatchSize: 1,
		MaxAge:    1 * time.Hour,
		Headers:   map[string]string{"X-API-Key": "secret"},
	})

	if err := s.Ship(testEvent(event.ActionAllowed)); err != nil {
		t.Fatalf("Ship: %v", err)
	}

	time.Sleep(50 * time.Millisecond)
	s.Close()
}

// ---------- Pipeline tests ----------

func TestPipelineFanOut(t *testing.T) {
	var buf1, buf2 bytes.Buffer
	s1 := shipper.NewStdoutShipperTo(&buf1)
	s2 := shipper.NewStdoutShipperTo(&buf2)

	p := shipper.NewPipeline([]shipper.Shipper{s1, s2})

	e := testEvent(event.ActionRequested)
	p.Handle(e)

	if buf1.Len() == 0 {
		t.Error("expected shipper 1 to receive event")
	}
	if buf2.Len() == 0 {
		t.Error("expected shipper 2 to receive event")
	}
}

func TestPipelineAttachToBus(t *testing.T) {
	var buf bytes.Buffer
	s := shipper.NewStdoutShipperTo(&buf)
	p := shipper.NewPipeline([]shipper.Shipper{s})

	bus := event.NewBus()
	p.Attach(bus)

	bus.Publish(testEvent(event.ActionAllowed))

	if buf.Len() == 0 {
		t.Error("expected pipeline to receive event from bus")
	}
}

func TestPipelineFilter(t *testing.T) {
	var buf bytes.Buffer
	s := shipper.NewStdoutShipperTo(&buf)

	p := shipper.NewPipeline(
		[]shipper.Shipper{s},
		shipper.WithFilter(shipper.GovernanceOnly),
	)

	// This should be filtered out (ref_monitor, not governance)
	p.Handle(testEvent(event.ActionAllowed))
	if buf.Len() != 0 {
		t.Error("expected ActionAllowed to be filtered out by GovernanceOnly")
	}

	// This should pass through (governance)
	p.Handle(testEvent(event.PolicyDenied))
	if buf.Len() == 0 {
		t.Error("expected PolicyDenied to pass GovernanceOnly filter")
	}
}

func TestPipelineSkipHeartbeats(t *testing.T) {
	var buf bytes.Buffer
	s := shipper.NewStdoutShipperTo(&buf)

	p := shipper.NewPipeline(
		[]shipper.Shipper{s},
		shipper.WithFilter(shipper.SkipHeartbeats),
	)

	p.Handle(testEvent(event.HeartbeatEmitted))
	if buf.Len() != 0 {
		t.Error("expected heartbeat to be filtered out")
	}

	p.Handle(testEvent(event.ActionRequested))
	if buf.Len() == 0 {
		t.Error("expected non-heartbeat to pass through")
	}
}

func TestPipelineKindFilter(t *testing.T) {
	var buf bytes.Buffer
	s := shipper.NewStdoutShipperTo(&buf)

	p := shipper.NewPipeline(
		[]shipper.Shipper{s},
		shipper.WithFilter(shipper.KindFilter(event.PolicyDenied, event.InvariantViolation)),
	)

	p.Handle(testEvent(event.ActionRequested))
	if buf.Len() != 0 {
		t.Error("expected ActionRequested to be filtered")
	}

	p.Handle(testEvent(event.PolicyDenied))
	if buf.Len() == 0 {
		t.Error("expected PolicyDenied to pass kind filter")
	}
}

func TestPipelineCategoryFilter(t *testing.T) {
	var buf bytes.Buffer
	s := shipper.NewStdoutShipperTo(&buf)

	p := shipper.NewPipeline(
		[]shipper.Shipper{s},
		shipper.WithFilter(shipper.CategoryFilter(event.CategoryGovernance, event.CategorySafety)),
	)

	p.Handle(testEvent(event.ActionRequested)) // ref_monitor — filtered
	if buf.Len() != 0 {
		t.Error("expected ref_monitor to be filtered")
	}

	p.Handle(testEvent(event.BlastRadiusExceeded)) // safety — passes
	if buf.Len() == 0 {
		t.Error("expected safety event to pass category filter")
	}
}

// errorShipper always returns an error on Ship.
type errorShipper struct{}

func (e *errorShipper) Ship(_ event.Event) error { return fmt.Errorf("always fails") }
func (e *errorShipper) Flush() error              { return nil }
func (e *errorShipper) Close() error              { return nil }

func TestPipelineErrorHandling(t *testing.T) {
	var buf bytes.Buffer
	good := shipper.NewStdoutShipperTo(&buf)
	bad := &errorShipper{}

	// Suppress log output during test
	silentLogger := log.New(io.Discard, "", 0)
	p := shipper.NewPipeline(
		[]shipper.Shipper{bad, good},
		shipper.WithLogger(silentLogger),
	)

	p.Handle(testEvent(event.ActionRequested))

	// Good shipper should still receive the event despite bad shipper failing
	if buf.Len() == 0 {
		t.Error("expected good shipper to receive event even when bad shipper fails")
	}

	if p.ErrorCount() != 1 {
		t.Errorf("expected 1 error, got %d", p.ErrorCount())
	}
}

func TestPipelineMultipleErrors(t *testing.T) {
	bad1 := &errorShipper{}
	bad2 := &errorShipper{}

	silentLogger := log.New(io.Discard, "", 0)
	p := shipper.NewPipeline(
		[]shipper.Shipper{bad1, bad2},
		shipper.WithLogger(silentLogger),
	)

	p.Handle(testEvent(event.ActionRequested))
	p.Handle(testEvent(event.ActionAllowed))

	// 2 events * 2 bad shippers = 4 errors
	if p.ErrorCount() != 4 {
		t.Errorf("expected 4 errors, got %d", p.ErrorCount())
	}
}

func TestPipelineFlushAndClose(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "pipeline-events.jsonl")
	fs, err := shipper.NewFileShipper(shipper.FileShipperConfig{Path: path})
	if err != nil {
		t.Fatalf("NewFileShipper: %v", err)
	}

	p := shipper.NewPipeline([]shipper.Shipper{fs})
	p.Handle(testEvent(event.RunStarted))

	if err := p.Flush(); err != nil {
		t.Errorf("Flush: %v", err)
	}
	if err := p.Close(); err != nil {
		t.Errorf("Close: %v", err)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	if len(strings.TrimSpace(string(data))) == 0 {
		t.Error("expected file to have content after pipeline close")
	}
}

func TestPipelineMultipleFilters(t *testing.T) {
	var buf bytes.Buffer
	s := shipper.NewStdoutShipperTo(&buf)

	// Both filters must pass: skip heartbeats AND only governance
	p := shipper.NewPipeline(
		[]shipper.Shipper{s},
		shipper.WithFilter(shipper.SkipHeartbeats),
		shipper.WithFilter(shipper.GovernanceOnly),
	)

	p.Handle(testEvent(event.HeartbeatEmitted)) // Fails first filter
	if buf.Len() != 0 {
		t.Error("heartbeat should be filtered")
	}

	p.Handle(testEvent(event.ActionRequested)) // Passes first, fails second
	if buf.Len() != 0 {
		t.Error("ref_monitor event should be filtered by GovernanceOnly")
	}

	p.Handle(testEvent(event.PolicyDenied)) // Passes both
	if buf.Len() == 0 {
		t.Error("governance event should pass both filters")
	}
}

// ---------- Integration: bus -> pipeline -> shippers ----------

func TestEndToEndBusToPipeline(t *testing.T) {
	var buf1, buf2 bytes.Buffer
	s1 := shipper.NewStdoutShipperTo(&buf1)
	s2 := shipper.NewStdoutShipperTo(&buf2)

	p := shipper.NewPipeline(
		[]shipper.Shipper{s1, s2},
		shipper.WithFilter(shipper.SkipHeartbeats),
	)

	bus := event.NewBus()
	p.Attach(bus)

	// Publish governance events
	bus.Publish(testEvent(event.PolicyDenied))
	bus.Publish(testEvent(event.ActionAllowed))

	// Publish heartbeat (should be filtered)
	bus.Publish(testEvent(event.HeartbeatEmitted))

	lines1 := strings.Split(strings.TrimSpace(buf1.String()), "\n")
	lines2 := strings.Split(strings.TrimSpace(buf2.String()), "\n")

	if len(lines1) != 2 {
		t.Errorf("shipper 1: expected 2 events, got %d", len(lines1))
	}
	if len(lines2) != 2 {
		t.Errorf("shipper 2: expected 2 events, got %d", len(lines2))
	}

	if p.ErrorCount() != 0 {
		t.Errorf("expected 0 errors, got %d", p.ErrorCount())
	}
}
