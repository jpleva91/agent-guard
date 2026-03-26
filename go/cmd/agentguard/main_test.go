package main

import (
	"encoding/json"
	"testing"
)

// TestParseActionInputPreNormalized verifies that a pre-normalized ActionContext
// payload ({"action":"file.write","target":"foo.ts"}) is accepted directly without
// re-normalization. This is the regression test for issue #957.
func TestParseActionInputPreNormalized(t *testing.T) {
	data := []byte(`{"action":"file.write","target":"foo.ts"}`)
	ctx, err := parseActionInput(data)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ctx.Action != "file.write" {
		t.Errorf("expected action=file.write, got %s", ctx.Action)
	}
	if ctx.Target != "foo.ts" {
		t.Errorf("expected target=foo.ts, got %s", ctx.Target)
	}
}

// TestParseActionInputRawToolCall verifies that a raw Claude Code tool call
// payload ({"tool":"Write","input":{...}}) is normalized before evaluation.
func TestParseActionInputRawToolCall(t *testing.T) {
	data := []byte(`{"tool":"Write","input":{"file_path":"src/main.ts","content":"hello"}}`)
	ctx, err := parseActionInput(data)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ctx.Action != "file.write" {
		t.Errorf("expected action=file.write after normalization, got %s", ctx.Action)
	}
}

// TestParseActionInputBashShellExec verifies that a Bash tool call normalizes to shell.exec.
func TestParseActionInputBashShellExec(t *testing.T) {
	data := []byte(`{"tool":"Bash","input":{"command":"ls -la"}}`)
	ctx, err := parseActionInput(data)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ctx.Action != "shell.exec" {
		t.Errorf("expected action=shell.exec, got %s", ctx.Action)
	}
	if ctx.Command != "ls -la" {
		t.Errorf("expected command=ls -la, got %s", ctx.Command)
	}
}

// TestParseActionInputPreNormalizedWithCommand verifies ActionContext with command field.
func TestParseActionInputPreNormalizedWithCommand(t *testing.T) {
	data := []byte(`{"action":"shell.exec","command":"git status"}`)
	ctx, err := parseActionInput(data)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ctx.Action != "shell.exec" {
		t.Errorf("expected action=shell.exec, got %s", ctx.Action)
	}
	if ctx.Command != "git status" {
		t.Errorf("expected command=git status, got %s", ctx.Command)
	}
}

// TestParseActionInputInvalidJSON verifies an error is returned for invalid JSON.
func TestParseActionInputInvalidJSON(t *testing.T) {
	_, err := parseActionInput([]byte(`{not valid json`))
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

// TestParseActionInputNormalizeEvaluatePipeline verifies that the output of
// parseActionInput (raw format) can be re-serialized as an ActionContext and
// then accepted by parseActionInput again (simulate normalize | evaluate pipeline).
func TestParseActionInputNormalizeEvaluatePipeline(t *testing.T) {
	// Step 1: raw tool call -> ActionContext (simulates normalize)
	rawData := []byte(`{"tool":"Read","input":{"file_path":"/etc/hosts"}}`)
	ctx, err := parseActionInput(rawData)
	if err != nil {
		t.Fatalf("normalize step failed: %v", err)
	}

	// Step 2: serialize ActionContext -> re-parse (simulates piping to evaluate)
	serialized, err := json.Marshal(ctx)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}
	ctx2, err := parseActionInput(serialized)
	if err != nil {
		t.Fatalf("evaluate step failed: %v", err)
	}

	if ctx2.Action != "file.read" {
		t.Errorf("expected action=file.read in pipeline, got %s", ctx2.Action)
	}
}
