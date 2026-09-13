import * as vscode from "vscode";
import {
  enrichDependencyRow,
  type EnrichedDependencyRow,
} from "./enrichDependencyRow";
import { npmPackageUrl } from "./fetchNpmLatest";
import { fetchSocketScoresByPurl } from "./fetchSocketScores";
import { PACKMAN_VIEW_TYPE } from "./openWith";
import { parsePackageDocument } from "./parsePackageDocument";
import { toPackageViewModel } from "./packageViewModel";
import { renderUiModeHtml } from "./renderUiModeHtml";
import {
  applySocketEnrichment,
  socketComponentsFromRows,
} from "./socketColumn";
import { resolveSocketCredentials } from "./socketCredentials";

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

    const seedLocalRows = (): EnrichedDependencyRow[] => {
      const parsed = parsePackageDocument(document.getText());
      if (!parsed.ok) {
        enrichmentByName = new Map();
        return [];
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
      return seeded;
    };

    const refreshEnrichment = async () => {
      const generation = ++enrichmentGeneration;
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

      const next = new Map<string, EnrichedDependencyRow>();
      await Promise.all(
        unique.map(async (row) => {
          const enriched = await enrichDependencyRow(row, { githubToken });
          next.set(row.name, enriched);
        }),
      );

      const enrichedRows = [...next.values()];
      let socketResult = undefined;
      if (socketCredentials.status === "ready") {
        socketResult = await fetchSocketScoresByPurl({
          orgSlug: socketCredentials.orgSlug,
          apiToken: socketCredentials.apiToken,
          components: socketComponentsFromRows(enrichedRows),
        });
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

    webviewPanel.onDidDispose(() => {
      enrichmentGeneration += 1;
      changeDocumentSubscription.dispose();
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
