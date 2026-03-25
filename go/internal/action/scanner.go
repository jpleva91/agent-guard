// Package action provides command scanning for git, github, and destructive patterns.
package action

import (
	"regexp"
	"strings"
)

// ScanResult is returned by pattern scanning functions.
type ScanResult struct {
	ActionType  string
	Matched     bool
	Description string
	RiskLevel   string
	Category    string
}

// PatternGroup maps a set of regex patterns to a canonical action type.
// This mirrors config.ActionPattern but avoids an import cycle.
type PatternGroup struct {
	Patterns   []string
	ActionType string
}

// DestructivePatternDef defines a destructive command pattern.
// This mirrors config.DestructivePattern but avoids an import cycle.
type DestructivePatternDef struct {
	Pattern     string
	Flags       string
	Description string
	RiskLevel   string
	Category    string
}

// Scanner detects action types from command strings using compiled regex patterns.
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

// NewScanner creates a Scanner with compiled patterns from the provided data.
func NewScanner(gitGroups, githubGroups []PatternGroup, destructivePatterns []DestructivePatternDef) *Scanner {
	s := &Scanner{}

	for _, p := range gitGroups {
		cp := compiledPattern{actionType: p.ActionType}
		for _, pat := range p.Patterns {
			if r, err := regexp.Compile(pat); err == nil {
				cp.regexes = append(cp.regexes, r)
			}
		}
		s.gitPatterns = append(s.gitPatterns, cp)
	}

	for _, p := range githubGroups {
		cp := compiledPattern{actionType: p.ActionType}
		for _, pat := range p.Patterns {
			if r, err := regexp.Compile(pat); err == nil {
				cp.regexes = append(cp.regexes, r)
			}
		}
		s.githubPatterns = append(s.githubPatterns, cp)
	}

	for _, p := range destructivePatterns {
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

// ScanGitAction returns the first matching git action type or nil.
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

// ScanGithubAction returns the first matching github action type or nil.
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

// ScanDestructive returns all destructive pattern matches for a command.
func (s *Scanner) ScanDestructive(command string) []ScanResult {
	cmd := strings.TrimSpace(command)
	var results []ScanResult
	for _, p := range s.destructive {
		if p.regex.MatchString(cmd) {
			results = append(results, ScanResult{
				ActionType:  p.category,
				Matched:     true,
				Description: p.description,
				RiskLevel:   p.riskLevel,
				Category:    p.category,
			})
		}
	}
	return results
}
