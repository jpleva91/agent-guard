package action_test

import (
	"testing"

	"github.com/AgentGuardHQ/agent-guard/go/internal/action"
	"github.com/AgentGuardHQ/agent-guard/go/internal/config"
)

// ---- ParseShellCommand tests ----

func TestParseSimpleCommand(t *testing.T) {
	ast := action.ParseShellCommand("git push origin main")
	if len(ast.Commands) != 1 {
		t.Fatalf("expected 1 command, got %d", len(ast.Commands))
	}
	cmd := ast.Commands[0]
	if cmd.Name != "git" {
		t.Errorf("expected name=git, got %s", cmd.Name)
	}
	if len(cmd.Args) != 3 {
		t.Fatalf("expected 3 args, got %d: %v", len(cmd.Args), cmd.Args)
	}
	if cmd.Args[0] != "push" || cmd.Args[1] != "origin" || cmd.Args[2] != "main" {
		t.Errorf("unexpected args: %v", cmd.Args)
	}
	if cmd.Operator != "" {
		t.Errorf("expected empty operator, got %q", cmd.Operator)
	}
}

func TestParseEmptyString(t *testing.T) {
	ast := action.ParseShellCommand("")
	if len(ast.Commands) != 0 {
		t.Errorf("expected 0 commands for empty string, got %d", len(ast.Commands))
	}
}

func TestParseWhitespaceOnly(t *testing.T) {
	ast := action.ParseShellCommand("   \t  ")
	if len(ast.Commands) != 0 {
		t.Errorf("expected 0 commands for whitespace, got %d", len(ast.Commands))
	}
}

func TestParseCompoundAnd(t *testing.T) {
	ast := action.ParseShellCommand("git add . && git commit -m 'fix' && git push")
	if len(ast.Commands) != 3 {
		t.Fatalf("expected 3 commands, got %d", len(ast.Commands))
	}
	// First command: git add .
	if ast.Commands[0].Name != "git" {
		t.Errorf("cmd[0] name: expected git, got %s", ast.Commands[0].Name)
	}
	if len(ast.Commands[0].Args) != 2 || ast.Commands[0].Args[0] != "add" || ast.Commands[0].Args[1] != "." {
		t.Errorf("cmd[0] args: %v", ast.Commands[0].Args)
	}
	if ast.Commands[0].Operator != "&&" {
		t.Errorf("cmd[0] operator: expected &&, got %q", ast.Commands[0].Operator)
	}
	// Second command: git commit -m 'fix'
	if ast.Commands[1].Name != "git" {
		t.Errorf("cmd[1] name: expected git, got %s", ast.Commands[1].Name)
	}
	if ast.Commands[1].Operator != "&&" {
		t.Errorf("cmd[1] operator: expected &&, got %q", ast.Commands[1].Operator)
	}
	// Third command: git push
	if ast.Commands[2].Name != "git" {
		t.Errorf("cmd[2] name: expected git, got %s", ast.Commands[2].Name)
	}
	if ast.Commands[2].Operator != "" {
		t.Errorf("cmd[2] operator: expected empty, got %q", ast.Commands[2].Operator)
	}
}

func TestParseCompoundOr(t *testing.T) {
	ast := action.ParseShellCommand("test -f file || touch file")
	if len(ast.Commands) != 2 {
		t.Fatalf("expected 2 commands, got %d", len(ast.Commands))
	}
	if ast.Commands[0].Operator != "||" {
		t.Errorf("expected ||, got %q", ast.Commands[0].Operator)
	}
}

func TestParseCompoundSemicolon(t *testing.T) {
	ast := action.ParseShellCommand("echo hello; echo world")
	if len(ast.Commands) != 2 {
		t.Fatalf("expected 2 commands, got %d", len(ast.Commands))
	}
	if ast.Commands[0].Name != "echo" || ast.Commands[0].Args[0] != "hello" {
		t.Errorf("cmd[0]: %v %v", ast.Commands[0].Name, ast.Commands[0].Args)
	}
	if ast.Commands[0].Operator != ";" {
		t.Errorf("expected ;, got %q", ast.Commands[0].Operator)
	}
	if ast.Commands[1].Name != "echo" || ast.Commands[1].Args[0] != "world" {
		t.Errorf("cmd[1]: %v %v", ast.Commands[1].Name, ast.Commands[1].Args)
	}
}

func TestParsePipe(t *testing.T) {
	ast := action.ParseShellCommand("cat file.txt | grep pattern")
	if len(ast.Commands) != 2 {
		t.Fatalf("expected 2 commands, got %d", len(ast.Commands))
	}
	if ast.Commands[0].Name != "cat" {
		t.Errorf("expected cat, got %s", ast.Commands[0].Name)
	}
	if ast.Commands[0].Operator != "|" {
		t.Errorf("expected |, got %q", ast.Commands[0].Operator)
	}
	if ast.Commands[1].Name != "grep" {
		t.Errorf("expected grep, got %s", ast.Commands[1].Name)
	}
}

func TestParseRedirectStdout(t *testing.T) {
	ast := action.ParseShellCommand("echo foo > file.txt")
	if len(ast.Commands) != 1 {
		t.Fatalf("expected 1 command, got %d", len(ast.Commands))
	}
	cmd := ast.Commands[0]
	if cmd.Name != "echo" {
		t.Errorf("expected echo, got %s", cmd.Name)
	}
	if len(cmd.Redirects) != 1 {
		t.Fatalf("expected 1 redirect, got %d", len(cmd.Redirects))
	}
	rd := cmd.Redirects[0]
	if rd.Fd != 1 {
		t.Errorf("expected fd=1, got %d", rd.Fd)
	}
	if rd.Target != "file.txt" {
		t.Errorf("expected target=file.txt, got %s", rd.Target)
	}
	if rd.Append {
		t.Error("expected append=false")
	}
}

func TestParseRedirectAppend(t *testing.T) {
	ast := action.ParseShellCommand("echo bar >> log.txt")
	if len(ast.Commands) != 1 {
		t.Fatalf("expected 1 command, got %d", len(ast.Commands))
	}
	if len(ast.Commands[0].Redirects) != 1 {
		t.Fatalf("expected 1 redirect, got %d", len(ast.Commands[0].Redirects))
	}
	rd := ast.Commands[0].Redirects[0]
	if !rd.Append {
		t.Error("expected append=true")
	}
	if rd.Target != "log.txt" {
		t.Errorf("expected log.txt, got %s", rd.Target)
	}
}

func TestParseRedirectStderr(t *testing.T) {
	ast := action.ParseShellCommand("cmd 2>/dev/null")
	if len(ast.Commands) != 1 {
		t.Fatalf("expected 1 command, got %d", len(ast.Commands))
	}
	if len(ast.Commands[0].Redirects) != 1 {
		t.Fatalf("expected 1 redirect, got %d", len(ast.Commands[0].Redirects))
	}
	rd := ast.Commands[0].Redirects[0]
	if rd.Fd != 2 {
		t.Errorf("expected fd=2, got %d", rd.Fd)
	}
	if rd.Target != "/dev/null" {
		t.Errorf("expected /dev/null, got %s", rd.Target)
	}
}

func TestParseSingleQuotedString(t *testing.T) {
	ast := action.ParseShellCommand("git commit -m 'fix: handle edge case'")
	if len(ast.Commands) != 1 {
		t.Fatalf("expected 1 command, got %d", len(ast.Commands))
	}
	cmd := ast.Commands[0]
	if cmd.Name != "git" {
		t.Errorf("expected git, got %s", cmd.Name)
	}
	// -m and the message should be separate tokens
	if len(cmd.Args) != 3 {
		t.Fatalf("expected 3 args [commit, -m, message], got %d: %v", len(cmd.Args), cmd.Args)
	}
	if cmd.Args[2] != "fix: handle edge case" {
		t.Errorf("expected quoted message, got %q", cmd.Args[2])
	}
}

func TestParseDoubleQuotedString(t *testing.T) {
	ast := action.ParseShellCommand(`echo "hello world"`)
	if len(ast.Commands) != 1 {
		t.Fatalf("expected 1 command, got %d", len(ast.Commands))
	}
	if len(ast.Commands[0].Args) != 1 {
		t.Fatalf("expected 1 arg, got %d: %v", len(ast.Commands[0].Args), ast.Commands[0].Args)
	}
	if ast.Commands[0].Args[0] != "hello world" {
		t.Errorf("expected 'hello world', got %q", ast.Commands[0].Args[0])
	}
}

func TestParseQuotedStringNotSplit(t *testing.T) {
	ast := action.ParseShellCommand(`git commit -m "add feature && fix bug"`)
	if len(ast.Commands) != 1 {
		t.Fatalf("expected 1 command (quoted && should not split), got %d", len(ast.Commands))
	}
	cmd := ast.Commands[0]
	if cmd.Args[2] != "add feature && fix bug" {
		t.Errorf("expected message to contain &&, got %q", cmd.Args[2])
	}
}

func TestParseSubshell(t *testing.T) {
	ast := action.ParseShellCommand("echo $(whoami)")
	if len(ast.Commands) != 1 {
		t.Fatalf("expected 1 command, got %d", len(ast.Commands))
	}
	if ast.Commands[0].Args[0] != "$(whoami)" {
		t.Errorf("expected $(whoami), got %q", ast.Commands[0].Args[0])
	}
}

func TestParseVariableExpansion(t *testing.T) {
	ast := action.ParseShellCommand("echo $HOME")
	if len(ast.Commands) != 1 {
		t.Fatalf("expected 1 command, got %d", len(ast.Commands))
	}
	if ast.Commands[0].Args[0] != "$HOME" {
		t.Errorf("expected $HOME, got %q", ast.Commands[0].Args[0])
	}
}

func TestParseBraceVariableExpansion(t *testing.T) {
	ast := action.ParseShellCommand("echo ${USER}")
	if len(ast.Commands) != 1 {
		t.Fatalf("expected 1 command, got %d", len(ast.Commands))
	}
	if ast.Commands[0].Args[0] != "${USER}" {
		t.Errorf("expected ${USER}, got %q", ast.Commands[0].Args[0])
	}
}

func TestParseBacktickSubstitution(t *testing.T) {
	ast := action.ParseShellCommand("echo `date`")
	if len(ast.Commands) != 1 {
		t.Fatalf("expected 1 command, got %d", len(ast.Commands))
	}
	if ast.Commands[0].Args[0] != "`date`" {
		t.Errorf("expected `date`, got %q", ast.Commands[0].Args[0])
	}
}

func TestParseIsCompound(t *testing.T) {
	tests := []struct {
		input    string
		compound bool
	}{
		{"git push", false},
		{"git add . && git push", true},
		{"echo a || echo b", true},
		{"echo a; echo b", true},
		{"cat f | grep p", true},
	}
	for _, tt := range tests {
		ast := action.ParseShellCommand(tt.input)
		if ast.IsCompound() != tt.compound {
			t.Errorf("IsCompound(%q) = %v, want %v", tt.input, ast.IsCompound(), tt.compound)
		}
	}
}

func TestParseFullCommand(t *testing.T) {
	ast := action.ParseShellCommand("git push origin main")
	if len(ast.Commands) != 1 {
		t.Fatalf("expected 1 command, got %d", len(ast.Commands))
	}
	full := ast.Commands[0].FullCommand()
	if full != "git push origin main" {
		t.Errorf("expected 'git push origin main', got %q", full)
	}
}

func TestParseMixedOperators(t *testing.T) {
	ast := action.ParseShellCommand("cd /repo && git add . && git commit -m 'msg'; git push | tee log.txt")
	if len(ast.Commands) != 5 {
		t.Fatalf("expected 5 commands, got %d", len(ast.Commands))
	}
	expected := []struct {
		name string
		op   string
	}{
		{"cd", "&&"},
		{"git", "&&"},
		{"git", ";"},
		{"git", "|"},
		{"tee", ""},
	}
	for i, exp := range expected {
		if ast.Commands[i].Name != exp.name {
			t.Errorf("cmd[%d] name: expected %s, got %s", i, exp.name, ast.Commands[i].Name)
		}
		if ast.Commands[i].Operator != exp.op {
			t.Errorf("cmd[%d] operator: expected %q, got %q", i, exp.op, ast.Commands[i].Operator)
		}
	}
}

func TestParseRtk(t *testing.T) {
	// RTK-prefixed commands that agents commonly produce
	ast := action.ParseShellCommand("rtk git add . && rtk git commit -m 'msg' && rtk git push")
	if len(ast.Commands) != 3 {
		t.Fatalf("expected 3 commands, got %d", len(ast.Commands))
	}
	if ast.Commands[0].Name != "rtk" {
		t.Errorf("expected rtk, got %s", ast.Commands[0].Name)
	}
	if ast.Commands[0].Args[0] != "git" {
		t.Errorf("expected git as first arg of rtk, got %s", ast.Commands[0].Args[0])
	}
}

// ---- AST Scanner tests ----

func TestScanASTSimpleGitPush(t *testing.T) {
	s := config.NewDefaultScanner()
	results := s.ScanAST("git push origin main")
	if len(results) == 0 {
		t.Fatal("expected at least 1 result")
	}
	found := false
	for _, r := range results {
		if r.ActionType == "git.push" {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected git.push in results: %v", results)
	}
}

func TestScanASTCompoundFindsAllActions(t *testing.T) {
	s := config.NewDefaultScanner()
	results := s.ScanAST("git add . && git commit -m 'fix' && git push origin main")
	// Should find git.add, git.commit, and git.push
	types := make(map[string]bool)
	for _, r := range results {
		types[r.ActionType] = true
	}
	for _, expected := range []string{"git.commit", "git.push"} {
		if !types[expected] {
			t.Errorf("expected %s in results, found: %v", expected, types)
		}
	}
}

func TestScanASTCompoundWithDestructive(t *testing.T) {
	s := config.NewDefaultScanner()
	results := s.ScanAST("git push origin main && rm -rf /tmp/data")
	hasGit := false
	hasDestructive := false
	for _, r := range results {
		if r.ActionType == "git.push" {
			hasGit = true
		}
		if r.Category != "" && r.Matched {
			hasDestructive = true
		}
	}
	if !hasGit {
		t.Error("expected git.push")
	}
	if !hasDestructive {
		t.Error("expected destructive match")
	}
}

func TestScanASTGithubAction(t *testing.T) {
	s := config.NewDefaultScanner()
	results := s.ScanAST("gh pr create --title 'fix'")
	found := false
	for _, r := range results {
		if r.ActionType == "github.pr.create" {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected github.pr.create, got: %v", results)
	}
}

func TestScanASTMixedGitAndGithub(t *testing.T) {
	s := config.NewDefaultScanner()
	results := s.ScanAST("git push origin main && gh pr create --title 'ship it'")
	types := make(map[string]bool)
	for _, r := range results {
		types[r.ActionType] = true
	}
	if !types["git.push"] {
		t.Error("expected git.push")
	}
	if !types["github.pr.create"] {
		t.Error("expected github.pr.create")
	}
}

func TestScanASTEmptyInput(t *testing.T) {
	s := config.NewDefaultScanner()
	results := s.ScanAST("")
	if results != nil {
		t.Errorf("expected nil for empty input, got %v", results)
	}
}

func TestScanASTNonGitCommand(t *testing.T) {
	s := config.NewDefaultScanner()
	results := s.ScanAST("ls -la && echo hello")
	// Should have no git/github results, possibly no results at all
	for _, r := range results {
		if r.ActionType == "git.push" || r.ActionType == "github.pr.create" {
			t.Errorf("unexpected action: %s", r.ActionType)
		}
	}
}

func TestScanASTGitActions(t *testing.T) {
	s := config.NewDefaultScanner()
	results := s.ScanASTGitActions("git add . && git commit -m 'fix' && git push origin main")
	types := make(map[string]bool)
	for _, r := range results {
		types[r.ActionType] = true
	}
	if !types["git.commit"] {
		t.Error("expected git.commit")
	}
	if !types["git.push"] {
		t.Error("expected git.push")
	}
}

func TestScanASTDestructive(t *testing.T) {
	s := config.NewDefaultScanner()
	results := s.ScanASTDestructive("echo hello && rm -rf /tmp && echo done")
	if len(results) == 0 {
		t.Error("expected destructive match for rm -rf")
	}
}

func TestPreferAST(t *testing.T) {
	tests := []struct {
		input string
		want  bool
	}{
		{"git push origin main", false},
		{"git add . && git push", true},
		{"echo a || echo b", true},
		{"echo a; echo b", true},
		{"cat f | grep p", true},
		// Note: containsCompoundOperator is a fast heuristic that doesn't
		// respect quotes. This is intentional — it over-triggers to AST mode
		// which handles quoted strings correctly. The false positive is harmless.
		{"echo 'hello && world'", true},
	}
	for _, tt := range tests {
		got := action.PreferAST(tt.input)
		if got != tt.want {
			t.Errorf("PreferAST(%q) = %v, want %v", tt.input, got, tt.want)
		}
	}
}

// ---- Benchmarks: AST vs Regex ----

var benchCompoundCmd = "cd /project && git add . && git commit -m 'feat: add new feature' && git push origin main && gh pr create --title 'New feature' --body 'Description'"

func BenchmarkRegexCompound(b *testing.B) {
	s := config.NewDefaultScanner()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		s.ScanGitAction(benchCompoundCmd)
		s.ScanGithubAction(benchCompoundCmd)
		s.ScanDestructive(benchCompoundCmd)
	}
}

func BenchmarkASTCompound(b *testing.B) {
	s := config.NewDefaultScanner()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		s.ScanAST(benchCompoundCmd)
	}
}

func BenchmarkRegexSimple(b *testing.B) {
	s := config.NewDefaultScanner()
	cmd := "git push origin main"
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		s.ScanGitAction(cmd)
		s.ScanGithubAction(cmd)
		s.ScanDestructive(cmd)
	}
}

func BenchmarkASTSimple(b *testing.B) {
	s := config.NewDefaultScanner()
	cmd := "git push origin main"
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		s.ScanAST(cmd)
	}
}

// Benchmark for a long compound command typical of CI pipelines
func BenchmarkASTLongCompound(b *testing.B) {
	s := config.NewDefaultScanner()
	cmd := "npm install && npm run build && npm test && git add . && git commit -m 'release' && git push origin main && gh pr create --title 'Release' && docker build -t app . && kubectl apply -f deploy.yaml"
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		s.ScanAST(cmd)
	}
}

func BenchmarkRegexLongCompound(b *testing.B) {
	s := config.NewDefaultScanner()
	cmd := "npm install && npm run build && npm test && git add . && git commit -m 'release' && git push origin main && gh pr create --title 'Release' && docker build -t app . && kubectl apply -f deploy.yaml"
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		s.ScanGitAction(cmd)
		s.ScanGithubAction(cmd)
		s.ScanDestructive(cmd)
	}
}
