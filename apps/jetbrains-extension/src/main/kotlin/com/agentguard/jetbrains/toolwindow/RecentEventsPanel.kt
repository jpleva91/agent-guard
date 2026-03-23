package com.agentguard.jetbrains.toolwindow

import com.agentguard.jetbrains.models.GovernanceEvent
import com.agentguard.jetbrains.services.EventReaderService
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.ui.ColoredListCellRenderer
import com.intellij.ui.SimpleTextAttributes
import com.intellij.ui.components.JBList
import com.intellij.ui.components.JBScrollPane
import java.time.Duration
import java.time.Instant
import javax.swing.DefaultListModel
import javax.swing.JComponent
import javax.swing.JList

/**
 * Panel displaying recent governance events from the latest run.
 * Shows allowed, denied, escalated, and violation events in a scrollable list.
 *
 * Mirrors the RecentEventsProvider from the VS Code extension.
 */
class RecentEventsPanel(private val project: Project) {

    private val listModel = DefaultListModel<GovernanceEvent>()
    private val list = JBList(listModel)

    val component: JComponent
        get() = JBScrollPane(list)

    init {
        list.cellRenderer = EventCellRenderer()
        list.emptyText.text = "No recent events"
        refresh()
    }

    fun refresh() {
        ApplicationManager.getApplication().invokeLater {
            val reader = project.getService(EventReaderService::class.java) ?: return@invokeLater
            val events = reader.getRecentEvents(20)
            listModel.clear()
            for (event in events) {
                listModel.addElement(event)
            }
        }
    }

    private class EventCellRenderer : ColoredListCellRenderer<GovernanceEvent>() {
        override fun customizeCellRenderer(
            list: JList<out GovernanceEvent>,
            value: GovernanceEvent,
            index: Int,
            selected: Boolean,
            hasFocus: Boolean,
        ) {
            val kindLabel = EVENT_KIND_LABELS[value.kind] ?: value.kind
            val kindStyle = EVENT_KIND_STYLES[value.kind] ?: SimpleTextAttributes.REGULAR_ATTRIBUTES

            append("$kindLabel: ", kindStyle)
            append(value.actionType ?: "unknown", SimpleTextAttributes.REGULAR_ATTRIBUTES)

            val target = value.target
            if (target != null) {
                val truncated = if (target.length > 40) "..." + target.takeLast(37) else target
                append(" \u2192 $truncated", SimpleTextAttributes.GRAYED_ATTRIBUTES)
            }

            val timestamp = formatRelativeTime(value.timestamp)
            if (timestamp != null) {
                append("  $timestamp", SimpleTextAttributes.GRAYED_SMALL_ATTRIBUTES)
            }
        }

        private fun formatRelativeTime(timestamp: String): String? {
            return try {
                val eventTime = Instant.parse(timestamp)
                val now = Instant.now()
                val duration = Duration.between(eventTime, now)
                when {
                    duration.seconds < 60 -> "just now"
                    duration.toMinutes() < 60 -> "${duration.toMinutes()}m ago"
                    duration.toHours() < 24 -> "${duration.toHours()}h ago"
                    else -> null
                }
            } catch (_: Exception) {
                null
            }
        }

        companion object {
            private val EVENT_KIND_LABELS = mapOf(
                "ActionAllowed" to "Allowed",
                "ActionDenied" to "Denied",
                "ActionEscalated" to "Escalated",
                "PolicyDenied" to "Policy Denied",
                "InvariantViolation" to "Violation",
                "BlastRadiusExceeded" to "Blast Radius",
            )

            private val EVENT_KIND_STYLES = mapOf(
                "ActionAllowed" to SimpleTextAttributes(SimpleTextAttributes.STYLE_PLAIN, java.awt.Color(0x00, 0x80, 0x00)),
                "ActionDenied" to SimpleTextAttributes(SimpleTextAttributes.STYLE_BOLD, java.awt.Color(0xCC, 0x00, 0x00)),
                "ActionEscalated" to SimpleTextAttributes(SimpleTextAttributes.STYLE_BOLD, java.awt.Color(0xCC, 0x88, 0x00)),
                "PolicyDenied" to SimpleTextAttributes(SimpleTextAttributes.STYLE_BOLD, java.awt.Color(0xCC, 0x00, 0x00)),
                "InvariantViolation" to SimpleTextAttributes(SimpleTextAttributes.STYLE_BOLD, java.awt.Color(0xCC, 0x00, 0x00)),
                "BlastRadiusExceeded" to SimpleTextAttributes(SimpleTextAttributes.STYLE_BOLD, java.awt.Color(0xCC, 0x44, 0x00)),
            )
        }
    }
}
