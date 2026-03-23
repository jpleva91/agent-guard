package com.agentguard.jetbrains.services

import com.intellij.openapi.project.Project
import com.intellij.openapi.project.ProjectManager
import com.intellij.openapi.vfs.newvfs.BulkFileListener
import com.intellij.openapi.vfs.newvfs.events.VFileEvent

/**
 * VFS listener that watches for changes in .agentguard/events/ directories.
 * When JSONL files change, triggers a refresh of the governance watcher service
 * to update tool windows, notifications, and diagnostics.
 *
 * Registered as a projectListener in plugin.xml.
 */
class GovernanceFileListener : BulkFileListener {

    override fun after(events: List<VFileEvent>) {
        val hasGovernanceChange = events.any { event ->
            val path = event.path
            path.contains(".agentguard/events/") && path.endsWith(".jsonl")
        }

        if (!hasGovernanceChange) return

        for (project in ProjectManager.getInstance().openProjects) {
            if (project.isDisposed) continue
            val watcher = project.getService(GovernanceWatcherService::class.java) ?: continue
            watcher.onEventsChanged()
        }
    }
}
