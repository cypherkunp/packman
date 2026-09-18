import * as vscode from "vscode";
import { PACKMAN_VIEW_TYPE } from "./openWith";
import {
  enrichmentRefreshEmitter,
  PackageJsonEditorProvider,
} from "./packageJsonEditorProvider";

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(PackageJsonEditorProvider.register());
  context.subscriptions.push(enrichmentRefreshEmitter);

  context.subscriptions.push(
    vscode.commands.registerCommand("packman.openEditMode", () =>
      openPackageJsonWith("default"),
    ),
    vscode.commands.registerCommand("packman.openUiMode", () =>
      openPackageJsonWith(PACKMAN_VIEW_TYPE),
    ),
    vscode.commands.registerCommand("packman.openSocketSettings", async () => {
      await vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "packman.socket",
      );
    }),
    vscode.commands.registerCommand("packman.refreshEnrichment", () => {
      enrichmentRefreshEmitter.fire();
    }),
  );
}

export function deactivate(): void {}

async function openPackageJsonWith(
  viewId: typeof PACKMAN_VIEW_TYPE | "default",
): Promise<void> {
  const uri = activePackageJsonUri();
  if (!uri) {
    return;
  }
  await vscode.commands.executeCommand("vscode.openWith", uri, viewId);
}

function activePackageJsonUri(): vscode.Uri | undefined {
  const tabInput = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  if (
    tabInput &&
    typeof tabInput === "object" &&
    "uri" in tabInput &&
    tabInput.uri instanceof vscode.Uri &&
    isPackageJsonUri(tabInput.uri)
  ) {
    return tabInput.uri;
  }

  const doc = vscode.window.activeTextEditor?.document;
  if (doc && isPackageJsonUri(doc.uri)) {
    return doc.uri;
  }

  return undefined;
}

function isPackageJsonUri(uri: vscode.Uri): boolean {
  return /(?:^|[/\\])package\.json$/i.test(uri.fsPath);
}
