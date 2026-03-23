package com.agentguard.jetbrains.models

/**
 * A source location extracted from a governance violation event.
 * Used for inline diagnostics in the editor gutter and Problems panel.
 */
data class ViolationLocation(
    val filePath: String,
    val line: Int = 1,
    val message: String,
    val severity: ViolationSeverity,
    val invariantId: String? = null,
    val eventId: String,
)

enum class ViolationSeverity {
    ERROR,
    WARNING,
    INFO,
}
