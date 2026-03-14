// Run History TreeView — shows recent governance runs with timestamps and outcomes
// Each run expands to show action counts and event details

import * as vscode from 'vscode';
import type { RunSummary } from '../services/event-reader';
import { ESCALATION_LABELS, loadAllRuns } from '../services/event-reader';

/** A top-level run entry in the history tree */
class RunItem extends vscode.TreeItem {
  constructor(readonly summary: RunSummary) {
    const label = formatRunLabel(summary);
    super(label, vscode.TreeItemCollapsibleState.Collapsed);

    this.description = formatTimestamp(summary.startedAt);
    this.tooltip = `${summary.runId}\nStarted: ${new Date(summary.startedAt).toLocaleString()}\nEvents: ${summary.totalEvents}`;

    this.iconPath = summary.status === 'active'
      ? new vscode.ThemeIcon('sync~spin')
      : summary.actionsDenied > 0 || summary.violations > 0
        ? new vscode.ThemeIcon('warning')
        : new vscode.ThemeIcon('pass');
  }
}

/** A detail line within an expanded run */
class RunDetailItem extends vscode.TreeItem {
  constructor(label: string, icon?: vscode.ThemeIcon) {
    super(label, vscode.TreeItemCollapsibleState.None);
    if (icon) {
      this.iconPath = icon;
    }
  }
}

type HistoryTreeItem = RunItem | RunDetailItem;

/**
 * TreeDataProvider for the Run History view.
 * Lists all governance runs sorted by recency, expandable for details.
 */
export class RunHistoryProvider implements vscode.TreeDataProvider<HistoryTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<HistoryTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private runs: RunSummary[] = [];

  constructor(private readonly workspaceRoot: string) {
    this.refresh();
  }

  refresh(): void {
    this.runs = loadAllRuns(this.workspaceRoot);
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: HistoryTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: HistoryTreeItem): HistoryTreeItem[] {
    if (!element) {
      // Root level: list all runs
      if (this.runs.length === 0) {
        return [new RunDetailItem('No governance runs recorded', new vscode.ThemeIcon('info'))];
      }
      return this.runs.map((run) => new RunItem(run));
    }

    // Expanded run: show details
    if (element instanceof RunItem) {
      return buildRunDetails(element.summary);
    }

    return [];
  }
}

function buildRunDetails(run: RunSummary): RunDetailItem[] {
  const details: RunDetailItem[] = [];

  details.push(new RunDetailItem(
    `Status: ${run.status}`,
    run.status === 'active' ? new vscode.ThemeIcon('sync~spin') : new vscode.ThemeIcon('check'),
  ));

  const levelLabel = ESCALATION_LABELS[run.escalationLevel] ?? 'UNKNOWN';
  details.push(new RunDetailItem(
    `Escalation: ${levelLabel}`,
    run.escalationLevel >= 2 ? new vscode.ThemeIcon('warning') : new vscode.ThemeIcon('shield'),
  ));

  details.push(new RunDetailItem(
    `Allowed: ${run.actionsAllowed}`,
    new vscode.ThemeIcon('pass'),
  ));

  details.push(new RunDetailItem(
    `Denied: ${run.actionsDenied}`,
    run.actionsDenied > 0 ? new vscode.ThemeIcon('error') : new vscode.ThemeIcon('circle-slash'),
  ));

  details.push(new RunDetailItem(
    `Violations: ${run.violations}`,
    run.violations > 0 ? new vscode.ThemeIcon('alert') : new vscode.ThemeIcon('check-all'),
  ));

  details.push(new RunDetailItem(
    `Total events: ${run.totalEvents}`,
    new vscode.ThemeIcon('list-flat'),
  ));

  if (run.endedAt) {
    const durationMs = run.endedAt - run.startedAt;
    details.push(new RunDetailItem(
      `Duration: ${formatDurationLong(durationMs)}`,
      new vscode.ThemeIcon('clock'),
    ));
  }

  return details;
}

function formatRunLabel(summary: RunSummary): string {
  const shortId = summary.runId.length > 20
    ? summary.runId.slice(0, 20) + '...'
    : summary.runId;

  if (summary.actionsDenied > 0) {
    return `${shortId} (${summary.actionsDenied} denied)`;
  }
  return shortId;
}

function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - ts;

  if (diffMs < 60_000) return 'just now';
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;

  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatDurationLong(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}
