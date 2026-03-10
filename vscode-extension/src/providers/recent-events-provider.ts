// Recent Events TreeView — shows individual governance events from the latest run
// Displays: event kind, action type, target, and timestamp

import * as vscode from 'vscode';
import type { RecentEvent } from '../services/event-reader';
import { getRecentEvents } from '../services/event-reader';

/** Icons for each event kind */
const EVENT_ICONS: Record<string, vscode.ThemeIcon> = {
  ActionAllowed: new vscode.ThemeIcon('pass'),
  ActionDenied: new vscode.ThemeIcon('error'),
  ActionEscalated: new vscode.ThemeIcon('warning'),
  PolicyDenied: new vscode.ThemeIcon('circle-slash'),
  InvariantViolation: new vscode.ThemeIcon('alert'),
  BlastRadiusExceeded: new vscode.ThemeIcon('flame'),
};

/** Friendly labels for event kinds */
const EVENT_LABELS: Record<string, string> = {
  ActionAllowed: 'Allowed',
  ActionDenied: 'Denied',
  ActionEscalated: 'Escalated',
  PolicyDenied: 'Policy Denied',
  InvariantViolation: 'Violation',
  BlastRadiusExceeded: 'Blast Radius',
};

class EventItem extends vscode.TreeItem {
  constructor(event: RecentEvent) {
    const kindLabel = EVENT_LABELS[event.kind] ?? event.kind;
    const actionLabel = event.actionType ?? 'unknown';
    const label = `${kindLabel}: ${actionLabel}`;
    super(label, vscode.TreeItemCollapsibleState.None);

    this.iconPath = EVENT_ICONS[event.kind] ?? new vscode.ThemeIcon('circle-outline');

    const targetPart = event.target ? ` → ${event.target}` : '';
    const reasonPart = event.reason ? `\nReason: ${event.reason}` : '';
    this.tooltip = `${event.kind}: ${actionLabel}${targetPart}${reasonPart}\n${formatEventTime(event.timestamp)}`;

    this.description = event.target ? truncatePath(event.target) : formatEventTime(event.timestamp);
  }
}

/**
 * TreeDataProvider for the Recent Events view.
 * Shows individual governance events from the latest run.
 */
export class RecentEventsProvider implements vscode.TreeDataProvider<EventItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<EventItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private events: RecentEvent[] = [];

  constructor(private readonly workspaceRoot: string) {
    this.refresh();
  }

  refresh(): void {
    this.events = getRecentEvents(this.workspaceRoot);
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: EventItem): vscode.TreeItem {
    return element;
  }

  getChildren(): EventItem[] {
    if (this.events.length === 0) {
      return [
        new EventItem({
          id: 'empty',
          kind: 'info',
          timestamp: Date.now(),
          actionType: 'No recent events',
          target: null,
          reason: null,
        }),
      ];
    }
    return this.events.map((event) => new EventItem(event));
  }
}

function formatEventTime(ts: number): string {
  const now = Date.now();
  const diffMs = now - ts;

  if (diffMs < 60_000) return 'just now';
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;

  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function truncatePath(target: string): string {
  if (target.length <= 30) return target;
  return '…' + target.slice(-29);
}
