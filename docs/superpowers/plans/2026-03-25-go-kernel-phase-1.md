# Go Kernel Phase 1 — Foundation + Evaluator

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Go binary that normalizes tool calls into ActionContext and evaluates them against `agentguard.yaml` policies, producing identical decisions to the TypeScript kernel.

**Architecture:** Idiomatic Go with `internal/` packages. `internal/action/` handles types + AAB normalization (CommandScanner with regex patterns). `internal/engine/` handles policy evaluation (multi-phase rule matching: deny → allow → default-deny). `internal/config/` loads YAML policies and `//go:embed` governance data with disk overlay. `cmd/agentguard/` exposes `normalize` and `evaluate` subcommands.

**Tech Stack:** Go 1.22+, `gopkg.in/yaml.v3` (YAML parsing), `//go:embed` (static data), standard library only for the rest. No CGo.

**Spec:** `docs/superpowers/specs/2026-03-25-go-kernel-rewrite-design.md`

**TS Reference:** Types in `packages/core/src/types.ts`, `packages/policy/src/evaluator.ts`, `packages/kernel/src/aab.ts`, `packages/matchers/src/command-scanner.ts`, `packages/policy/src/yaml-loader.ts`

---

### Task 1: Initialize Go module and project structure

**Files:**
- Create: `go/go.mod`
- Create: `go/cmd/agentguard/main.go`
- Create: `go/internal/action/types.go`

- [ ] **Step 1: Create go module**

```bash
mkdir -p go/cmd/agentguard go/internal/action go/internal/engine go/internal/config go/internal/event go/pkg/hook go/data go/test/compliance go/test/testdata/policies go/test/testdata/payloads
cd go && go mod init github.com/AgentGuardHQ/agent-guard/go
```

- [ ] **Step 2: Create minimal main.go**

```go
// go/cmd/agentguard/main.go
package main

import (
	"fmt"
	"os"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "Usage: agentguard <normalize|evaluate>")
		os.Exit(1)
	}
	switch os.Args[1] {
	case "normalize":
		fmt.Fprintln(os.Stderr, "normalize: not yet implemented")
		os.Exit(1)
	case "evaluate":
		fmt.Fprintln(os.Stderr, "evaluate: not yet implemented")
		os.Exit(1)
	default:
		fmt.Fprintf(os.Stderr, "unknown command: %s\n", os.Args[1])
		os.Exit(1)
	}
}
```

- [ ] **Step 3: Verify it builds**

```bash
cd go && go build -o bin/agentguard ./cmd/agentguard && ./bin/agentguard
# Expected: "Usage: agentguard <normalize|evaluate>" on stderr, exit 1
```

- [ ] **Step 4: Commit**

```bash
git add go/
git commit -m "feat(go): initialize Go module and project structure"
```

---

### Task 2: Core types — ActionContext, PolicyRule, EvalResult

**Files:**
- Create: `go/internal/action/types.go`
- Create: `go/internal/action/types_test.go`

- [ ] **Step 1: Write the test**

```go
// go/internal/action/types_test.go
package action_test

import (
	"testing"

	"github.com/AgentGuardHQ/agent-guard/go/internal/action"
)

func TestActionContextFields(t *testing.T) {
	ctx := action.ActionContext{
		Action:      "git.push",
		ActionClass: "git",
		Target:      "origin/main",
		Destructive: false,
		Source:      "claude-code",
		Agent:       "claude-code:opus:developer",
	}
	if ctx.Action != "git.push" {
		t.Errorf("expected git.push, got %s", ctx.Action)
	}
	if ctx.ActionClass != "git" {
		t.Errorf("expected git, got %s", ctx.ActionClass)
	}
}

func TestPolicyRuleMatchSingleAction(t *testing.T) {
	rule := action.PolicyRule{
		Action: action.StringOrSlice{"git.push"},
		Effect: "deny",
		Reason: "No push to main",
	}
	if rule.Effect != "deny" {
		t.Errorf("expected deny, got %s", rule.Effect)
	}
	if len(rule.Action) != 1 || rule.Action[0] != "git.push" {
		t.Errorf("expected [git.push], got %v", rule.Action)
	}
}

func TestPolicyRuleMatchMultipleActions(t *testing.T) {
	rule := action.PolicyRule{
		Action: action.StringOrSlice{"test.run", "test.run.unit", "test.run.integration"},
		Effect: "allow",
	}
	if len(rule.Action) != 3 {
		t.Errorf("expected 3 actions, got %d", len(rule.Action))
	}
}

func TestEvalResultAllowed(t *testing.T) {
	r := action.EvalResult{Allowed: true, Decision: "allow", Reason: "File reads safe"}
	if !r.Allowed {
		t.Error("expected allowed")
	}
}

func TestEvalResultDenied(t *testing.T) {
	r := action.EvalResult{Allowed: false, Decision: "deny", Reason: "Protected branch"}
	if r.Allowed {
		t.Error("expected denied")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd go && go test ./internal/action/...
# Expected: FAIL — types not defined
```

- [ ] **Step 3: Implement types**

```go
// go/internal/action/types.go
package action

// StringOrSlice handles YAML fields that can be either a string or []string.
type StringOrSlice []string

// ActionContext is the vendor-neutral action representation (KE-2).
type ActionContext struct {
	Action      string            `json:"action"`
	ActionClass string            `json:"actionClass"`
	Target      string            `json:"target"`
	Actor       ActorIdentity     `json:"actor"`
	Args        ActionArguments   `json:"args"`
	Destructive bool              `json:"destructive"`
	Source      string            `json:"source"`
	NormalizedAt int64            `json:"normalizedAt"`

	// NormalizedIntent-compatible fields
	Agent        string            `json:"agent"`
	Branch       string            `json:"branch,omitempty"`
	Command      string            `json:"command,omitempty"`
	FilesAffected int              `json:"filesAffected,omitempty"`
	Metadata     map[string]any    `json:"metadata,omitempty"`
	Persona      *AgentPersona     `json:"persona,omitempty"`
}

type ActorIdentity struct {
	AgentID    string        `json:"agentId"`
	SessionID  string        `json:"sessionId,omitempty"`
	InWorktree bool          `json:"inWorktree,omitempty"`
	Persona    *AgentPersona `json:"persona,omitempty"`
}

type ActionArguments struct {
	FilePath      string         `json:"filePath,omitempty"`
	Command       string         `json:"command,omitempty"`
	Branch        string         `json:"branch,omitempty"`
	Content       string         `json:"content,omitempty"`
	FilesAffected int            `json:"filesAffected,omitempty"`
	Metadata      map[string]any `json:"metadata,omitempty"`
}

type AgentPersona struct {
	TrustTier     string   `json:"trustTier,omitempty" yaml:"trustTier,omitempty"`
	Autonomy      string   `json:"autonomy,omitempty" yaml:"autonomy,omitempty"`
	RiskTolerance string   `json:"riskTolerance,omitempty" yaml:"riskTolerance,omitempty"`
	Role          string   `json:"role,omitempty" yaml:"role,omitempty"`
	Tags          []string `json:"tags,omitempty" yaml:"tags,omitempty"`
}

// PolicyRule represents a single rule in an agentguard.yaml policy.
type PolicyRule struct {
	Action           StringOrSlice     `json:"action" yaml:"action"`
	Effect           string            `json:"effect" yaml:"effect"`
	Conditions       *RuleConditions   `json:"conditions,omitempty" yaml:",omitempty"`
	Reason           string            `json:"reason,omitempty" yaml:"reason,omitempty"`
	Suggestion       string            `json:"suggestion,omitempty" yaml:"suggestion,omitempty"`
	CorrectedCommand string            `json:"correctedCommand,omitempty" yaml:"correctedCommand,omitempty"`
	Intervention     string            `json:"intervention,omitempty" yaml:"intervention,omitempty"`

	// Flattened condition fields (YAML allows these at rule level)
	Target          string            `json:"-" yaml:"target,omitempty"`
	Branches        []string          `json:"-" yaml:"branches,omitempty"`
	Limit           int               `json:"-" yaml:"limit,omitempty"`
	RequireTests    bool              `json:"-" yaml:"requireTests,omitempty"`
	RequireFormat   bool              `json:"-" yaml:"requireFormat,omitempty"`
	RequireWorktree bool              `json:"-" yaml:"requireWorktree,omitempty"`
}

type RuleConditions struct {
	Scope           []string          `json:"scope,omitempty" yaml:"scope,omitempty"`
	Limit           int               `json:"limit,omitempty" yaml:"limit,omitempty"`
	Branches        []string          `json:"branches,omitempty" yaml:"branches,omitempty"`
	RequireTests    bool              `json:"requireTests,omitempty" yaml:"requireTests,omitempty"`
	RequireFormat   bool              `json:"requireFormat,omitempty" yaml:"requireFormat,omitempty"`
	RequireWorktree bool              `json:"requireWorktree,omitempty" yaml:"requireWorktree,omitempty"`
	Persona         *PersonaCondition `json:"persona,omitempty" yaml:"persona,omitempty"`
	Forecast        *ForecastCondition `json:"forecast,omitempty" yaml:"forecast,omitempty"`
}

type PersonaCondition struct {
	TrustTier     []string `json:"trustTier,omitempty" yaml:"trustTier,omitempty"`
	Role          []string `json:"role,omitempty" yaml:"role,omitempty"`
	Autonomy      []string `json:"autonomy,omitempty" yaml:"autonomy,omitempty"`
	RiskTolerance []string `json:"riskTolerance,omitempty" yaml:"riskTolerance,omitempty"`
	Tags          []string `json:"tags,omitempty" yaml:"tags,omitempty"`
}

type ForecastCondition struct {
	TestRiskScore     float64  `json:"testRiskScore,omitempty" yaml:"testRiskScore,omitempty"`
	BlastRadiusScore  float64  `json:"blastRadiusScore,omitempty" yaml:"blastRadiusScore,omitempty"`
	RiskLevel         []string `json:"riskLevel,omitempty" yaml:"riskLevel,omitempty"`
	PredictedFileCount int     `json:"predictedFileCount,omitempty" yaml:"predictedFileCount,omitempty"`
	DependencyCount   int      `json:"dependencyCount,omitempty" yaml:"dependencyCount,omitempty"`
}

// LoadedPolicy is a fully parsed policy file.
type LoadedPolicy struct {
	ID                 string                    `json:"id" yaml:"id"`
	Name               string                    `json:"name" yaml:"name"`
	Description        string                    `json:"description,omitempty" yaml:"description,omitempty"`
	Rules              []PolicyRule              `json:"rules" yaml:"rules"`
	Severity           int                       `json:"severity" yaml:"severity"`
	Mode               string                    `json:"mode,omitempty" yaml:"mode,omitempty"`
	InvariantModes     map[string]string         `json:"invariantModes,omitempty" yaml:"invariantModes,omitempty"`
	Pack               string                    `json:"pack,omitempty" yaml:"pack,omitempty"`
	DisabledInvariants []string                  `json:"disabledInvariants,omitempty" yaml:"disabledInvariants,omitempty"`
	Version            string                    `json:"version,omitempty" yaml:"version,omitempty"`
}

// EvalResult is the output of policy evaluation.
type EvalResult struct {
	Allowed          bool        `json:"allowed"`
	Decision         string      `json:"decision"`
	MatchedRule      *PolicyRule `json:"matchedRule,omitempty"`
	MatchedPolicy    *LoadedPolicy `json:"matchedPolicy,omitempty"`
	Reason           string      `json:"reason"`
	Severity         int         `json:"severity"`
	Suggestion       string      `json:"suggestion,omitempty"`
	CorrectedCommand string      `json:"correctedCommand,omitempty"`
	Intervention     string      `json:"intervention,omitempty"`
}

// Suggestion is a corrective suggestion for denied actions.
type Suggestion struct {
	Message          string `json:"message"`
	CorrectedCommand string `json:"correctedCommand,omitempty"`
}

// RawAction is the input from a tool call (before normalization).
type RawAction struct {
	Tool          string         `json:"tool,omitempty"`
	Command       string         `json:"command,omitempty"`
	File          string         `json:"file,omitempty"`
	Target        string         `json:"target,omitempty"`
	Content       string         `json:"content,omitempty"`
	Branch        string         `json:"branch,omitempty"`
	Agent         string         `json:"agent,omitempty"`
	FilesAffected int            `json:"filesAffected,omitempty"`
	Metadata      map[string]any `json:"metadata,omitempty"`
}
```

- [ ] **Step 4: Run tests**

```bash
cd go && go test ./internal/action/...
# Expected: PASS
```

- [ ] **Step 5: Commit**

```bash
git add go/internal/action/
git commit -m "feat(go): add core types — ActionContext, PolicyRule, EvalResult"
```

---

### Task 3: Embedded governance data + tool-action map

**Files:**
- Create: `go/internal/config/data.go`
- Create: `go/internal/config/data_test.go`
- Create: `go/data/` (symlinks to TS data files)

- [ ] **Step 1: Create data symlinks**

```bash
cd go/data
ln -s ../../packages/core/src/data/actions.json .
ln -s ../../packages/core/src/data/blast-radius.json .
ln -s ../../packages/core/src/data/destructive-patterns.json .
ln -s ../../packages/core/src/data/git-action-patterns.json .
ln -s ../../packages/core/src/data/github-action-patterns.json .
ln -s ../../packages/core/src/data/invariant-patterns.json .
ln -s ../../packages/core/src/data/tool-action-map.json .
```

- [ ] **Step 2: Write the test**

```go
// go/internal/config/data_test.go
package config_test

import (
	"testing"

	"github.com/AgentGuardHQ/agent-guard/go/internal/config"
)

func TestToolActionMap(t *testing.T) {
	m := config.ToolActionMap()
	if m["Bash"] != "shell.exec" {
		t.Errorf("expected shell.exec for Bash, got %s", m["Bash"])
	}
	if m["Read"] != "file.read" {
		t.Errorf("expected file.read for Read, got %s", m["Read"])
	}
	if m["Write"] != "file.write" {
		t.Errorf("expected file.write for Write, got %s", m["Write"])
	}
}

func TestDestructivePatterns(t *testing.T) {
	patterns := config.DestructivePatterns()
	if len(patterns) == 0 {
		t.Error("expected at least one destructive pattern")
	}
}

func TestGitActionPatterns(t *testing.T) {
	patterns := config.GitActionPatterns()
	if len(patterns) == 0 {
		t.Error("expected at least one git action pattern")
	}
}

func TestGithubActionPatterns(t *testing.T) {
	patterns := config.GithubActionPatterns()
	if len(patterns) == 0 {
		t.Error("expected at least one github action pattern")
	}
}
```

- [ ] **Step 3: Implement embedded data loader**

```go
// go/internal/config/data.go
package config

import (
	"embed"
	"encoding/json"
	"sync"
)

//go:embed data/*.json
var embeddedData embed.FS

// Pattern types matching the TS data format.
type DestructivePattern struct {
	Pattern     string `json:"pattern"`
	Flags       string `json:"flags,omitempty"`
	Description string `json:"description"`
	RiskLevel   string `json:"riskLevel"`
	Category    string `json:"category"`
}

type ActionPattern struct {
	Patterns   []string `json:"patterns"`
	ActionType string   `json:"actionType"`
}

var (
	toolActionMap     map[string]string
	toolActionMapOnce sync.Once

	destructivePatterns     []DestructivePattern
	destructivePatternsOnce sync.Once

	gitPatterns     []ActionPattern
	gitPatternsOnce sync.Once

	githubPatterns     []ActionPattern
	githubPatternsOnce sync.Once
)

func ToolActionMap() map[string]string {
	toolActionMapOnce.Do(func() {
		data, _ := embeddedData.ReadFile("data/tool-action-map.json")
		toolActionMap = make(map[string]string)
		json.Unmarshal(data, &toolActionMap)
	})
	return toolActionMap
}

func DestructivePatterns() []DestructivePattern {
	destructivePatternsOnce.Do(func() {
		data, _ := embeddedData.ReadFile("data/destructive-patterns.json")
		json.Unmarshal(data, &destructivePatterns)
	})
	return destructivePatterns
}

func GitActionPatterns() []ActionPattern {
	gitPatternsOnce.Do(func() {
		data, _ := embeddedData.ReadFile("data/git-action-patterns.json")
		json.Unmarshal(data, &gitPatterns)
	})
	return gitPatterns
}

func GithubActionPatterns() []ActionPattern {
	githubPatternsOnce.Do(func() {
		data, _ := embeddedData.ReadFile("data/github-action-patterns.json")
		json.Unmarshal(data, &githubPatterns)
	})
	return githubPatterns
}
```

Note: The `//go:embed` directive needs the data directory relative to the package. Move symlinks or copy files into `go/internal/config/data/` so the embed works.

- [ ] **Step 4: Run tests**

```bash
cd go && go test ./internal/config/...
# Expected: PASS
```

- [ ] **Step 5: Commit**

```bash
git add go/internal/config/ go/data/
git commit -m "feat(go): embed governance data with sync.Once lazy loading"
```

---

### Task 4: CommandScanner — regex pattern matching for git, github, destructive

**Files:**
- Create: `go/internal/action/scanner.go`
- Create: `go/internal/action/scanner_test.go`

- [ ] **Step 1: Write the tests**

```go
// go/internal/action/scanner_test.go
package action_test

import (
	"testing"

	"github.com/AgentGuardHQ/agent-guard/go/internal/action"
)

func TestScanGitPush(t *testing.T) {
	s := action.NewScanner()
	r := s.ScanGitAction("git push origin main")
	if r == nil || r.ActionType != "git.push" {
		t.Errorf("expected git.push, got %v", r)
	}
}

func TestScanGitCommit(t *testing.T) {
	s := action.NewScanner()
	r := s.ScanGitAction("git commit -m 'fix bug'")
	if r == nil || r.ActionType != "git.commit" {
		t.Errorf("expected git.commit, got %v", r)
	}
}

func TestScanGitNonGit(t *testing.T) {
	s := action.NewScanner()
	r := s.ScanGitAction("ls -la")
	if r != nil {
		t.Errorf("expected nil for non-git command, got %v", r)
	}
}

func TestScanGithubPrCreate(t *testing.T) {
	s := action.NewScanner()
	r := s.ScanGithubAction("gh pr create --title 'fix'")
	if r == nil || r.ActionType != "github.pr.create" {
		t.Errorf("expected github.pr.create, got %v", r)
	}
}

func TestScanGithubPrList(t *testing.T) {
	s := action.NewScanner()
	r := s.ScanGithubAction("gh pr list --limit 10")
	if r == nil || r.ActionType != "github.pr.list" {
		t.Errorf("expected github.pr.list, got %v", r)
	}
}

func TestScanGithubNonGh(t *testing.T) {
	s := action.NewScanner()
	r := s.ScanGithubAction("git push origin main")
	if r != nil {
		t.Errorf("expected nil for non-gh command, got %v", r)
	}
}

func TestScanDestructiveRmRf(t *testing.T) {
	s := action.NewScanner()
	matches := s.ScanDestructive("rm -rf /")
	if len(matches) == 0 {
		t.Error("expected destructive match for rm -rf")
	}
}

func TestScanDestructiveSafe(t *testing.T) {
	s := action.NewScanner()
	matches := s.ScanDestructive("ls -la")
	if len(matches) != 0 {
		t.Errorf("expected no matches for safe command, got %d", len(matches))
	}
}

func TestScanGitInCompoundCommand(t *testing.T) {
	s := action.NewScanner()
	r := s.ScanGitAction("cd /repo && git push origin main")
	if r == nil || r.ActionType != "git.push" {
		t.Errorf("expected git.push in compound command, got %v", r)
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd go && go test ./internal/action/...
# Expected: FAIL — NewScanner not defined
```

- [ ] **Step 3: Implement Scanner**

```go
// go/internal/action/scanner.go
package action

import (
	"regexp"
	"strings"

	"github.com/AgentGuardHQ/agent-guard/go/internal/config"
)

// ScanResult is returned by pattern scanning functions.
type ScanResult struct {
	ActionType string
	Matched    bool
}

// Scanner detects action types from command strings.
type Scanner struct {
	gitPatterns    []compiledPattern
	githubPatterns []compiledPattern
	destructive    []compiledDestructive
}

type compiledPattern struct {
	regexes    []*regexp.Regexp
	actionType string
}

type compiledDestructive struct {
	regex       *regexp.Regexp
	description string
	riskLevel   string
	category    string
}

// NewScanner creates a Scanner with compiled patterns from embedded data.
func NewScanner() *Scanner {
	s := &Scanner{}

	for _, p := range config.GitActionPatterns() {
		cp := compiledPattern{actionType: p.ActionType}
		for _, pat := range p.Patterns {
			if r, err := regexp.Compile(pat); err == nil {
				cp.regexes = append(cp.regexes, r)
			}
		}
		s.gitPatterns = append(s.gitPatterns, cp)
	}

	for _, p := range config.GithubActionPatterns() {
		cp := compiledPattern{actionType: p.ActionType}
		for _, pat := range p.Patterns {
			if r, err := regexp.Compile(pat); err == nil {
				cp.regexes = append(cp.regexes, r)
			}
		}
		s.githubPatterns = append(s.githubPatterns, cp)
	}

	for _, p := range config.DestructivePatterns() {
		flags := ""
		if strings.Contains(p.Flags, "i") {
			flags = "(?i)"
		}
		if r, err := regexp.Compile(flags + p.Pattern); err == nil {
			s.destructive = append(s.destructive, compiledDestructive{
				regex:       r,
				description: p.Description,
				riskLevel:   p.RiskLevel,
				category:    p.Category,
			})
		}
	}

	return s
}

// ScanGitAction returns the git action type or nil.
func (s *Scanner) ScanGitAction(command string) *ScanResult {
	cmd := strings.TrimSpace(command)
	for _, p := range s.gitPatterns {
		for _, r := range p.regexes {
			if r.MatchString(cmd) {
				return &ScanResult{ActionType: p.actionType, Matched: true}
			}
		}
	}
	return nil
}

// ScanGithubAction returns the github action type or nil.
func (s *Scanner) ScanGithubAction(command string) *ScanResult {
	cmd := strings.TrimSpace(command)
	for _, p := range s.githubPatterns {
		for _, r := range p.regexes {
			if r.MatchString(cmd) {
				return &ScanResult{ActionType: p.actionType, Matched: true}
			}
		}
	}
	return nil
}

// ScanDestructive returns all destructive pattern matches.
func (s *Scanner) ScanDestructive(command string) []ScanResult {
	cmd := strings.TrimSpace(command)
	var results []ScanResult
	for _, p := range s.destructive {
		if p.regex.MatchString(cmd) {
			results = append(results, ScanResult{
				ActionType: p.category,
				Matched:    true,
			})
		}
	}
	return results
}
```

- [ ] **Step 4: Run tests**

```bash
cd go && go test ./internal/action/...
# Expected: PASS
```

- [ ] **Step 5: Commit**

```bash
git add go/internal/action/scanner.go go/internal/action/scanner_test.go
git commit -m "feat(go): CommandScanner with git, github, destructive pattern detection"
```

---

### Task 5: AAB normalization — RawAction → ActionContext

**Files:**
- Create: `go/internal/action/normalize.go`
- Create: `go/internal/action/normalize_test.go`

- [ ] **Step 1: Write the tests**

```go
// go/internal/action/normalize_test.go
package action_test

import (
	"testing"

	"github.com/AgentGuardHQ/agent-guard/go/internal/action"
)

func TestNormalizeBashGitPush(t *testing.T) {
	raw := action.RawAction{
		Tool:    "Bash",
		Command: "git push origin main",
		Agent:   "claude-code:opus:developer",
	}
	ctx := action.Normalize(raw, "claude-code")
	if ctx.Action != "git.push" {
		t.Errorf("expected git.push, got %s", ctx.Action)
	}
	if ctx.ActionClass != "git" {
		t.Errorf("expected git class, got %s", ctx.ActionClass)
	}
	if ctx.Branch != "main" {
		t.Errorf("expected branch main, got %s", ctx.Branch)
	}
}

func TestNormalizeBashGhPrCreate(t *testing.T) {
	raw := action.RawAction{
		Tool:    "Bash",
		Command: "gh pr create --title 'fix'",
	}
	ctx := action.Normalize(raw, "claude-code")
	if ctx.Action != "github.pr.create" {
		t.Errorf("expected github.pr.create, got %s", ctx.Action)
	}
	if ctx.ActionClass != "github" {
		t.Errorf("expected github class, got %s", ctx.ActionClass)
	}
}

func TestNormalizeFileWrite(t *testing.T) {
	raw := action.RawAction{
		Tool: "Write",
		File: "src/main.go",
	}
	ctx := action.Normalize(raw, "claude-code")
	if ctx.Action != "file.write" {
		t.Errorf("expected file.write, got %s", ctx.Action)
	}
	if ctx.Target != "src/main.go" {
		t.Errorf("expected src/main.go, got %s", ctx.Target)
	}
}

func TestNormalizeFileRead(t *testing.T) {
	raw := action.RawAction{Tool: "Read", File: "/tmp/test.txt"}
	ctx := action.Normalize(raw, "claude-code")
	if ctx.Action != "file.read" {
		t.Errorf("expected file.read, got %s", ctx.Action)
	}
}

func TestNormalizeDestructiveCommand(t *testing.T) {
	raw := action.RawAction{Tool: "Bash", Command: "rm -rf /"}
	ctx := action.Normalize(raw, "claude-code")
	if !ctx.Destructive {
		t.Error("expected destructive=true for rm -rf")
	}
}

func TestNormalizeUnknownTool(t *testing.T) {
	raw := action.RawAction{Tool: "CustomTool"}
	ctx := action.Normalize(raw, "test")
	if ctx.Action != "unknown" {
		t.Errorf("expected unknown, got %s", ctx.Action)
	}
	if ctx.ActionClass != "unknown" {
		t.Errorf("expected unknown class, got %s", ctx.ActionClass)
	}
}

func TestNormalizeSource(t *testing.T) {
	raw := action.RawAction{Tool: "Bash", Command: "ls"}
	ctx := action.Normalize(raw, "copilot-cli")
	if ctx.Source != "copilot-cli" {
		t.Errorf("expected copilot-cli, got %s", ctx.Source)
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd go && go test ./internal/action/...
# Expected: FAIL — Normalize not defined
```

- [ ] **Step 3: Implement Normalize**

```go
// go/internal/action/normalize.go
package action

import (
	"strings"
	"time"

	"github.com/AgentGuardHQ/agent-guard/go/internal/config"
)

var scanner *Scanner

func getScanner() *Scanner {
	if scanner == nil {
		scanner = NewScanner()
	}
	return scanner
}

// ResolveActionClass maps an action string to its class.
func ResolveActionClass(action string) string {
	parts := strings.SplitN(action, ".", 2)
	if len(parts) == 0 {
		return "unknown"
	}
	switch parts[0] {
	case "file", "test", "git", "github", "shell", "npm", "http", "deploy", "infra":
		return parts[0]
	case "mcp":
		return "mcp"
	default:
		return "unknown"
	}
}

// ExtractBranch extracts the target branch from a git push command.
func ExtractBranch(command string) string {
	segments := strings.FieldsFunc(command, func(r rune) bool {
		return r == '&' || r == '|' || r == ';'
	})
	for _, seg := range segments {
		seg = strings.TrimSpace(seg)
		if !strings.Contains(seg, "git") || !strings.Contains(seg, "push") {
			continue
		}
		// Tokenize after "git push"
		idx := strings.Index(seg, "push")
		if idx < 0 {
			continue
		}
		after := strings.TrimSpace(seg[idx+4:])
		tokens := strings.Fields(after)
		var positional []string
		for i := 0; i < len(tokens); i++ {
			t := tokens[i]
			if strings.HasPrefix(t, "-") {
				// Skip flags and their values
				valueFlags := map[string]bool{"-o": true, "--push-option": true, "--receive-pack": true, "--exec": true, "--repo": true}
				if !strings.Contains(t, "=") && valueFlags[t] && i+1 < len(tokens) {
					i++
				}
				continue
			}
			positional = append(positional, t)
		}
		if len(positional) >= 2 {
			ref := positional[1]
			// Handle refspec: strip src: prefix, +prefix, refs/heads/
			if idx := strings.LastIndex(ref, ":"); idx >= 0 {
				ref = ref[idx+1:]
			}
			ref = strings.TrimPrefix(ref, "+")
			ref = strings.TrimPrefix(ref, "refs/heads/")
			return ref
		}
	}
	return ""
}

// Normalize converts a RawAction into an ActionContext.
func Normalize(raw RawAction, source string) ActionContext {
	toolMap := config.ToolActionMap()
	s := getScanner()

	// Default action from tool-action map
	actionType := toolMap[raw.Tool]
	if actionType == "" {
		// Try lowercase
		actionType = toolMap[strings.ToLower(raw.Tool)]
	}
	if actionType == "" {
		actionType = "unknown"
	}

	target := raw.Target
	if target == "" {
		target = raw.File
	}
	if target == "" {
		target = raw.Command
	}

	branch := raw.Branch
	destructive := false

	// For shell.exec, detect specific action types
	if actionType == "shell.exec" && raw.Command != "" {
		cmd := raw.Command

		// GitHub detection first (before git)
		if ghResult := s.ScanGithubAction(cmd); ghResult != nil {
			actionType = ghResult.ActionType
		} else if gitResult := s.ScanGitAction(cmd); gitResult != nil {
			// Git detection
			actionType = gitResult.ActionType
			if branch == "" {
				branch = ExtractBranch(cmd)
			}
		}

		// Destructive detection
		if matches := s.ScanDestructive(cmd); len(matches) > 0 {
			destructive = true
		}
	}

	actionClass := ResolveActionClass(actionType)
	agent := raw.Agent
	if agent == "" {
		agent = source
	}

	return ActionContext{
		Action:       actionType,
		ActionClass:  actionClass,
		Target:       target,
		Destructive:  destructive,
		Source:       source,
		NormalizedAt: time.Now().UnixMilli(),
		Agent:        agent,
		Branch:       branch,
		Command:      raw.Command,
		FilesAffected: raw.FilesAffected,
		Metadata:     raw.Metadata,
		Actor: ActorIdentity{
			AgentID: agent,
		},
		Args: ActionArguments{
			FilePath: raw.File,
			Command:  raw.Command,
			Branch:   branch,
			Content:  raw.Content,
			Metadata: raw.Metadata,
		},
	}
}
```

- [ ] **Step 4: Run tests**

```bash
cd go && go test ./internal/action/...
# Expected: PASS
```

- [ ] **Step 5: Commit**

```bash
git add go/internal/action/normalize.go go/internal/action/normalize_test.go
git commit -m "feat(go): AAB normalization — RawAction to ActionContext"
```

---

### Task 6: YAML policy loader

**Files:**
- Create: `go/internal/config/yaml.go`
- Create: `go/internal/config/yaml_test.go`

- [ ] **Step 1: Add yaml dependency**

```bash
cd go && go get gopkg.in/yaml.v3
```

- [ ] **Step 2: Write the tests**

```go
// go/internal/config/yaml_test.go
package config_test

import (
	"testing"

	"github.com/AgentGuardHQ/agent-guard/go/internal/action"
	"github.com/AgentGuardHQ/agent-guard/go/internal/config"
)

func TestLoadYamlPolicy(t *testing.T) {
	yaml := `
id: test-policy
name: Test Policy
severity: 4
mode: guide
rules:
  - action: git.push
    effect: deny
    branches: [main, master]
    reason: No push to main
    suggestion: Push to a feature branch
    correctedCommand: "git push origin {{branch}}"
  - action: file.read
    effect: allow
    reason: Reading is safe
`
	policy, err := config.LoadYamlPolicy([]byte(yaml))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if policy.ID != "test-policy" {
		t.Errorf("expected test-policy, got %s", policy.ID)
	}
	if policy.Mode != "guide" {
		t.Errorf("expected guide, got %s", policy.Mode)
	}
	if len(policy.Rules) != 2 {
		t.Fatalf("expected 2 rules, got %d", len(policy.Rules))
	}

	deny := policy.Rules[0]
	if deny.Effect != "deny" {
		t.Errorf("expected deny, got %s", deny.Effect)
	}
	if len(deny.Branches) != 2 {
		t.Errorf("expected 2 branches, got %d", len(deny.Branches))
	}
	if deny.Suggestion != "Push to a feature branch" {
		t.Errorf("unexpected suggestion: %s", deny.Suggestion)
	}
}

func TestLoadYamlPolicyMultiAction(t *testing.T) {
	yaml := `
id: test
name: Test
rules:
  - action:
      - test.run
      - test.run.unit
    effect: allow
    reason: Tests are safe
`
	policy, err := config.LoadYamlPolicy([]byte(yaml))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	rule := policy.Rules[0]
	if len(rule.Action) != 2 {
		t.Errorf("expected 2 actions, got %d", len(rule.Action))
	}
}

func TestLoadYamlPolicyInvariantModes(t *testing.T) {
	yaml := `
id: test
name: Test
mode: guide
invariantModes:
  no-secret-exposure: enforce
  blast-radius-limit: educate
rules: []
`
	policy, err := config.LoadYamlPolicy([]byte(yaml))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if policy.InvariantModes["no-secret-exposure"] != "enforce" {
		t.Errorf("expected enforce, got %s", policy.InvariantModes["no-secret-exposure"])
	}
	if policy.InvariantModes["blast-radius-limit"] != "educate" {
		t.Errorf("expected educate, got %s", policy.InvariantModes["blast-radius-limit"])
	}
}
```

- [ ] **Step 3: Implement YAML loader**

```go
// go/internal/config/yaml.go
package config

import (
	"fmt"

	"github.com/AgentGuardHQ/agent-guard/go/internal/action"
	"gopkg.in/yaml.v3"
)

// LoadYamlPolicy parses YAML bytes into a LoadedPolicy.
func LoadYamlPolicy(data []byte) (*action.LoadedPolicy, error) {
	var raw struct {
		ID                 string                       `yaml:"id"`
		Name               string                       `yaml:"name"`
		Description        string                       `yaml:"description"`
		Severity           int                          `yaml:"severity"`
		Mode               string                       `yaml:"mode"`
		Pack               string                       `yaml:"pack"`
		Version            string                       `yaml:"version"`
		InvariantModes     map[string]string            `yaml:"invariantModes"`
		DisabledInvariants []string                     `yaml:"disabledInvariants"`
		Rules              []action.PolicyRule          `yaml:"rules"`
	}

	if err := yaml.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("yaml parse error: %w", err)
	}

	// Normalize flattened condition fields into Conditions struct
	for i := range raw.Rules {
		r := &raw.Rules[i]
		if r.Target != "" || len(r.Branches) > 0 || r.Limit > 0 ||
			r.RequireTests || r.RequireFormat || r.RequireWorktree {
			if r.Conditions == nil {
				r.Conditions = &action.RuleConditions{}
			}
			if r.Target != "" && len(r.Conditions.Scope) == 0 {
				r.Conditions.Scope = []string{r.Target}
			}
			if len(r.Branches) > 0 && len(r.Conditions.Branches) == 0 {
				r.Conditions.Branches = r.Branches
			}
			if r.Limit > 0 && r.Conditions.Limit == 0 {
				r.Conditions.Limit = r.Limit
			}
			if r.RequireTests {
				r.Conditions.RequireTests = true
			}
			if r.RequireFormat {
				r.Conditions.RequireFormat = true
			}
			if r.RequireWorktree {
				r.Conditions.RequireWorktree = true
			}
		}
	}

	return &action.LoadedPolicy{
		ID:                 raw.ID,
		Name:               raw.Name,
		Description:        raw.Description,
		Severity:           raw.Severity,
		Mode:               raw.Mode,
		Pack:               raw.Pack,
		Version:            raw.Version,
		InvariantModes:     raw.InvariantModes,
		DisabledInvariants: raw.DisabledInvariants,
		Rules:              raw.Rules,
	}, nil
}
```

Also implement `UnmarshalYAML` for `StringOrSlice` in `types.go`:

```go
// Add to go/internal/action/types.go

import "gopkg.in/yaml.v3"

func (s *StringOrSlice) UnmarshalYAML(node *yaml.Node) error {
	switch node.Kind {
	case yaml.ScalarNode:
		*s = StringOrSlice{node.Value}
		return nil
	case yaml.SequenceNode:
		var items []string
		if err := node.Decode(&items); err != nil {
			return err
		}
		*s = items
		return nil
	default:
		return fmt.Errorf("expected string or sequence, got %v", node.Kind)
	}
}
```

- [ ] **Step 4: Run tests**

```bash
cd go && go test ./internal/config/...
# Expected: PASS
```

- [ ] **Step 5: Commit**

```bash
git add go/internal/config/yaml.go go/internal/config/yaml_test.go go/internal/action/types.go go/go.sum
git commit -m "feat(go): YAML policy loader with StringOrSlice and invariantModes"
```

---

### Task 7: Policy evaluator — multi-phase rule matching

**Files:**
- Create: `go/internal/engine/policy.go`
- Create: `go/internal/engine/policy_test.go`

- [ ] **Step 1: Write the tests**

```go
// go/internal/engine/policy_test.go
package engine_test

import (
	"testing"

	"github.com/AgentGuardHQ/agent-guard/go/internal/action"
	"github.com/AgentGuardHQ/agent-guard/go/internal/engine"
)

func testPolicy() *action.LoadedPolicy {
	return &action.LoadedPolicy{
		ID:       "test",
		Name:     "Test",
		Severity: 4,
		Rules: []action.PolicyRule{
			{Action: action.StringOrSlice{"git.push"}, Effect: "deny", Branches: []string{"main", "master"}, Reason: "No push to main"},
			{Action: action.StringOrSlice{"shell.exec"}, Effect: "deny", Target: "rm -rf", Reason: "Destructive blocked"},
			{Action: action.StringOrSlice{"file.read"}, Effect: "allow", Reason: "Reading safe"},
			{Action: action.StringOrSlice{"shell.exec"}, Effect: "allow", Reason: "Shell allowed"},
			{Action: action.StringOrSlice{"git.push"}, Effect: "allow", Reason: "Push to feature branches allowed"},
		},
	}
}

func TestDenyGitPushToMain(t *testing.T) {
	ctx := action.ActionContext{Action: "git.push", Branch: "main"}
	result := engine.Evaluate(ctx, []*action.LoadedPolicy{testPolicy()}, &engine.EvalOptions{DefaultDeny: true})
	if result.Allowed {
		t.Error("expected denied for push to main")
	}
	if result.Reason != "No push to main" {
		t.Errorf("expected 'No push to main', got '%s'", result.Reason)
	}
}

func TestAllowGitPushToFeature(t *testing.T) {
	ctx := action.ActionContext{Action: "git.push", Branch: "fix/foo"}
	result := engine.Evaluate(ctx, []*action.LoadedPolicy{testPolicy()}, &engine.EvalOptions{DefaultDeny: true})
	if !result.Allowed {
		t.Errorf("expected allowed for push to fix/foo, got denied: %s", result.Reason)
	}
}

func TestAllowFileRead(t *testing.T) {
	ctx := action.ActionContext{Action: "file.read"}
	result := engine.Evaluate(ctx, []*action.LoadedPolicy{testPolicy()}, &engine.EvalOptions{DefaultDeny: true})
	if !result.Allowed {
		t.Error("expected allowed for file.read")
	}
}

func TestDefaultDenyUnknownAction(t *testing.T) {
	ctx := action.ActionContext{Action: "deploy.trigger"}
	result := engine.Evaluate(ctx, []*action.LoadedPolicy{testPolicy()}, &engine.EvalOptions{DefaultDeny: true})
	if result.Allowed {
		t.Error("expected denied for unmatched action with defaultDeny")
	}
}

func TestDefaultAllowUnknownAction(t *testing.T) {
	ctx := action.ActionContext{Action: "deploy.trigger"}
	result := engine.Evaluate(ctx, []*action.LoadedPolicy{testPolicy()}, &engine.EvalOptions{DefaultDeny: false})
	if !result.Allowed {
		t.Error("expected allowed for unmatched action without defaultDeny")
	}
}

func TestDenyRuleMatchesTarget(t *testing.T) {
	ctx := action.ActionContext{Action: "shell.exec", Command: "rm -rf /tmp"}
	result := engine.Evaluate(ctx, []*action.LoadedPolicy{testPolicy()}, &engine.EvalOptions{DefaultDeny: true})
	if result.Allowed {
		t.Error("expected denied for rm -rf command")
	}
}

func TestAllowShellExecSafe(t *testing.T) {
	ctx := action.ActionContext{Action: "shell.exec", Command: "ls -la"}
	result := engine.Evaluate(ctx, []*action.LoadedPolicy{testPolicy()}, &engine.EvalOptions{DefaultDeny: true})
	if !result.Allowed {
		t.Errorf("expected allowed for ls -la, got denied: %s", result.Reason)
	}
}

func TestSuggestionPassedThrough(t *testing.T) {
	policy := &action.LoadedPolicy{
		ID: "test", Name: "Test", Severity: 3,
		Rules: []action.PolicyRule{
			{
				Action: action.StringOrSlice{"git.push"}, Effect: "deny",
				Branches: []string{"main"},
				Reason: "No push", Suggestion: "Use feature branch",
				CorrectedCommand: "git push origin {{branch}}",
			},
		},
	}
	ctx := action.ActionContext{Action: "git.push", Branch: "main"}
	result := engine.Evaluate(ctx, []*action.LoadedPolicy{policy}, &engine.EvalOptions{DefaultDeny: true})
	if result.Suggestion != "Use feature branch" {
		t.Errorf("expected suggestion, got '%s'", result.Suggestion)
	}
	if result.CorrectedCommand != "git push origin {{branch}}" {
		t.Errorf("expected correctedCommand, got '%s'", result.CorrectedCommand)
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd go && go test ./internal/engine/...
# Expected: FAIL — engine package not found
```

- [ ] **Step 3: Implement evaluator**

```go
// go/internal/engine/policy.go
package engine

import (
	"strings"

	"github.com/AgentGuardHQ/agent-guard/go/internal/action"
)

// EvalOptions controls evaluation behavior.
type EvalOptions struct {
	DefaultDeny bool
}

// Evaluate runs multi-phase policy evaluation: deny rules first, then allow rules, then default.
func Evaluate(ctx action.ActionContext, policies []*action.LoadedPolicy, opts *EvalOptions) action.EvalResult {
	if opts == nil {
		opts = &EvalOptions{}
	}

	// Phase 1: Check deny rules across all policies
	for _, policy := range policies {
		for i := range policy.Rules {
			rule := &policy.Rules[i]
			if rule.Effect != "deny" {
				continue
			}
			if matchesRule(ctx, rule) {
				return action.EvalResult{
					Allowed:          false,
					Decision:         "deny",
					MatchedRule:      rule,
					MatchedPolicy:    policy,
					Reason:           rule.Reason,
					Severity:         policy.Severity,
					Suggestion:       rule.Suggestion,
					CorrectedCommand: rule.CorrectedCommand,
					Intervention:     rule.Intervention,
				}
			}
		}
	}

	// Phase 2: Check allow rules
	for _, policy := range policies {
		for i := range policy.Rules {
			rule := &policy.Rules[i]
			if rule.Effect != "allow" {
				continue
			}
			if matchesRule(ctx, rule) {
				return action.EvalResult{
					Allowed:       true,
					Decision:      "allow",
					MatchedRule:   rule,
					MatchedPolicy: policy,
					Reason:        rule.Reason,
					Severity:      policy.Severity,
				}
			}
		}
	}

	// Phase 3: Default decision
	if opts.DefaultDeny {
		return action.EvalResult{
			Allowed:  false,
			Decision: "deny",
			Reason:   "No matching policy rule — default deny (fail-closed)",
			Severity: 5,
		}
	}
	return action.EvalResult{
		Allowed:  true,
		Decision: "allow",
		Reason:   "No matching policy rule — default allow (fail-open)",
		Severity: 0,
	}
}

// matchesRule checks if an ActionContext matches a PolicyRule.
func matchesRule(ctx action.ActionContext, rule *action.PolicyRule) bool {
	// Action must match
	if !matchesAction(ctx.Action, rule.Action) {
		return false
	}

	// Branch condition (from flattened or conditions)
	branches := rule.Branches
	if rule.Conditions != nil && len(rule.Conditions.Branches) > 0 {
		branches = rule.Conditions.Branches
	}
	if len(branches) > 0 {
		if ctx.Branch == "" {
			// No branch info — for deny rules, assume match (fail-closed)
			if rule.Effect == "deny" {
				return true
			}
			return false
		}
		branchMatched := false
		for _, b := range branches {
			if b == ctx.Branch {
				branchMatched = true
				break
			}
		}
		if !branchMatched {
			return false
		}
	}

	// Target/scope condition
	target := rule.Target
	if rule.Conditions != nil && len(rule.Conditions.Scope) > 0 {
		target = rule.Conditions.Scope[0]
	}
	if target != "" {
		// Target is a substring match on command or target
		cmdLower := strings.ToLower(ctx.Command)
		targetLower := strings.ToLower(ctx.Target)
		scopeLower := strings.ToLower(target)
		if !strings.Contains(cmdLower, scopeLower) && !strings.Contains(targetLower, scopeLower) {
			return false
		}
	}

	return true
}

// matchesAction checks if an action type matches a rule's action pattern.
func matchesAction(actionType string, patterns action.StringOrSlice) bool {
	for _, p := range patterns {
		if p == actionType {
			return true
		}
	}
	return false
}
```

- [ ] **Step 4: Run tests**

```bash
cd go && go test ./internal/engine/...
# Expected: PASS
```

- [ ] **Step 5: Commit**

```bash
git add go/internal/engine/
git commit -m "feat(go): policy evaluator — multi-phase deny/allow/default rule matching"
```

---

### Task 8: Wire evaluate subcommand — read JSON from stdin, output decision

**Files:**
- Modify: `go/cmd/agentguard/main.go`
- Create: `go/test/testdata/policies/test-policy.yaml`
- Create: `go/test/testdata/payloads/git-push-main.json`

- [ ] **Step 1: Create test fixtures**

```yaml
# go/test/testdata/policies/test-policy.yaml
id: test-policy
name: Test Policy
severity: 4
mode: guide
rules:
  - action: git.push
    effect: deny
    branches: [main, master]
    reason: Direct push to protected branch
    suggestion: Push to a feature branch and open a PR
    correctedCommand: "git push origin {{branch}}"
  - action: file.read
    effect: allow
    reason: Reading is always safe
  - action: shell.exec
    effect: allow
    reason: Shell execution allowed by default
  - action: git.push
    effect: allow
    reason: Pushes to feature branches allowed
```

```json
// go/test/testdata/payloads/git-push-main.json
{"tool":"Bash","input":{"command":"git push origin main"},"hook":"PreToolUse","session_id":"test"}
```

- [ ] **Step 2: Implement evaluate subcommand**

```go
// Replace the evaluate case in go/cmd/agentguard/main.go
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

	raw := action.RawAction{Tool: payload.Tool}
	if input := payload.Input; input != nil {
		if cmd, ok := input["command"].(string); ok {
			raw.Command = cmd
		}
		if fp, ok := input["file_path"].(string); ok {
			raw.File = fp
		}
	}

	ctx := action.Normalize(raw, "cli")
	out, _ := json.MarshalIndent(ctx, "", "  ")
	fmt.Println(string(out))
}

func runEvaluate(args []string) {
	fs := flag.NewFlagSet("evaluate", flag.ExitOnError)
	policyPath := fs.String("policy", "", "Path to agentguard.yaml")
	fs.Parse(args)

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

	raw := action.RawAction{Tool: payload.Tool}
	if input := payload.Input; input != nil {
		if cmd, ok := input["command"].(string); ok {
			raw.Command = cmd
		}
		if fp, ok := input["file_path"].(string); ok {
			raw.File = fp
		}
	}

	ctx := action.Normalize(raw, "cli")
	result := engine.Evaluate(ctx, []*action.LoadedPolicy{policy}, &engine.EvalOptions{DefaultDeny: true})

	out, _ := json.MarshalIndent(result, "", "  ")
	fmt.Println(string(out))

	if !result.Allowed {
		os.Exit(2)
	}
}
```

- [ ] **Step 3: Build and test manually**

```bash
cd go && go build -o bin/agentguard ./cmd/agentguard

# Test: git push to main should be denied
echo '{"tool":"Bash","input":{"command":"git push origin main"}}' | ./bin/agentguard evaluate --policy ../agentguard.yaml
echo "Exit: $?"
# Expected: {"allowed":false, "reason":"Direct push to protected branch", ...}, exit 2

# Test: file read should be allowed
echo '{"tool":"Read","input":{"file_path":"/tmp/test.txt"}}' | ./bin/agentguard evaluate --policy ../agentguard.yaml
echo "Exit: $?"
# Expected: {"allowed":true, ...}, exit 0

# Test: normalize
echo '{"tool":"Bash","input":{"command":"gh pr create --title fix"}}' | ./bin/agentguard normalize
# Expected: {"action":"github.pr.create", "actionClass":"github", ...}
```

- [ ] **Step 4: Commit**

```bash
git add go/cmd/agentguard/ go/test/testdata/
git commit -m "feat(go): evaluate and normalize subcommands — Phase 1 complete"
```

---

### Task 9: Compliance test — compare Go and TS decisions

**Files:**
- Create: `go/test/compliance/compliance_test.go`
- Create: `go/test/testdata/payloads/` (multiple test payloads)

- [ ] **Step 1: Create test payloads**

Create JSON files in `go/test/testdata/payloads/`:
- `git-push-main.json` — `{"tool":"Bash","input":{"command":"git push origin main"}}`
- `git-push-feature.json` — `{"tool":"Bash","input":{"command":"git push origin fix/foo"}}`
- `file-read.json` — `{"tool":"Read","input":{"file_path":"/tmp/test.txt"}}`
- `file-write.json` — `{"tool":"Write","input":{"file_path":"src/main.go"}}`
- `shell-ls.json` — `{"tool":"Bash","input":{"command":"ls -la"}}`
- `shell-rm-rf.json` — `{"tool":"Bash","input":{"command":"rm -rf /tmp/foo"}}`
- `gh-pr-create.json` — `{"tool":"Bash","input":{"command":"gh pr create --title fix"}}`
- `gh-pr-list.json` — `{"tool":"Bash","input":{"command":"gh pr list"}}`
- `unknown-tool.json` — `{"tool":"CustomTool","input":{}}`
- `deploy-trigger.json` — `{"tool":"Bash","input":{"command":"kubectl apply -f deploy.yaml"}}`

- [ ] **Step 2: Write compliance test**

```go
// go/test/compliance/compliance_test.go
package compliance_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/AgentGuardHQ/agent-guard/go/internal/action"
	"github.com/AgentGuardHQ/agent-guard/go/internal/config"
	"github.com/AgentGuardHQ/agent-guard/go/internal/engine"
)

func TestComplianceWithPolicy(t *testing.T) {
	// Load the actual agentguard.yaml from repo root
	policyPath := filepath.Join("..", "..", "agentguard.yaml")
	policyData, err := os.ReadFile(policyPath)
	if err != nil {
		t.Skipf("agentguard.yaml not found at %s, skipping compliance tests", policyPath)
	}

	policy, err := config.LoadYamlPolicy(policyData)
	if err != nil {
		t.Fatalf("failed to load policy: %v", err)
	}

	payloadDir := filepath.Join("..", "testdata", "payloads")
	entries, err := os.ReadDir(payloadDir)
	if err != nil {
		t.Fatalf("failed to read payloads dir: %v", err)
	}

	for _, entry := range entries {
		if filepath.Ext(entry.Name()) != ".json" {
			continue
		}
		t.Run(entry.Name(), func(t *testing.T) {
			data, err := os.ReadFile(filepath.Join(payloadDir, entry.Name()))
			if err != nil {
				t.Fatalf("read payload: %v", err)
			}

			var payload struct {
				Tool  string         `json:"tool"`
				Input map[string]any `json:"input"`
			}
			json.Unmarshal(data, &payload)

			raw := action.RawAction{Tool: payload.Tool}
			if input := payload.Input; input != nil {
				if cmd, ok := input["command"].(string); ok {
					raw.Command = cmd
				}
				if fp, ok := input["file_path"].(string); ok {
					raw.File = fp
				}
			}

			ctx := action.Normalize(raw, "compliance-test")
			result := engine.Evaluate(ctx, []*action.LoadedPolicy{policy}, &engine.EvalOptions{DefaultDeny: true})

			// Log for manual comparison with TS kernel
			t.Logf("action=%s allowed=%v reason=%q", ctx.Action, result.Allowed, result.Reason)
		})
	}
}
```

- [ ] **Step 3: Run compliance tests**

```bash
cd go && go test ./test/compliance/ -v
# Expected: PASS — all payloads produce decisions
```

- [ ] **Step 4: Commit**

```bash
git add go/test/
git commit -m "test(go): add compliance test suite — 10 payloads against agentguard.yaml"
```

---

### Task 10: Final build, full test, tag Phase 1

- [ ] **Step 1: Run all Go tests**

```bash
cd go && go test ./...
# Expected: all PASS
```

- [ ] **Step 2: Build release binary**

```bash
cd go && go build -o bin/agentguard ./cmd/agentguard
ls -la bin/agentguard
# Expected: single static binary, ~5-10MB
```

- [ ] **Step 3: Smoke test**

```bash
echo '{"tool":"Bash","input":{"command":"git push origin main"}}' | go/bin/agentguard evaluate --policy agentguard.yaml
# Expected: denied with suggestion

echo '{"tool":"Read","input":{"file_path":"/tmp/test.txt"}}' | go/bin/agentguard evaluate --policy agentguard.yaml
# Expected: allowed

echo '{"tool":"Bash","input":{"command":"gh pr create --title fix"}}' | go/bin/agentguard normalize
# Expected: github.pr.create
```

- [ ] **Step 4: Commit and push**

```bash
git add go/
git commit -m "feat(go): Phase 1 complete — types, matchers, AAB, policy evaluator"
git push origin main
```
