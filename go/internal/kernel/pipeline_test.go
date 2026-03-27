package kernel_test

import (
	"errors"
	"testing"

	"github.com/AgentGuardHQ/agentguard/go/internal/action"
	"github.com/AgentGuardHQ/agentguard/go/internal/kernel"
)

func TestPipelineAllowedRunsStages(t *testing.T) {
	k := newTestKernel(t)
	defer k.Close()

	p := kernel.NewPipeline(k)
	var ran []string
	p.AddStage("audit", func(ctx action.ActionContext) error {
		ran = append(ran, "audit:"+ctx.Action)
		return nil
	})
	p.AddStage("log", func(ctx action.ActionContext) error {
		ran = append(ran, "log:"+ctx.Action)
		return nil
	})

	result, err := p.Execute(action.RawAction{Tool: "Read", File: "x.go"})
	if err != nil {
		t.Fatalf("Execute: %v", err)
	}
	if result.Decision != "allow" {
		t.Errorf("expected allow, got %s", result.Decision)
	}
	if len(ran) != 2 {
		t.Fatalf("expected 2 stages to run, got %d", len(ran))
	}
	if ran[0] != "audit:file.read" {
		t.Errorf("expected audit:file.read, got %s", ran[0])
	}
	if ran[1] != "log:file.read" {
		t.Errorf("expected log:file.read, got %s", ran[1])
	}
}

func TestPipelineDeniedSkipsStages(t *testing.T) {
	k := newTestKernel(t)
	defer k.Close()

	p := kernel.NewPipeline(k)
	stageRan := false
	p.AddStage("should-not-run", func(_ action.ActionContext) error {
		stageRan = true
		return nil
	})

	result, err := p.Execute(action.RawAction{Tool: "Bash", Command: "git push origin main"})
	if err != nil {
		t.Fatalf("Execute: %v", err)
	}
	if result.Decision != "deny" {
		t.Errorf("expected deny, got %s", result.Decision)
	}
	if stageRan {
		t.Error("stage should not run for denied actions")
	}
}

func TestPipelineStageFailure(t *testing.T) {
	k := newTestKernel(t)
	defer k.Close()

	p := kernel.NewPipeline(k)
	p.AddStage("fail", func(_ action.ActionContext) error {
		return errors.New("stage boom")
	})
	p.AddStage("after-fail", func(_ action.ActionContext) error {
		t.Error("should not reach stage after failure")
		return nil
	})

	_, err := p.Execute(action.RawAction{Tool: "Read", File: "x.go"})
	if err == nil {
		t.Fatal("expected error from failing stage")
	}
	if !errors.Is(err, err) {
		t.Logf("error: %v", err)
	}
}

func TestPipelineNoStages(t *testing.T) {
	k := newTestKernel(t)
	defer k.Close()

	p := kernel.NewPipeline(k)
	result, err := p.Execute(action.RawAction{Tool: "Read", File: "x.go"})
	if err != nil {
		t.Fatalf("Execute: %v", err)
	}
	if result.Decision != "allow" {
		t.Errorf("expected allow, got %s", result.Decision)
	}
}
