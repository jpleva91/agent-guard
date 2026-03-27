// Package main provides the AgentGuard Go kernel CLI.
package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"

	"github.com/AgentGuardHQ/agentguard/go/internal/action"
	"github.com/AgentGuardHQ/agentguard/go/internal/config"
	"github.com/AgentGuardHQ/agentguard/go/internal/engine"
	"github.com/AgentGuardHQ/agentguard/go/internal/kernel"
	"github.com/AgentGuardHQ/agentguard/go/pkg/hook"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "Usage: agentguard <guard|normalize|evaluate|claude-hook|copilot-hook>")
		os.Exit(1)
	}
	switch os.Args[1] {
	case "guard":
		runGuard(os.Args[2:])
	case "normalize":
		runNormalize()
	case "evaluate":
		runEvaluate(os.Args[2:])
	case "claude-hook":
		if err := hook.RunClaudeHook(); err != nil {
			fmt.Fprintf(os.Stderr, "claude-hook error: %v\n", err)
			os.Exit(1)
		}
	case "copilot-hook":
		if err := hook.RunCopilotHook(); err != nil {
			fmt.Fprintf(os.Stderr, "copilot-hook error: %v\n", err)
			os.Exit(1)
		}
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

// runEvaluate loads a policy, reads a JSON action from stdin, evaluates it
// against the policy, and outputs the result. Exits 2 if denied.
//
// Two input formats are supported:
//
//  1. Raw tool call (Claude Code hook format):
//     {"tool":"Write","input":{"file_path":"foo.ts","content":"..."}}
//     The action is normalized before evaluation.
//
//  2. Pre-normalized ActionContext (output of `normalize` command):
//     {"action":"file.write","target":"foo.ts"}
//     Detected by the presence of the "action" field; normalization is skipped.
//     This allows piping: normalize | evaluate --policy agentguard.yaml
//
// Note: the "pack:" field in policy YAML is stored as metadata but pack rules
// are not automatically resolved. Use a policy file with explicit rules, or
// pre-merge pack rules into your policy before passing to evaluate.
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

	ctx, err := parseActionInput(stdinData)
	if err != nil {
		fmt.Fprintf(os.Stderr, "parse json: %v\n", err)
		os.Exit(1)
	}

	result := engine.Evaluate(ctx, []*action.LoadedPolicy{policy}, &engine.EvalOptions{DefaultDeny: true})

	out, _ := json.MarshalIndent(result, "", "  ")
	fmt.Println(string(out))

	if !result.Allowed {
		os.Exit(2)
	}
}

// parseActionInput accepts either a pre-normalized ActionContext or a raw tool
// call payload and returns a ready-to-evaluate ActionContext.
//
// Detection heuristic: if the top-level JSON object has an "action" field it is
// treated as a pre-normalized ActionContext; otherwise it is treated as a raw
// {"tool":..., "input":{...}} payload and passed through the normalizer.
func parseActionInput(data []byte) (action.ActionContext, error) {
	// Peek at the top-level keys without full unmarshaling.
	var probe struct {
		Action string `json:"action"`
	}
	if err := json.Unmarshal(data, &probe); err != nil {
		return action.ActionContext{}, fmt.Errorf("invalid JSON: %w", err)
	}

	if probe.Action != "" {
		// Pre-normalized ActionContext — unmarshal directly.
		var ctx action.ActionContext
		if err := json.Unmarshal(data, &ctx); err != nil {
			return action.ActionContext{}, fmt.Errorf("unmarshal ActionContext: %w", err)
		}
		return ctx, nil
	}

	// Raw tool call format — normalize before evaluating.
	var payload struct {
		Tool  string         `json:"tool"`
		Input map[string]any `json:"input"`
	}
	if err := json.Unmarshal(data, &payload); err != nil {
		return action.ActionContext{}, fmt.Errorf("unmarshal tool payload: %w", err)
	}
	raw := parseRawAction(payload.Tool, payload.Input)
	normalizer := config.NewDefaultNormalizer()
	return normalizer.Normalize(raw, "cli"), nil
}

// runGuard creates a kernel, reads actions from stdin, and outputs governance
// decisions. Supports single JSON objects and newline-delimited JSON.
// Exits 2 if any action is denied.
func runGuard(args []string) {
	fs := flag.NewFlagSet("guard", flag.ExitOnError)
	policyPath := fs.String("policy", "", "Path to agentguard.yaml policy file")
	dryRun := fs.Bool("dry-run", false, "Evaluate without executing")
	agentName := fs.String("agent-name", "", "Agent identity for this session")
	defaultDeny := fs.Bool("default-deny", true, "Deny actions with no matching rule")
	if err := fs.Parse(args); err != nil {
		fmt.Fprintf(os.Stderr, "parse flags: %v\n", err)
		os.Exit(1)
	}

	if *policyPath == "" {
		fmt.Fprintln(os.Stderr, "error: --policy is required")
		os.Exit(1)
	}

	cfg := kernel.KernelConfig{
		PolicyPaths: []string{*policyPath},
		DryRun:      *dryRun,
		AgentName:   *agentName,
		DefaultDeny: *defaultDeny,
	}

	k, err := kernel.NewKernel(cfg)
	if err != nil {
		fmt.Fprintf(os.Stderr, "kernel init: %v\n", err)
		os.Exit(1)
	}
	defer k.Close()

	stdinData, err := io.ReadAll(os.Stdin)
	if err != nil {
		fmt.Fprintf(os.Stderr, "read stdin: %v\n", err)
		os.Exit(1)
	}

	// Parse input — try single JSON object first, then newline-delimited
	var payloads []struct {
		Tool  string         `json:"tool"`
		Input map[string]any `json:"input"`
	}

	var single struct {
		Tool  string         `json:"tool"`
		Input map[string]any `json:"input"`
	}
	if err := json.Unmarshal(stdinData, &single); err == nil && single.Tool != "" {
		payloads = append(payloads, single)
	} else {
		// Try newline-delimited JSON
		dec := json.NewDecoder(bytes.NewReader(stdinData))
		for dec.More() {
			var p struct {
				Tool  string         `json:"tool"`
				Input map[string]any `json:"input"`
			}
			if err := dec.Decode(&p); err != nil {
				fmt.Fprintf(os.Stderr, "parse json: %v\n", err)
				os.Exit(1)
			}
			payloads = append(payloads, p)
		}
	}

	if len(payloads) == 0 {
		fmt.Fprintln(os.Stderr, "error: no actions provided on stdin")
		os.Exit(1)
	}

	anyDenied := false
	for _, p := range payloads {
		raw := parseRawAction(p.Tool, p.Input)
		result, err := k.Propose(raw)
		if err != nil {
			fmt.Fprintf(os.Stderr, "propose error: %v\n", err)
			os.Exit(1)
		}
		out, _ := json.MarshalIndent(result, "", "  ")
		fmt.Println(string(out))
		if result.Decision == "deny" {
			anyDenied = true
		}
	}

	if anyDenied {
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
