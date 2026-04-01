package gateway

import (
	"context"
	"fmt"
	"log"
	"net"
	"net/http"

	"github.com/AgentGuardHQ/agentguard/go/internal/event"
	"github.com/AgentGuardHQ/agentguard/go/internal/kernel"
	"github.com/AgentGuardHQ/agentguard/go/internal/shipper"
)

// Run starts the MCP gateway server with the given configuration.
// It blocks until the context is cancelled, then performs graceful shutdown.
func Run(ctx context.Context, cfg *GatewayConfig) error {
	applyDefaults(cfg)

	gw, cleanup, err := BuildGateway(cfg)
	if err != nil {
		return fmt.Errorf("build gateway: %w", err)
	}
	defer cleanup()

	mux := http.NewServeMux()
	mux.HandleFunc("/sse", gw.HandleSSE)
	mux.HandleFunc("/message", gw.HandleMessage)

	srv := &http.Server{
		Handler: mux,
	}

	// Use a listener to support port 0 (random port for testing)
	ln, err := net.Listen("tcp", cfg.Listen.Address)
	if err != nil {
		return fmt.Errorf("listen on %s: %w", cfg.Listen.Address, err)
	}

	log.Printf("[agentguard-gateway] listening on %s (transport=%s)", ln.Addr().String(), cfg.Listen.Transport)
	log.Printf("[agentguard-gateway] upstreams: %d configured", len(cfg.Upstream))
	log.Printf("[agentguard-gateway] policies: %v", cfg.Policy.Paths)

	// Start server in a goroutine
	errCh := make(chan error, 1)
	go func() {
		if err := srv.Serve(ln); err != http.ErrServerClosed {
			errCh <- err
		}
		close(errCh)
	}()

	// Wait for context cancellation
	select {
	case <-ctx.Done():
		log.Println("[agentguard-gateway] shutting down...")
		return srv.Close()
	case err := <-errCh:
		return err
	}
}

// BuildGateway constructs a fully wired Gateway from config.
// Returns the gateway, a cleanup function, and any error.
func BuildGateway(cfg *GatewayConfig) (*Gateway, func(), error) {
	// 1. Create event bus
	bus := event.NewBus()

	// 2. Create kernel
	kcfg := kernel.KernelConfig{
		PolicyPaths: cfg.Policy.Paths,
		DefaultDeny: cfg.Policy.DefaultDeny,
		AgentName:   "agentguard-gateway",
		EventBus:    bus,
	}
	k, err := kernel.NewKernel(kcfg)
	if err != nil {
		return nil, nil, fmt.Errorf("kernel init: %w", err)
	}

	// 3. Create session state
	session := NewSessionState(cfg.Session)

	// 4. Create upstream manager
	mgr := NewUpstreamManager(cfg.Upstream)

	// 5. Connect upstreams (placeholder connectors)
	for _, def := range cfg.Upstream {
		var conn UpstreamConnector
		switch def.Transport {
		case "stdio":
			conn = NewStdioConnector(def)
		case "sse":
			conn = NewSSEConnector(def)
		default:
			return nil, nil, fmt.Errorf("unknown upstream transport: %s", def.Transport)
		}
		if err := mgr.SetConnector(def.Name, conn); err != nil {
			return nil, nil, fmt.Errorf("set connector %s: %w", def.Name, err)
		}
	}

	// 6. Wire telemetry shipper
	var shp shipper.Shipper
	shp, err = createShipper(cfg.Telemetry)
	if err != nil {
		return nil, nil, fmt.Errorf("create shipper: %w", err)
	}

	// Attach shipper to event bus
	if shp != nil {
		pipeline := shipper.NewPipeline([]shipper.Shipper{shp})
		pipeline.Attach(bus)
	}

	// 7. Build gateway
	gw := NewGateway(k, bus, mgr, session)

	// Cleanup function
	cleanup := func() {
		k.Close()
		mgr.Close()
		if shp != nil {
			shp.Flush()
			shp.Close()
		}
	}

	return gw, cleanup, nil
}

// createShipper creates a telemetry shipper from config.
// Returns nil if no shipper is configured.
func createShipper(cfg TelemetryConfig) (shipper.Shipper, error) {
	switch cfg.Shipper {
	case "stdout":
		return shipper.NewStdoutShipper(), nil
	case "file":
		if cfg.Path == "" {
			return nil, fmt.Errorf("file shipper requires a path")
		}
		return shipper.NewFileShipper(shipper.FileShipperConfig{
			Path: cfg.Path,
		})
	case "":
		return nil, nil
	default:
		return nil, fmt.Errorf("unknown shipper type: %s", cfg.Shipper)
	}
}
