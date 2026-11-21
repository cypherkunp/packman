import { dirname } from "node:path";
import * as vscode from "vscode";
import {
  buildOverlay,
  overlayDependencies,
  RUN_SCRIPT_COMMAND,
  type DependencyEnrichment,
  type OverlayContext,
  type OverlayDecoration,
  type OverlayDecorationTone,
  type OverlayRange,
} from "./buildOverlay";
import { isOverlayTarget } from "./overlayTarget";
import {
  enrichmentCache,
  enrichmentRefreshEmitter,
  enrichmentStore,
} from "./packageJsonEditorProvider";
import { runPackageScript } from "./runPackageScript";
import { resolveSocketCredentials } from "./socketCredentials";

const OVERLAY_SETTING = "packman.overlay.enabled";
const SOCKET_SETTINGS = "packman.socket";
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
    enrichment: known,
  });

  /** Eager enrichment per Dependency name, degraded results included. */
  const known = new Map<string, DependencyEnrichment>();
  /** Names already sent to eager enrichment, so edits don't refetch. */
  const requested = new Set<string>();
  let enrichAbort = new AbortController();
  const decorationTypes = createDecorationTypes();

  const overlayEditors = () =>
    vscode.window.visibleTextEditors.filter((editor) =>
      isOverlayTarget(editor.document.uri.path),
    );

  const renderDecorations = () => {
    for (const editor of overlayEditors()) {
      const { document } = editor;
      const decorations = buildOverlay(
        document.getText(),
        contextFor(document),
      ).decorations;
      for (const [tone, type] of decorationTypes) {
        editor.setDecorations(
          type,
          decorations
            .filter((decoration) => decoration.tone === tone)
            .map((decoration) => toDecorationOptions(document, decoration)),
        );
      }
    }
  };

  /** Eager path (npm, plus Socket when configured) for names not seen yet. */
  const enrichNewDependencies = () => {
    if (!isEnabled()) {
      return;
    }
    const rows = overlayEditors()
      .flatMap((editor) => overlayDependencies(editor.document.getText()))
      .filter((row) => !requested.has(row.name));
    if (rows.length === 0) {
      return;
    }
    for (const row of rows) {
      requested.add(row.name);
    }
    const signal = enrichAbort.signal;
    const config = vscode.workspace.getConfiguration("packman");
    void enrichmentStore
      .enrichEager(rows, {
        signal,
        socket: resolveSocketCredentials(
          config.get<string>("socket.apiToken"),
          config.get<string>("socket.orgSlug"),
        ),
      })
      .then((enriched) => {
        if (signal.aborted) {
          return;
        }
        for (const [name, row] of enriched) {
          known.set(name, row);
          // Let a later pass retry lookups that failed outright.
          if (!row.latest && row.latestDegrade) {
            requested.delete(name);
          }
        }
        renderDecorations();
      })
      .catch(() => {
        for (const row of rows) {
          requested.delete(row.name);
        }
      });
  };

  /** Drop every enrichment result and start over (Refresh, Socket change). */
  const reenrich = () => {
    enrichAbort.abort();
    enrichAbort = new AbortController();
    known.clear();
    requested.clear();
    renderDecorations();
    enrichNewDependencies();
  };

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

  const refresh = () => {
    changed.fire();
    renderDecorations();
    enrichNewDependencies();
  };
  const refreshSoon = () => {
    if (debounce) {
      clearTimeout(debounce);
    }
    debounce = setTimeout(refresh, REFRESH_DEBOUNCE_MS);
  };

  refresh();

  return vscode.Disposable.from(
    changed,
    { dispose: () => debounce && clearTimeout(debounce) },
    { dispose: () => enrichAbort.abort() },
    ...decorationTypes.values(),
    vscode.window.onDidChangeVisibleTextEditors(refresh),
    enrichmentRefreshEmitter.event(() => {
      enrichmentCache.clear();
      enrichmentStore.clear();
      reenrich();
    }),
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
      if (event.affectsConfiguration(SOCKET_SETTINGS)) {
        reenrich();
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

const TONE_COLORS: Record<OverlayDecorationTone, string> = {
  outdated: "editorWarning.foreground",
  latest: "editorCodeLens.foreground",
  pending: "editorCodeLens.foreground",
  degraded: "disabledForeground",
  risk: "editorError.foreground",
};

/** One end-of-line decoration type per tone, coloured by the theme only. */
function createDecorationTypes(): Map<
  OverlayDecorationTone,
  vscode.TextEditorDecorationType
> {
  return new Map(
    (Object.keys(TONE_COLORS) as OverlayDecorationTone[]).map((tone) => [
      tone,
      vscode.window.createTextEditorDecorationType({
        after: {
          color: new vscode.ThemeColor(TONE_COLORS[tone]),
          margin: "0 0 0 2ch",
        },
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
      }),
    ]),
  );
}

/**
 * Shows the decoration at the end of the Dependency's line, unless more
 * entries follow on that line, in which case it sits right after the entry.
 */
function toDecorationOptions(
  document: vscode.TextDocument,
  decoration: OverlayDecoration,
): vscode.DecorationOptions {
  const end = decoration.range.end;
  const line = document.lineAt(end.line);
  const rest = line.text.slice(end.character);
  const anchor = /^\s*,?\s*$/.test(rest)
    ? line.range.end
    : new vscode.Position(end.line, end.character);
  return {
    range: new vscode.Range(anchor, anchor),
    renderOptions: { after: { contentText: decoration.text } },
  };
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
