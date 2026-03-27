package action_test

import (
	"testing"

	"github.com/AgentGuardHQ/agentguard/go/internal/action"
	"github.com/AgentGuardHQ/agentguard/go/internal/config"
)

func newTestScanner() *action.Scanner {
	return config.NewDefaultScanner()
}

func TestScanGitPush(t *testing.T) {
	s := newTestScanner()
	r := s.ScanGitAction("git push origin main")
	if r == nil || r.ActionType != "git.push" {
		t.Errorf("expected git.push, got %v", r)
	}
}

func TestScanGitCommit(t *testing.T) {
	s := newTestScanner()
	r := s.ScanGitAction("git commit -m 'fix bug'")
	if r == nil || r.ActionType != "git.commit" {
		t.Errorf("expected git.commit, got %v", r)
	}
}

func TestScanGitNonGit(t *testing.T) {
	s := newTestScanner()
	r := s.ScanGitAction("ls -la")
	if r != nil {
		t.Errorf("expected nil for non-git command, got %v", r)
	}
}

func TestScanGithubPrCreate(t *testing.T) {
	s := newTestScanner()
	r := s.ScanGithubAction("gh pr create --title 'fix'")
	if r == nil || r.ActionType != "github.pr.create" {
		t.Errorf("expected github.pr.create, got %v", r)
	}
}

func TestScanGithubPrList(t *testing.T) {
	s := newTestScanner()
	r := s.ScanGithubAction("gh pr list --limit 10")
	if r == nil || r.ActionType != "github.pr.list" {
		t.Errorf("expected github.pr.list, got %v", r)
	}
}

func TestScanGithubNonGh(t *testing.T) {
	s := newTestScanner()
	r := s.ScanGithubAction("git push origin main")
	if r != nil {
		t.Errorf("expected nil for non-gh command, got %v", r)
	}
}

func TestScanDestructiveRmRf(t *testing.T) {
	s := newTestScanner()
	matches := s.ScanDestructive("rm -rf /")
	if len(matches) == 0 {
		t.Error("expected destructive match for rm -rf")
	}
}

func TestScanDestructiveSafe(t *testing.T) {
	s := newTestScanner()
	matches := s.ScanDestructive("ls -la")
	if len(matches) != 0 {
		t.Errorf("expected no matches for safe command, got %d", len(matches))
	}
}

func TestScanGitInCompoundCommand(t *testing.T) {
	s := newTestScanner()
	r := s.ScanGitAction("cd /repo && git push origin main")
	if r == nil || r.ActionType != "git.push" {
		t.Errorf("expected git.push in compound command, got %v", r)
	}
}

func TestScanGitForcePush(t *testing.T) {
	s := newTestScanner()
	r := s.ScanGitAction("git push --force origin main")
	if r == nil || r.ActionType != "git.force-push" {
		t.Errorf("expected git.force-push, got %v", r)
	}
}

func TestScanGitWorktreeAdd(t *testing.T) {
	s := newTestScanner()
	r := s.ScanGitAction("git worktree add ../wt-branch feature")
	if r == nil || r.ActionType != "git.worktree.add" {
		t.Errorf("expected git.worktree.add, got %v", r)
	}
}

func TestScanGithubIssueCreate(t *testing.T) {
	s := newTestScanner()
	r := s.ScanGithubAction("gh issue create --title 'bug'")
	if r == nil || r.ActionType != "github.issue.create" {
		t.Errorf("expected github.issue.create, got %v", r)
	}
}

func TestScanDestructiveSudo(t *testing.T) {
	s := newTestScanner()
	matches := s.ScanDestructive("sudo rm -rf /tmp/data")
	if len(matches) == 0 {
		t.Error("expected destructive match for sudo rm")
	}
}

func TestScanDestructiveCaseInsensitive(t *testing.T) {
	s := newTestScanner()
	matches := s.ScanDestructive("DROP DATABASE mydb")
	if len(matches) == 0 {
		t.Error("expected destructive match for DROP DATABASE")
	}
}
