// Governance notification service — surfaces policy violations and invariant
// violations as VS Code notifications. Watches JSONL event files for new events
// and shows notifications with configurable severity levels.

import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getEventsDir, parseJsonlFile } from './event-reader';
import {
  isNotificationEvent,
  formatNotificationMessage,
  resolveSeverity,
} from './notification-formatter';
import type { NotificationEventKind, NotificationLevel } from './notification-formatter';

/**
 * Notification service that watches governance event files and shows
 * VS Code notifications for policy violations and invariant violations.
 */
export class NotificationService implements vscode.Disposable {
  private readonly seenEventIds = new Set<string>();
  private fileWatcher: fs.FSWatcher | undefined;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly workspaceRoot: string) {
    this.initializeSeenEvents();
    this.startWatching();
  }

  dispose(): void {
    if (this.fileWatcher) {
      this.fileWatcher.close();
      this.fileWatcher = undefined;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
  }

  /**
   * Scan all existing events on startup so we only notify on new events.
   */
  private initializeSeenEvents(): void {
    const eventsDir = getEventsDir(this.workspaceRoot);
    if (!fs.existsSync(eventsDir)) return;

    const files = fs.readdirSync(eventsDir).filter((f) => f.endsWith('.jsonl'));
    for (const file of files) {
      const filePath = path.join(eventsDir, file);
      const events = parseJsonlFile(filePath);
      for (const event of events) {
        this.seenEventIds.add(event.id);
      }
    }
  }

  /**
   * Watch the events directory for new JSONL writes.
   */
  private startWatching(): void {
    const eventsDir = getEventsDir(this.workspaceRoot);
    if (!fs.existsSync(eventsDir)) {
      try {
        fs.mkdirSync(eventsDir, { recursive: true });
      } catch {
        return;
      }
    }

    try {
      this.fileWatcher = fs.watch(eventsDir, { persistent: false }, (_eventType, filename) => {
        if (filename && filename.endsWith('.jsonl')) {
          this.debouncedCheckForNewEvents(path.join(eventsDir, filename));
        }
      });
    } catch {
      // Directory watch not supported — notifications won't be real-time
    }
  }

  private debouncedCheckForNewEvents(filePath: string): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => this.checkForNewEvents(filePath), 300);
  }

  /**
   * Check a JSONL file for new notification-worthy events.
   */
  private checkForNewEvents(filePath: string): void {
    if (!fs.existsSync(filePath)) return;

    const config = vscode.workspace.getConfiguration('agentguard.notifications');
    const enabled = config.get<boolean>('enabled', true);
    if (!enabled) return;

    const events = parseJsonlFile(filePath);
    for (const event of events) {
      if (this.seenEventIds.has(event.id)) continue;
      this.seenEventIds.add(event.id);

      if (isNotificationEvent(event.kind)) {
        this.showNotification(event.kind, event, config);
      }
    }
  }

  /**
   * Show a VS Code notification for a governance event.
   */
  private showNotification(
    kind: NotificationEventKind,
    event: import('./event-reader').GovernanceEvent,
    config: vscode.WorkspaceConfiguration
  ): void {
    const severityOverrides = config.get<Record<string, string>>('severityOverrides', {});
    const severity = resolveSeverity(kind, severityOverrides);

    const message = formatNotificationMessage(event);
    const showFn = getShowFunction(severity);

    showFn(message, 'View Details').then((action) => {
      if (action === 'View Details') {
        vscode.commands.executeCommand('agentguard.runStatus.focus');
        vscode.commands.executeCommand('agentguard.refresh');
      }
    });
  }
}

/**
 * Get the appropriate VS Code notification function for a severity level.
 */
function getShowFunction(
  severity: NotificationLevel
): (message: string, ...items: string[]) => Thenable<string | undefined> {
  switch (severity) {
    case 'error':
      return vscode.window.showErrorMessage;
    case 'warning':
      return vscode.window.showWarningMessage;
    case 'information':
    default:
      return vscode.window.showInformationMessage;
  }
}
