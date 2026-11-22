import { dirname } from "node:path";
import * as vscode from "vscode";
import {
  buildOverlay,
  OVERLAY_TONE_COLORS,
  overlayDependencies,
  RUN_SCRIPT_COMMAND,
  GITHUB_SETTINGS_COMMAND,
  REFRESH_ENRICHMENT_COMMAND,
  SIGN_IN_TO_GITHUB_COMMAND,
  SOCKET_SETTINGS_COMMAND,
  type OverlayContext,
  type OverlayDecoration,
  type OverlayDecorationTone,
  type OverlayRange,
} from "./buildOverlay";
import { GithubAccess } from "./githubAccess";
import { formatGithubResetClock, sharedGithubBudget } from "./githubBudget";
import { GithubPauseWatch } from "./githubPauseWatch";
import { isWellFormed } from "./overlayTree";
import { canRunScriptsFrom, isOverlayTarget } from "./overlayTarget";
import {
  enrichmentRefresh,
  enrichmentStore,
} from "./sessionState";
import { runScriptFromEditor } from "./runScriptFromEditor";
import { SignalFetchPolicy, type ShownDocument } from "./signalFetchPolicy";
import { resolveSocketCredentials } from "./socketCredentials";

const OVERLAY_SETTING = "packman.overlay.enabled";
const SOCKET_SETTINGS = "packman.socket";
const REFRESH_DEBOUNCE_MS = 300;
/** Coalesces re-renders while enrichment results stream in. */
const RENDER_COALESCE_MS = 50;
/** How long a hover waits for GitHub before showing its loading note. */
const HOVER_GITHUB_WAIT_MS = 1_500;
const HOVER_COMMANDS = [
  SOCKET_SETTINGS_COMMAND,
  GITHUB_SETTINGS_COMMAND,
  REFRESH_ENRICHMENT_COMMAND,
];
/**
 * How often, while GitHub is paused, summaries check whether it resumed.
 * This only re-renders; a resume never triggers a fetch (ADR 0002).
 */
const GITHUB_PAUSE_POLL_MS = 15_000;

/**
 * Thin VS Code adapter for the Overlay: feeds documents to the pure
 * `buildOverlay` and maps its output onto VS Code types one-to-one.
 */
export function registerOverlay(): vscode.Disposable {
  let sessionOverride: boolean | undefined;
  const changed = new vscode.EventEmitter<void>();
  let debounce: ReturnType<typeof setTimeout> | undefined;

  const isEnabled = () =>
    sessionOverride ??
    vscode.workspace.getConfiguration().get<boolean>(OVERLAY_SETTING, true);

  /** Each document's latest well-formed text, kept while it's mid-edit. */
  const lastGoodTexts = new Map<string, string>();
  const lastGoodText = (document: vscode.TextDocument) => {
    const uri = document.uri.toString();
    const text = document.getText();
    if (isWellFormed(text)) {
      lastGoodTexts.set(uri, text);
    }
    return lastGoodTexts.get(uri);
  };

  const contextFor = (document: vscode.TextDocument): OverlayContext => {
    const pausedUntil = sharedGithubBudget.blockedUntilMs();
    return {
      documentUri: document.uri.toString(),
      lastGoodText: lastGoodText(document),
      enabled: isEnabled(),
      trusted: vscode.workspace.isTrusted,
      readOnly: isReadOnly(document),
      enrichment: policy.enrichment,
      socketConfigured: socketCredentials().status === "ready",
      githubPaused: isGithubPaused(),
      githubAccess: githubAccess.hasAccess,
      github: policy.github,
      githubPausedUntil:
        pausedUntil !== undefined
          ? formatGithubResetClock(pausedUntil)
          : undefined,
    };
  };

  const socketCredentials = () => {
    const config = vscode.workspace.getConfiguration("packman");
    return resolveSocketCredentials(
      config.get<string>("socket.apiToken"),
      config.get<string>("socket.orgSlug"),
    );
  };

  /** Re-render summaries when the GitHub budget blocks or resumes. */
  const githubPauseWatch = new GithubPauseWatch({
    isPaused: isGithubPaused,
    onChange: () => {
      changed.fire();
      // Signals show `issues ⏸` while paused.
      renderDecorations();
    },
    setTimer: (callback) => setInterval(callback, GITHUB_PAUSE_POLL_MS),
    clearTimer: (timer) => clearInterval(timer),
  });

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

  /**
   * GitHub access needs no setup: the token setting, else the editor's
   * signed-in account. Only the Block summary's sign-in click prompts; a
   * granted session re-fetches the visible editors, like Refresh.
   */
  const githubAccess = new GithubAccess({
    configuredToken: () =>
      vscode.workspace.getConfiguration("packman").get<string>("github.token"),
    getSession: (scopes, { interactive }) =>
      vscode.authentication.getSession(
        "github",
        scopes,
        interactive ? { createIfNone: true } : { silent: true },
      ),
    onGranted: () => enrichmentRefresh.refresh(),
    onChange: () => changed.fire(),
  });

  /**
   * Signals are fetched strictly on user action (ADR 0002): an editor is
   * shown, a Dependency is typed, Refresh, or a Socket settings change.
   */
  let renderTimer: ReturnType<typeof setTimeout> | undefined;
  const policy = new SignalFetchPolicy({
    store: enrichmentStore,
    budget: sharedGithubBudget,
    socket: socketCredentials,
    githubToken: () => githubAccess.token(),
    onChange: () => {
      renderTimer ??= setTimeout(() => {
        renderTimer = undefined;
        // A blocked budget shows `GitHub paused` in summaries at once.
        githubPauseWatch.check();
        renderDecorations();
        changed.fire();
      }, RENDER_COALESCE_MS);
    },
  });

  const shownDocument = (editor: vscode.TextEditor): ShownDocument => ({
    text: editor.document.getText(),
    visibleRanges: editor.visibleRanges.map((range) => ({
      start: range.start.line,
      end: range.end.line + 1,
    })),
  });
  const visibleDocuments = () => overlayEditors().map(shownDocument);
  const whenEnabled = (fetch: () => Promise<void>) => {
    if (isEnabled()) {
      void fetch().catch(() => undefined);
    }
  };

  /** Editors visible after the last change, so only newly shown ones fetch. */
  let visibleUris = new Set<string>();
  const fetchNewlyShown = () => {
    const editors = overlayEditors();
    const shown = editors.filter(
      (editor) => !visibleUris.has(editor.document.uri.toString()),
    );
    visibleUris = new Set(editors.map((editor) => editor.document.uri.toString()));
    whenEnabled(() => policy.shown(shown.map(shownDocument)));
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

  const hoverProvider: vscode.HoverProvider = {
    async provideHover(document, position) {
      if (!isOverlayTarget(document.uri.path)) {
        return undefined;
      }
      const text = document.getText();
      const target = buildOverlay(text, contextFor(document)).hovers.find(
        (hover) => toRange(hover.range).contains(position),
      );
      if (!target) {
        return undefined;
      }
      const range =
        overlayDependencies(text).find((row) => row.name === target.dependency)
          ?.range ?? "";
      const loading = policy
        .hover({ name: target.dependency, range })
        .catch(() => undefined);
      await Promise.race([
        loading,
        new Promise((resolve) => setTimeout(resolve, HOVER_GITHUB_WAIT_MS)),
      ]);
      const hover = buildOverlay(text, contextFor(document)).hovers.find(
        (entry) => entry.dependency === target.dependency,
      );
      if (!hover) {
        return undefined;
      }
      const markdown = new vscode.MarkdownString(hover.markdown);
      markdown.isTrusted = { enabledCommands: HOVER_COMMANDS };
      return new vscode.Hover(markdown, toRange(hover.range));
    },
  };

  /** Re-render only; never fetches. */
  const rerender = () => {
    githubPauseWatch.check();
    changed.fire();
    renderDecorations();
  };
  /** Typing: after the debounce, fetch only Dependency names never seen. */
  const edited = new Set<vscode.TextDocument>();
  const editedSoon = (document: vscode.TextDocument) => {
    edited.add(document);
    if (debounce) {
      clearTimeout(debounce);
    }
    debounce = setTimeout(() => {
      rerender();
      const documents = [...edited];
      edited.clear();
      for (const document of documents) {
        whenEnabled(() => policy.edited({ text: document.getText() }));
      }
    }, REFRESH_DEBOUNCE_MS);
  };

  /** Turning the Overlay on shows every visible editor's signals again. */
  const overlayShownAgain = () => {
    rerender();
    visibleUris = new Set();
    fetchNewlyShown();
  };

  rerender();
  fetchNewlyShown();

  return vscode.Disposable.from(
    changed,
    { dispose: () => debounce && clearTimeout(debounce) },
    { dispose: () => renderTimer && clearTimeout(renderTimer) },
    { dispose: () => policy.dispose() },
    githubPauseWatch,
    ...decorationTypes.values(),
    vscode.window.onDidChangeVisibleTextEditors(() => {
      rerender();
      fetchNewlyShown();
    }),
    // Refresh covers visible package.json editors only; the store and cache
    // are already cleared, so others fetch again when they are shown.
    enrichmentRefresh.onRefresh(() =>
      whenEnabled(() => policy.refresh(visibleDocuments())),
    ),
    vscode.languages.registerCodeLensProvider(
      [{ pattern: "**/package.json" }],
      codeLensProvider,
    ),
    vscode.languages.registerHoverProvider(
      [{ pattern: "**/package.json" }],
      hoverProvider,
    ),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (isOverlayTarget(event.document.uri.path)) {
        editedSoon(event.document);
      }
    }),
    vscode.workspace.onDidCloseTextDocument((document) => {
      lastGoodTexts.delete(document.uri.toString());
    }),
    vscode.workspace.onDidGrantWorkspaceTrust(rerender),
    vscode.window.tabGroups.onDidChangeTabs(rerender),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(OVERLAY_SETTING)) {
        sessionOverride = undefined;
        overlayShownAgain();
      }
      if (event.affectsConfiguration(SOCKET_SETTINGS)) {
        whenEnabled(() => policy.socketChanged(visibleDocuments()));
      }
    }),
    vscode.commands.registerCommand(SIGN_IN_TO_GITHUB_COMMAND, () =>
      githubAccess.signIn(),
    ),
    vscode.authentication.onDidChangeSessions((event) => {
      if (event.provider.id === "github") {
        void githubAccess.sessionsChanged().catch(() => undefined);
      }
    }),
    vscode.commands.registerCommand("packman.toggleOverlay", () => {
      sessionOverride = !isEnabled();
      overlayShownAgain();
    }),
    vscode.commands.registerCommand(
      RUN_SCRIPT_COMMAND,
      (documentUri: unknown, script: unknown) => {
        if (typeof documentUri !== "string" || typeof script !== "string") {
          return;
        }
        runScriptFromEditor(
          packageDirFor(vscode.Uri.parse(documentUri)),
          script,
        );
      },
    ),
  );
}

function isGithubPaused(): boolean {
  return sharedGithubBudget.blockedUntilMs() !== undefined;
}

/** One end-of-line decoration type per tone, coloured by the theme only. */
function createDecorationTypes(): Map<
  OverlayDecorationTone,
  vscode.TextEditorDecorationType
> {
  return new Map(
    (Object.keys(OVERLAY_TONE_COLORS) as OverlayDecorationTone[]).map((tone) => [
      tone,
      vscode.window.createTextEditorDecorationType({
        after: {
          color: new vscode.ThemeColor(OVERLAY_TONE_COLORS[tone]),
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
 * Read-only when the document lives on a scheme whose scripts can't be run
 * (git, PR reviews, …), on a read-only file system, or is only open as a
 * diff side.
 *
 * CodeLenses are provided per document, not per editor: a diff's working-copy
 * side is the same `file:` document as a normal tab, so while both are open
 * it shows the same Run lenses. VS Code gives no way to tell them apart here.
 */
function isReadOnly(document: vscode.TextDocument): boolean {
  const { uri } = document;
  if (!canRunScriptsFrom(uri.scheme)) {
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
