package com.agentguard.jetbrains.toolwindow

import com.agentguard.jetbrains.models.RunStatus
import com.agentguard.jetbrains.models.RunSummary
import com.agentguard.jetbrains.services.EventReaderService
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.ui.components.JBScrollPane
import com.intellij.ui.treeStructure.Tree
import com.intellij.util.ui.JBUI
import java.time.Duration
import java.time.Instant
import javax.swing.JComponent
import javax.swing.tree.DefaultMutableTreeNode
import javax.swing.tree.DefaultTreeModel

/**
 * Panel displaying all governance run history as an expandable tree.
 * Each run is a collapsible node showing detail properties when expanded.
 *
 * Mirrors the RunHistoryProvider from the VS Code extension.
 */
class RunHistoryPanel(private val project: Project) {

    private val rootNode = DefaultMutableTreeNode("Runs")
    private val treeModel = DefaultTreeModel(rootNode)
    private val tree = Tree(treeModel)

    val component: JComponent
        get() = JBScrollPane(tree)

    init {
        tree.isRootVisible = false
        tree.showsRootHandles = true
        tree.border = JBUI.Borders.empty(4)
        tree.emptyText.text = "No governance runs"
        refresh()
    }

    fun refresh() {
        ApplicationManager.getApplication().invokeLater {
            val reader = project.getService(EventReaderService::class.java) ?: return@invokeLater
            val runs = reader.loadAllRuns()
            rebuildTree(runs)
        }
    }

    private fun rebuildTree(runs: List<RunSummary>) {
        rootNode.removeAllChildren()

        for (run in runs) {
            val label = buildRunLabel(run)
            val runNode = DefaultMutableTreeNode(label)

            runNode.add(DefaultMutableTreeNode("Status: ${run.status.label}"))
            runNode.add(DefaultMutableTreeNode("Escalation: ${run.escalationLabel}"))
            runNode.add(DefaultMutableTreeNode("Allowed: ${run.actionsAllowed}"))
            runNode.add(DefaultMutableTreeNode("Denied: ${run.actionsDenied}"))
            runNode.add(DefaultMutableTreeNode("Violations: ${run.invariantViolations}"))
            runNode.add(DefaultMutableTreeNode("Total events: ${run.totalEvents}"))
            runNode.add(DefaultMutableTreeNode("Duration: ${formatDuration(run.startTime, run.endTime)}"))

            rootNode.add(runNode)
        }

        treeModel.reload()
    }

    private fun buildRunLabel(run: RunSummary): String {
        val id = run.runId.take(12) + if (run.runId.length > 12) "..." else ""
        val statusIcon = when {
            run.status == RunStatus.ACTIVE -> "\u25CF"
            run.hasDenials -> "\u26A0"
            else -> "\u2713"
        }
        val timestamp = formatRelativeTime(run.startTime)
        val suffix = if (run.hasDenials) " (${run.actionsDenied} denied)" else ""
        return "$statusIcon $id$suffix  $timestamp"
    }

    private fun formatRelativeTime(timestamp: String?): String {
        if (timestamp == null) return ""
        return try {
            val eventTime = Instant.parse(timestamp)
            val now = Instant.now()
            val duration = Duration.between(eventTime, now)
            when {
                duration.seconds < 60 -> "just now"
                duration.toMinutes() < 60 -> "${duration.toMinutes()}m ago"
                duration.toHours() < 24 -> "${duration.toHours()}h ago"
                else -> timestamp.take(10)
            }
        } catch (_: Exception) {
            ""
        }
    }

    private fun formatDuration(start: String?, end: String?): String {
        if (start == null) return "—"
        return try {
            val startInstant = Instant.parse(start)
            val endInstant = if (end != null) Instant.parse(end) else Instant.now()
            val duration = Duration.between(startInstant, endInstant)
            val minutes = duration.toMinutes()
            val seconds = duration.seconds % 60
            if (minutes > 0) "${minutes}m ${seconds}s" else "${seconds}s"
        } catch (_: Exception) {
            "—"
        }
    }
}
