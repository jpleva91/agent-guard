package kernel

import (
	"fmt"

	"github.com/AgentGuardHQ/agentguard/go/internal/action"
)

// StageFunc is a callback invoked for each pipeline stage after the kernel
// has made its governance decision. It receives the normalized ActionContext
// and may return an error to abort the pipeline.
type StageFunc func(action.ActionContext) error

// Stage is a named step in a governance pipeline.
type Stage struct {
	Name    string
	Handler StageFunc
}

// Pipeline chains a kernel governance evaluation with zero or more
// post-decision stages. Stages run sequentially after Propose and
// only execute if the action is allowed.
type Pipeline struct {
	kernel *Kernel
	stages []Stage
}

// NewPipeline creates a Pipeline backed by the given Kernel.
func NewPipeline(k *Kernel) *Pipeline {
	return &Pipeline{kernel: k}
}

// AddStage appends a named stage to the pipeline.
func (p *Pipeline) AddStage(name string, handler StageFunc) {
	p.stages = append(p.stages, Stage{Name: name, Handler: handler})
}

// Execute runs the full pipeline: kernel.Propose followed by each stage
// (in order) if the action was allowed. If any stage fails, the pipeline
// returns the KernelResult from Propose along with the stage error.
// Denied actions skip all stages and return immediately.
func (p *Pipeline) Execute(raw action.RawAction) (KernelResult, error) {
	result, err := p.kernel.Propose(raw)
	if err != nil {
		return result, fmt.Errorf("pipeline propose: %w", err)
	}

	// Only run stages for allowed actions
	if result.Decision != "allow" {
		return result, nil
	}

	for _, stage := range p.stages {
		if err := stage.Handler(result.Action); err != nil {
			return result, fmt.Errorf("pipeline stage %q: %w", stage.Name, err)
		}
	}

	return result, nil
}
