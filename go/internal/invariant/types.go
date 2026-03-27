// Package invariant provides the invariant checking system for the AgentGuard kernel.
// Invariants are system-level safety constraints that are evaluated on every action,
// independent of policy rules. They enforce hard boundaries that agents must not cross.
package invariant

import (
	"github.com/AgentGuardHQ/agentguard/go/internal/action"
)

// InvariantID uniquely identifies a built-in invariant.
type InvariantID string

// Built-in invariant IDs.
const (
	SecretExposure              InvariantID = "no-secret-exposure"
	ProtectedBranch             InvariantID = "protected-branch"
	BlastRadiusLimit            InvariantID = "blast-radius-limit"
	TestBeforePush              InvariantID = "test-before-push"
	NoForcePush                 InvariantID = "no-force-push"
	NoSkillModification         InvariantID = "no-skill-modification"
	NoScheduledTaskModification InvariantID = "no-scheduled-task-modification"
	NoCredentialFileCreation    InvariantID = "no-credential-file-creation"
	NoPackageScriptInjection    InvariantID = "no-package-script-injection"
	LockfileIntegrity           InvariantID = "lockfile-integrity"
	RecursiveOperationGuard     InvariantID = "recursive-operation-guard"
	LargeFileWrite              InvariantID = "large-file-write"
	NoCICDConfigModification    InvariantID = "no-cicd-config-modification"
	NoPermissionEscalation      InvariantID = "no-permission-escalation"
	NoGovernanceSelfMod         InvariantID = "no-governance-self-modification"
	NoContainerConfigMod        InvariantID = "no-container-config-modification"
	NoEnvVarModification        InvariantID = "no-env-var-modification"
	NoNetworkEgress             InvariantID = "no-network-egress"
	NoDestructiveMigration      InvariantID = "no-destructive-migration"
	TransitiveEffectAnalysis    InvariantID = "transitive-effect-analysis"
	NoIDESocketAccess           InvariantID = "no-ide-socket-access"
	CommitScopeGuard            InvariantID = "commit-scope-guard"
)

// Severity indicates the criticality of an invariant violation.
type Severity string

const (
	SeverityCritical Severity = "CRITICAL"
	SeverityHigh     Severity = "HIGH"
	SeverityMedium   Severity = "MEDIUM"
	SeverityLow      Severity = "LOW"
)

// SeverityFromInt converts a numeric severity (1-5) to a Severity level.
func SeverityFromInt(n int) Severity {
	switch {
	case n >= 5:
		return SeverityCritical
	case n >= 4:
		return SeverityHigh
	case n >= 3:
		return SeverityMedium
	default:
		return SeverityLow
	}
}

// InvariantResult is the outcome of evaluating a single invariant.
type InvariantResult struct {
	ID       InvariantID    `json:"id"`
	Passed   bool           `json:"passed"`
	Severity Severity       `json:"severity"`
	Message  string         `json:"message"`
	Details  map[string]any `json:"details,omitempty"`
}

// CheckContext carries all the information needed to evaluate invariants
// against a proposed action.
type CheckContext struct {
	// Action is the normalized action context from the kernel pipeline.
	Action action.ActionContext

	// WorkingDir is the current working directory of the agent.
	WorkingDir string

	// GitBranch is the current git branch (may differ from Action.Branch for push targets).
	GitBranch string

	// SessionEscalation is the current escalation level (NORMAL, ELEVATED, HIGH, LOCKDOWN).
	SessionEscalation string

	// ModifiedFiles is the list of files being modified by this action.
	ModifiedFiles []string

	// ProtectedBranches is the list of branches that require special protection.
	// Defaults to ["main", "master"] if empty.
	ProtectedBranches []string

	// BlastRadiusLimit is the maximum number of files a single action may affect.
	// Defaults to 20 if zero.
	BlastRadiusLimit int

	// TestsPass indicates whether tests have passed in this session.
	// nil means unknown/not verified.
	TestsPass *bool

	// ForcePush indicates whether the action is a force push.
	ForcePush bool

	// DirectPush indicates whether the action is a direct push (not via PR).
	DirectPush bool

	// IsPush indicates whether the action is any kind of git push.
	IsPush bool

	// WriteSizeBytes is the byte size of content being written (for file.write).
	WriteSizeBytes *int

	// WriteSizeBytesLimit is the maximum allowed write size. Defaults to 102400 (100KB).
	WriteSizeBytesLimit int

	// FileContentDiff is the content diff or new content for content-aware invariants.
	FileContentDiff string

	// IsNetworkRequest indicates whether the action is a network request.
	IsNetworkRequest bool

	// RequestURL is the full URL of a network request.
	RequestURL string

	// RequestDomain is the extracted domain of a network request.
	RequestDomain string

	// NetworkEgressAllowlist is the list of allowed domains for network egress.
	// nil means not configured (fail-open). Empty slice means deny all.
	NetworkEgressAllowlist []string

	// StagedFiles is the list of files staged for a git commit.
	StagedFiles []string

	// SessionWrittenFiles is the list of files written/modified in this session.
	SessionWrittenFiles []string
}

// InvariantDef is a registered invariant definition: an ID, metadata, and check function.
type InvariantDef struct {
	ID          InvariantID
	Name        string
	Description string
	Severity    Severity
	Check       func(ctx CheckContext) InvariantResult
}
