package action

// ScanAST parses a shell command into an AST and scans each individual command
// for git actions, github actions, and destructive patterns. This is more precise
// than scanning the full string because each sub-command is matched independently.
//
// For compound commands (&&, ||, ;, |), this avoids false positives from
// cross-command token bleed and is faster than running regex over the entire string.
func (s *Scanner) ScanAST(input string) []ScanResult {
	ast := ParseShellCommand(input)
	if len(ast.Commands) == 0 {
		return nil
	}

	var results []ScanResult
	seen := make(map[string]bool) // deduplicate by ActionType

	for _, cmd := range ast.Commands {
		full := cmd.FullCommand()
		if full == "" {
			continue
		}

		// GitHub detection first (before git, since gh commands also contain "git" substring)
		if ghResult := s.ScanGithubAction(full); ghResult != nil {
			key := "gh:" + ghResult.ActionType
			if !seen[key] {
				seen[key] = true
				results = append(results, *ghResult)
			}
		} else if gitResult := s.ScanGitAction(full); gitResult != nil {
			key := "git:" + gitResult.ActionType
			if !seen[key] {
				seen[key] = true
				results = append(results, *gitResult)
			}
		}

		// Destructive detection (independent of git/github)
		for _, d := range s.ScanDestructive(full) {
			key := "destr:" + d.Description
			if !seen[key] {
				seen[key] = true
				results = append(results, d)
			}
		}
	}

	return results
}

// ScanASTGitActions returns only git action results from AST-based scanning.
func (s *Scanner) ScanASTGitActions(input string) []ScanResult {
	ast := ParseShellCommand(input)
	if len(ast.Commands) == 0 {
		return nil
	}

	var results []ScanResult
	seen := make(map[string]bool)

	for _, cmd := range ast.Commands {
		full := cmd.FullCommand()
		if full == "" {
			continue
		}
		if gitResult := s.ScanGitAction(full); gitResult != nil {
			if !seen[gitResult.ActionType] {
				seen[gitResult.ActionType] = true
				results = append(results, *gitResult)
			}
		}
	}

	return results
}

// ScanASTDestructive returns only destructive pattern results from AST-based scanning.
func (s *Scanner) ScanASTDestructive(input string) []ScanResult {
	ast := ParseShellCommand(input)
	if len(ast.Commands) == 0 {
		return nil
	}

	var results []ScanResult
	seen := make(map[string]bool)

	for _, cmd := range ast.Commands {
		full := cmd.FullCommand()
		if full == "" {
			continue
		}
		for _, d := range s.ScanDestructive(full) {
			key := d.Description
			if !seen[key] {
				seen[key] = true
				results = append(results, d)
			}
		}
	}

	return results
}

// PreferAST returns true if the AST scanner should be preferred over regex
// for this input. Currently true for compound commands.
func PreferAST(input string) bool {
	return containsCompoundOperator(input)
}
