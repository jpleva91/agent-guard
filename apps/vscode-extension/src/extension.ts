// AgentGuard VS Code Extension — sidebar panel with governance run status
// Activates when a workspace contains .agentguard/ or agentguard.yaml

import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { RunStatusProvider } from './providers/run-status-provider';
import { RunHistoryProvider } from './providers/run-history-provider';
import { RecentEventsProvider } from './providers/recent-events-provider';
import { NotificationService } from './services/notification-service';
import { DiagnosticsService } from './services/diagnostics-service';
import { getEventsDir } from './services/event-reader';

let fileWatcher: fs.FSWatcher | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    return;
  }

  // Register tree data providers
  const runStatusProvider = new RunStatusProvider(workspaceRoot);
  const runHistoryProvider = new RunHistoryProvider(workspaceRoot);
  const recentEventsProvider = new RecentEventsProvider(workspaceRoot);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('agentguard.runStatus', runStatusProvider),
    vscode.window.registerTreeDataProvider('agentguard.runHistory', runHistoryProvider),
    vscode.window.registerTreeDataProvider('agentguard.recentEvents', recentEventsProvider)
  );

  // Register notification service
  const notificationService = new NotificationService(workspaceRoot);
  context.subscriptions.push(notificationService);

  // Register diagnostics service for inline violation indicators
  const diagnosticsService = new DiagnosticsService(workspaceRoot);
  context.subscriptions.push(diagnosticsService);

  // Register refresh command
  context.subscriptions.push(
    vscode.commands.registerCommand('agentguard.refresh', () => {
      runStatusProvider.refresh();
      runHistoryProvider.refresh();
      recentEventsProvider.refresh();
    })
  );

  // Register clear diagnostics command
  context.subscriptions.push(
    vscode.commands.registerCommand('agentguard.clearDiagnostics', () => {
      diagnosticsService.clearAll();
    })
  );

  // Watch the events directory for changes
  const eventsDir = getEventsDir(workspaceRoot);
  watchEventsDirectory(eventsDir, () => {
    runStatusProvider.refresh();
    runHistoryProvider.refresh();
    recentEventsProvider.refresh();
  });

  // Clean up file watcher on deactivation
  context.subscriptions.push({
    dispose: () => {
      if (fileWatcher) {
        fileWatcher.close();
        fileWatcher = undefined;
      }
    },
  });
}

export function deactivate(): void {
  if (fileWatcher) {
    fileWatcher.close();
    fileWatcher = undefined;
  }
}

/**
 * Get the workspace root folder path.
 */
function getWorkspaceRoot(): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return undefined;
  }
  return folders[0].uri.fsPath;
}

/**
 * Watch the .agentguard/events/ directory for new or modified JSONL files.
 * Debounces rapid changes to avoid excessive refreshes.
 */
function watchEventsDirectory(eventsDir: string, onChange: () => void): void {
  // Ensure directory exists before watching
  if (!fs.existsSync(eventsDir)) {
    try {
      fs.mkdirSync(eventsDir, { recursive: true });
    } catch {
      return;
    }
  }

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  const debouncedOnChange = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(onChange, 500);
  };

  try {
    fileWatcher = fs.watch(eventsDir, { persistent: false }, (_eventType, filename) => {
      if (filename && filename.endsWith('.jsonl')) {
        debouncedOnChange();
      }
    });
  } catch {
    // Directory watch not supported or failed — fall back to manual refresh
  }
}
