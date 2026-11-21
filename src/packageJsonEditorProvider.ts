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
import { renderUiModeHtml } from "./renderUiModeHtml";
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
    let enrichAbort: AbortController | undefined;

    const readSocketCredentials = () => {
      const config = vscode.workspace.getConfiguration("packman");
      return resolveSocketCredentials(
        config.get<string>("socket.apiToken"),
        config.get<string>("socket.orgSlug"),
      );
    };

    const updateWebview = () => {
      const until = sharedGithubBudget.blockedUntilMs();
      webviewPanel.webview.html = renderUiModeHtml(
        document.getText(),
        nonce,
        enrichmentByName,
        until !== undefined
          ? { githubResetLabel: formatGithubResetClock(until) }
          : undefined,
      );
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
      const seeded = unique.map((row) => ({
        ...row,
        npmUrl: npmPackageUrl(row.name),
        socket:
          socketCredentials.status === "missing"
            ? ({ kind: "cta" as const })
            : ({ kind: "empty" as const }),
      }));
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
      updateWebview();

      const parsed = parsePackageDocument(document.getText());
      if (!parsed.ok) {
        return;
      }

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
      updateWebview();
    };

    void refreshEnrichment();

    const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(
      (event) => {
        if (event.document.uri.toString() === document.uri.toString()) {
          void refreshEnrichment();
        }
      },
    );

    const refreshSubscription = enrichmentRefreshEmitter.event(() => {
      forceRefresh = true;
      enrichmentCache.clear();
      void refreshEnrichment();
    });

    const messageSubscription = webviewPanel.webview.onDidReceiveMessage(
      (message: unknown) => {
        if (
          !message ||
          typeof message !== "object" ||
          !("type" in message) ||
          (message as { type?: unknown }).type !== "runScript"
        ) {
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
      changeDocumentSubscription.dispose();
      refreshSubscription.dispose();
      messageSubscription.dispose();
    });
  }
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
