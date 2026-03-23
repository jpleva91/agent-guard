package com.agentguard.jetbrains.models

/**
 * Aggregated summary of a governance run (session).
 * Built by scanning all events in a session's JSONL file.
 */
data class RunSummary(
    val runId: String,
    val sessionFile: String,
    val status: RunStatus,
    val startTime: String? = null,
    val endTime: String? = null,
    val actionsRequested: Int = 0,
    val actionsAllowed: Int = 0,
    val actionsDenied: Int = 0,
    val invariantViolations: Int = 0,
    val totalEvents: Int = 0,
    val maxEscalationLevel: Int = 0,
) {
    val escalationLabel: String
        get() = GovernanceEvent.ESCALATION_LABELS[maxEscalationLevel] ?: "NORMAL"

    val hasDenials: Boolean
        get() = actionsDenied > 0 || invariantViolations > 0
}

enum class RunStatus(val label: String) {
    ACTIVE("active"),
    COMPLETED("completed"),
}
