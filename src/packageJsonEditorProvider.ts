import * as vscode from "vscode";
import {
  enrichDependencyRow,
  type EnrichedDependencyRow,
} from "./enrichDependencyRow";
import { PACKMAN_VIEW_TYPE } from "./openWith";
import { parsePackageDocument } from "./parsePackageDocument";
import { toPackageViewModel } from "./packageViewModel";
import { renderUiModeHtml } from "./renderUiModeHtml";

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
    };

    const nonce = getNonce();
    let enrichmentByName = new Map<string, EnrichedDependencyRow>();
    let enrichmentGeneration = 0;

    const updateWebview = () => {
      webviewPanel.webview.html = renderUiModeHtml(
        document.getText(),
        nonce,
        enrichmentByName,
      );
    };

    const refreshEnrichment = async () => {
      const generation = ++enrichmentGeneration;
      const parsed = parsePackageDocument(document.getText());
      if (!parsed.ok) {
        enrichmentByName = new Map();
        updateWebview();
        return;
      }

      const model = toPackageViewModel(parsed.value);
      const rows = model.dependencyBags.flatMap((bag) => bag.rows);
      const unique = [...new Map(rows.map((row) => [row.name, row])).values()];
      const token = vscode.workspace
        .getConfiguration("packman")
        .get<string>("github.token");
      const githubToken =
        typeof token === "string" && token.trim().length > 0
          ? token.trim()
          : undefined;

      const next = new Map<string, EnrichedDependencyRow>();
      await Promise.all(
        unique.map(async (row) => {
          const enriched = await enrichDependencyRow(row, { githubToken });
          next.set(row.name, enriched);
        }),
      );

      if (generation !== enrichmentGeneration) {
        return;
      }
      enrichmentByName = next;
      updateWebview();
    };

    updateWebview();
    void refreshEnrichment();

    const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(
      (event) => {
        if (event.document.uri.toString() === document.uri.toString()) {
          updateWebview();
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
