package com.agentguard.jetbrains.services

import com.agentguard.jetbrains.models.GovernanceEvent
import com.agentguard.jetbrains.models.ViolationLocation
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.Notification
import com.intellij.openapi.Disposable
import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project
import com.intellij.util.Alarm
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Central coordinator for governance event watching.
 * Debounces file system events and dispatches to:
 * - Tool window refresh callbacks
 * - Notification generation
 * - Violation location tracking (for diagnostics)
 *
 * This is the JetBrains equivalent of the VS Code extension's
 * file watcher + notification service + diagnostics service combined.
 */
@Service(Service.Level.PROJECT)
class GovernanceWatcherService(private val project: Project) : Disposable {

    private val alarm = Alarm(Alarm.ThreadToUse.POOLED_THREAD, this)
    private val seenEventIds = mutableSetOf<String>()
    private val refreshListeners = CopyOnWriteArrayList<() -> Unit>()

    private val _violations = mutableMapOf<String, MutableList<ViolationLocation>>()
    val violations: Map<String, List<ViolationLocation>>
        get() = _violations

    init {
        initializeSeenEvents()
    }

    fun addRefreshListener(listener: () -> Unit) {
        refreshListeners.add(listener)
    }

    fun removeRefreshListener(listener: () -> Unit) {
        refreshListeners.remove(listener)
    }

    fun onEventsChanged() {
        alarm.cancelAllRequests()
        alarm.addRequest({ processNewEvents() }, DEBOUNCE_MS)
    }

    override fun dispose() {
        refreshListeners.clear()
        seenEventIds.clear()
        _violations.clear()
    }

    private fun initializeSeenEvents() {
        val reader = project.getService(EventReaderService::class.java) ?: return
        val runs = reader.loadAllRuns()
        for (run in runs) {
            val events = reader.parseJsonlFile(java.io.File(run.sessionFile))
            for (event in events) {
                seenEventIds.add(event.id)
                processViolation(event)
            }
        }
    }

    private fun processNewEvents() {
        val reader = project.getService(EventReaderService::class.java) ?: return
        val latestRun = reader.findLatestRun() ?: return
        val events = reader.parseJsonlFile(java.io.File(latestRun.sessionFile))

        var hasNewNotifications = false
        for (event in events) {
            if (event.id in seenEventIds) continue
            seenEventIds.add(event.id)

            processViolation(event)

            if (NotificationFormatter.isNotificationEvent(event.kind)) {
                showNotification(event)
                hasNewNotifications = true
            }
        }

        // Refresh all tool windows
        for (listener in refreshListeners) {
            listener()
        }
    }

    private fun processViolation(event: GovernanceEvent) {
        if (!ViolationMapper.isViolationEvent(event.kind)) return
        val locations = ViolationMapper.extractViolationLocations(event)
        for (loc in locations) {
            _violations.getOrPut(loc.filePath) { mutableListOf() }.add(loc)
        }
    }

    private fun showNotification(event: GovernanceEvent) {
        val type = NotificationFormatter.resolveNotificationType(event.kind)
        val message = NotificationFormatter.formatMessage(event)

        val notification = NotificationGroupManager.getInstance()
            .getNotificationGroup("AgentGuard")
            .createNotification("AgentGuard: $message", type)

        notification.notify(project)
    }

    companion object {
        private const val DEBOUNCE_MS = 500L
    }
}
