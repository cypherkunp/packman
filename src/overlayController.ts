import { dirname } from "node:path";
import * as vscode from "vscode";
import {
  buildOverlay,
  RUN_SCRIPT_COMMAND,
  type OverlayContext,
  type OverlayRange,
} from "./buildOverlay";
import { isOverlayTarget } from "./overlayTarget";
import { runPackageScript } from "./runPackageScript";

const OVERLAY_SETTING = "packman.overlay.enabled";
const REFRESH_DEBOUNCE_MS = 300;
/** Schemes whose documents can be edited and whose scripts can be run. */
const EDITABLE_SCHEMES = new Set(["file", "untitled", "vscode-remote"]);

/**
 * Thin VS Code adapter for the Overlay: feeds documents to the pure
 * `buildOverlay` and maps its output onto VS Code types one-to-one.
 */
export function registerOverlay(
  scriptFallbackWarnedDirs: Set<string>,
): vscode.Disposable {
  let sessionOverride: boolean | undefined;
  const changed = new vscode.EventEmitter<void>();
  let debounce: ReturnType<typeof setTimeout> | undefined;

  const isEnabled = () =>
    sessionOverride ??
    vscode.workspace.getConfiguration().get<boolean>(OVERLAY_SETTING, true);

  const contextFor = (document: vscode.TextDocument): OverlayContext => ({
    documentUri: document.uri.toString(),
    enabled: isEnabled(),
    trusted: vscode.workspace.isTrusted,
    readOnly: isReadOnly(document),
  });

  const codeLensProvider: vscode.CodeLensProvider = {
    onDidChangeCodeLenses: changed.event,
    provideCodeLenses(document) {
      if (!isOverlayTarget(document.uri.path)) {
        return [];
      }
      return buildOverlay(document.getText(), contextFor(document)).lenses.map(
        (lens) =>
          new vscode.CodeLens(toRange(lens.range), {
            title: lens.title,
            command: lens.command,
            arguments: lens.arguments,
            tooltip: lens.tooltip,
          }),
      );
    },
  };

  const refresh = () => changed.fire();
  const refreshSoon = () => {
    if (debounce) {
      clearTimeout(debounce);
    }
    debounce = setTimeout(refresh, REFRESH_DEBOUNCE_MS);
  };

  return vscode.Disposable.from(
    changed,
    { dispose: () => debounce && clearTimeout(debounce) },
    vscode.languages.registerCodeLensProvider(
      [{ pattern: "**/package.json" }],
      codeLensProvider,
    ),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (isOverlayTarget(event.document.uri.path)) {
        refreshSoon();
      }
    }),
    vscode.workspace.onDidGrantWorkspaceTrust(refresh),
    vscode.window.tabGroups.onDidChangeTabs(refresh),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(OVERLAY_SETTING)) {
        sessionOverride = undefined;
        refresh();
      }
    }),
    vscode.commands.registerCommand("packman.toggleOverlay", () => {
      sessionOverride = !isEnabled();
      refresh();
    }),
    vscode.commands.registerCommand(
      RUN_SCRIPT_COMMAND,
      (documentUri: unknown, script: unknown) => {
        if (typeof documentUri !== "string" || typeof script !== "string") {
          return;
        }
        if (!vscode.workspace.isTrusted) {
          void vscode.window.showWarningMessage(
            "Packman: trust this workspace to run scripts.",
          );
          return;
        }
        const uri = vscode.Uri.parse(documentUri);
        const packageDir = packageDirFor(uri);
        if (!packageDir) {
          void vscode.window.showWarningMessage(
            "Packman: save this package.json to a folder to run its scripts.",
          );
          return;
        }
        runPackageScript(packageDir, script, {
          findTerminal: (name) =>
            vscode.window.terminals.find((t) => t.name === name),
          createTerminal: (options) =>
            vscode.window.createTerminal({
              name: options.name,
              cwd: options.cwd,
            }),
          warn: (text) => {
            void vscode.window.showWarningMessage(text);
          },
          warnedDirs: scriptFallbackWarnedDirs,
        });
      },
    ),
  );
}

function toRange(range: OverlayRange): vscode.Range {
  return new vscode.Range(
    range.start.line,
    range.start.character,
    range.end.line,
    range.end.character,
  );
}

function packageDirFor(uri: vscode.Uri): string | undefined {
  if (uri.scheme === "untitled" && !uri.path.includes("/")) {
    const folder = vscode.workspace.workspaceFolders?.[0];
    return folder?.uri.fsPath;
  }
  return dirname(uri.fsPath);
}

/**
 * Read-only when the document lives on a non-editable scheme (git, PR
 * reviews, …), on a read-only file system, or is only open as a diff side.
 */
function isReadOnly(document: vscode.TextDocument): boolean {
  const { uri } = document;
  if (!EDITABLE_SCHEMES.has(uri.scheme)) {
    return true;
  }
  if (vscode.workspace.fs.isWritableFileSystem(uri.scheme) === false) {
    return true;
  }
  return isOnlyInDiff(uri);
}

function isOnlyInDiff(uri: vscode.Uri): boolean {
  const target = uri.toString();
  let inDiff = false;
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      const input = tab.input;
      if (input instanceof vscode.TabInputText) {
        if (input.uri.toString() === target) {
          return false;
        }
      } else if (input instanceof vscode.TabInputTextDiff) {
        if (
          input.original.toString() === target ||
          input.modified.toString() === target
        ) {
          inDiff = true;
        }
      }
    }
  }
  return inDiff;
}
