// Package main provides the AgentGuard Go kernel CLI.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"

	"github.com/AgentGuardHQ/agent-guard/go/internal/action"
	"github.com/AgentGuardHQ/agent-guard/go/internal/config"
	"github.com/AgentGuardHQ/agent-guard/go/internal/engine"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "Usage: agentguard <normalize|evaluate>")
		os.Exit(1)
	}
	switch os.Args[1] {
	case "normalize":
		runNormalize()
	case "evaluate":
		runEvaluate(os.Args[2:])
	default:
		fmt.Fprintf(os.Stderr, "unknown command: %s\n", os.Args[1])
		os.Exit(1)
	}
}

// runNormalize reads a JSON tool call from stdin and outputs the normalized ActionContext.
func runNormalize() {
	data, err := io.ReadAll(os.Stdin)
	if err != nil {
		fmt.Fprintf(os.Stderr, "read stdin: %v\n", err)
		os.Exit(1)
	}

	var payload struct {
		Tool  string         `json:"tool"`
		Input map[string]any `json:"input"`
	}
	if err := json.Unmarshal(data, &payload); err != nil {
		fmt.Fprintf(os.Stderr, "parse json: %v\n", err)
		os.Exit(1)
	}

	raw := parseRawAction(payload.Tool, payload.Input)
	normalizer := config.NewDefaultNormalizer()
	ctx := normalizer.Normalize(raw, "cli")
	out, _ := json.MarshalIndent(ctx, "", "  ")
	fmt.Println(string(out))
}

// runEvaluate loads a policy, reads a JSON tool call from stdin, normalizes it,
// evaluates it against the policy, and outputs the result. Exits 2 if denied.
func runEvaluate(args []string) {
	fs := flag.NewFlagSet("evaluate", flag.ExitOnError)
	policyPath := fs.String("policy", "", "Path to agentguard.yaml")
	if err := fs.Parse(args); err != nil {
		fmt.Fprintf(os.Stderr, "parse flags: %v\n", err)
		os.Exit(1)
	}

	if *policyPath == "" {
		fmt.Fprintln(os.Stderr, "error: --policy is required")
		os.Exit(1)
	}

	policyData, err := os.ReadFile(*policyPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "read policy: %v\n", err)
		os.Exit(1)
	}

	policy, err := config.LoadYamlPolicy(policyData)
	if err != nil {
		fmt.Fprintf(os.Stderr, "parse policy: %v\n", err)
		os.Exit(1)
	}

	stdinData, err := io.ReadAll(os.Stdin)
	if err != nil {
		fmt.Fprintf(os.Stderr, "read stdin: %v\n", err)
		os.Exit(1)
	}

	var payload struct {
		Tool  string         `json:"tool"`
		Input map[string]any `json:"input"`
	}
	if err := json.Unmarshal(stdinData, &payload); err != nil {
		fmt.Fprintf(os.Stderr, "parse json: %v\n", err)
		os.Exit(1)
	}

	raw := parseRawAction(payload.Tool, payload.Input)
	normalizer := config.NewDefaultNormalizer()
	ctx := normalizer.Normalize(raw, "cli")
	result := engine.Evaluate(ctx, []*action.LoadedPolicy{policy}, &engine.EvalOptions{DefaultDeny: true})

	out, _ := json.MarshalIndent(result, "", "  ")
	fmt.Println(string(out))

	if !result.Allowed {
		os.Exit(2)
	}
}

// parseRawAction extracts a RawAction from the JSON payload fields.
func parseRawAction(tool string, input map[string]any) action.RawAction {
	raw := action.RawAction{Tool: tool}
	if input != nil {
		if cmd, ok := input["command"].(string); ok {
			raw.Command = cmd
		}
		if fp, ok := input["file_path"].(string); ok {
			raw.File = fp
		}
		if tgt, ok := input["target"].(string); ok {
			raw.Target = tgt
		}
		if content, ok := input["content"].(string); ok {
			raw.Content = content
		}
	}
	return raw
}
