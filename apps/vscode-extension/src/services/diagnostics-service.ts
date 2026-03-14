// Inline violation indicator service — maps governance violations to VS Code
// editor diagnostics and decorations. Watches JSONL event files for violation
// events and highlights affected files/lines in the editor.

import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getEventsDir, parseJsonlFile } from './event-reader';
import { isViolationEvent, extractViolationLocations } from './violation-mapper';
import type { ViolationLocation, ViolationSeverity } from './violation-mapper';

/**
 * Service that creates inline violation indicators in the VS Code editor.
 * Registers a DiagnosticCollection for the Problems panel and
 * TextEditorDecorationTypes for gutter/inline highlights.
 */
export class DiagnosticsService implements vscode.Disposable {
  private readonly diagnosticCollection: vscode.DiagnosticCollection;
  private readonly seenEventIds = new Set<string>();
  private readonly violations = new Map<string, ViolationLocation[]>();
  private fileWatcher: fs.FSWatcher | undefined;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;

  // Decoration types for inline highlights
  private readonly errorDecorationType: vscode.TextEditorDecorationType;
  private readonly warningDecorationType: vscode.TextEditorDecorationType;
  private readonly infoDecorationType: vscode.TextEditorDecorationType;

  constructor(private readonly workspaceRoot: string) {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection('agentguard');

    this.errorDecorationType = vscode.window.createTextEditorDecorationType({
      gutterIconPath: new vscode.ThemeIcon('error').id,
      overviewRulerColor: new vscode.ThemeColor('editorError.foreground'),
      overviewRulerLane: vscode.OverviewRulerLane.Left,
      backgroundColor: new vscode.ThemeColor('diffEditor.removedTextBackground'),
      isWholeLine: true,
    });

    this.warningDecorationType = vscode.window.createTextEditorDecorationType({
      overviewRulerColor: new vscode.ThemeColor('editorWarning.foreground'),
      overviewRulerLane: vscode.OverviewRulerLane.Left,
      backgroundColor: new vscode.ThemeColor('diffEditor.removedTextBackground'),
      isWholeLine: true,
    });

    this.infoDecorationType = vscode.window.createTextEditorDecorationType({
      overviewRulerColor: new vscode.ThemeColor('editorInfo.foreground'),
      overviewRulerLane: vscode.OverviewRulerLane.Left,
      isWholeLine: true,
    });

    this.loadExistingViolations();
    this.startWatching();

    // Update decorations when the active editor changes
    vscode.window.onDidChangeActiveTextEditor(() => this.updateDecorations());
  }

  dispose(): void {
    this.diagnosticCollection.dispose();
    this.errorDecorationType.dispose();
    this.warningDecorationType.dispose();
    this.infoDecorationType.dispose();
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
   * Clear all violation indicators. Called when violations are resolved
   * or the user explicitly refreshes.
   */
  clearAll(): void {
    this.diagnosticCollection.clear();
    this.violations.clear();
    this.seenEventIds.clear();
    this.clearDecorations();
  }

  /**
   * Scan existing event files for violations on startup.
   */
  private loadExistingViolations(): void {
    const eventsDir = getEventsDir(this.workspaceRoot);
    if (!fs.existsSync(eventsDir)) return;

    const files = fs.readdirSync(eventsDir).filter((f) => f.endsWith('.jsonl'));
    for (const file of files) {
      this.processEventFile(path.join(eventsDir, file));
    }
    this.refreshDiagnostics();
    this.updateDecorations();
  }

  /**
   * Watch the events directory for new violations.
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
          this.debouncedProcessFile(path.join(eventsDir, filename));
        }
      });
    } catch {
      // Directory watch not supported
    }
  }

  private debouncedProcessFile(filePath: string): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.processEventFile(filePath);
      this.refreshDiagnostics();
      this.updateDecorations();
    }, 300);
  }

  /**
   * Process a JSONL file for violation events.
   */
  private processEventFile(filePath: string): void {
    if (!fs.existsSync(filePath)) return;

    const config = vscode.workspace.getConfiguration('agentguard');
    const enabled = config.get<boolean>('diagnostics.enabled', true);
    if (!enabled) return;

    const events = parseJsonlFile(filePath);
    for (const event of events) {
      if (this.seenEventIds.has(event.id)) continue;
      this.seenEventIds.add(event.id);

      if (isViolationEvent(event.kind)) {
        const locations = extractViolationLocations(event);
        for (const location of locations) {
          this.addViolation(location);
        }
      }
    }
  }

  /**
   * Add a violation location to the internal map.
   */
  private addViolation(location: ViolationLocation): void {
    const absPath = this.resolveFilePath(location.filePath);
    const existing = this.violations.get(absPath) ?? [];
    existing.push({ ...location, filePath: absPath });
    this.violations.set(absPath, existing);
  }

  /**
   * Resolve a potentially relative file path to an absolute path.
   */
  private resolveFilePath(filePath: string): string {
    if (path.isAbsolute(filePath)) return filePath;
    return path.join(this.workspaceRoot, filePath);
  }

  /**
   * Refresh the VS Code DiagnosticCollection from the violations map.
   */
  private refreshDiagnostics(): void {
    this.diagnosticCollection.clear();

    for (const [filePath, locations] of this.violations) {
      const uri = vscode.Uri.file(filePath);
      const diagnostics = locations.map((loc) => {
        const line = Math.max(0, loc.line > 0 ? loc.line - 1 : 0);
        const range = new vscode.Range(line, 0, line, Number.MAX_SAFE_INTEGER);
        const diagnostic = new vscode.Diagnostic(
          range,
          loc.message,
          mapToVsCodeSeverity(loc.severity)
        );
        diagnostic.source = 'AgentGuard';
        diagnostic.code = loc.invariantId;
        return diagnostic;
      });

      this.diagnosticCollection.set(uri, diagnostics);
    }
  }

  /**
   * Update inline decorations for the active text editor.
   */
  private updateDecorations(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const filePath = editor.document.uri.fsPath;
    const locations = this.violations.get(filePath);

    if (!locations || locations.length === 0) {
      this.clearDecorationsForEditor(editor);
      return;
    }

    const errorRanges: vscode.DecorationOptions[] = [];
    const warningRanges: vscode.DecorationOptions[] = [];
    const infoRanges: vscode.DecorationOptions[] = [];

    for (const loc of locations) {
      const line = Math.max(0, loc.line > 0 ? loc.line - 1 : 0);
      const range = new vscode.Range(line, 0, line, Number.MAX_SAFE_INTEGER);
      const decoration: vscode.DecorationOptions = {
        range,
        hoverMessage: new vscode.MarkdownString(
          `**AgentGuard Violation**\n\n${loc.message}\n\n*Invariant*: \`${loc.invariantId}\``
        ),
      };

      switch (loc.severity) {
        case 'error':
          errorRanges.push(decoration);
          break;
        case 'warning':
          warningRanges.push(decoration);
          break;
        case 'info':
          infoRanges.push(decoration);
          break;
      }
    }

    editor.setDecorations(this.errorDecorationType, errorRanges);
    editor.setDecorations(this.warningDecorationType, warningRanges);
    editor.setDecorations(this.infoDecorationType, infoRanges);
  }

  /**
   * Clear decorations from a specific editor.
   */
  private clearDecorationsForEditor(editor: vscode.TextEditor): void {
    editor.setDecorations(this.errorDecorationType, []);
    editor.setDecorations(this.warningDecorationType, []);
    editor.setDecorations(this.infoDecorationType, []);
  }

  /**
   * Clear decorations from all visible editors.
   */
  private clearDecorations(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      this.clearDecorationsForEditor(editor);
    }
  }
}

/**
 * Map violation severity to VS Code diagnostic severity.
 */
function mapToVsCodeSeverity(severity: ViolationSeverity): vscode.DiagnosticSeverity {
  switch (severity) {
    case 'error':
      return vscode.DiagnosticSeverity.Error;
    case 'warning':
      return vscode.DiagnosticSeverity.Warning;
    case 'info':
      return vscode.DiagnosticSeverity.Information;
  }
}
