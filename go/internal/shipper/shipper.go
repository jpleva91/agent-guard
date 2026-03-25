// Package shipper delivers events from the event bus to external systems.
// It implements the third plane in the Evaluator/Emitter/Shipper architecture.
package shipper

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/AgentGuardHQ/agent-guard/go/internal/event"
)

// Shipper receives events from the EventBus and delivers them externally.
type Shipper interface {
	Ship(event event.Event) error
	Flush() error
	Close() error
}

// ---------- StdoutShipper ----------

// StdoutShipper writes JSON events to an io.Writer (defaults to stdout).
type StdoutShipper struct {
	mu  sync.Mutex
	out io.Writer
}

// NewStdoutShipper creates a shipper that writes JSON events to stdout.
func NewStdoutShipper() *StdoutShipper {
	return &StdoutShipper{out: os.Stdout}
}

// NewStdoutShipperTo creates a shipper that writes JSON events to the given writer.
func NewStdoutShipperTo(w io.Writer) *StdoutShipper {
	return &StdoutShipper{out: w}
}

// Ship writes a single event as a JSON line.
func (s *StdoutShipper) Ship(e event.Event) error {
	data, err := json.Marshal(e)
	if err != nil {
		return fmt.Errorf("stdout shipper: marshal: %w", err)
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	_, err = fmt.Fprintf(s.out, "%s\n", data)
	if err != nil {
		return fmt.Errorf("stdout shipper: write: %w", err)
	}
	return nil
}

// Flush is a no-op for stdout.
func (s *StdoutShipper) Flush() error { return nil }

// Close is a no-op for stdout.
func (s *StdoutShipper) Close() error { return nil }

// ---------- FileShipper ----------

// FileShipperConfig configures the file shipper.
type FileShipperConfig struct {
	Path            string // Path to the output JSONL file.
	MaxBytes        int64  // Max file size before rotation (0 = no rotation).
	RotationSuffix  string // Suffix format for rotated files (default: ".1").
}

// FileShipper appends JSON events to a file in JSONL format with optional rotation.
type FileShipper struct {
	mu       sync.Mutex
	cfg      FileShipperConfig
	file     *os.File
	written  int64
}

// NewFileShipper creates a shipper that appends JSON events to a file.
func NewFileShipper(cfg FileShipperConfig) (*FileShipper, error) {
	f, err := os.OpenFile(cfg.Path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		return nil, fmt.Errorf("file shipper: open: %w", err)
	}
	info, err := f.Stat()
	if err != nil {
		f.Close()
		return nil, fmt.Errorf("file shipper: stat: %w", err)
	}
	if cfg.RotationSuffix == "" {
		cfg.RotationSuffix = ".1"
	}
	return &FileShipper{
		cfg:     cfg,
		file:    f,
		written: info.Size(),
	}, nil
}

// Ship writes a single event as a JSON line to the file.
func (s *FileShipper) Ship(e event.Event) error {
	data, err := json.Marshal(e)
	if err != nil {
		return fmt.Errorf("file shipper: marshal: %w", err)
	}
	line := append(data, '\n')

	s.mu.Lock()
	defer s.mu.Unlock()

	// Rotate if needed
	if s.cfg.MaxBytes > 0 && s.written+int64(len(line)) > s.cfg.MaxBytes {
		if err := s.rotate(); err != nil {
			return fmt.Errorf("file shipper: rotate: %w", err)
		}
	}

	n, err := s.file.Write(line)
	if err != nil {
		return fmt.Errorf("file shipper: write: %w", err)
	}
	s.written += int64(n)
	return nil
}

// rotate closes the current file, renames it, and opens a new one.
func (s *FileShipper) rotate() error {
	s.file.Close()
	rotatedPath := s.cfg.Path + s.cfg.RotationSuffix
	if err := os.Rename(s.cfg.Path, rotatedPath); err != nil {
		return err
	}
	f, err := os.OpenFile(s.cfg.Path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		return err
	}
	s.file = f
	s.written = 0
	return nil
}

// Flush syncs the file to disk.
func (s *FileShipper) Flush() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.file.Sync()
}

// Close flushes and closes the file.
func (s *FileShipper) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.file.Sync(); err != nil {
		return err
	}
	return s.file.Close()
}

// ---------- HTTPShipper ----------

// HTTPShipperConfig configures the HTTP shipper.
type HTTPShipperConfig struct {
	URL        string        // Target URL for POST requests.
	Timeout    time.Duration // HTTP client timeout (default: 10s).
	MaxRetries int           // Number of retries on failure (default: 1).
	Headers    map[string]string // Additional HTTP headers.
	BatchSize  int           // Max events per batch (default: 50).
	MaxAge     time.Duration // Max age before batch flush (default: 5s).
}

// HTTPShipper batches events and POSTs them to a configurable URL.
type HTTPShipper struct {
	mu     sync.Mutex
	cfg    HTTPShipperConfig
	client *http.Client
	batch  *Batch
	done   chan struct{}
	wg     sync.WaitGroup
}

// NewHTTPShipper creates a shipper that batches events and POSTs them.
func NewHTTPShipper(cfg HTTPShipperConfig) *HTTPShipper {
	if cfg.Timeout == 0 {
		cfg.Timeout = 10 * time.Second
	}
	if cfg.MaxRetries == 0 {
		cfg.MaxRetries = 1
	}
	if cfg.BatchSize == 0 {
		cfg.BatchSize = 50
	}
	if cfg.MaxAge == 0 {
		cfg.MaxAge = 5 * time.Second
	}

	s := &HTTPShipper{
		cfg: cfg,
		client: &http.Client{
			Timeout: cfg.Timeout,
		},
		batch: NewBatch(cfg.BatchSize, cfg.MaxAge),
		done:  make(chan struct{}),
	}

	// Background flush ticker
	s.wg.Add(1)
	go s.flushLoop()

	return s
}

// flushLoop periodically checks and flushes aged-out batches.
func (s *HTTPShipper) flushLoop() {
	defer s.wg.Done()
	ticker := time.NewTicker(s.cfg.MaxAge / 2)
	defer ticker.Stop()
	for {
		select {
		case <-s.done:
			return
		case <-ticker.C:
			s.mu.Lock()
			if s.batch.ShouldFlush() {
				events := s.batch.Drain()
				s.mu.Unlock()
				if len(events) > 0 {
					_ = s.send(events) // log errors but don't propagate from background
				}
			} else {
				s.mu.Unlock()
			}
		}
	}
}

// Ship adds an event to the batch. If the batch is full, it is flushed.
func (s *HTTPShipper) Ship(e event.Event) error {
	s.mu.Lock()
	s.batch.Add(e)
	if s.batch.Full() {
		events := s.batch.Drain()
		s.mu.Unlock()
		return s.send(events)
	}
	s.mu.Unlock()
	return nil
}

// Flush sends any pending events immediately.
func (s *HTTPShipper) Flush() error {
	s.mu.Lock()
	events := s.batch.Drain()
	s.mu.Unlock()
	if len(events) == 0 {
		return nil
	}
	return s.send(events)
}

// Close stops the background flush loop and flushes remaining events.
func (s *HTTPShipper) Close() error {
	close(s.done)
	s.wg.Wait()
	return s.Flush()
}

// send POSTs a batch of events with retry.
func (s *HTTPShipper) send(events []event.Event) error {
	data, err := json.Marshal(events)
	if err != nil {
		return fmt.Errorf("http shipper: marshal: %w", err)
	}

	var lastErr error
	attempts := 1 + s.cfg.MaxRetries
	for i := 0; i < attempts; i++ {
		req, err := http.NewRequest(http.MethodPost, s.cfg.URL, bytes.NewReader(data))
		if err != nil {
			return fmt.Errorf("http shipper: new request: %w", err)
		}
		req.Header.Set("Content-Type", "application/json")
		for k, v := range s.cfg.Headers {
			req.Header.Set(k, v)
		}

		resp, err := s.client.Do(req)
		if err != nil {
			lastErr = fmt.Errorf("http shipper: do request: %w", err)
			continue
		}
		resp.Body.Close()
		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			return nil
		}
		lastErr = fmt.Errorf("http shipper: unexpected status %d", resp.StatusCode)
	}
	return lastErr
}
