// Package invariant provides the invariant checking system for the AgentGuard kernel.
//
// Invariants are system-level safety constraints evaluated on every action,
// independent of policy rules. They enforce hard boundaries that agents must
// not cross — secret exposure, force pushes, credential file creation, etc.
//
// # Usage
//
//	checker := invariant.NewChecker(nil) // all 22 invariants enabled
//	failures := checker.Check(ctx)
//	if len(failures) > 0 {
//	    // action violates one or more invariants
//	}
//
// To disable specific invariants:
//
//	checker := invariant.NewChecker([]invariant.InvariantID{
//	    invariant.LargeFileWrite,
//	    invariant.LockfileIntegrity,
//	})
//
// # Built-in Invariants
//
// The package provides 22 built-in invariant definitions covering:
//   - Secret exposure and credential file protection
//   - Protected branch safety and force push prevention
//   - Blast radius limits and large file write guards
//   - CI/CD config, governance, and container config modification detection
//   - Permission escalation and environment variable modification detection
//   - Network egress governance
//   - Destructive migration and transitive effect analysis
//   - IDE socket access blocking
//   - Commit scope verification
package invariant
