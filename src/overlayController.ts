import { dirname } from "node:path";
import * as vscode from "vscode";
import {
  buildOverlay,
  overlayDependencies,
  RUN_SCRIPT_COMMAND,
  GITHUB_SETTINGS_COMMAND,
  REFRESH_ENRICHMENT_COMMAND,
  SOCKET_SETTINGS_COMMAND,
  type DependencyEnrichment,
  type DependencyGithub,
  type OverlayContext,
  type OverlayDecoration,
  type OverlayDecorationTone,
  type OverlayRange,
} from "./buildOverlay";
import { formatGithubResetClock, sharedGithubBudget } from "./githubBudget";
import { shouldFetchGithubOnHover } from "./githubOnHover";
import { GithubPauseWatch } from "./githubPauseWatch";
import { isWellFormed } from "./overlayTree";
import {
  canRunScriptsFrom,
  isOverlayTarget,
  overlayTargetDocuments,
} from "./overlayTarget";
import {
  enrichmentRefresh,
  enrichmentStore,
} from "./sessionState";
import { resolveGithubToken } from "./resolveGithubToken";
import { runScriptFromEditor } from "./runScriptFromEditor";
import { resolveSocketCredentials } from "./socketCredentials";

const OVERLAY_SETTING = "packman.overlay.enabled";
const SOCKET_SETTINGS = "packman.socket";
const REFRESH_DEBOUNCE_MS = 300;
/** How long a hover waits for GitHub before showing its loading note. */
const HOVER_GITHUB_WAIT_MS = 1_500;
const HOVER_COMMANDS = [
  SOCKET_SETTINGS_COMMAND,
  GITHUB_SETTINGS_COMMAND,
  REFRESH_ENRICHMENT_COMMAND,
];
/** How often, while GitHub is paused, summaries check whether it resumed. */
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
      enrichment: known,
      socketConfigured: socketCredentials().status === "ready",
      githubPaused: isGithubPaused(),
      github,
      githubPausedUntil:
        pausedUntil !== undefined
          ? formatGithubResetClock(pausedUntil)
          : undefined,
    };
  };

  /** GitHub enrichment fetched on hover, per Dependency name. */
  const github = new Map<string, DependencyGithub>();

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
    onChange: () => changed.fire(),
    setTimer: (callback) => setInterval(callback, GITHUB_PAUSE_POLL_MS),
    clearTimer: (timer) => clearInterval(timer),
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

  /**
   * Eager path (npm, plus Socket when configured) for names not seen yet in
   * `documents`; visible editors by default.
   */
  const enrichNewDependencies = (
    documents: readonly vscode.TextDocument[] = overlayEditors().map(
      (editor) => editor.document,
    ),
  ) => {
    if (!isEnabled()) {
      return;
    }
    const rows = documents
      .flatMap((document) => overlayDependencies(document.getText()))
      .filter((row) => !requested.has(row.name));
    if (rows.length === 0) {
      return;
    }
    for (const row of rows) {
      requested.add(row.name);
    }
    const signal = enrichAbort.signal;
    void enrichmentStore
      .enrichEager(rows, { signal, socket: socketCredentials() })
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
        changed.fire();
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
    github.clear();
    changed.fire();
    renderDecorations();
    // Every open package.json, not only visible ones, so background tabs
    // don't come back with nothing known after a Refresh.
    enrichNewDependencies(overlayTargetDocuments(vscode.workspace.textDocuments));
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

  /**
   * GitHub-only path for one Dependency, on hover only. The store caches
   * loaded results and the shared budget gates every request.
   */
  const loadGithub = async (name: string, range: string): Promise<void> => {
    const config = vscode.workspace.getConfiguration("packman");
    const githubToken = await resolveGithubToken(
      config.get<string>("github.token"),
      (scopes) =>
        vscode.authentication.getSession("github", scopes, { silent: true }),
    );
    sharedGithubBudget.setIdentity(githubToken);
    const signal = enrichAbort.signal;
    const enriched = await enrichmentStore.enrichGithub(
      { name, range },
      { githubToken, githubBudget: sharedGithubBudget, signal },
    );
    if (signal.aborted) {
      return;
    }
    github.set(name, {
      githubUrl: enriched.githubUrl,
      issuesUrl: enriched.issuesUrl,
      openIssuesCount: enriched.openIssuesCount,
      githubDegrade: enriched.githubDegrade,
      issuesDegrade: enriched.issuesDegrade,
    });
    if (!known.has(name) && (enriched.latest || enriched.latestDegrade)) {
      known.set(name, enriched);
      renderDecorations();
    }
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
      const cached = github.get(target.dependency);
      if (shouldFetchGithubOnHover(cached, isGithubPaused())) {
        const range =
          overlayDependencies(text).find(
            (row) => row.name === target.dependency,
          )?.range ?? "";
        const loading = loadGithub(target.dependency, range)
          .catch(() => undefined)
          // A blocked budget shows `GitHub paused` in summaries at once.
          .finally(() => githubPauseWatch.check());
        await Promise.race([
          loading,
          new Promise((resolve) => setTimeout(resolve, HOVER_GITHUB_WAIT_MS)),
        ]);
      }
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

  const refresh = () => {
    githubPauseWatch.check();
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
    githubPauseWatch,
    ...decorationTypes.values(),
    vscode.window.onDidChangeVisibleTextEditors(refresh),
    enrichmentRefresh.onRefresh(reenrich),
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
        refreshSoon();
      }
    }),
    vscode.workspace.onDidCloseTextDocument((document) => {
      lastGoodTexts.delete(document.uri.toString());
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
