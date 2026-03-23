package com.agentguard.jetbrains.models

/**
 * A single governance event parsed from JSONL event files.
 * Mirrors the canonical event schema in packages/events/src/schema.ts.
 */
data class GovernanceEvent(
    val id: String,
    val kind: String,
    val timestamp: String,
    val fingerprint: String = "",
    val metadata: Map<String, Any?> = emptyMap(),
) {
    val actionType: String?
        get() = metadata["actionType"] as? String
            ?: metadata["action"] as? String

    val target: String?
        get() = metadata["target"] as? String

    val reason: String?
        get() = metadata["reason"] as? String
            ?: metadata["rule"] as? String

    val escalationLevel: Int?
        get() = (metadata["escalationLevel"] as? Number)?.toInt()
            ?: (metadata["level"] as? Number)?.toInt()

    val invariantId: String?
        get() = metadata["invariantId"] as? String
            ?: metadata["invariant"] as? String

    val detail: String?
        get() = metadata["detail"] as? String
            ?: metadata["message"] as? String

    val score: Number?
        get() = metadata["score"] as? Number
            ?: metadata["blastRadius"] as? Number

    val threshold: Number?
        get() = metadata["threshold"] as? Number

    @Suppress("UNCHECKED_CAST")
    val files: List<String>
        get() = (metadata["files"] as? List<*>)?.filterIsInstance<String>() ?: emptyList()

    val filePath: String?
        get() = metadata["file"] as? String
            ?: metadata["filePath"] as? String
            ?: metadata["path"] as? String

    val line: Int?
        get() = (metadata["line"] as? Number)?.toInt()

    companion object {
        val NOTIFICATION_KINDS = setOf(
            "PolicyDenied",
            "InvariantViolation",
            "BlastRadiusExceeded",
            "ActionEscalated",
        )

        val ACTIONABLE_KINDS = setOf(
            "ActionAllowed",
            "ActionDenied",
            "ActionEscalated",
            "PolicyDenied",
            "InvariantViolation",
            "BlastRadiusExceeded",
        )

        val ESCALATION_LABELS = mapOf(
            0 to "NORMAL",
            1 to "ELEVATED",
            2 to "HIGH",
            3 to "LOCKDOWN",
        )
    }
}
