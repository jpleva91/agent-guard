package com.agentguard.jetbrains.services

import com.agentguard.jetbrains.models.GovernanceEvent
import com.intellij.notification.NotificationType

/**
 * Formats governance events into human-readable notification messages.
 * Pure utility — no IDE dependencies beyond NotificationType enum.
 *
 * Mirrors notification-formatter.ts from the VS Code extension.
 */
object NotificationFormatter {

    fun isNotificationEvent(kind: String): Boolean =
        kind in GovernanceEvent.NOTIFICATION_KINDS

    fun resolveNotificationType(kind: String): NotificationType = when (kind) {
        "InvariantViolation" -> NotificationType.ERROR
        "BlastRadiusExceeded" -> NotificationType.ERROR
        "PolicyDenied" -> NotificationType.WARNING
        "ActionEscalated" -> NotificationType.INFORMATION
        else -> NotificationType.INFORMATION
    }

    fun formatMessage(event: GovernanceEvent): String = when (event.kind) {
        "PolicyDenied" -> {
            val action = event.actionType ?: "unknown action"
            val rule = event.reason ?: "policy rule"
            "Policy denied $action \u2014 $rule"
        }
        "InvariantViolation" -> {
            val invariant = event.invariantId ?: "unknown"
            val detail = event.detail ?: "check failed"
            "Invariant violation [$invariant] \u2014 $detail"
        }
        "BlastRadiusExceeded" -> {
            val score = event.score ?: "?"
            val threshold = event.threshold ?: "?"
            "Blast radius exceeded ($score/$threshold)"
        }
        "ActionEscalated" -> {
            val action = event.actionType ?: "action"
            val level = event.escalationLevel ?: 0
            val label = GovernanceEvent.ESCALATION_LABELS[level] ?: "ELEVATED"
            "$action escalated to $label"
        }
        else -> event.kind
    }
}
