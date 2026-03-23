package com.agentguard.jetbrains.services

import com.agentguard.jetbrains.models.GovernanceEvent
import com.agentguard.jetbrains.models.ViolationLocation
import com.agentguard.jetbrains.models.ViolationSeverity

/**
 * Extracts file paths and line numbers from governance violation events
 * for inline diagnostics in the editor.
 *
 * Mirrors violation-mapper.ts from the VS Code extension.
 */
object ViolationMapper {

    private val VIOLATION_KINDS = setOf(
        "InvariantViolation",
        "PolicyDenied",
        "BlastRadiusExceeded",
        "ActionDenied",
    )

    fun isViolationEvent(kind: String): Boolean = kind in VIOLATION_KINDS

    fun extractViolationLocations(event: GovernanceEvent): List<ViolationLocation> {
        if (!isViolationEvent(event.kind)) return emptyList()

        val locations = mutableListOf<ViolationLocation>()
        val message = NotificationFormatter.formatMessage(event)
        val severity = resolveSeverity(event)

        when (event.kind) {
            "InvariantViolation" -> {
                val filePath = event.filePath
                if (filePath != null && looksLikeFilePath(filePath)) {
                    locations.add(
                        ViolationLocation(
                            filePath = filePath,
                            line = event.line ?: 1,
                            message = message,
                            severity = severity,
                            invariantId = event.invariantId,
                            eventId = event.id,
                        )
                    )
                }
                extractFilePathsFromText(event.detail).forEach { path ->
                    if (path != filePath) {
                        locations.add(
                            ViolationLocation(
                                filePath = path,
                                line = 1,
                                message = message,
                                severity = severity,
                                invariantId = event.invariantId,
                                eventId = event.id,
                            )
                        )
                    }
                }
            }
            "PolicyDenied" -> {
                val filePath = event.filePath ?: event.target
                if (filePath != null && looksLikeFilePath(filePath)) {
                    locations.add(
                        ViolationLocation(
                            filePath = filePath,
                            line = event.line ?: 1,
                            message = message,
                            severity = severity,
                            invariantId = null,
                            eventId = event.id,
                        )
                    )
                }
            }
            "BlastRadiusExceeded" -> {
                event.files.filter { looksLikeFilePath(it) }.forEach { path ->
                    locations.add(
                        ViolationLocation(
                            filePath = path,
                            line = 1,
                            message = message,
                            severity = severity,
                            invariantId = null,
                            eventId = event.id,
                        )
                    )
                }
            }
            "ActionDenied" -> {
                val target = event.target
                if (target != null && looksLikeFilePath(target)) {
                    locations.add(
                        ViolationLocation(
                            filePath = target,
                            line = 1,
                            message = message,
                            severity = severity,
                            invariantId = null,
                            eventId = event.id,
                        )
                    )
                }
            }
        }

        return locations
    }

    private fun resolveSeverity(event: GovernanceEvent): ViolationSeverity {
        val level = event.escalationLevel ?: 0
        return when {
            level >= 4 -> ViolationSeverity.ERROR
            level >= 2 -> ViolationSeverity.WARNING
            event.kind == "InvariantViolation" -> ViolationSeverity.ERROR
            event.kind == "BlastRadiusExceeded" -> ViolationSeverity.ERROR
            event.kind == "PolicyDenied" -> ViolationSeverity.WARNING
            else -> ViolationSeverity.INFO
        }
    }

    private fun looksLikeFilePath(text: String): Boolean {
        if (text.length > 500) return false
        if (text.contains(' ') || text.contains('<') || text.contains('>')) return false
        if (text.contains('|') || text.contains('"') || text.contains('\'')) return false
        return text.contains('.') || text.contains('/')
    }

    private val FILE_PATH_PATTERN = Regex("""(?:detected|modified|target|file|path):\s*(.+)""", RegexOption.IGNORE_CASE)

    private fun extractFilePathsFromText(text: String?): List<String> {
        if (text == null) return emptyList()
        val match = FILE_PATH_PATTERN.find(text) ?: return emptyList()
        return match.groupValues[1]
            .split(",")
            .map { it.trim() }
            .filter { it.isNotEmpty() && looksLikeFilePath(it) }
    }
}
