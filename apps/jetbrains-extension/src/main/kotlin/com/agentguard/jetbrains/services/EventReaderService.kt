package com.agentguard.jetbrains.services

import com.agentguard.jetbrains.models.GovernanceEvent
import com.agentguard.jetbrains.models.RunStatus
import com.agentguard.jetbrains.models.RunSummary
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project
import java.io.File

/**
 * Reads and parses governance events from JSONL files in .agentguard/events/.
 * This is the data layer for all UI components — tool windows, notifications,
 * and diagnostics all consume events through this service.
 *
 * Mirrors the event-reader.ts service from the VS Code extension.
 */
@Service(Service.Level.PROJECT)
class EventReaderService(private val project: Project) {

    private val gson = Gson()
    private val mapType = object : TypeToken<Map<String, Any?>>() {}.type

    private val eventsDir: File?
        get() {
            val basePath = project.basePath ?: return null
            return File(basePath, ".agentguard/events")
        }

    fun parseJsonlFile(file: File): List<GovernanceEvent> {
        if (!file.exists()) return emptyList()
        return file.readLines()
            .filter { it.isNotBlank() }
            .mapNotNull { line -> parseEventLine(line) }
    }

    fun listSessionIds(): List<String> {
        val dir = eventsDir ?: return emptyList()
        if (!dir.exists()) return emptyList()
        return dir.listFiles { f -> f.extension == "jsonl" }
            ?.sortedByDescending { it.lastModified() }
            ?.map { it.nameWithoutExtension }
            ?: emptyList()
    }

    fun summarizeRun(sessionId: String, sessionFile: File, events: List<GovernanceEvent>): RunSummary {
        var startTime: String? = null
        var endTime: String? = null
        var actionsRequested = 0
        var actionsAllowed = 0
        var actionsDenied = 0
        var invariantViolations = 0
        var maxEscalation = 0
        var hasRunEnded = false

        for (event in events) {
            when (event.kind) {
                "RunStarted" -> startTime = event.timestamp
                "RunEnded" -> {
                    endTime = event.timestamp
                    hasRunEnded = true
                }
                "ActionRequested" -> actionsRequested++
                "ActionAllowed" -> actionsAllowed++
                "ActionDenied" -> actionsDenied++
                "InvariantViolation" -> invariantViolations++
                "ActionEscalated" -> {
                    val level = event.escalationLevel ?: 0
                    if (level > maxEscalation) maxEscalation = level
                }
            }
        }

        return RunSummary(
            runId = sessionId,
            sessionFile = sessionFile.absolutePath,
            status = if (hasRunEnded) RunStatus.COMPLETED else RunStatus.ACTIVE,
            startTime = startTime,
            endTime = endTime,
            actionsRequested = actionsRequested,
            actionsAllowed = actionsAllowed,
            actionsDenied = actionsDenied,
            invariantViolations = invariantViolations,
            totalEvents = events.size,
            maxEscalationLevel = maxEscalation,
        )
    }

    fun loadAllRuns(): List<RunSummary> {
        val dir = eventsDir ?: return emptyList()
        if (!dir.exists()) return emptyList()

        return dir.listFiles { f -> f.extension == "jsonl" }
            ?.sortedByDescending { it.lastModified() }
            ?.map { file ->
                val events = parseJsonlFile(file)
                summarizeRun(file.nameWithoutExtension, file, events)
            }
            ?: emptyList()
    }

    fun findLatestRun(): RunSummary? {
        val runs = loadAllRuns()
        return runs.firstOrNull { it.status == RunStatus.ACTIVE }
            ?: runs.firstOrNull()
    }

    fun getRecentEvents(limit: Int = 20): List<GovernanceEvent> {
        val latestRun = findLatestRun() ?: return emptyList()
        val file = File(latestRun.sessionFile)
        val events = parseJsonlFile(file)

        return events
            .filter { it.kind in GovernanceEvent.ACTIONABLE_KINDS }
            .takeLast(limit)
            .reversed()
    }

    fun findPolicyFile(): String? {
        val basePath = project.basePath ?: return null
        val candidates = listOf("agentguard.yaml", "agentguard.yml", ".agentguard.yaml")
        for (name in candidates) {
            if (File(basePath, name).exists()) return name
        }
        return null
    }

    private fun parseEventLine(line: String): GovernanceEvent? {
        return try {
            val map: Map<String, Any?> = gson.fromJson(line, mapType)
            GovernanceEvent(
                id = map["id"] as? String ?: return null,
                kind = map["kind"] as? String ?: return null,
                timestamp = map["timestamp"] as? String ?: "",
                fingerprint = map["fingerprint"] as? String ?: "",
                metadata = map,
            )
        } catch (_: Exception) {
            null
        }
    }
}
