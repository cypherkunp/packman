import * as vscode from "vscode";
import {
  enrichDependencyRow,
  type EnrichedDependencyRow,
} from "./enrichDependencyRow";
import { EnrichmentCache, ENRICHMENT_TTL_MS } from "./enrichmentCache";
import { npmPackageUrl } from "./fetchNpmLatest";
import { fetchSocketScoresByPurl } from "./fetchSocketScores";
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

const FETCH_TIMEOUT_MS = 12_000;

/** Shared across Packman UI mode editors for the extension host lifetime. */
export const enrichmentCache = new EnrichmentCache<unknown>({
  ttlMs: ENRICHMENT_TTL_MS,
});

export const enrichmentRefreshEmitter = new vscode.EventEmitter<void>();

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
    webviewPanel.webview.options = {
      enableScripts: false,
      enableCommandUris: ["packman.openSocketSettings"],
    };

    const nonce = getNonce();
    let enrichmentByName = new Map<string, EnrichedDependencyRow>();
    let enrichmentGeneration = 0;
    let forceRefresh = false;

    const readSocketCredentials = () => {
      const config = vscode.workspace.getConfiguration("packman");
      return resolveSocketCredentials(
        config.get<string>("socket.apiToken"),
        config.get<string>("socket.orgSlug"),
      );
    };

    const updateWebview = () => {
      webviewPanel.webview.html = renderUiModeHtml(
        document.getText(),
        nonce,
        enrichmentByName,
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
      const githubTokenRaw = config.get<string>("github.token");
      const githubToken =
        typeof githubTokenRaw === "string" && githubTokenRaw.trim().length > 0
          ? githubTokenRaw.trim()
          : undefined;
      const socketCredentials = readSocketCredentials();
      const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);

      const enrichedRows = await mapPool(
        unique,
        ENRICHMENT_CONCURRENCY,
        async (row) =>
          enrichDependencyRow(row, {
            githubToken,
            cache: enrichmentCache,
            signal,
            forceRefresh: refresh,
          }),
      );

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

    webviewPanel.onDidDispose(() => {
      enrichmentGeneration += 1;
      changeDocumentSubscription.dispose();
      refreshSubscription.dispose();
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
