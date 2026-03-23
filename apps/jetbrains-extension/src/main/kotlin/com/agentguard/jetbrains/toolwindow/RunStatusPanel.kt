package com.agentguard.jetbrains.toolwindow

import com.agentguard.jetbrains.models.GovernanceEvent
import com.agentguard.jetbrains.models.RunStatus
import com.agentguard.jetbrains.models.RunSummary
import com.agentguard.jetbrains.services.EventReaderService
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBPanel
import com.intellij.util.ui.JBUI
import java.awt.GridBagConstraints
import java.awt.GridBagLayout
import java.time.Duration
import java.time.Instant
import javax.swing.JComponent

/**
 * Panel displaying the latest governance run status with key metrics.
 * Mirrors the RunStatusProvider from the VS Code extension.
 *
 * Shows: run ID, status, escalation level, policy file, and action counts.
 */
class RunStatusPanel(private val project: Project) {

    private val panel = JBPanel<JBPanel<*>>(GridBagLayout())
    private val labels = mutableMapOf<String, JBLabel>()

    val component: JComponent
        get() = panel

    init {
        buildLayout()
        refresh()
    }

    fun refresh() {
        ApplicationManager.getApplication().invokeLater {
            val reader = project.getService(EventReaderService::class.java) ?: return@invokeLater
            val run = reader.findLatestRun()
            val policy = reader.findPolicyFile()
            updateLabels(run, policy)
        }
    }

    private fun buildLayout() {
        panel.border = JBUI.Borders.empty(8)
        val rows = listOf(
            "Run" to "—",
            "Status" to "—",
            "Escalation" to "NORMAL",
            "Policy" to "—",
            "Allowed" to "0",
            "Denied" to "0",
            "Violations" to "0",
            "Events" to "0",
            "Duration" to "—",
        )

        for ((index, pair) in rows.withIndex()) {
            val (label, defaultValue) = pair
            val nameLabel = JBLabel("$label:")
            nameLabel.font = nameLabel.font.deriveFont(java.awt.Font.BOLD)
            val valueLabel = JBLabel(defaultValue)
            labels[label] = valueLabel

            val gbc = GridBagConstraints().apply {
                gridy = index
                insets = JBUI.insets(2, 0)
                anchor = GridBagConstraints.WEST
            }

            gbc.gridx = 0
            gbc.weightx = 0.0
            gbc.fill = GridBagConstraints.NONE
            panel.add(nameLabel, gbc)

            gbc.gridx = 1
            gbc.weightx = 1.0
            gbc.fill = GridBagConstraints.HORIZONTAL
            gbc.insets = JBUI.insets(2, 8, 2, 0)
            panel.add(valueLabel, gbc)
        }

        // Spacer to push content to top
        val spacerGbc = GridBagConstraints().apply {
            gridy = rows.size
            weighty = 1.0
            fill = GridBagConstraints.VERTICAL
        }
        panel.add(JBLabel(), spacerGbc)
    }

    private fun updateLabels(run: RunSummary?, policy: String?) {
        if (run == null) {
            labels["Run"]?.text = "No runs found"
            labels["Status"]?.text = "—"
            labels["Escalation"]?.text = "—"
            labels["Policy"]?.text = policy ?: "none (fail-open)"
            labels["Allowed"]?.text = "0"
            labels["Denied"]?.text = "0"
            labels["Violations"]?.text = "0"
            labels["Events"]?.text = "0"
            labels["Duration"]?.text = "—"
            return
        }

        labels["Run"]?.text = run.runId.take(12) + if (run.runId.length > 12) "..." else ""
        labels["Status"]?.text = when (run.status) {
            RunStatus.ACTIVE -> "\u25CF active"
            RunStatus.COMPLETED -> "\u2713 completed"
        }
        labels["Escalation"]?.text = run.escalationLabel
        labels["Policy"]?.text = policy ?: "none (fail-open)"
        labels["Allowed"]?.text = run.actionsAllowed.toString()
        labels["Denied"]?.text = run.actionsDenied.toString()
        labels["Violations"]?.text = run.invariantViolations.toString()
        labels["Events"]?.text = run.totalEvents.toString()
        labels["Duration"]?.text = formatDuration(run.startTime, run.endTime)
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
