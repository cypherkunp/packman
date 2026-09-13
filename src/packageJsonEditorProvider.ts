import * as vscode from "vscode";
import { PACKMAN_VIEW_TYPE } from "./openWith";
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
    const updateWebview = () => {
      webviewPanel.webview.html = renderUiModeHtml(document.getText(), nonce);
    };

    updateWebview();

    const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(
      (event) => {
        if (event.document.uri.toString() === document.uri.toString()) {
          updateWebview();
        }
      },
    );

    webviewPanel.onDidDispose(() => {
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
