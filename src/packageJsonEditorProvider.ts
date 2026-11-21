import * as vscode from "vscode";
import { dirname } from "node:path";
import {
  enrichDependencyRow,
  type EnrichedDependencyRow,
} from "./enrichDependencyRow";
import { handoffGitDiffToTextEditor } from "./handoffGitDiff";
import { EnrichmentCache, ENRICHMENT_TTL_MS } from "./enrichmentCache";
import { npmPackageUrl } from "./fetchNpmLatest";
import { probeGithubCoreLimit } from "./fetchGithubRepoSummary";
import { fetchSocketScoresByPurl } from "./fetchSocketScores";
import {
  formatGithubResetClock,
  sharedGithubBudget,
} from "./githubBudget";
import { resolveGithubToken } from "./resolveGithubToken";
import { ENRICHMENT_CONCURRENCY, mapPool } from "./mapPool";
import { PACKMAN_VIEW_TYPE } from "./openWith";
import { parsePackageDocument } from "./parsePackageDocument";
import { toPackageViewModel } from "./packageViewModel";
import {
  renderUiModeBody,
  renderUiModeHtml,
  type UiModeExtras,
} from "./renderUiModeHtml";
import {
  applySocketEnrichment,
  socketComponentsFromRows,
} from "./socketColumn";
import { resolveSocketCredentials } from "./socketCredentials";
import { runPackageScript } from "./runPackageScript";

/** Shared across Packman UI mode editors for the extension host lifetime. */
export const enrichmentCache = new EnrichmentCache<unknown>({
  ttlMs: ENRICHMENT_TTL_MS,
});

export const enrichmentRefreshEmitter = new vscode.EventEmitter<void>();

/** Package dirs already warned about lockfile fallback (session-scoped). */
const scriptFallbackWarnedDirs = new Set<string>();

export class PackageJsonEditorProvider implements vscode.CustomTextEditorProvider {
  public static register(): vscode.Disposable {
    return vscode.window.registerCustomEditorProvider(
      PACKMAN_VIEW_TYPE,
      new PackageJsonEditorProvider(),
      {
        webviewOptions: {
          retainContextWhenHidden: false,
        },
      },
    );
  }

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    if (await handoffGitDiffToTextEditor(document, webviewPanel)) {
      return;
    }

    webviewPanel.webview.options = {
      enableScripts: true,
      enableCommandUris: [
        "packman.openSocketSettings",
        "packman.openGithubSettings",
      ],
    };

    const nonce = getNonce();
    let enrichmentByName = new Map<string, EnrichedDependencyRow>();
    let enrichmentGeneration = 0;
    let forceRefresh = false;
    let loading = false;
    let enrichAbort: AbortController | undefined;
    let enrichDebounce: ReturnType<typeof setTimeout> | undefined;
    /** True once the current webview document has loaded and can take patches. */
    let webviewReady = false;
    const editShortcut = process.platform === "darwin" ? "⌘⇧M" : "Ctrl+Shift+M";

    const readSocketCredentials = () => {
      const config = vscode.workspace.getConfiguration("packman");
      return resolveSocketCredentials(
        config.get<string>("socket.apiToken"),
        config.get<string>("socket.orgSlug"),
      );
    };

    const currentExtras = (): UiModeExtras => {
      const until = sharedGithubBudget.blockedUntilMs();
      return {
        loading,
        editShortcut,
        githubResetLabel:
          until !== undefined ? formatGithubResetClock(until) : undefined,
      };
    };

    /** Loads the full document; resets scroll, so only on first show. */
    const loadWebview = () => {
      webviewReady = false;
      webviewPanel.webview.html = renderUiModeHtml(
        document.getText(),
        nonce,
        enrichmentByName,
        currentExtras(),
      );
    };

    /** Patches the live page in place so scroll, focus and open sections survive. */
    const updateWebview = () => {
      if (!webviewReady) {
        loadWebview();
        return;
      }
      void webviewPanel.webview.postMessage({
        type: "render",
        html: renderUiModeBody(
          document.getText(),
          enrichmentByName,
          currentExtras(),
        ),
      });
    };

    const seedLocalRows = (): void => {
      const parsed = parsePackageDocument(document.getText());
      if (!parsed.ok) {
        enrichmentByName = new Map();
        return;
      }
      const model = toPackageViewModel(parsed.value);
      const rows = model.dependencyBags.flatMap((bag) => bag.rows);
      const unique = [...new Map(rows.map((row) => [row.name, row])).values()];
      const socketCredentials = readSocketCredentials();
      // Keep what is already known for unchanged rows, so edits elsewhere in
      // the file don't blank every enrichment cell while data is refetched.
      const seeded = unique.map((row): EnrichedDependencyRow => {
        const known = enrichmentByName.get(row.name);
        if (known && known.range === row.range) {
          return known;
        }
        return {
          ...row,
          npmUrl: npmPackageUrl(row.name),
          socket:
            socketCredentials.status === "missing"
              ? { kind: "cta" }
              : undefined,
        };
      });
      enrichmentByName = new Map(seeded.map((row) => [row.name, row]));
    };

    const refreshEnrichment = async () => {
      enrichAbort?.abort();
      const abort = new AbortController();
      enrichAbort = abort;
      const generation = ++enrichmentGeneration;
      const refresh = forceRefresh;
      forceRefresh = false;
      seedLocalRows();

      const parsed = parsePackageDocument(document.getText());
      if (!parsed.ok) {
        loading = false;
        updateWebview();
        return;
      }
      loading = true;
      updateWebview();

      const model = toPackageViewModel(parsed.value);
      const rows = model.dependencyBags.flatMap((bag) => bag.rows);
      const unique = [...new Map(rows.map((row) => [row.name, row])).values()];
      const config = vscode.workspace.getConfiguration("packman");
      const githubToken = await resolveGithubToken(
        config.get<string>("github.token"),
        (scopes) =>
          vscode.authentication.getSession("github", scopes, {
            silent: false,
          }),
      );
      if (abort.signal.aborted || generation !== enrichmentGeneration) {
        return;
      }
      sharedGithubBudget.setIdentity(githubToken);
      await probeGithubCoreLimit(
        githubToken,
        sharedGithubBudget,
        fetch,
        abort.signal,
      );
      if (abort.signal.aborted || generation !== enrichmentGeneration) {
        return;
      }
      const socketCredentials = readSocketCredentials();

      const enrichedRows = await mapPool(
        unique,
        ENRICHMENT_CONCURRENCY,
        async (row) => {
          if (abort.signal.aborted) {
            return {
              ...row,
              npmUrl: npmPackageUrl(row.name),
            };
          }
          return enrichDependencyRow(row, {
            githubToken,
            cache: enrichmentCache,
            signal: abort.signal,
            forceRefresh: refresh,
            githubBudget: sharedGithubBudget,
          });
        },
        abort.signal,
      );
      if (abort.signal.aborted || generation !== enrichmentGeneration) {
        return;
      }

      let socketResult = undefined;
      if (socketCredentials.status === "ready") {
        socketResult = await fetchSocketScoresByPurl(
          {
            orgSlug: socketCredentials.orgSlug,
            apiToken: socketCredentials.apiToken,
            components: socketComponentsFromRows(enrichedRows),
          },
          fetch,
        );
      }

      const withSocket = applySocketEnrichment(
        enrichedRows,
        socketCredentials,
        socketResult,
      );
      const finalMap = new Map(
        withSocket.map((row) => [row.name, row] as const),
      );

      if (generation !== enrichmentGeneration) {
        return;
      }
      enrichmentByName = finalMap;
      loading = false;
      updateWebview();
    };

    const runRefresh = () => {
      void refreshEnrichment().catch(() => {
        loading = false;
        updateWebview();
      });
    };

    loadWebview();
    runRefresh();

    const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(
      (event) => {
        if (event.document.uri.toString() !== document.uri.toString()) {
          return;
        }
        // Show the edit at once with what is already known; refetch after typing settles.
        seedLocalRows();
        updateWebview();
        if (enrichDebounce) {
          clearTimeout(enrichDebounce);
        }
        enrichDebounce = setTimeout(runRefresh, 500);
      },
    );

    // retainContextWhenHidden is off, so a hidden webview is torn down and comes
    // back from webview.html; reload it with current state when shown again.
    const viewStateSubscription = webviewPanel.onDidChangeViewState(() => {
      if (webviewPanel.visible) {
        loadWebview();
      } else {
        webviewReady = false;
      }
    });

    const refreshSubscription = enrichmentRefreshEmitter.event(() => {
      forceRefresh = true;
      enrichmentCache.clear();
      runRefresh();
    });

    const messageSubscription = webviewPanel.webview.onDidReceiveMessage(
      (message: unknown) => {
        if (!message || typeof message !== "object" || !("type" in message)) {
          return;
        }
        const type = (message as { type?: unknown }).type;
        if (type === "ready") {
          webviewReady = true;
          return;
        }
        if (type === "refresh") {
          void vscode.commands.executeCommand("packman.refreshEnrichment");
          return;
        }
        if (type === "openEditMode") {
          const { line, column } = message as { line?: unknown; column?: unknown };
          void openEditModeAt(
            document,
            typeof line === "number" ? line : 0,
            typeof column === "number" ? column : 0,
          );
          return;
        }
        if (type !== "runScript") {
          return;
        }
        const script = (message as { script?: unknown }).script;
        if (typeof script !== "string" || script.length === 0) {
          return;
        }
        const packageDir = dirname(document.uri.fsPath);
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
    );

    webviewPanel.onDidDispose(() => {
      enrichAbort?.abort();
      enrichmentGeneration += 1;
      if (enrichDebounce) {
        clearTimeout(enrichDebounce);
      }
      changeDocumentSubscription.dispose();
      viewStateSubscription.dispose();
      refreshSubscription.dispose();
      messageSubscription.dispose();
    });
  }
}

async function openEditModeAt(
  document: vscode.TextDocument,
  line: number,
  column: number,
): Promise<void> {
  await vscode.commands.executeCommand("vscode.openWith", document.uri, "default");
  if (line < 1) {
    return;
  }
  const editor = vscode.window.visibleTextEditors.find(
    (candidate) => candidate.document.uri.toString() === document.uri.toString(),
  );
  if (!editor) {
    return;
  }
  const position = new vscode.Position(line - 1, Math.max(0, column - 1));
  editor.selection = new vscode.Selection(position, position);
  editor.revealRange(
    new vscode.Range(position, position),
    vscode.TextEditorRevealType.InCenterIfOutsideViewport,
  );
}

function getNonce(): string {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let i = 0; i < 32; i++) {
    nonce += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return nonce;
}
