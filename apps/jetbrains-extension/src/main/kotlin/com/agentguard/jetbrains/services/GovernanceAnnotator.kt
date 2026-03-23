package com.agentguard.jetbrains.services

import com.agentguard.jetbrains.models.ViolationLocation
import com.agentguard.jetbrains.models.ViolationSeverity
import com.intellij.lang.annotation.AnnotationHolder
import com.intellij.lang.annotation.ExternalAnnotator
import com.intellij.lang.annotation.HighlightSeverity
import com.intellij.openapi.editor.Document
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.vfs.VfsUtilCore
import com.intellij.psi.PsiFile

/**
 * External annotator that adds inline governance violation markers to the editor.
 * Reads violation locations from GovernanceWatcherService and creates
 * editor annotations (gutter icons, underlines, hover messages).
 *
 * This is the JetBrains equivalent of the VS Code diagnostics service.
 */
class GovernanceAnnotator : ExternalAnnotator<List<ViolationLocation>, List<ViolationLocation>>() {

    override fun collectInformation(file: PsiFile): List<ViolationLocation> {
        val project = file.project
        val watcher = project.getService(GovernanceWatcherService::class.java) ?: return emptyList()
        val virtualFile = file.virtualFile ?: return emptyList()

        val basePath = project.basePath ?: return emptyList()
        val relativePath = VfsUtilCore.getRelativePath(virtualFile, project.baseDir ?: return emptyList())
            ?: return emptyList()

        return watcher.violations[relativePath] ?: emptyList()
    }

    override fun doAnnotate(collectedInfo: List<ViolationLocation>): List<ViolationLocation> {
        return collectedInfo
    }

    override fun apply(file: PsiFile, annotationResult: List<ViolationLocation>, holder: AnnotationHolder) {
        val document = FileDocumentManager.getInstance().getDocument(file.virtualFile ?: return) ?: return

        for (violation in annotationResult) {
            val lineNumber = (violation.line - 1).coerceIn(0, document.lineCount - 1)
            val startOffset = document.getLineStartOffset(lineNumber)
            val endOffset = document.getLineEndOffset(lineNumber)

            val severity = when (violation.severity) {
                ViolationSeverity.ERROR -> HighlightSeverity.ERROR
                ViolationSeverity.WARNING -> HighlightSeverity.WARNING
                ViolationSeverity.INFO -> HighlightSeverity.WEAK_WARNING
            }

            val tooltip = buildString {
                append("AgentGuard: ")
                append(violation.message)
                if (violation.invariantId != null) {
                    append(" [${violation.invariantId}]")
                }
            }

            holder.newAnnotation(severity, violation.message)
                .range(startOffset, endOffset)
                .tooltip(tooltip)
                .create()
        }
    }
}
