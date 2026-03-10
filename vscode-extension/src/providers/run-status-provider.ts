// Run Status TreeView — shows the latest governance run status
// Displays: run ID, status, escalation level, action counts

import * as vscode from 'vscode';
import type { RunSummary } from '../services/event-reader';
import { ESCALATION_LABELS, findLatestRun, findPolicyFile } from '../services/event-reader';

/** Tree item representing a status property */
class StatusItem extends vscode.TreeItem {
  constructor(label: string, value: string, icon?: vscode.ThemeIcon) {
    super(`${label}: ${value}`, vscode.TreeItemCollapsibleState.None);
    if (icon) {
      this.iconPath = icon;
    }
    this.tooltip = `${label}: ${value}`;
  }
}

/**
 * TreeDataProvider for the Run Status view.
 * Shows the latest governance run with key metrics.
 */
export class RunStatusProvider implements vscode.TreeDataProvider<StatusItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<StatusItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private currentRun: RunSummary | null = null;
  private policyFile: string | null = null;

  constructor(private readonly workspaceRoot: string) {
    this.refresh();
  }

  refresh(): void {
    this.currentRun = findLatestRun(this.workspaceRoot);
    this.policyFile = findPolicyFile(this.workspaceRoot);
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: StatusItem): vscode.TreeItem {
    return element;
  }

  getChildren(): StatusItem[] {
    if (!this.currentRun) {
      const items: StatusItem[] = [
        new StatusItem('Status', 'No governance runs found', new vscode.ThemeIcon('info')),
      ];
      // Show policy file even when no runs exist
      const policyLabel = this.policyFile ?? 'none (fail-open)';
      items.push(new StatusItem('Policy', policyLabel, new vscode.ThemeIcon('file-code')));
      return items;
    }

    const run = this.currentRun;
    const items: StatusItem[] = [];

    // Run ID
    items.push(new StatusItem('Run', run.runId, new vscode.ThemeIcon('play-circle')));

    // Status
    const statusIcon =
      run.status === 'active' ? new vscode.ThemeIcon('sync~spin') : new vscode.ThemeIcon('check');
    items.push(new StatusItem('Status', run.status, statusIcon));

    // Escalation level
    const levelLabel = ESCALATION_LABELS[run.escalationLevel] ?? 'UNKNOWN';
    const levelIcon =
      run.escalationLevel >= 2 ? new vscode.ThemeIcon('warning') : new vscode.ThemeIcon('shield');
    items.push(new StatusItem('Escalation', levelLabel, levelIcon));

    // Active policy file
    const policyLabel = this.policyFile ?? 'none (fail-open)';
    items.push(new StatusItem('Policy', policyLabel, new vscode.ThemeIcon('file-code')));

    // Action counts
    items.push(new StatusItem('Allowed', String(run.actionsAllowed), new vscode.ThemeIcon('pass')));
    items.push(
      new StatusItem(
        'Denied',
        String(run.actionsDenied),
        run.actionsDenied > 0 ? new vscode.ThemeIcon('error') : new vscode.ThemeIcon('circle-slash')
      )
    );
    items.push(
      new StatusItem(
        'Violations',
        String(run.violations),
        run.violations > 0 ? new vscode.ThemeIcon('alert') : new vscode.ThemeIcon('check-all')
      )
    );

    // Total events
    items.push(
      new StatusItem('Events', String(run.totalEvents), new vscode.ThemeIcon('list-flat'))
    );

    // Duration
    if (run.endedAt) {
      const durationMs = run.endedAt - run.startedAt;
      items.push(
        new StatusItem('Duration', formatDuration(durationMs), new vscode.ThemeIcon('clock'))
      );
    } else if (run.startedAt) {
      const elapsed = Date.now() - run.startedAt;
      items.push(new StatusItem('Elapsed', formatDuration(elapsed), new vscode.ThemeIcon('clock')));
    }

    return items;
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}
