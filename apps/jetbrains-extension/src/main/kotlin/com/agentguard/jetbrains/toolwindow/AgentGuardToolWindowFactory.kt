package com.agentguard.jetbrains.toolwindow

import com.agentguard.jetbrains.services.GovernanceWatcherService
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.content.ContentFactory

/**
 * Factory for the AgentGuard tool window in the IDE sidebar.
 * Creates three tabs mirroring the VS Code extension's sidebar panels:
 * - Run Status: live metrics for the current governance session
 * - Recent Events: stream of recent allowed/denied/escalated actions
 * - Run History: browse past governance sessions
 *
 * Each tab registers a refresh listener with GovernanceWatcherService
 * so it updates automatically when new events arrive.
 */
class AgentGuardToolWindowFactory : ToolWindowFactory, DumbAware {

    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val contentFactory = ContentFactory.getInstance()
        val watcher = project.getService(GovernanceWatcherService::class.java)

        val statusPanel = RunStatusPanel(project)
        val statusContent = contentFactory.createContent(statusPanel.component, "Run Status", false)
        toolWindow.contentManager.addContent(statusContent)

        val eventsPanel = RecentEventsPanel(project)
        val eventsContent = contentFactory.createContent(eventsPanel.component, "Recent Events", false)
        toolWindow.contentManager.addContent(eventsContent)

        val historyPanel = RunHistoryPanel(project)
        val historyContent = contentFactory.createContent(historyPanel.component, "Run History", false)
        toolWindow.contentManager.addContent(historyContent)

        // Register refresh callbacks
        watcher.addRefreshListener { statusPanel.refresh() }
        watcher.addRefreshListener { eventsPanel.refresh() }
        watcher.addRefreshListener { historyPanel.refresh() }
    }

    override fun shouldBeAvailable(project: Project): Boolean {
        val basePath = project.basePath ?: return false
        val hasAgentGuardDir = java.io.File(basePath, ".agentguard").exists()
        val hasPolicyFile = java.io.File(basePath, "agentguard.yaml").exists()
                || java.io.File(basePath, "agentguard.yml").exists()
                || java.io.File(basePath, ".agentguard.yaml").exists()
        return hasAgentGuardDir || hasPolicyFile
    }
}
