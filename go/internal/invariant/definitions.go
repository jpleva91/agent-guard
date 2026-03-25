package invariant

import (
	"fmt"
	"path/filepath"
	"regexp"
	"strings"
)

// Sensitive file patterns — substring matches (case-insensitive) against file paths.
var sensitiveFilePatterns = []string{
	".env", "credentials", ".pem", ".key", "secret", "token",
	".npmrc", ".netrc", ".pgpass", ".htpasswd",
	"id_rsa", "id_ed25519", "id_ecdsa", "id_dsa",
	".p12", ".pfx", ".jks", "keystore",
	"secrets.yaml", "secrets.yml", "vault.json",
}

// Credential path patterns — substring matches (case-insensitive).
var credentialPathPatterns = []string{
	"/.ssh/", "\\.ssh\\",
	"/.aws/credentials", "/.aws/config", "\\.aws\\credentials", "\\.aws\\config",
	"/.config/gcloud/", "\\.config\\gcloud\\",
	"/.azure/", "\\.azure\\",
	"/.docker/config.json", "\\.docker\\config.json",
}

// Credential file basenames (case-insensitive).
var credentialBasenamePatterns = []string{".npmrc", ".pypirc", ".netrc", ".curlrc"}

// Env file patterns — basenames (case-insensitive).
var envFileRegex = regexp.MustCompile(`(?i)(?:^|[/\\])\.env(?:\.\w+)?$`)

// Container config basenames (case-insensitive).
var containerConfigBasenames = []string{
	"dockerfile", "docker-compose.yml", "docker-compose.yaml",
	"compose.yml", "compose.yaml", ".dockerignore", "containerfile",
}

// Container config suffix patterns.
var dockerfileSuffixRegex = regexp.MustCompile(`(?i)\.dockerfile$`)

// IDE socket path patterns (lowercased).
var ideSocketPathPatterns = []string{
	"vscode-ipc-", ".vscode-server/ipc-",
	"jetbrains_", "intellij_", "idea_",
	"cursor-ipc-",
	"/tmp/clion", "/tmp/pycharm", "/tmp/webstorm", "/tmp/goland", "/tmp/rider",
}

// Lifecycle scripts that auto-run during npm install/publish/pack.
var lifecycleScripts = []string{
	"preinstall", "postinstall", "prepare", "prepublishOnly",
	"prepack", "postpack", "install",
}

// Read-only action types that are exempt from write-guard invariants.
var readOnlyActions = []string{"file.read", "git.diff"}

// Read-only shell commands.
var readOnlyCmds = []string{
	"ls", "cat", "head", "tail", "find", "grep", "rg", "tree", "stat", "file", "wc", "diff",
}

// Shell profile basenames (case-insensitive).
var shellProfileBasenames = []string{
	".bashrc", ".bash_profile", ".bash_login", ".profile",
	".zshrc", ".zshenv", ".zprofile", ".zlogin",
	".cshrc", ".tcshrc", ".login",
}

// System-wide profile paths (substring match, case-insensitive).
var systemProfilePatterns = []string{
	"/etc/profile", "/etc/environment", "/etc/profile.d/",
}

// Sensitive environment variable name patterns (case-insensitive substrings).
var sensitiveEnvVarPatterns = []string{
	"secret", "password", "passwd", "token", "api_key", "apikey",
	"private_key", "access_key", "auth", "credential",
	"connection_string", "database_url", "db_pass",
}

// Script file extensions.
var scriptExtensions = []string{
	".sh", ".bash", ".zsh", ".fish", ".py", ".rb", ".pl", ".pm",
	".js", ".mjs", ".ts", ".ps1", ".bat", ".cmd",
}

// CI/CD directory patterns.
var cicdDirPatterns = []string{
	".github/workflows/", ".github\\workflows\\",
	".circleci/", ".circleci\\",
	".buildkite/", ".buildkite\\",
}

// CI/CD file patterns.
var cicdFilePatterns = []string{
	".gitlab-ci.yml", "Jenkinsfile", ".travis.yml", "azure-pipelines.yml",
}

// Migration directory patterns.
var migrationDirPatterns = []string{
	"migrations/", "db/migrate/", "prisma/migrations/",
	"drizzle/", "knex/migrations/", "sequelize/migrations/",
}

// Governance directory patterns.
var governanceDirPatterns = []string{".agentguard/", ".agentguard\\", "policies/", "policies\\"}

// Governance file basenames.
var governanceFileBasenames = []string{"agentguard.yaml", "agentguard.yml", ".agentguard.yaml"}

// Network command patterns.
var networkCommandPatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?i)\bcurl\b`),
	regexp.MustCompile(`(?i)\bwget\b`),
	regexp.MustCompile(`(?i)\b(?:nc|netcat|ncat)\b`),
	regexp.MustCompile(`(?i)\bfetch\b`),
	regexp.MustCompile(`(?i)\bhttpie\b`),
	regexp.MustCompile(`(?i)\bhttp\s`),
}

// Transitive script patterns — detect policy-violating content in written files.
var transitiveScriptPatterns = []struct {
	pattern *regexp.Regexp
	label   string
}{
	{regexp.MustCompile(`\brm\s+(-[a-zA-Z]*[rf][a-zA-Z]*\s+|.*--recursive|.*--force)`), "destructive deletion (rm -rf/rm -r)"},
	{regexp.MustCompile(`\bcurl\b`), "network access (curl)"},
	{regexp.MustCompile(`\bwget\b`), "network access (wget)"},
	{regexp.MustCompile(`\b(?:nc|netcat|ncat)\b`), "raw network socket (netcat)"},
	{regexp.MustCompile(`/dev/tcp/`), "network exfiltration (/dev/tcp)"},
	{regexp.MustCompile(`(?:cat|source|\.)\s+[^\n]*\.env\b`), "secret file read (.env)"},
	{regexp.MustCompile(`open\s*\(\s*['"][^'"]*(?:\.env|credentials|secret|\.key|\.pem|id_rsa)[^'"]*['"]\s*\)`), "secret file read via open()"},
	{regexp.MustCompile(`\bsubprocess\s*\.(?:call|run|Popen|check_output|check_call)\b`), "subprocess execution (Python)"},
	{regexp.MustCompile(`\bos\s*\.(?:system|popen)\b`), "os command execution (Python)"},
	{regexp.MustCompile(`\bshutil\s*\.rmtree\b`), "recursive deletion (shutil.rmtree)"},
	{regexp.MustCompile(`\bchild_process\b`), "child process spawning (Node.js)"},
	{regexp.MustCompile(`\bexecSync\s*\(`), "synchronous command execution (execSync)"},
	{regexp.MustCompile(`\beval\s*\(`), "dynamic code execution (eval)"},
}

// Destructive DDL patterns for migration files.
var destructiveDDLPatterns = []struct {
	pattern *regexp.Regexp
	label   string
}{
	{regexp.MustCompile(`(?i)\bDROP\s+TABLE\b`), "DROP TABLE"},
	{regexp.MustCompile(`(?i)\bDROP\s+COLUMN\b`), "DROP COLUMN"},
	{regexp.MustCompile(`(?i)\bDROP\s+INDEX\b`), "DROP INDEX"},
	{regexp.MustCompile(`(?i)\bDROP\s+DATABASE\b`), "DROP DATABASE"},
	{regexp.MustCompile(`(?i)\bTRUNCATE\b`), "TRUNCATE"},
	{regexp.MustCompile(`(?i)\bALTER\s+TABLE\s+\S+\s+DROP\b`), "ALTER TABLE ... DROP"},
	{regexp.MustCompile(`(?im)\bDELETE\s+FROM\s+\S+\s*(?:;|\s*$)`), "DELETE FROM (without WHERE)"},
}

// Wrapper command prefixes to strip for base command extraction.
var wrapperCmds = []string{"rtk", "npx", "env", "sudo", "time", "nice"}

// --- Helper functions ---

// isReadOnlyAction returns true if the action type is inherently read-only.
func isReadOnlyAction(actionType string) bool {
	for _, a := range readOnlyActions {
		if a == actionType {
			return true
		}
	}
	return false
}

// isReadOnlyCmd returns true if the command basename is a read-only tool.
func isReadOnlyCmd(cmd string) bool {
	for _, c := range readOnlyCmds {
		if c == cmd {
			return true
		}
	}
	return false
}

// extractBaseCommand strips known command wrappers (rtk, npx, env, sudo)
// to find the actual base command.
func extractBaseCommand(command string) string {
	tokens := strings.Fields(command)
	idx := 0
	for idx < len(tokens) {
		// Strip path prefix (e.g. /usr/bin/rtk -> rtk)
		base := filepath.Base(tokens[idx])
		isWrapper := false
		for _, w := range wrapperCmds {
			if base == w {
				isWrapper = true
				break
			}
		}
		if !isWrapper {
			break
		}
		idx++
	}
	if idx < len(tokens) {
		return filepath.Base(tokens[idx])
	}
	return ""
}

// hasFileRedirect returns true if the shell command contains a stdout file redirect.
func hasFileRedirect(command string) bool {
	// Strip safe stderr patterns
	stripped := regexp.MustCompile(`[0-9]>/dev/null`).ReplaceAllString(command, "")
	stripped = regexp.MustCompile(`[0-9]>&[0-9]`).ReplaceAllString(stripped, "")
	stripped = strings.ReplaceAll(stripped, "&>/dev/null", "")
	// Check for remaining > (stdout file redirect)
	return regexp.MustCompile(`(?:^|[^&\d])>`).MatchString(stripped)
}

// isReadOnlyShellCommand returns true for shell.exec commands that cannot modify files.
func isReadOnlyShellCommand(actionType, command string) bool {
	if actionType != "shell.exec" {
		return false
	}
	cmd := strings.TrimSpace(command)
	baseCmd := extractBaseCommand(cmd)
	return isReadOnlyCmd(baseCmd) && !hasFileRedirect(cmd)
}

// skipIfReadOnly returns a passing result if the action is read-only, or nil to continue checking.
func skipIfReadOnly(ctx CheckContext) *InvariantResult {
	actionType := ctx.Action.Action
	if isReadOnlyAction(actionType) {
		return &InvariantResult{
			Passed:  true,
			Message: fmt.Sprintf("Action type %s is read-only", actionType),
		}
	}
	if isReadOnlyShellCommand(actionType, ctx.Action.Command) {
		return &InvariantResult{
			Passed:  true,
			Message: "Read-only shell command",
		}
	}
	return nil
}

// isCredentialPath returns true if the file path targets a well-known credential location.
func isCredentialPath(filePath string) bool {
	lower := strings.ToLower(filePath)

	// Check directory-based credential patterns
	for _, p := range credentialPathPatterns {
		if strings.Contains(lower, strings.ToLower(p)) {
			return true
		}
	}

	// Check credential basenames
	base := strings.ToLower(filepath.Base(filePath))
	for _, p := range credentialBasenamePatterns {
		if base == p {
			return true
		}
	}

	// Check .env file pattern
	if envFileRegex.MatchString(filePath) {
		return true
	}

	return false
}

// isContainerConfigPath returns true if the path targets a container configuration file.
func isContainerConfigPath(filePath string) bool {
	lower := strings.ToLower(filepath.Base(filePath))
	for _, p := range containerConfigBasenames {
		if lower == p {
			return true
		}
	}
	// Check *.dockerfile suffix
	if dockerfileSuffixRegex.MatchString(strings.ToLower(filePath)) {
		return true
	}
	return false
}

// isShellProfilePath returns true if the path targets a shell profile file.
func isShellProfilePath(filePath string) bool {
	lower := strings.ToLower(filePath)

	// Check system-wide profile paths
	for _, p := range systemProfilePatterns {
		if strings.Contains(lower, strings.ToLower(p)) {
			return true
		}
	}

	// Check user-level shell profile basenames
	base := strings.ToLower(filepath.Base(filePath))
	for _, p := range shellProfileBasenames {
		if base == p {
			return true
		}
	}

	return false
}

// isNetworkCommand returns true if the command contains a network tool.
func isNetworkCommand(command string) bool {
	lower := strings.ToLower(command)
	for _, p := range networkCommandPatterns {
		if p.MatchString(lower) {
			return true
		}
	}
	return false
}

// extractDomainFromURL extracts a domain from a URL string.
func extractDomainFromURL(rawURL string) string {
	trimmed := strings.TrimSpace(rawURL)
	if trimmed == "" {
		return ""
	}

	// Try to parse protocol://hostname
	re := regexp.MustCompile(`(?i)^(?:https?://)?([^/:?\s#]+)`)
	match := re.FindStringSubmatch(trimmed)
	if len(match) >= 2 {
		return strings.ToLower(match[1])
	}
	return ""
}

// extractURLFromCommand extracts a URL from a shell command containing curl/wget/etc.
func extractURLFromCommand(command string) string {
	re := regexp.MustCompile(`(?i)\bhttps?://[^\s"'<>|;)]+`)
	match := re.FindString(command)
	return match
}

// isScriptFilePath returns true if the file has a known script extension.
func isScriptFilePath(filePath string) bool {
	if filePath == "" {
		return false
	}
	lower := strings.ToLower(filePath)
	for _, ext := range scriptExtensions {
		if strings.HasSuffix(lower, ext) {
			return true
		}
	}
	return false
}

// hasShebang returns true if the content starts with a shebang line.
func hasShebang(content string) bool {
	return strings.HasPrefix(content, "#!")
}

// isLifecycleConfigPath returns true if the file can define lifecycle hooks.
func isLifecycleConfigPath(filePath string) bool {
	if filePath == "" {
		return false
	}
	base := strings.ToLower(filepath.Base(filePath))
	if base == "package.json" || base == "makefile" {
		return true
	}
	lower := strings.ToLower(filePath)
	return strings.HasSuffix(lower, ".mk")
}

// identifyIDE returns the IDE name from a matched socket pattern.
func identifyIDE(pattern string) string {
	switch {
	case strings.Contains(pattern, "vscode") || strings.Contains(pattern, ".vscode-server"):
		return "VS Code"
	case strings.Contains(pattern, "cursor"):
		return "Cursor"
	case strings.Contains(pattern, "jetbrains") || strings.Contains(pattern, "intellij") || strings.Contains(pattern, "idea"):
		return "JetBrains"
	case strings.Contains(pattern, "clion"):
		return "CLion"
	case strings.Contains(pattern, "pycharm"):
		return "PyCharm"
	case strings.Contains(pattern, "webstorm"):
		return "WebStorm"
	case strings.Contains(pattern, "goland"):
		return "GoLand"
	case strings.Contains(pattern, "rider"):
		return "Rider"
	default:
		return "Unknown"
	}
}

// DefaultInvariants returns all 22 built-in invariant definitions.
func DefaultInvariants() []InvariantDef {
	return []InvariantDef{
		checkSecretExposure(),
		checkProtectedBranch(),
		checkBlastRadiusLimit(),
		checkTestBeforePush(),
		checkNoForcePush(),
		checkNoSkillModification(),
		checkNoScheduledTaskModification(),
		checkNoCredentialFileCreation(),
		checkNoPackageScriptInjection(),
		checkLockfileIntegrity(),
		checkRecursiveOperationGuard(),
		checkLargeFileWrite(),
		checkNoCICDConfigModification(),
		checkNoPermissionEscalation(),
		checkNoGovernanceSelfModification(),
		checkNoContainerConfigModification(),
		checkNoEnvVarModification(),
		checkNoNetworkEgress(),
		checkNoDestructiveMigration(),
		checkTransitiveEffectAnalysis(),
		checkNoIDESocketAccess(),
		checkCommitScopeGuard(),
	}
}

// --- Invariant definitions ---

// 1. Secret Exposure — detect secrets/credentials in file modifications.
func checkSecretExposure() InvariantDef {
	return InvariantDef{
		ID:          SecretExposure,
		Name:        "No Secret Exposure",
		Description: "Sensitive files (.env, credentials, keys) must not be committed or exposed",
		Severity:    SeverityCritical,
		Check: func(ctx CheckContext) InvariantResult {
			var exposed []string
			for _, f := range ctx.ModifiedFiles {
				lower := strings.ToLower(f)
				for _, p := range sensitiveFilePatterns {
					if strings.Contains(lower, p) {
						exposed = append(exposed, f)
						break
					}
				}
			}

			if len(exposed) > 0 {
				return InvariantResult{
					ID:       SecretExposure,
					Passed:   false,
					Severity: SeverityCritical,
					Message:  fmt.Sprintf("Sensitive files detected: %s", strings.Join(exposed, ", ")),
					Details: map[string]any{
						"exposedFiles": exposed,
					},
				}
			}
			return InvariantResult{
				ID:       SecretExposure,
				Passed:   true,
				Severity: SeverityCritical,
				Message:  "No sensitive files modified",
			}
		},
	}
}

// 2. Protected Branch — block direct pushes to main/master/release branches.
func checkProtectedBranch() InvariantDef {
	return InvariantDef{
		ID:          ProtectedBranch,
		Name:        "Protected Branch Safety",
		Description: "Direct pushes to main/master are forbidden",
		Severity:    SeverityHigh,
		Check: func(ctx CheckContext) InvariantResult {
			protectedBranches := ctx.ProtectedBranches
			if len(protectedBranches) == 0 {
				protectedBranches = []string{"main", "master"}
			}

			targetBranch := ctx.Action.Branch
			if targetBranch == "" {
				targetBranch = ctx.GitBranch
			}

			isProtected := false
			for _, b := range protectedBranches {
				if b == targetBranch {
					isProtected = true
					break
				}
			}

			if isProtected && ctx.DirectPush {
				return InvariantResult{
					ID:       ProtectedBranch,
					Passed:   false,
					Severity: SeverityHigh,
					Message:  fmt.Sprintf("Direct push to protected branch: %s", targetBranch),
					Details: map[string]any{
						"targetBranch": targetBranch,
					},
				}
			}
			return InvariantResult{
				ID:       ProtectedBranch,
				Passed:   true,
				Severity: SeverityHigh,
				Message:  "No direct push to protected branch",
			}
		},
	}
}

// 3. Blast Radius — flag actions affecting too many files.
func checkBlastRadiusLimit() InvariantDef {
	return InvariantDef{
		ID:          BlastRadiusLimit,
		Name:        "Blast Radius Limit",
		Description: "A single operation must not modify too many files at once",
		Severity:    SeverityMedium,
		Check: func(ctx CheckContext) InvariantResult {
			limit := ctx.BlastRadiusLimit
			if limit == 0 {
				limit = 20
			}

			count := ctx.Action.FilesAffected
			if count == 0 {
				count = len(ctx.ModifiedFiles)
			}

			if count > limit {
				return InvariantResult{
					ID:       BlastRadiusLimit,
					Passed:   false,
					Severity: SeverityMedium,
					Message:  fmt.Sprintf("%d files modified (limit: %d)", count, limit),
					Details: map[string]any{
						"filesAffected": count,
						"limit":         limit,
					},
				}
			}
			return InvariantResult{
				ID:       BlastRadiusLimit,
				Passed:   true,
				Severity: SeverityMedium,
				Message:  fmt.Sprintf("At most %d files modified", limit),
			}
		},
	}
}

// 4. Test Before Push — require tests to have run before git push.
func checkTestBeforePush() InvariantDef {
	return InvariantDef{
		ID:          TestBeforePush,
		Name:        "Tests Before Push",
		Description: "Tests must pass before pushing to protected branches",
		Severity:    SeverityMedium,
		Check: func(ctx CheckContext) InvariantResult {
			if !ctx.IsPush {
				return InvariantResult{
					ID:       TestBeforePush,
					Passed:   true,
					Severity: SeverityMedium,
					Message:  "Not a push operation",
				}
			}

			// Only enforce on protected branches
			protectedBranches := ctx.ProtectedBranches
			if len(protectedBranches) == 0 {
				protectedBranches = []string{"main", "master"}
			}

			targetBranch := ctx.Action.Branch
			if targetBranch == "" {
				targetBranch = ctx.GitBranch
			}

			if targetBranch != "" {
				isProtected := false
				for _, b := range protectedBranches {
					if b == targetBranch {
						isProtected = true
						break
					}
				}
				if !isProtected {
					return InvariantResult{
						ID:       TestBeforePush,
						Passed:   true,
						Severity: SeverityMedium,
						Message:  fmt.Sprintf("Feature branch: %s", targetBranch),
					}
				}
			}

			if ctx.TestsPass != nil && *ctx.TestsPass {
				return InvariantResult{
					ID:       TestBeforePush,
					Passed:   true,
					Severity: SeverityMedium,
					Message:  "Tests passing",
				}
			}
			return InvariantResult{
				ID:       TestBeforePush,
				Passed:   false,
				Severity: SeverityMedium,
				Message:  "Tests not verified before push to protected branch",
			}
		},
	}
}

// 5. No Force Push — block git force push.
func checkNoForcePush() InvariantDef {
	return InvariantDef{
		ID:          NoForcePush,
		Name:        "No Force Push",
		Description: "Force pushes are forbidden unless explicitly authorized",
		Severity:    SeverityHigh,
		Check: func(ctx CheckContext) InvariantResult {
			if ctx.ForcePush {
				return InvariantResult{
					ID:       NoForcePush,
					Passed:   false,
					Severity: SeverityHigh,
					Message:  "Force push detected",
				}
			}
			return InvariantResult{
				ID:       NoForcePush,
				Passed:   true,
				Severity: SeverityHigh,
				Message:  "Normal push",
			}
		},
	}
}

// 6. No Skill Modification — block modifications to .claude/skills/.
func checkNoSkillModification() InvariantDef {
	return InvariantDef{
		ID:          NoSkillModification,
		Name:        "No Skill Modification",
		Description: "Agent skill files (.claude/skills/) must not be modified by governed actions",
		Severity:    SeverityHigh,
		Check: func(ctx CheckContext) InvariantResult {
			if skip := skipIfReadOnly(ctx); skip != nil {
				skip.ID = NoSkillModification
				skip.Severity = SeverityHigh
				return *skip
			}

			skillPatterns := []string{".claude/skills/", ".claude\\skills\\"}
			matchesSkillPath := func(path string) bool {
				for _, p := range skillPatterns {
					if strings.Contains(path, p) {
						return true
					}
				}
				return false
			}

			var violations []string

			target := ctx.Action.Target
			if target != "" && matchesSkillPath(target) {
				violations = append(violations, fmt.Sprintf("target: %s", target))
			}

			command := ctx.Action.Command
			if command != "" && matchesSkillPath(command) {
				violations = append(violations, "command references skills")
			}

			for _, f := range ctx.ModifiedFiles {
				if matchesSkillPath(f) {
					violations = append(violations, fmt.Sprintf("modified: %s", f))
				}
			}

			if len(violations) > 0 {
				return InvariantResult{
					ID:       NoSkillModification,
					Passed:   false,
					Severity: SeverityHigh,
					Message:  fmt.Sprintf("Skill modification detected (%s)", strings.Join(violations, "; ")),
				}
			}
			return InvariantResult{
				ID:       NoSkillModification,
				Passed:   true,
				Severity: SeverityHigh,
				Message:  "No skill files affected",
			}
		},
	}
}

// 7. No Scheduled Task Modification — block modifications to .claude/scheduled-tasks/.
func checkNoScheduledTaskModification() InvariantDef {
	return InvariantDef{
		ID:          NoScheduledTaskModification,
		Name:        "No Scheduled Task Modification",
		Description: "Agents must not modify scheduled task definitions (.claude/scheduled-tasks/) directly",
		Severity:    SeverityCritical,
		Check: func(ctx CheckContext) InvariantResult {
			if skip := skipIfReadOnly(ctx); skip != nil {
				skip.ID = NoScheduledTaskModification
				skip.Severity = SeverityCritical
				return *skip
			}

			scheduledPatterns := []string{".claude/scheduled-tasks/", ".claude\\scheduled-tasks\\"}
			matchesScheduledPath := func(path string) bool {
				for _, p := range scheduledPatterns {
					if strings.Contains(path, p) {
						return true
					}
				}
				return false
			}

			var violations []string

			target := ctx.Action.Target
			if target != "" && matchesScheduledPath(target) {
				violations = append(violations, fmt.Sprintf("target: %s", target))
			}

			command := ctx.Action.Command
			if command != "" && matchesScheduledPath(command) {
				violations = append(violations, "command references scheduled tasks")
			}

			for _, f := range ctx.ModifiedFiles {
				if matchesScheduledPath(f) {
					violations = append(violations, fmt.Sprintf("modified: %s", f))
				}
			}

			if len(violations) > 0 {
				return InvariantResult{
					ID:       NoScheduledTaskModification,
					Passed:   false,
					Severity: SeverityCritical,
					Message:  fmt.Sprintf("Scheduled task modification detected (%s)", strings.Join(violations, "; ")),
				}
			}
			return InvariantResult{
				ID:       NoScheduledTaskModification,
				Passed:   true,
				Severity: SeverityCritical,
				Message:  "No scheduled task files affected",
			}
		},
	}
}

// 8. No Credential File Creation — block creation of credential/secret files.
func checkNoCredentialFileCreation() InvariantDef {
	return InvariantDef{
		ID:          NoCredentialFileCreation,
		Name:        "No Credential File Creation",
		Description: "Agents must not create or overwrite well-known credential files",
		Severity:    SeverityCritical,
		Check: func(ctx CheckContext) InvariantResult {
			actionType := ctx.Action.Action
			writingActions := []string{"file.write", "file.move"}

			// Only applies to write/move actions
			if actionType != "" {
				isWrite := false
				for _, wa := range writingActions {
					if actionType == wa {
						isWrite = true
						break
					}
				}
				if !isWrite {
					return InvariantResult{
						ID:       NoCredentialFileCreation,
						Passed:   true,
						Severity: SeverityCritical,
						Message:  fmt.Sprintf("Action type %s is not a write operation", actionType),
					}
				}
			}

			target := ctx.Action.Target
			if target == "" {
				return InvariantResult{
					ID:       NoCredentialFileCreation,
					Passed:   true,
					Severity: SeverityCritical,
					Message:  "No target specified",
				}
			}

			if isCredentialPath(target) {
				return InvariantResult{
					ID:       NoCredentialFileCreation,
					Passed:   false,
					Severity: SeverityCritical,
					Message:  fmt.Sprintf("Credential file targeted: %s", target),
					Details: map[string]any{
						"target": target,
					},
				}
			}
			return InvariantResult{
				ID:       NoCredentialFileCreation,
				Passed:   true,
				Severity: SeverityCritical,
				Message:  "No credential files affected",
			}
		},
	}
}

// 9. No Package Script Injection — detect suspicious package.json script modifications.
func checkNoPackageScriptInjection() InvariantDef {
	return InvariantDef{
		ID:          NoPackageScriptInjection,
		Name:        "No Package Script Injection",
		Description: "Modifications to package.json scripts are flagged as potential supply chain attack vectors",
		Severity:    SeverityHigh,
		Check: func(ctx CheckContext) InvariantResult {
			actionType := ctx.Action.Action
			writingActions := []string{"file.write", "file.move"}

			// Only applies to write/move actions
			if actionType != "" {
				isWrite := false
				for _, wa := range writingActions {
					if actionType == wa {
						isWrite = true
						break
					}
				}
				if !isWrite {
					return InvariantResult{
						ID:       NoPackageScriptInjection,
						Passed:   true,
						Severity: SeverityHigh,
						Message:  fmt.Sprintf("Action type %s is not a write", actionType),
					}
				}
			}

			target := ctx.Action.Target
			isPackageJSON := target == "package.json" ||
				strings.HasSuffix(target, "/package.json") ||
				strings.HasSuffix(target, "\\package.json")

			if !isPackageJSON {
				return InvariantResult{
					ID:       NoPackageScriptInjection,
					Passed:   true,
					Severity: SeverityHigh,
					Message:  "Target is not package.json",
				}
			}

			diff := ctx.FileContentDiff
			if diff == "" {
				return InvariantResult{
					ID:       NoPackageScriptInjection,
					Passed:   true,
					Severity: SeverityHigh,
					Message:  "No content diff available for package.json write",
				}
			}

			// Check if the diff touches the "scripts" section
			scriptsPattern := regexp.MustCompile(`["']scripts["']\s*:`)
			if !scriptsPattern.MatchString(diff) {
				return InvariantResult{
					ID:       NoPackageScriptInjection,
					Passed:   true,
					Severity: SeverityHigh,
					Message:  "package.json modified without script changes",
				}
			}

			// Check for lifecycle script modifications
			var detected []string
			for _, script := range lifecycleScripts {
				keyPattern := regexp.MustCompile(fmt.Sprintf(`["']%s["']\s*:`, regexp.QuoteMeta(script)))
				if keyPattern.MatchString(diff) {
					detected = append(detected, script)
				}
			}

			if len(detected) > 0 {
				return InvariantResult{
					ID:       NoPackageScriptInjection,
					Passed:   false,
					Severity: SeverityHigh,
					Message:  fmt.Sprintf("Lifecycle script modification detected: %s", strings.Join(detected, ", ")),
				}
			}

			// Non-lifecycle script changes still flagged
			return InvariantResult{
				ID:       NoPackageScriptInjection,
				Passed:   false,
				Severity: SeverityHigh,
				Message:  "package.json scripts section modified",
			}
		},
	}
}

// 10. Lockfile Integrity — detect lockfile out of sync with manifest.
func checkLockfileIntegrity() InvariantDef {
	return InvariantDef{
		ID:          LockfileIntegrity,
		Name:        "Lockfile Integrity",
		Description: "Package lockfiles must stay in sync with manifests",
		Severity:    SeverityLow,
		Check: func(ctx CheckContext) InvariantResult {
			manifestChanged := false
			lockfileChanged := false

			for _, f := range ctx.ModifiedFiles {
				if f == "package.json" || strings.HasSuffix(f, "/package.json") {
					manifestChanged = true
				}
				if f == "package-lock.json" || f == "yarn.lock" || f == "pnpm-lock.yaml" ||
					strings.HasSuffix(f, "/package-lock.json") {
					lockfileChanged = true
				}
			}

			if !manifestChanged {
				return InvariantResult{
					ID:       LockfileIntegrity,
					Passed:   true,
					Severity: SeverityLow,
					Message:  "No manifest changes",
				}
			}

			if lockfileChanged {
				return InvariantResult{
					ID:       LockfileIntegrity,
					Passed:   true,
					Severity: SeverityLow,
					Message:  "Lockfile updated with manifest",
				}
			}
			return InvariantResult{
				ID:       LockfileIntegrity,
				Passed:   false,
				Severity: SeverityLow,
				Message:  "Manifest changed without lockfile update",
			}
		},
	}
}

// 11. Recursive Operation Guard — block deeply recursive or unbounded operations.
func checkRecursiveOperationGuard() InvariantDef {
	return InvariantDef{
		ID:          RecursiveOperationGuard,
		Name:        "Recursive Operation Guard",
		Description: "Flags recursive operations combined with destructive commands",
		Severity:    SeverityLow,
		Check: func(ctx CheckContext) InvariantResult {
			command := ctx.Action.Command
			if command == "" {
				return InvariantResult{
					ID:       RecursiveOperationGuard,
					Passed:   true,
					Severity: SeverityLow,
					Message:  "No command specified",
				}
			}

			actionType := ctx.Action.Action
			if actionType != "" && actionType != "shell.exec" {
				return InvariantResult{
					ID:       RecursiveOperationGuard,
					Passed:   true,
					Severity: SeverityLow,
					Message:  fmt.Sprintf("Action type %s is not a shell command", actionType),
				}
			}

			lower := strings.ToLower(command)
			var violations []string

			findRe := regexp.MustCompile(`\bfind\b`)

			// find with -delete
			if findRe.MatchString(lower) && regexp.MustCompile(`\s-delete\b`).MatchString(lower) {
				violations = append(violations, "find with -delete")
			}

			// find with -exec combined with destructive commands
			if findRe.MatchString(lower) && regexp.MustCompile(`\s-exec(?:dir)?\s`).MatchString(lower) {
				destructiveExecCmds := []string{"rm", "mv", "cp", "chmod", "chown", "shred"}
				for _, cmd := range destructiveExecCmds {
					re := regexp.MustCompile(fmt.Sprintf(`-exec(?:dir)?\s+(?:\S+/)?%s\b`, regexp.QuoteMeta(cmd)))
					if re.MatchString(lower) {
						violations = append(violations, fmt.Sprintf("find -exec %s", cmd))
					}
				}
			}

			// find -exec sh -c with destructive commands
			if findRe.MatchString(lower) {
				shcRe := regexp.MustCompile(`-exec(?:dir)?\s+(?:\S+/)?(?:sh|bash)\b(?:\s+\S+)*\s+-c\s+(.*)`)
				if shcMatch := shcRe.FindStringSubmatch(lower); len(shcMatch) > 1 {
					innerCmd := shcMatch[1]
					destructiveInShell := []string{"rm", "mv", "chmod", "chown", "shred"}
					for _, cmd := range destructiveInShell {
						re := regexp.MustCompile(fmt.Sprintf(`\b%s\b`, regexp.QuoteMeta(cmd)))
						if re.MatchString(innerCmd) {
							violations = append(violations, fmt.Sprintf("find -exec sh -c (%s)", cmd))
						}
					}
				}
			}

			// xargs with destructive commands
			if regexp.MustCompile(`\bxargs\b`).MatchString(lower) {
				destructiveXargsCmds := []string{"rm", "mv", "cp", "chmod", "chown", "shred"}
				for _, cmd := range destructiveXargsCmds {
					re := regexp.MustCompile(fmt.Sprintf(`xargs\s+(?:\S+\s+)*(?:\S+/)?%s\b`, regexp.QuoteMeta(cmd)))
					if re.MatchString(lower) {
						violations = append(violations, fmt.Sprintf("xargs %s", cmd))
					}
				}
			}

			// Recursive chmod/chown
			if regexp.MustCompile(`\b(?:chmod|chown)\b`).MatchString(lower) &&
				regexp.MustCompile(`\s(?:-R\b|-r\b|--recursive\b)`).MatchString(lower) {
				match := regexp.MustCompile(`\b(chmod|chown)\b`).FindString(lower)
				if match != "" {
					violations = append(violations, fmt.Sprintf("recursive %s", match))
				}
			}

			if len(violations) > 0 {
				return InvariantResult{
					ID:       RecursiveOperationGuard,
					Passed:   false,
					Severity: SeverityLow,
					Message:  fmt.Sprintf("Recursive destructive operation detected: %s", strings.Join(violations, ", ")),
				}
			}
			return InvariantResult{
				ID:       RecursiveOperationGuard,
				Passed:   true,
				Severity: SeverityLow,
				Message:  "No recursive destructive operations detected",
			}
		},
	}
}

// 12. Large File Write — block writes of very large files.
func checkLargeFileWrite() InvariantDef {
	return InvariantDef{
		ID:          LargeFileWrite,
		Name:        "Large File Write Limit",
		Description: "Single file writes must not exceed a size threshold",
		Severity:    SeverityMedium,
		Check: func(ctx CheckContext) InvariantResult {
			actionType := ctx.Action.Action

			// Only applies to file.write actions
			if actionType != "" && actionType != "file.write" {
				return InvariantResult{
					ID:       LargeFileWrite,
					Passed:   true,
					Severity: SeverityMedium,
					Message:  fmt.Sprintf("Action type %s is not file.write", actionType),
				}
			}

			if ctx.WriteSizeBytes == nil {
				return InvariantResult{
					ID:       LargeFileWrite,
					Passed:   true,
					Severity: SeverityMedium,
					Message:  "No write size specified",
				}
			}

			limit := ctx.WriteSizeBytesLimit
			if limit == 0 {
				limit = 102400 // 100KB default
			}

			size := *ctx.WriteSizeBytes
			if size > limit {
				return InvariantResult{
					ID:       LargeFileWrite,
					Passed:   false,
					Severity: SeverityMedium,
					Message:  fmt.Sprintf("Write size: %d bytes (limit: %d bytes)", size, limit),
					Details: map[string]any{
						"writeSizeBytes": size,
						"limit":          limit,
					},
				}
			}
			return InvariantResult{
				ID:       LargeFileWrite,
				Passed:   true,
				Severity: SeverityMedium,
				Message:  fmt.Sprintf("Write size at most %d bytes", limit),
			}
		},
	}
}

// 13. No CI/CD Config Modification — flag CI/CD config changes.
func checkNoCICDConfigModification() InvariantDef {
	return InvariantDef{
		ID:          NoCICDConfigModification,
		Name:        "No CI/CD Config Modification",
		Description: "CI/CD pipeline configurations must not be modified by governed actions",
		Severity:    SeverityCritical,
		Check: func(ctx CheckContext) InvariantResult {
			if skip := skipIfReadOnly(ctx); skip != nil {
				skip.ID = NoCICDConfigModification
				skip.Severity = SeverityCritical
				return *skip
			}

			matchesCicdPath := func(s string) bool {
				normalized := strings.ReplaceAll(s, "\\", "/")
				for _, p := range cicdDirPatterns {
					if strings.Contains(s, p) {
						return true
					}
				}
				for _, p := range cicdFilePatterns {
					if strings.Contains(normalized, p) {
						return true
					}
				}
				return false
			}

			var violations []string

			target := ctx.Action.Target
			if target != "" && matchesCicdPath(target) {
				violations = append(violations, fmt.Sprintf("target: %s", target))
			}

			command := ctx.Action.Command
			if command != "" && matchesCicdPath(command) {
				violations = append(violations, "command references CI/CD config")
			}

			for _, f := range ctx.ModifiedFiles {
				if matchesCicdPath(f) {
					violations = append(violations, fmt.Sprintf("modified: %s", f))
				}
			}

			if len(violations) > 0 {
				return InvariantResult{
					ID:       NoCICDConfigModification,
					Passed:   false,
					Severity: SeverityCritical,
					Message:  fmt.Sprintf("CI/CD config modification detected (%s)", strings.Join(violations, "; ")),
				}
			}
			return InvariantResult{
				ID:       NoCICDConfigModification,
				Passed:   true,
				Severity: SeverityCritical,
				Message:  "No CI/CD config files affected",
			}
		},
	}
}

// 14. No Permission Escalation — detect sudo/chmod/chown escalation.
func checkNoPermissionEscalation() InvariantDef {
	return InvariantDef{
		ID:          NoPermissionEscalation,
		Name:        "No Permission Escalation",
		Description: "Agents must not escalate filesystem permissions",
		Severity:    SeverityHigh,
		Check: func(ctx CheckContext) InvariantResult {
			command := ctx.Action.Command
			target := ctx.Action.Target
			var violations []string

			if command != "" {
				lowerCmd := strings.ToLower(command)

				// Detect chmod to world-writable or broad permissions
				if regexp.MustCompile(`\bchmod\b`).MatchString(lowerCmd) {
					// Octal modes
					octalRe := regexp.MustCompile(`\bchmod\s+(?:-[a-zA-Z]+\s+)*([0-7]{3,4})\b`)
					if octalMatch := octalRe.FindStringSubmatch(command); len(octalMatch) > 1 {
						mode := octalMatch[1]
						othersDigit := int(mode[len(mode)-1] - '0')
						if (othersDigit & 2) != 0 {
							violations = append(violations, fmt.Sprintf("world-writable chmod: %s", mode))
						}

						// Setuid/setgid via octal
						if len(mode) == 4 {
							specialBits := int(mode[0] - '0')
							if (specialBits & 6) != 0 {
								violations = append(violations, fmt.Sprintf("setuid/setgid octal chmod: %s", mode))
							}
						}
					}

					// Symbolic modes: o+w, a+w, +w
					symbolicRe := regexp.MustCompile(`\bchmod\s+(?:-[a-zA-Z]+\s+)*(?:o\+[rwxXst]*w|a\+[rwxXst]*w|\+[rwxXst]*w|o=[rwxXst]*w[rwxXst]*|a=[rwxXst]*w[rwxXst]*)\b`)
					if symbolicRe.MatchString(command) {
						violations = append(violations, "world-writable symbolic chmod")
					}

					// Setuid/setgid via symbolic
					suidRe := regexp.MustCompile(`\bchmod\s+(?:-[a-zA-Z]+\s+)*(?:[ug]\+[rwxXt]*s|[ug]=[rwxXst]*s[rwxXst]*|\+[rwxXt]*s)\b`)
					if suidRe.MatchString(command) {
						violations = append(violations, "setuid/setgid chmod")
					}
				}

				// Detect chown/chgrp
				if regexp.MustCompile(`\bchown\b`).MatchString(lowerCmd) {
					violations = append(violations, "ownership change via chown")
				}
				if regexp.MustCompile(`\bchgrp\b`).MatchString(lowerCmd) {
					violations = append(violations, "group change via chgrp")
				}
			}

			// Detect writes to sudoers files
			if target != "" {
				normalized := strings.ToLower(strings.ReplaceAll(target, "\\", "/"))
				if strings.HasSuffix(normalized, "/sudoers") ||
					strings.Contains(normalized, "/sudoers.d/") ||
					strings.Contains(normalized, "/etc/sudoers") {
					violations = append(violations, fmt.Sprintf("sudoers file targeted: %s", target))
				}
			}

			if len(violations) > 0 {
				return InvariantResult{
					ID:       NoPermissionEscalation,
					Passed:   false,
					Severity: SeverityHigh,
					Message:  fmt.Sprintf("Permission escalation detected (%s)", strings.Join(violations, "; ")),
				}
			}
			return InvariantResult{
				ID:       NoPermissionEscalation,
				Passed:   true,
				Severity: SeverityHigh,
				Message:  "No permission escalation detected",
			}
		},
	}
}

// 15. No Governance Self-Modification — block modification of governance files.
func checkNoGovernanceSelfModification() InvariantDef {
	return InvariantDef{
		ID:          NoGovernanceSelfMod,
		Name:        "No Governance Self-Modification",
		Description: "Agents must not modify governance configuration",
		Severity:    SeverityCritical,
		Check: func(ctx CheckContext) InvariantResult {
			if skip := skipIfReadOnly(ctx); skip != nil {
				skip.ID = NoGovernanceSelfMod
				skip.Severity = SeverityCritical
				return *skip
			}

			matchesGovernancePath := func(path string) bool {
				lower := strings.ToLower(path)
				for _, p := range governanceDirPatterns {
					if strings.Contains(lower, strings.ToLower(p)) {
						return true
					}
				}
				base := strings.ToLower(filepath.Base(path))
				for _, f := range governanceFileBasenames {
					if base == f {
						return true
					}
				}
				return false
			}

			var violations []string

			target := ctx.Action.Target
			if target != "" && matchesGovernancePath(target) {
				violations = append(violations, fmt.Sprintf("target: %s", target))
			}

			command := ctx.Action.Command
			if command != "" {
				if matchesGovernancePath(command) {
					violations = append(violations, "command references governance paths")
				} else {
					lowerCmd := strings.ToLower(command)
					for _, f := range governanceFileBasenames {
						if strings.Contains(lowerCmd, f) {
							violations = append(violations, "command references governance paths")
							break
						}
					}
				}
			}

			for _, f := range ctx.ModifiedFiles {
				if matchesGovernancePath(f) {
					violations = append(violations, fmt.Sprintf("modified: %s", f))
				}
			}

			if len(violations) > 0 {
				return InvariantResult{
					ID:       NoGovernanceSelfMod,
					Passed:   false,
					Severity: SeverityCritical,
					Message:  fmt.Sprintf("Governance self-modification detected (%s)", strings.Join(violations, "; ")),
				}
			}
			return InvariantResult{
				ID:       NoGovernanceSelfMod,
				Passed:   true,
				Severity: SeverityCritical,
				Message:  "No governance files affected",
			}
		},
	}
}

// 16. No Container Config Modification — flag Docker/k8s config changes.
func checkNoContainerConfigModification() InvariantDef {
	return InvariantDef{
		ID:          NoContainerConfigMod,
		Name:        "No Container Config Modification",
		Description: "Container configuration files must not be modified without authorization",
		Severity:    SeverityMedium,
		Check: func(ctx CheckContext) InvariantResult {
			actionType := ctx.Action.Action
			writingActions := []string{"file.write", "file.move"}

			// Only applies to write/move actions
			if actionType != "" {
				isWrite := false
				for _, wa := range writingActions {
					if actionType == wa {
						isWrite = true
						break
					}
				}
				if !isWrite {
					return InvariantResult{
						ID:       NoContainerConfigMod,
						Passed:   true,
						Severity: SeverityMedium,
						Message:  fmt.Sprintf("Action type %s is not a write operation", actionType),
					}
				}
			}

			target := ctx.Action.Target
			if target != "" && isContainerConfigPath(target) {
				return InvariantResult{
					ID:       NoContainerConfigMod,
					Passed:   false,
					Severity: SeverityMedium,
					Message:  fmt.Sprintf("Container config file targeted: %s", target),
				}
			}

			for _, f := range ctx.ModifiedFiles {
				if isContainerConfigPath(f) {
					return InvariantResult{
						ID:       NoContainerConfigMod,
						Passed:   false,
						Severity: SeverityMedium,
						Message:  fmt.Sprintf("Container config file modified: %s", f),
					}
				}
			}

			return InvariantResult{
				ID:       NoContainerConfigMod,
				Passed:   true,
				Severity: SeverityMedium,
				Message:  "No container config files affected",
			}
		},
	}
}

// 17. No Environment Variable Modification — flag .env file and shell profile modifications.
func checkNoEnvVarModification() InvariantDef {
	return InvariantDef{
		ID:          NoEnvVarModification,
		Name:        "No Environment Variable Modification",
		Description: "Detects attempts to modify environment variables or shell profile files",
		Severity:    SeverityMedium,
		Check: func(ctx CheckContext) InvariantResult {
			var violations []string
			actionType := ctx.Action.Action

			// Shell command detection
			command := ctx.Action.Command
			if command != "" && (actionType == "" || actionType == "shell.exec") {
				// Detect export of sensitive env vars
				exportRe := regexp.MustCompile(`(?i)\bexport\s+([A-Za-z_][A-Za-z0-9_]*)=`)
				for _, match := range exportRe.FindAllStringSubmatch(command, -1) {
					varName := strings.ToLower(match[1])
					for _, p := range sensitiveEnvVarPatterns {
						if strings.Contains(varName, p) {
							violations = append(violations, fmt.Sprintf("sensitive export: %s", match[1]))
							break
						}
					}
				}

				// Detect setenv (csh/tcsh style)
				setenvRe := regexp.MustCompile(`(?i)\bsetenv\s+([A-Za-z_][A-Za-z0-9_]*)\s`)
				for _, match := range setenvRe.FindAllStringSubmatch(command, -1) {
					varName := strings.ToLower(match[1])
					for _, p := range sensitiveEnvVarPatterns {
						if strings.Contains(varName, p) {
							violations = append(violations, fmt.Sprintf("sensitive setenv: %s", match[1]))
							break
						}
					}
				}
			}

			// File write detection (shell profile files)
			target := ctx.Action.Target
			writingActions := []string{"file.write", "file.move"}
			if target != "" && (actionType == "" || containsStr(writingActions, actionType)) {
				if isShellProfilePath(target) {
					violations = append(violations, fmt.Sprintf("shell profile write: %s", target))
				}
			}

			// Check modifiedFiles for bulk operations
			for _, f := range ctx.ModifiedFiles {
				if isShellProfilePath(f) {
					msg := fmt.Sprintf("shell profile modified: %s", f)
					if !containsStr(violations, msg) {
						violations = append(violations, msg)
					}
				}
			}

			if len(violations) > 0 {
				return InvariantResult{
					ID:       NoEnvVarModification,
					Passed:   false,
					Severity: SeverityMedium,
					Message:  fmt.Sprintf("Environment variable modification detected (%s)", strings.Join(violations, "; ")),
				}
			}
			return InvariantResult{
				ID:       NoEnvVarModification,
				Passed:   true,
				Severity: SeverityMedium,
				Message:  "No environment variable modifications detected",
			}
		},
	}
}

// 18. No Network Egress — flag outbound network requests.
func checkNoNetworkEgress() InvariantDef {
	return InvariantDef{
		ID:          NoNetworkEgress,
		Name:        "No Network Egress",
		Description: "Denies HTTP requests to non-allowlisted domains",
		Severity:    SeverityHigh,
		Check: func(ctx CheckContext) InvariantResult {
			actionType := ctx.Action.Action
			command := ctx.Action.Command

			isHTTPAction := actionType == "http.request"
			isNetworkShell := (actionType == "" || actionType == "shell.exec") && isNetworkCommand(command)
			explicitFlag := ctx.IsNetworkRequest

			if !isHTTPAction && !isNetworkShell && !explicitFlag {
				return InvariantResult{
					ID:       NoNetworkEgress,
					Passed:   true,
					Severity: SeverityHigh,
					Message:  "Not a network request",
				}
			}

			// If no allowlist configured, fail-open (opt-in governance)
			if ctx.NetworkEgressAllowlist == nil {
				return InvariantResult{
					ID:       NoNetworkEgress,
					Passed:   true,
					Severity: SeverityHigh,
					Message:  "Network egress allowlist not configured (fail-open)",
				}
			}

			// Extract domain
			domain := ctx.RequestDomain
			if domain == "" && ctx.RequestURL != "" {
				domain = extractDomainFromURL(ctx.RequestURL)
			}
			if domain == "" && isNetworkShell {
				if url := extractURLFromCommand(command); url != "" {
					domain = extractDomainFromURL(url)
				}
			}
			if domain == "" && isHTTPAction && ctx.Action.Target != "" {
				domain = extractDomainFromURL(ctx.Action.Target)
			}

			if domain == "" {
				return InvariantResult{
					ID:       NoNetworkEgress,
					Passed:   false,
					Severity: SeverityHigh,
					Message:  "Network request detected but domain could not be determined",
				}
			}

			// Empty allowlist = deny all
			allowlist := ctx.NetworkEgressAllowlist
			if len(allowlist) == 0 {
				return InvariantResult{
					ID:       NoNetworkEgress,
					Passed:   false,
					Severity: SeverityHigh,
					Message:  fmt.Sprintf("Network egress to %s denied (no domains allowlisted)", domain),
				}
			}

			// Check domain against allowlist
			lowerDomain := strings.ToLower(domain)
			allowed := false
			for _, entry := range allowlist {
				lowerEntry := strings.ToLower(entry)
				if lowerDomain == lowerEntry || strings.HasSuffix(lowerDomain, "."+lowerEntry) {
					allowed = true
					break
				}
			}

			if allowed {
				return InvariantResult{
					ID:       NoNetworkEgress,
					Passed:   true,
					Severity: SeverityHigh,
					Message:  fmt.Sprintf("Network egress to %s allowed (matches allowlist)", domain),
				}
			}
			return InvariantResult{
				ID:       NoNetworkEgress,
				Passed:   false,
				Severity: SeverityHigh,
				Message:  fmt.Sprintf("Network egress to %s denied (not in allowlist: %s)", domain, strings.Join(allowlist, ", ")),
			}
		},
	}
}

// 19. No Destructive Migration — flag destructive database migrations.
func checkNoDestructiveMigration() InvariantDef {
	return InvariantDef{
		ID:          NoDestructiveMigration,
		Name:        "No Destructive Migration",
		Description: "Flags destructive DDL in migration files",
		Severity:    SeverityMedium,
		Check: func(ctx CheckContext) InvariantResult {
			actionType := ctx.Action.Action

			// Only applies to file.write actions
			if actionType != "" && actionType != "file.write" {
				return InvariantResult{
					ID:       NoDestructiveMigration,
					Passed:   true,
					Severity: SeverityMedium,
					Message:  fmt.Sprintf("Action type %s is not file.write", actionType),
				}
			}

			target := ctx.Action.Target
			if target == "" {
				return InvariantResult{
					ID:       NoDestructiveMigration,
					Passed:   true,
					Severity: SeverityMedium,
					Message:  "No target specified",
				}
			}

			// Check if target is in a migration directory
			normalizedTarget := strings.ToLower(strings.ReplaceAll(target, "\\", "/"))
			isMigration := false
			for _, p := range migrationDirPatterns {
				if strings.Contains(normalizedTarget, p) {
					isMigration = true
					break
				}
			}

			if !isMigration {
				return InvariantResult{
					ID:       NoDestructiveMigration,
					Passed:   true,
					Severity: SeverityMedium,
					Message:  "Target is not in a migration directory",
				}
			}

			content := ctx.FileContentDiff
			if content == "" {
				return InvariantResult{
					ID:       NoDestructiveMigration,
					Passed:   true,
					Severity: SeverityMedium,
					Message:  "No file content available for migration file",
				}
			}

			var violations []string
			for _, entry := range destructiveDDLPatterns {
				if entry.pattern.MatchString(content) {
					violations = append(violations, entry.label)
				}
			}

			if len(violations) > 0 {
				return InvariantResult{
					ID:       NoDestructiveMigration,
					Passed:   false,
					Severity: SeverityMedium,
					Message:  fmt.Sprintf("Destructive DDL detected: %s", strings.Join(violations, ", ")),
				}
			}
			return InvariantResult{
				ID:       NoDestructiveMigration,
				Passed:   true,
				Severity: SeverityMedium,
				Message:  "Migration file contains no destructive DDL",
			}
		},
	}
}

// 20. Transitive Effect Analysis — flag actions with cascading side effects.
func checkTransitiveEffectAnalysis() InvariantDef {
	return InvariantDef{
		ID:          TransitiveEffectAnalysis,
		Name:        "Transitive Effect Analysis",
		Description: "Detects when written file content would produce effects denied if executed directly",
		Severity:    SeverityHigh,
		Check: func(ctx CheckContext) InvariantResult {
			actionType := ctx.Action.Action

			// Only applies to file.write actions
			if actionType != "" && actionType != "file.write" {
				return InvariantResult{
					ID:       TransitiveEffectAnalysis,
					Passed:   true,
					Severity: SeverityHigh,
					Message:  fmt.Sprintf("Action type %s is not file.write", actionType),
				}
			}

			content := ctx.FileContentDiff
			if content == "" {
				return InvariantResult{
					ID:       TransitiveEffectAnalysis,
					Passed:   true,
					Severity: SeverityHigh,
					Message:  "No file content available",
				}
			}

			target := ctx.Action.Target
			var violations []string

			// Script content analysis
			scriptFile := isScriptFilePath(target) || hasShebang(content)
			if scriptFile {
				for _, entry := range transitiveScriptPatterns {
					if entry.pattern.MatchString(content) {
						violations = append(violations, entry.label)
					}
				}
			}

			// Config lifecycle hook analysis
			configFile := isLifecycleConfigPath(target)
			if configFile {
				base := strings.ToLower(filepath.Base(target))
				lowerTarget := strings.ToLower(target)

				// package.json lifecycle scripts with dangerous commands
				if base == "package.json" {
					for _, script := range lifecycleScripts {
						scriptRe := regexp.MustCompile(fmt.Sprintf(`["']%s["']\s*:\s*["']([^"']+)["']`, regexp.QuoteMeta(script)))
						if match := scriptRe.FindStringSubmatch(content); len(match) > 1 {
							cmd := match[1]
							if regexp.MustCompile(`\bcurl\b|\bwget\b|\bnc\b|\brm\s+-rf\b`).MatchString(cmd) {
								violations = append(violations, fmt.Sprintf("dangerous lifecycle hook: %s (%s)", script, cmd))
							}
						}
					}
				}

				// Makefile with dangerous targets
				if base == "makefile" || strings.HasSuffix(lowerTarget, ".mk") {
					if regexp.MustCompile(`\bcurl\b`).MatchString(content) ||
						regexp.MustCompile(`\bwget\b`).MatchString(content) {
						violations = append(violations, "Makefile with network commands")
					}
					if regexp.MustCompile(`\brm\s+-rf\s+/`).MatchString(content) {
						violations = append(violations, "Makefile with destructive root deletion")
					}
				}
			}

			if len(violations) > 0 {
				return InvariantResult{
					ID:       TransitiveEffectAnalysis,
					Passed:   false,
					Severity: SeverityHigh,
					Message:  fmt.Sprintf("Transitive policy violations detected: %s", strings.Join(violations, "; ")),
				}
			}
			return InvariantResult{
				ID:       TransitiveEffectAnalysis,
				Passed:   true,
				Severity: SeverityHigh,
				Message:  "No transitive effects detected",
			}
		},
	}
}

// 21. No IDE Socket Access — block IDE socket file access.
func checkNoIDESocketAccess() InvariantDef {
	return InvariantDef{
		ID:          NoIDESocketAccess,
		Name:        "No IDE Socket Access",
		Description: "Blocks agent access to IDE IPC sockets (VS Code, JetBrains, Cursor)",
		Severity:    SeverityHigh,
		Check: func(ctx CheckContext) InvariantResult {
			target := strings.ToLower(ctx.Action.Target)
			command := strings.ToLower(ctx.Action.Command)

			textToCheck := target
			if textToCheck == "" {
				textToCheck = command
			}
			if textToCheck == "" {
				return InvariantResult{
					ID:       NoIDESocketAccess,
					Passed:   true,
					Severity: SeverityHigh,
					Message:  "No target or command to check",
				}
			}

			for _, pattern := range ideSocketPathPatterns {
				if strings.Contains(textToCheck, pattern) {
					ide := identifyIDE(pattern)
					source := "target"
					if target == "" {
						source = "command"
					}
					return InvariantResult{
						ID:       NoIDESocketAccess,
						Passed:   false,
						Severity: SeverityHigh,
						Message:  fmt.Sprintf("IDE socket access detected: pattern %q matched in %s (IDE: %s)", pattern, source, ide),
					}
				}
			}

			return InvariantResult{
				ID:       NoIDESocketAccess,
				Passed:   true,
				Severity: SeverityHigh,
				Message:  "No IDE socket access detected",
			}
		},
	}
}

// 22. Commit Scope Guard — flag commits touching files not modified in this session.
func checkCommitScopeGuard() InvariantDef {
	return InvariantDef{
		ID:          CommitScopeGuard,
		Name:        "Commit Scope Guard",
		Description: "All files in a git commit must have been written or modified by the current session",
		Severity:    SeverityHigh,
		Check: func(ctx CheckContext) InvariantResult {
			// Only applies to git.commit actions
			if ctx.Action.Action != "git.commit" {
				return InvariantResult{
					ID:       CommitScopeGuard,
					Passed:   true,
					Severity: SeverityHigh,
					Message:  "Not a git.commit action — skipped",
				}
			}

			// Fail-open: no staged file data
			if len(ctx.StagedFiles) == 0 {
				return InvariantResult{
					ID:       CommitScopeGuard,
					Passed:   true,
					Severity: SeverityHigh,
					Message:  "No staged files detected",
				}
			}

			// No session write log — cannot verify
			if len(ctx.SessionWrittenFiles) == 0 {
				return InvariantResult{
					ID:       CommitScopeGuard,
					Passed:   false,
					Severity: SeverityHigh,
					Message:  fmt.Sprintf("%d staged file(s) but no session write log — cannot verify commit scope", len(ctx.StagedFiles)),
				}
			}

			writtenSet := make(map[string]bool, len(ctx.SessionWrittenFiles))
			for _, f := range ctx.SessionWrittenFiles {
				writtenSet[f] = true
			}

			var unexpected []string
			for _, f := range ctx.StagedFiles {
				if !writtenSet[f] {
					unexpected = append(unexpected, f)
				}
			}

			if len(unexpected) > 0 {
				listed := unexpected
				suffix := ""
				if len(listed) > 5 {
					listed = listed[:5]
					suffix = fmt.Sprintf(" (+%d more)", len(unexpected)-5)
				}
				return InvariantResult{
					ID:       CommitScopeGuard,
					Passed:   false,
					Severity: SeverityHigh,
					Message:  fmt.Sprintf("%d unexpected staged file(s) not modified in this session: %s%s", len(unexpected), strings.Join(listed, ", "), suffix),
				}
			}

			return InvariantResult{
				ID:       CommitScopeGuard,
				Passed:   true,
				Severity: SeverityHigh,
				Message:  fmt.Sprintf("All %d staged file(s) match session write log", len(ctx.StagedFiles)),
			}
		},
	}
}

// containsStr returns true if slice contains the given string.
func containsStr(slice []string, s string) bool {
	for _, v := range slice {
		if v == s {
			return true
		}
	}
	return false
}
